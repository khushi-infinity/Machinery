/**
 * voiceAgent.ts - the whole voice loop, ours now, hands-free.
 *
 *   Start session -> spoken intro -> mic listens continuously (VAD)
 *     you finish speaking -> POST /api/stt (Gnani Prisma v3.0)
 *       -> POST /api/agent/turn (OpenRouter LLM + 14 tools)
 *            browser tools are executed HERE, on the scene, immediately;
 *            server tools already ran on the backend
 *       -> POST /api/tts (Gnani Timbre v3.0) -> the reply plays -> back to listening
 *
 * No push-to-talk. End-of-utterance is mic-energy based: once you have spoken
 * and then stay quiet for a beat, the clip ships. The mic is never open while
 * the agent talks, so it cannot hear itself. Escape or End session hangs up.
 */

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { clientTools } from './clientTools'
import { useScene } from './store'

export type VoiceStatus = 'idle' | 'listening' | 'thinking' | 'speaking'
export interface WebSource {
  title: string
  url: string
  snippet?: string
}

/** The 10 languages Gnani's models speak - hearing anything else falls back to Indian English. */
const TTS_LANGS = new Set([
  'bn-IN', 'en-IN', 'gu-IN', 'hi-IN', 'kn-IN', 'ml-IN',
  'mr-IN', 'pa-IN', 'ta-IN', 'te-IN',
])

/** VAD tuning. */
const POLL_MS = 60             // mic energy sample rate
const SILENCE_MS = 1300        // quiet this long after speech -> utterance done
const MIN_UTTERANCE_MS = 500   // ignore sub-half-second clips
const MIN_VOICED_MS = 220      // must contain real speech, not a door slam
const MAX_UTTERANCE_MS = 25000 // Prisma caps uploads near 30 s
const CALIBRATE_MS = 450       // room-noise sampling window before the intro

/** The spoken intro when a session starts. Short on purpose - the user talks next. */
const INTRO = (machine: string) =>
  `Hey, I am Third Hand, your repair copilot. Tell me what is failing on the ` +
  `${machine}, and I will walk you through the fix, step by step. So, what is ` +
  `the problem today?`

const push = (role: 'user' | 'agent' | 'tool', text: string) =>
  useScene.getState().push({ role, text, ts: Date.now() })

/** What the model sees of the screen - cheap and fresh every turn. */
function viewSnapshot() {
  const s = useScene.getState()
  return {
    machine: s.machine.id,
    machine_name: s.machine.name,
    focused_part: s.focusedPart,
    explode_level: Number(s.explode.toFixed(2)),
    highlighted: s.highlights.map((h) => ({ part_id: h.partId, label: h.label })),
    current_step: s.step?.n ?? null,
    pointer_on: s.pointerPart,
  }
}

/** Float32 samples -> 16-bit PCM WAV container. */
function encodeWav(samples: Float32Array, rate: number): Blob {
  const n = samples.length
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
  }
  ascii(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
  v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  ascii(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

/** MediaRecorder gives us webm/opus. Decode it and re-encode as 16 kHz mono
 *  WAV - the one format Gnani Prisma's STT always takes. */
async function toWav16k(blob: Blob, actx: AudioContext): Promise<Blob> {
  const raw = await actx.decodeAudioData(await blob.arrayBuffer())
  try {
    const rate = 16000
    const len = Math.max(1, Math.ceil(raw.duration * rate))
    const off = new OfflineAudioContext(1, len, rate)
    const src = off.createBufferSource()
    src.buffer = raw
    src.connect(off.destination)
    src.start()
    const mono = await off.startRendering()
    return encodeWav(mono.getChannelData(0), rate)
  } catch {
    // No 16 kHz offline rendering available: ship the native-rate mono WAV.
    return encodeWav(raw.getChannelData(0), raw.sampleRate)
  }
}

/** One utterance, end to end: wav -> stt -> agent turn -> scene tools -> tts.
 *  Throws on failure - the listening loop decides what happens next. */
async function runTurn(blob: Blob, ctx: {
  setStatusBoth: (s: VoiceStatus) => void
  historyRef: MutableRefObject<{ role: 'user' | 'assistant'; content: string }[]>
  setSources: (s: WebSource[]) => void
  audioElRef: MutableRefObject<HTMLAudioElement | null>
  sessionRef: MutableRefObject<boolean>
  audioCtxRef: MutableRefObject<AudioContext | null>
  signal: AbortSignal
}) {
  const { setStatusBoth, historyRef, setSources, audioElRef, sessionRef, audioCtxRef, signal } = ctx
  setStatusBoth('thinking')

  // 1. ears
  const actx = audioCtxRef.current
  if (!actx) throw new Error('audio context closed')
  const wav = await toWav16k(blob, actx)
  const fd = new FormData()
  fd.append('file', wav, 'utterance.wav')
  const sttRes = await fetch('/api/stt', { method: 'POST', body: fd, signal })
  if (!sttRes.ok) throw new Error(`stt ${sttRes.status}: ${(await sttRes.text()).slice(0, 160)}`)
  const { text, language } = (await sttRes.json()) as { text?: string; language?: string }
  const heard = (text ?? '').trim()
  if (!heard) return
  push('user', heard)

  // 2. brain - STREAMED: each scene tool fires on screen the moment the model
  //    queues it, while the model is still composing the final reply.
  const turnRes = await fetch('/api/agent/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: heard,
      language: language ?? 'en-IN',
      view: viewSnapshot(),
      history: historyRef.current.slice(-8),
    }),
    signal,
  })
  if (!turnRes.ok) throw new Error(`agent ${turnRes.status}: ${(await turnRes.text()).slice(0, 160)}`)

  const reader = turnRes.body?.getReader()
  if (!reader) throw new Error('agent returned no stream')
  const decoder = new TextDecoder()
  let buf = ''
  let speech = ''
  let sources: WebSource[] | undefined
  let gotFinal = false
  const onLine = (line: string) => {
    if (!line) return
    const evt = JSON.parse(line) as
      | { type: 'tool'; name: string; args?: Record<string, unknown> }
      | { type: 'final'; speech: string; sources?: WebSource[] }
      | { type: 'error'; detail: string }
    if (evt.type === 'tool') {
      // hands - the scene moves NOW, while the model keeps thinking
      try {
        ;(clientTools as any)[evt.name]?.(evt.args ?? {})
      } catch (e: any) {
        push('tool', `${evt.name} failed: ${e?.message ?? e}`)
      }
    } else if (evt.type === 'final') {
      gotFinal = true
      speech = evt.speech
      sources = evt.sources
    } else {
      throw new Error(`agent: ${evt.detail}`)
    }
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      onLine(line)
    }
    if (done) break
  }
  if (!gotFinal) throw new Error('agent stream ended without a reply')

  // 3. sources
  if (sources?.length) setSources(sources)

  push('agent', speech)
  historyRef.current.push(
    { role: 'user', content: heard },
    { role: 'assistant', content: speech },
  )
  if (!speech) return

  // 4. voice - chunked; resolves when the LAST chunk finishes playing
  await speak(speech, TTS_LANGS.has(language ?? '') ? language! : 'en-IN', {
    setStatusBoth,
    audioElRef,
    sessionRef,
    signal,
  })
}

/** Split a reply into sentence-ish TTS chunks so the FIRST one can start
 *  playing while the rest are still synthesising. */
function splitForTts(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const merged: string[] = []
  for (const s of sentences) {
    const last = merged[merged.length - 1]
    if (last && (last.length + s.length < 90 || s.length < 25)) {
      merged[merged.length - 1] = `${last} ${s}`
    } else {
      merged.push(s)
    }
  }
  return merged.length ? merged : [text]
}

/** One TTS chunk, plus everything the player needs to stop instantly. */
type SpeakCtx = {
  setStatusBoth: (s: VoiceStatus) => void
  audioElRef: MutableRefObject<HTMLAudioElement | null>
  sessionRef: MutableRefObject<boolean>
  signal: AbortSignal
}

/** Play one WAV blob; resolves on natural end, error, or hang-up. */
function playAudio(blob: Blob, ctx: SpeakCtx): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    ctx.audioElRef.current = audio
    const done = () => {
      URL.revokeObjectURL(url)
      if (ctx.audioElRef.current === audio) ctx.audioElRef.current = null
      resolve()
    }
    audio.onended = done
    audio.onerror = done
    audio.onpause = done // endSession() hanging up mid-playback
    audio.play().catch(done)
  })
}

/** Gnani Timbre v3.0, CHUNKED: synthesise sentence 1, start playing it while
 *  sentences 2..n synthesise in parallel. First words land in ~1 s no matter
 *  how long the reply got. Resolves only when ALL playback is over, so the
 *  mic opens only after the agent truly finishes (never hears itself). */
async function speak(text: string, language: string, ctx: SpeakCtx) {
  const { setStatusBoth, signal } = ctx
  const chunks = splitForTts(text)
  const synth = async (t: string): Promise<Blob> => {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t, language }),
      signal,
    })
    if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 160)}`)
    const { audio_b64 } = (await res.json()) as { audio_b64?: string }
    if (!audio_b64) return new Blob()
    const bytes = Uint8Array.from(atob(audio_b64), (c) => c.charCodeAt(0))
    return new Blob([bytes], { type: 'audio/wav' })
  }
  setStatusBoth('speaking')
  try {
    let next = synth(chunks[0])
    for (let i = 0; i < chunks.length; i++) {
      const blob = await next
      next = i + 1 < chunks.length ? synth(chunks[i + 1]) : Promise.resolve(new Blob())
      if (blob.size > 44) await playAudio(blob, ctx) // <=44 bytes is a headerless empty
      if (signal.aborted) return
    }
  } finally {
    setStatusBoth('idle')
  }
}

export function useVoiceAgent() {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [sources, setSources] = useState<WebSource[]>([])
  const statusRef = useRef<VoiceStatus>('idle')
  const historyRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const bufRef = useRef<Uint8Array | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const pollRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const sessionRef = useRef(false)
  const thresholdRef = useRef(16)
  const utterStartRef = useRef(0)
  const voicedMsRef = useRef(0)
  const lastVoiceRef = useRef(0)
  const errorsRef = useRef(0)

  const setStatusBoth = (s: VoiceStatus) => {
    statusRef.current = s
    setStatus(s)
  }

  /** Mic loudness (RMS off centre); dead silence sits under ~3. */
  const rms = () => {
    const a = analyserRef.current
    const buf = bufRef.current
    if (!a || !buf) return 0
    a.getByteTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) {
      const d = buf[i] - 128
      sum += d * d
    }
    return Math.sqrt(sum / buf.length)
  }

  const ensureMic = async () => {
    if (streamRef.current?.active) return
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    streamRef.current = stream
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    audioCtxRef.current = ctx
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    analyserRef.current = analyser
    bufRef.current = new Uint8Array(analyser.fftSize)
  }

  /** Sample the room briefly so the speech threshold clears the noise floor. */
  const calibrate = () =>
    new Promise<void>((resolve) => {
      const t0 = Date.now()
      let floor = Infinity
      const tick = () => {
        floor = Math.min(floor, rms())
        if (Date.now() - t0 < CALIBRATE_MS) requestAnimationFrame(tick)
        else {
          thresholdRef.current = Math.min(50, Math.max(12, floor * 3))
          resolve()
        }
      }
      tick()
    })

  /** Stop sampling and hand the current recording over. */
  const closeUtterance = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    const rec = recorderRef.current
    if (rec && rec.state === 'recording') rec.stop()
  }

  /** Open the mic and watch for: speech ... silence -> end of utterance. */
  const startListening = () => {
    if (!sessionRef.current) return
    const stream = streamRef.current
    if (!stream?.active) {
      sessionRef.current = false
      setStatusBoth('idle')
      return
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', ''].find(
      (m) => m === '' || MediaRecorder.isTypeSupported(m),
    )
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunksRef.current = []
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    rec.onstop = () => {
      const ms = Date.now() - utterStartRef.current
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
      if (blob.size > 1200 && ms > MIN_UTTERANCE_MS && voicedMsRef.current > MIN_VOICED_MS) {
        void handleUtterance(blob)
      } else if (sessionRef.current) {
        startListening()
      }
    }
    recorderRef.current = rec
    voicedMsRef.current = 0
    lastVoiceRef.current = 0
    utterStartRef.current = Date.now()
    rec.start()
    setStatusBoth('listening')
    pollRef.current = window.setInterval(() => {
      const now = Date.now()
      if (rms() > thresholdRef.current) {
        voicedMsRef.current += POLL_MS
        lastVoiceRef.current = now
      }
      if (voicedMsRef.current > MIN_VOICED_MS && now - lastVoiceRef.current > SILENCE_MS) {
        closeUtterance()
      } else if (now - utterStartRef.current > MAX_UTTERANCE_MS) {
        closeUtterance()
      }
    }, POLL_MS)
  }

  /** stt -> turn -> tools -> tts, then straight back to listening.
   *  Abortable: End session / Escape kills everything in flight instantly. */
  const handleUtterance = async (blob: Blob) => {
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await runTurn(blob, {
        setStatusBoth,
        historyRef,
        setSources,
        audioElRef,
        sessionRef,
        audioCtxRef,
        signal: controller.signal,
      })
      errorsRef.current = 0
    } catch (e: any) {
      if (controller.signal.aborted || !sessionRef.current) return // hung up mid-turn, not an error
      console.error('[voice]', e)
      push('tool', `error: ${e?.message ?? e}`)
      errorsRef.current += 1
      if (errorsRef.current >= 3) {
        push('tool', 'three turns failed in a row - pausing. Check the backend, then press Start session.')
        endRef.current()
        return
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
    if (sessionRef.current) startListening()
  }

  /** Click "Start session": mic + room calibration + the spoken intro. */
  const beginSession = async () => {
    if (sessionRef.current) return
    await ensureMic()
    sessionRef.current = true
    errorsRef.current = 0
    historyRef.current = []
    await calibrate()
    const intro = INTRO(useScene.getState().machine.name)
    push('agent', intro)
    historyRef.current.push({ role: 'assistant', content: intro })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await speak(intro, 'en-IN', { setStatusBoth, audioElRef, sessionRef, signal: controller.signal })
    } catch {
      /* intro aborted or tts failed - either way, listen next */
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
    if (sessionRef.current) startListening()
  }

  /** Hang up: abort in-flight STT/LLM/TTS, stop playback, kill mic + VAD. */
  const endSession = () => {
    sessionRef.current = false
    abortRef.current?.abort()
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null
      try {
        rec.stop()
      } catch {
        /* already stopped */
      }
    }
    recorderRef.current = null
    audioElRef.current?.pause()
    audioElRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    analyserRef.current = null
    bufRef.current = null
    const ctx = audioCtxRef.current
    audioCtxRef.current = null
    ctx?.close().catch(() => {})
    setStatusBoth('idle')
  }

  const endRef = useRef(endSession)
  useEffect(() => {
    endRef.current = endSession
  })

  /** Escape still hangs up. Space is gone - the agent just listens. */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && e.target === document.body) endRef.current()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  return { status, sources, beginSession, endSession }
}
