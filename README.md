# Machinery

**A voice agent that can see what you are looking at.**

You are elbow-deep in a machine. You cannot type, you cannot scroll a PDF, and
the service manual is 180 pages. You say *"my extruder is clicking"*, and a
technician's voice walks you through it while the 3D model on the bench screen
explodes itself, spins to the part that matters, and lights it orange.

Then you point at something and say *"what's this bit?"*, and it knows.

Three machines ship out of the box: a **desktop 3D printer**, a **1.5T MRI
scanner**, and a **centrifugal pump** that was imported from a `.glb` and
labelled in about two minutes. Same agent, same fourteen tools, same code. Only
the manifest changes.

| Job | Technology |
|---|---|
| Ears | **Gnani AI Prisma v3.0** speech to text (10 Indian languages, automatic detection) |
| Voice | **Gnani AI Timbre v3.0** text to speech (one voice, all 10 languages) |
| Brain | **OpenRouter** LLM (tool-calling; model is a single env var) |
| Live web | **OpenRouter** web search plugin (real citations) |

> **New to the repo?** Read [TEAM_SETUP.md](TEAM_SETUP.md) first: keys, smoke
> tests, running the app, verification. API details and curl examples are in
> [GNANI_SETUP.md](GNANI_SETUP.md). The prompt and tool contract are documented
> in [AGENT_SETUP.md](AGENT_SETUP.md).

---

## The problem

Someone is standing at a broken machine. The knowledge they need exists. It is
in a 180-page PDF, a 22-minute video, or a senior colleague's head. All three
are unreachable **because their hands and eyes are busy.** The PDF cannot be
scrolled with greasy hands. The video cannot be scrubbed to minute 14. The
colleague is on another site, and even on the phone they cannot see what you
see.

That is an interface problem, which is why a voice agent is the right shape of
answer, and why the answer needs a screen it can drive.

The 3D model is not standing in for the real machine. No service software shows
you your literal machine; every OEM parts catalogue is an exploded diagram. The
difference here is that **you never have to put your tools down to operate it.**

---

## How it works

Machinery has a closed loop:

```
        agent  ──── focus / highlight / explode / step ────►  3D viewport
          ▲                                                        │
          └──────── get_user_pointer / get_view_state ◄────────────┘
```

Tools going *out* mean the agent changes what you are looking at mid-sentence.
Tools coming *back* mean the agent is not blind: it can ask the screen what the
human is pointing at before it answers. That second direction is the part
nobody builds, and it is what makes the difference between a chatbot with a
voice and a colleague.

Because Prisma hears across 10 Indian languages and every Timbre v3.0 voice
speaks all 10 of them, the whole loop works in Hindi, Tamil, Telugu, Bengali,
Marathi, and more. The detected language flows straight to the speaker: Hindi
in, Hindi out. No translation layer in between.

### Three modes, one agent

| Mode | What happens | Why the 3D matters |
|---|---|---|
| **Repair** | Fault → procedure → guided steps → parts → service record | Shows *which* screw |
| **Learn** | "Walk me through this machine" → outside-in tour, two sentences per part | Peeling the seven shells off an MRI *is* the mental model |
| **Quiz** | "Point at the part that fails when the chiller blocks" → `get_user_pointer` marks the answer | The answer is a gesture, not a multiple-choice box |

Learn mode is not a bolt-on. On an MRI you **cannot** practise on the
hardware: it is multi-crore, it is in clinical use, and downtime is measured in
cancelled patients. Digital first is not a compromise there, it is the only
option. And because the same agent then stands next to you in the field, a
trainee learns on exactly the model they will later be guided through. One
voice, one model, one set of part names, from training to the job.

---

## Architecture

```
┌──────────────────────── browser ────────────────────────┐
│  React + Vite                                            │
│                                                          │
│  voiceAgent.ts   talk (VAD) ──► record utterance         │
│        │  CLIENT TOOLS (8; the scene tools)               │
│        ▼                                                 │
│   zustand store ◄──── browser tools ──────┐              │
│        ▼                                  │              │
│   react-three-fiber viewport              │              │
│   (camera rig, explode, glow, dim,        │              │
│    callouts, pointer)                     │              │
└───────────────────────────────────────────┼──────────────┘
             │ POST /api/stt → /api/agent/turn → /api/tts  │
             ▼                                            │
┌──────────── FastAPI: the whole agent loop ──────────────┘
│  /api/stt            utterance → Gnani PRISMA v3.0        │
│                      transcript + detected language      │
│  /api/agent/turn     OpenRouter LLM + 14 tools,          │
│                      tool-calling loop                   │
│  /api/tts            reply → Gnani TIMBRE v3.0 → WAV     │
│  /api/tools/get_procedure   symptom → ordered steps      │
│  /api/tools/lookup_part     specs, torque, safety, price │
│  /api/tools/order_part      writes to the live cart      │
│  /api/tools/log_repair      writes the service record    │
│  /api/tools/search_web      OpenRouter live web search   │
│  /api/tools/read_page       fetches the cited page       │
│  /api/machine        which catalogue the tools read from │
└──────────────────────────────────────────────────────────┘
```

**Where each technology is used:**

| Job | Technology | How it is used |
|---|---|---|
| Ears | **Gnani Prisma v3.0** STT | Every spoken utterance is uploaded (30 s WAV or less) to `api.vachana.ai/stt/v3` with `language_code=indic-auto`; the reply carries `transcript` **and** `detected_language_code` |
| Voice | **Gnani Timbre v3.0** TTS | Every spoken reply goes to `api.vachana.ai/api/v1/tts/inference` in the language Prisma just heard; one voice speaks all 10 languages |
| Brain | **OpenRouter** LLM | `nvidia/nemotron-3.5-super-vl:free` by default (swap via `OPENROUTER_MODEL`) drives the 14-tool loop with native function calling. The backend sends `reasoning: {enabled: false}`, so reasoning-heavy models cannot burn the token budget on hidden thinking and go silent. |
| Live web | **OpenRouter web-search plugin** | `search_web` returns real answers plus citation URLs (rendered as source cards); `read_page` quotes one page |

**The split that matters.** Anything that changes *what you see* is a client
tool (instant, runs in the browser, no round trip). Anything that is *truth
about the world*, specs, stock, orders, records, is a server tool. Get this
split wrong and the demo feels laggy; get it right and the scene moves while
the agent is still mid-sentence.

---

## What's built

| Path | What it is |
|---|---|
| `frontend/src/machines/` | Three machines as data. Printer: 13 parts. MRI: 18 parts, seven concentric shells that telescope apart. Pump: 16 parts, generated from a GLB. |
| `frontend/src/components/MachineModel.tsx` | Every part its own mesh: movable, glowable, hoverable. Non-highlighted parts dim so the subject pops on a projector. |
| `frontend/src/components/Scene.tsx` | Camera rig that flies to the focused part. Lighting is **local** (Lightformers, not an HDR preset) so nothing downloads on slow wifi. |
| `frontend/src/clientTools.ts` | All 8 client tools, machine-aware, plus a `machinery` global to drive the scene from the console. |
| `frontend/src/voiceAgent.ts` | The hands-free loop: mic energy VAD, record, upload, play replies, never hears itself. |
| `frontend/src/label/` | The labelling studio at `#label`. Turns a `.glb` into a working machine. |
| `backend/main.py` | The whole agent loop: Gnani Prisma STT → OpenRouter LLM with 14 tools → Gnani Timbre TTS, plus the machine-scoped server tools (4 core + 2 live-web tools). |
| `backend/data/` | 47 parts with real torque figures and safety notes. 13 full procedures. |
| `backend/test_stack.py` | Four-check smoke test: Gnani TTS, Gnani STT, OpenRouter tools, OpenRouter web. Run it first, always. |
| `frontend/tools/` | Generators for the two sample models checked into `public/models/`. |

**Zero asset dependencies on the demo path.** The printer and scanner are built
from primitives. No GLB to download, no draco decoder, no CORS, no "the model
didn't load" five minutes before you go on. The pump proves the GLB path works
when you want it; it is the only machine that loads a file.

---

## Set up

**1. Keys (backend only, never in frontend code).** Copy the template and fill
in two values:

```bash
cd backend
cp .env.example .env
```

| Key | Where to get it | Shape |
|---|---|---|
| `GNANI_API_KEY` | [app.gnani.ai](https://app.gnani.ai), under API keys | `vach_...` |
| `OPENROUTER_API_KEY` | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) | `sk-or-v1-...` |

`.env` is gitignored. Optional knobs live there too (see
[Configuration](#configuration)).

**2. Backend.**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python test_stack.py                      # 4 ✅ means ears, voice, brain, web all live
uvicorn main:app --reload --port 8000
```

**3. Frontend.**

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The agent's prompt and tool schemas are configured **in code**
(`backend/main.py`). There is no dashboard step and no ngrok.

---

## Use it

Click **Start session**. Machinery calibrates the mic, speaks its intro, then
listens continuously. It ships an utterance about 1.3 s after you stop
talking, answers, and listens again. The mic is closed while it speaks, so it
never hears itself. Escape or **End session** hangs up.

Things to say:

| Say | What happens |
|---|---|
| *"my extruder is clicking"* | Safety warning, then step 1: the scene explodes, the camera flies, the part glows, the step is pinned on screen |
| *"done"* (or *"that didn't work"*) | Advances to the next step, or wraps up |
| *"what's this bit?"* (while hovering a part) | Reads your cursor with `get_user_pointer` and answers about THAT part. You never named it. |
| *"how much is a nozzle?"* / *"torque on the nozzle?"* | `lookup_part`: real price, torque spec, tool size, safety note |
| *"order me a new nozzle"* | Confirms part and price first, then adds it to the live cart with an order id and ETA |
| *"log the repair"* | Writes the structured service record; it shows on screen |
| *"show me everything inside"*, *"start over"* | Explodes / resets the scene |
| *"switch to the MRI"*, *"I'm at the pump now"* | Loads the other machine; the agent only uses part ids from that manifest |
| *"walk me through this machine"* | Learn mode: a tour, two sentences per part |
| *"quiz me"* / *"test me"* | Quiz mode: it asks you to point at the part; your cursor's answer is marked |
| *"what does a nozzle actually cost out there?"* | Live web search through OpenRouter; source cards appear in the panel |
| *"हिंदी में बताओ, अगला कदम क्या है?"* | Answers in spoken Hindi (Prisma heard it, Timbre speaks it) |

**Drive the scene without the agent.** Open the DevTools console at
`localhost:5173`:

```js
machinery.switch_machine({ machine: 'mri' })
machinery.set_explode({ level: 0.8 })
machinery.focus_part({ part_id: 'gradient_coil', zoom: 0.7 })
machinery.highlight_part({ part_id: 'chiller', label: 'start here: filter' })
machinery.get_view_state()
```

This is how you tune the visuals without the voice loop.

---

## Configuration

From `backend/.env`:

| Variable | Default | Notes |
|---|---|---|
| `GNANI_API_KEY` | (required) | Gnani API key, used for both STT and TTS |
| `OPENROUTER_API_KEY` | (required) | OpenRouter key for the LLM and the web search |
| `OPENROUTER_MODEL` | `nvidia/nemotron-3.5-super-vl:free` | Free, fast, reliable tool calls. Any OpenAI-compatible tool-calling chat model on OpenRouter works, e.g. `openai/gpt-4o-mini` |
| `GNANI_TTS_VOICE` | `Shivani` | Any Timbre v3.0 voice; see below |
| `TOOL_SECRET` | `machinery-dev` | Shared secret the tool wrappers send as `X-Tool-Secret` |

**Timbre v3.0 voices** (every voice speaks all 10 languages): Shivani,
Lakshmi, Kalpana, Chetana, Vasudha, Riyaa, Tarika (female); Avinash, Shubham,
Prakash, Devansh, Yashraj, Harshad (male).

**Languages** supported end to end (STT and TTS, the same set): Bengali,
English (India), Gujarati, Hindi, Kannada, Malayalam, Marathi, Punjabi, Tamil,
Telugu. Code-mixed English-Hindi ("Hinglish") speech works on input, and model
selection is one env var on output.

**Tuning the agent.** The persona and rules live in `SYSTEM_PROMPT` in
`backend/main.py`; tool schemas sit next to it in `TOOL_SCHEMAS`. Temperature
is 0.2 and replies are capped at three spoken sentences by prompt design. See
[AGENT_SETUP.md](AGENT_SETUP.md) for the full contract.

---

## Extending: the labelling studio

A new machine is three data files and no engine changes:

```
frontend/src/machines/<id>.ts      geometry: primitives, or glbUrl + meshName per part
backend/data/<id>/parts.json       specs, torque, safety, price, stock
backend/data/<id>/procedures.json  symptom → ordered steps
```

Register the machine in `frontend/src/machines/index.ts`, drop the folder in
`backend/data/`, and the backend picks it up on boot. The agent discovers the
part ids at runtime from `switch_machine`; its prompt never names a part.

### The real input is a labelled model

An unlabelled mesh off Sketchfab is useless here. The agent needs a stable id
per part that the renderer and the parts catalogue both agree on. A crude box
model with 13 correctly-named parts works perfectly; a beautiful
400k-triangle scan with no node names does not.

Labelled assemblies already exist in the wild:

| Where the model comes from | What you get | What a human still does |
|---|---|---|
| **CAD / STEP from the OEM** | Full assembly tree with real part numbers; it was built from a bill of materials | Almost nothing. Confirm which parts are serviceable. |
| **Well-authored GLB** | Named meshes (`Pump_Casing`, `Impeller`) | Confirm ids, fix a few labels |
| **Sloppy GLB** | `Mesh_001` … `Mesh_247` | Name the 20 that matter, ignore the rest |
| **Photogrammetry scan** | One blob, no parts | Segmentation: the hard case |

You never need every mesh. You need the fifteen or thirty a technician would
ever touch, and the OEM's parts catalogue already tells you exactly which
those are. And labelling is one-time per model, not per session, so it
amortises over thousands of service calls.

Run the app and go to **`#label`** to use the studio:

```
localhost:5173/#label
```

Drop in a `.glb` and it reads the assembly tree out of the file:

- **part ids and labels** from the node names (`Bearing_Housing` →
  `bearing_housing`, "Bearing Housing")
- **explode vectors** from geometry: direction from the part's centroid
  relative to the assembly, distance from its size *and its nesting depth*.
  That last one matters. A naive centroid explode fails on any nested
  assembly, because an impeller sitting inside a casing shares its centre and
  the two fly together, so the impeller never becomes visible. Counting how
  many larger boxes enclose a part fixes it; inner parts get a shell's worth
  of extra travel.
- **scale, floor height and camera framing** so an imported model lands the
  right way up at a sensible size whatever units it arrived in

You answer two questions per row: *would a technician ever touch this*, and
*what do they call it*. Export writes the three files above.

**Proof: the pump.** `frontend/src/machines/pump.ts` is generated output,
checked in unedited. It came from dropping `public/models/pump.glb` into the
studio, unticking three structural nodes, and clicking Export: 19 meshes in,
16 serviceable parts out. Everything works on it identically. What the studio
could *not* generate is `backend/data/pump/parts.json` and
`procedures.json`: the torque figures, the safety notes, the order a good
technician actually checks things. That is the honest measure of onboarding a
machine: **the geometry is free, the knowledge is the work.** The knowledge is
also the thing worth owning.

### If your .glb will not load

Real models are almost never plain glTF, and `GLTFLoader` refuses compressed
ones with errors that read like the file is broken when it is not. All three
common cases are handled:

| Symptom | What it is | Handled |
|---|---|---|
| `setMeshoptDecoder must be called…` | Ran through `gltfpack`, or downloaded from Sketchfab | ✅ meshopt decoder is bundled |
| `no DRACOLoader instance provided` | Draco compressed, common out of Blender | ✅ decoder served from `public/decoders/draco/` |
| `no KTX2Loader instance provided` | KTX2 / Basis textures | ✅ transcoder served from `public/decoders/basis/` |
| `Failed to load buffer "scene.bin"` | A `.gltf` with its data in a sibling file | Select the `.gltf` **and** its `.bin` and textures together; the studio takes multiple files |

The decoders are vendored into `public/decoders/` rather than pulled from a
CDN. Two sample models are checked in: `pump.glb` (single-file binary) and
`valve.gltf` (embedded buffers). `frontend/tools/` regenerates both.

---

## API reference

Everything below is served by `backend/main.py`. The four tool wrappers accept
an optional `machine` field (`printer` | `mri` | `pump`); omit it and the
backend uses whatever the browser last switched to.

| Endpoint | What it does |
|---|---|
| `POST /api/stt` | Receives the utterance WAV, returns `{text, language}` via Gnani Prisma v3.0 |
| `POST /api/agent/turn` | One conversational turn, streamed as NDJSON lines so the browser can fire scene tools the moment they queue: `{"type":"tool","name":...,"args":{...}}` per scene tool, then `{"type":"final","speech":...,"sources":[...]}`, or `{"type":"error","detail":...}` |
| `POST /api/tts` | Reply text to base64 WAV via Gnani Timbre v3.0, in the given language |
| `POST /api/tools/get_procedure` | Spoken complaint → matching procedure with steps and safety warning |
| `POST /api/tools/lookup_part` | Part id → price, stock, torque, tool, safety note, service interval |
| `POST /api/tools/order_part` | Part id + quantity → cart line with order id and ETA; refuses non-orderable parts |
| `POST /api/tools/log_repair` | Writes the structured service record (`GET /api/report/{session_id}` reads it back) |
| `POST /api/tools/search_web` | Live web search via OpenRouter; results cached per query, sources saved for the panel |
| `POST /api/tools/read_page` | Fetches and strips one page the agent wants to quote |
| `POST /api/machine` | Registers the active machine with the backend so server tools scope correctly |
| `GET /api/machines` | Lists all machines and their procedures |
| `GET /api/session` | Full session state: cart, service log, procedure, report, sources |
| `POST /api/session/reset` | Fresh session (also clears the web caches) |
| `GET /api/health` | Config and models report |

Tool wrappers require `X-Tool-Secret: <TOOL_SECRET from backend/.env>`.

---

## Tool reference

The agent has 14 tools. Schemas are handed to the model with every turn
(`TOOL_SCHEMAS` in `backend/main.py`); the model returns `tool_calls` and the
loop routes them. Full descriptions and parameter tables are in
[AGENT_SETUP.md](AGENT_SETUP.md).

**Browser tools** (fire in the scene, streamed mid-turn through
`frontend/src/clientTools.ts`):

`switch_machine`, `set_explode`, `focus_part`, `highlight_part`, `show_step`,
`clear_scene`, `get_user_pointer` (reads the cursor), `get_view_state`

**Server tools** (run in the backend, results feed the next model round):

`get_procedure`, `lookup_part`, `order_part`, `log_repair`, `search_web`,
`read_page`

When `get_procedure` matches, the backend pre-fires step 1's scene tools
(explode → focus → highlight → show_step) itself, saving an extra model round.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `test_stack.py` import fails | Use the venv: `source backend/.venv/bin/activate` first. |
| Gnani 401 / 403 / 402 | Key invalid, missing the STT/TTS scope, or out of credit. Check `GNANI_API_KEY` in `backend/.env`; details in `GNANI_SETUP.md`. |
| Gnani 429 | One active STT request at a time. The app only sends the next utterance after the previous turn finishes; don't fire two turns concurrently. |
| TTS 400 | Voice or model mismatch. Use `timbre-v3.0` voice names (Shivani, Avinash, ...); a v2.5 voice like `Nalini` is rejected by v3.0. |
| OpenRouter 401, or no tool calls | Check `OPENROUTER_API_KEY`; make sure `OPENROUTER_MODEL` is a tool-calling chat model. |
| Browser: agent never answers | Backend not running, or the vite proxy target is not `:8000`. Check the dev-server terminal for proxy errors. |
| Agent never calls scene tools | Speak a fault phrase ("extruder clicking", "pump leaking"); greetings alone may not trigger tools. Check `/api/health` lists 14 tools. |
| Agent uses printer ids on the MRI | `switch_machine` returns the valid list; the prompt forbids cross-machine ids. |
| Mic permission denied | Use Chrome/Edge on `localhost` and allow the mic when prompted. |
| Agent cuts you off in a loud room | The voice detector trips on ambient noise. Use a headset with a boom mic; the laptop mic picks up the room. |
| Search returns "unavailable" | The agent says so in one line and continues with `get_procedure` by design; nothing on the voice path has a single point of failure. |
| Slow wifi | Nothing on the visual path downloads (no external assets); test the web search separately. |

---

## Roadmap

- **Point a camera at the real thing.** Let the agent read the machine's
  rating plate or the service manual and pull the model number and part ids
  into the catalogue itself. That is the version people pay for.
- **Blend hands and audio in field hardware.** The audio stack tolerates 8 kHz
  phone-grade input, so the same prompt and tools run behind a phone number
  for technicians with no laptop.
- **Deeper bilingual and code-mixed coverage.** Already wired for 10 languages
  plus Hinglish; next stop is per-machine domain phrase lists in each language.
- **The data flywheel.** Every session already writes a structured record:
  symptom, root cause, steps, parts. Five hundred sessions tell you the PTFE
  tube is the actual culprit 40% of the time, and where your manual is wrong:
  if technicians keep saying "that didn't work" at step 3, step 3 is bad.
- **AR.** Same agent, but the highlight lands on the real hardware instead of
  a model.

---

## Built with

- [Gnani AI](https://docs.gnani.ai): Prisma v3.0 speech to text and Timbre
  v3.0 text to speech, via `api.vachana.ai`
- [OpenRouter](https://openrouter.ai): the reasoning LLM and the live-web
  search plugin
- React, react-three-fiber, zustand, Vite, FastAPI, httpx

## Deploying on Render

The repository includes [`render.yaml`](render.yaml), which defines two Render
services:

1. `machinery-backend`: FastAPI web service under `backend/`
2. `machinery-frontend`: Vite static site under `frontend/`

In Render, choose **New → Blueprint**, connect this repository, and apply the
Blueprint. Add the values for `GNANI_API_KEY`, `GROQ_API_KEY`, and
`OPENROUTER_API_KEY` when prompted. The frontend is built with
`VITE_API_URL=https://machinery-backend.onrender.com`, and the backend accepts
requests from `https://machinery-frontend.onrender.com`.

Do not commit `backend/.env`; enter its values as Render environment variables.
