# Gnani AI + OpenRouter setup — paste-ready

Third Hand's ears and voice run on **Gnani AI** (the hackathon platform —
https://docs.gnani.ai). The brain and the live web run on **OpenRouter**
(https://openrouter.ai). Nothing else speaks to your keys.

```
   mic ──► talk (VAD) ──► mic→wav16k ──► /api/stt (Gnani Prisma v3.0)
                                              │
         /api/agent/turn (OpenRouter LLM, 14 tools, tool calling)
         search_web / read_page ──► OpenRouter web-search plugin
                                              │
   scene moves ───────►  /api/tts (Gnani Timbre v3.0) ──► voice plays
```

**No ngrok. No dashboard config. Two API keys total.** Gnani calls nothing of
ours — we call its REST endpoints from `backend/main.py`.

---

## 1. Keys

| Key | Where to get it | Shape |
| --- | --- | --- |
| **Gnani API key** | [app.gnani.ai](https://app.gnani.ai) → API keys (hackathon participants get 5,000 programme credits by email after registering) | `vach_...` |
| **OpenRouter API key** | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) | `sk-or-v1-...` |

Paste both into `backend/.env` (copy `backend/.env.example` as the template).
`.env` is gitignored — never commit it.

---

## 2. Smoke test — do this FIRST

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python test_stack.py     # expect 4/4 PASS
```

`test_stack.py` exercises every stage end-to-end:

1. **Gnani Timbre v3.0** — synthesises a sentence and saves `artifacts/tts_check.wav`
2. **Gnani Prisma v3.0** — transcribes that clip back (`indic-auto` detects the language)
3. **OpenRouter LLM** — chat with a native tool call (`get_procedure` schema)
4. **OpenRouter web** — the web-search plugin returns live citations

Sprint rule: real sponsor output printed before any UI gets touched.

One manual curl for each, if you want to verify outside Python:

```bash
# Ears — speech to text (10 Indian languages, auto-detect)
curl -X POST https://api.vachana.ai/stt/v3 \
  -H 'X-API-Key-ID: <GNANI_KEY>' \
  -F audio_file=@utterance.wav \
  -F model=prisma-v3.0 \
  -F language_code=indic-auto

# Voice — text to speech (returns a WAV)
curl -X POST https://api.vachana.ai/api/v1/tts/inference \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key-ID: <GNANI_KEY>' \
  -d '{"text":"testing one two three","voice":"Shivani","model":"timbre-v3.0","language":"en-IN","audio_config":{"sample_rate":48000,"num_channels":1,"sample_width":2,"encoding":"linear_pcm","container":"wav"}}' \
  --output test.wav

# Brain — OpenRouter chat + tools (OpenAI-compatible)
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer <OPENROUTER_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"google/gemini-2.5-flash","messages":[{"role":"user","content":"hello"}]}'
```

---

## 3. The models Third Hand uses

| Role | Model | Notes |
| --- | --- | --- |
| Ears (STT) | **Gnani Prisma v3.0** (`prisma-v3.0`) | 10 Indian languages; `language_code=indic-auto` detects the language and returns it as `detected_language_code` — that flows straight to TTS, so Hindi in → Hindi out. Handles code-mixed English-Hindi. |
| Brain (LLM) | **OpenRouter** (`OPENROUTER_MODEL`, default `google/gemini-2.5-flash`) | OpenAI-compatible endpoint with native tool calling — the whole 14-tool loop plugs in unchanged. Swap the model with one env var. |
| Voice (TTS) | **Gnani Timbre v3.0** (`timbre-v3.0`, voice `Shivani`) | Every v3.0 voice speaks all 10 languages — pick the voice, set the language per reply. `speed: 1.05` for technician pace. |
| Live web | **OpenRouter web-search plugin** (`plugins: [{"id":"web"}]`) | `search_web` gets real URLs back as annotations; `read_page` is a plain GET + HTML stripping. |

Our Gnani endpoints: `POST https://api.vachana.ai/stt/v3` (multipart),
`POST https://api.vachana.ai/api/v1/tts/inference` (JSON → binary WAV).
Header for both: `X-API-Key-ID`. Full reference: https://docs.gnani.ai/api/introduction/quick-start

Timbre v3.0 voices (all speak all 10 languages): Shivani, Lakshmi, Kalpana,
Chetana, Vasudha, Riyaa, Tarika (female); Avinash, Shubham, Prakash, Devansh,
Yashraj, Harshad (male). Change with `GNANI_TTS_VOICE` in `.env`.

---

## 4. What our backend wraps (everything else is app logic)

| Endpoint | What it does |
| --- | --- |
| `POST /api/stt` | browser uploads the utterance (16 kHz mono WAV, transcoded client-side) → Prisma v3.0 → `{text, language}` |
| `POST /api/agent/turn` | transcript + view state → OpenRouter LLM with 14 tool schemas → runs SERVER tools itself → **streams NDJSON**: one `{type:"tool"}` event per scene tool the moment it queues (the scene fires mid-turn), then `{type:"final", speech, sources}` |
| `POST /api/tts` | reply text → Timbre v3.0 → `{audio_b64}` (base64 WAV) |
| `POST /api/tools/search_web` | OpenRouter web-search plugin, cached per query, sources saved for the panel |
| `POST /api/tools/read_page` | direct GET + HTML→text so the agent can quote one specific page |

Tool schemas live in a Python list handed to the LLM (`backend/main.py`) —
no dashboard step.

---

## 5. 5-minute verification

1. `python test_stack.py` → 4 ✅
2. `uvicorn main:app --reload --port 8000` → `GET /api/health` shows
   `gnani_configured: true`, `openrouter_configured: true`, models
   `prisma-v3.0 / google/gemini-2.5-flash / timbre-v3.0`.
3. `curl -F "file=@artifacts/tts_check.wav" http://127.0.0.1:8000/api/stt` →
   the sentence comes back with `detected_language_code`.
4. Start the frontend, press **Start session**, say *"my extruder is clicking"*.

---

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| 401 from Gnani | `X-API-Key-ID` header missing or the key is wrong. Check `GNANI_API_KEY` in `backend/.env`. Keys in the header, not the body. |
| 402 from Gnani | `Insufficient credit` — register for the hackathon programme credits, or top up in the Gnani console. |
| 403 `SCOPE_NOT_ALLOWED` from Gnani | The key lacks the STT/TTS scope — regenerate it in the Gnani dashboard with both scopes. |
| 400 on TTS | Voice/model mismatch. Our voices are `timbre-v3.0` names (Shivani, Avinash, …); a v2.5 voice like `Nalini` is rejected by v3.0. |
| 429 from Gnani | Rate limited — you sent a request while the previous one was still running. Always send the NEXT utterance only after the previous turn finished (the app already behaves this way). |
| STT returns empty `transcript` | Sub-second or silent audio — the voice detector only ships clips with real speech, so this is rare; it is not an error. |
| OpenRouter 401 | Key missing/expired — check `OPENROUTER_API_KEY` in `backend/.env`. |
| OpenRouter tool call never comes | Use a tool-capable model (`google/gemini-2.5-flash`, `openai/gpt-4o-mini`, `meta-llama/llama-3.3-70b-instruct`). |
| STT hangs >5 s occasionally | Prisma v3.0 has a 5 s transcription-timeout budget — retry the same clip. Rare in practice. |
