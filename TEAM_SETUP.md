# TEAM_SETUP: total setup, zero prior context

Everything below assumes you have never run this repo. Follow top to bottom.
Time: about 25 minutes.

---

## 0. The big picture

Machinery is a voice agent for technicians standing inside broken machines.
It runs on two platforms, and **our own FastAPI backend owns every call**:

| Platform | What it does for us | Where |
| --- | --- | --- |
| **Gnani AI** | **Ears + voice**: **Prisma v3.0** speech to text (`indic-auto` over 10 Indian languages) and **Timbre v3.0** text to speech (one voice, all 10 languages) | `backend/main.py` calls `api.vachana.ai` directly |
| **OpenRouter** | **Brain + live web**: a tool-calling LLM drives all 14 tools; the web-search plugin powers `search_web` with real citations, `read_page` quotes one page | `backend/main.py` calls `openrouter.ai/api/v1` |

The 3D scene (React + react-three-fiber) is our frontend. The backend
(`backend/main.py`) drives everything: the browser listens hands-free (mic +
VAD, no push-to-talk), posts to `/api/stt`, then `/api/agent/turn` (tool loop;
scene tools fire in the browser, data tools run server-side), then `/api/tts`,
then the audio plays and it listens again.

The system prompt lives in `backend/main.py` (`SYSTEM_PROMPT`) and is
documented in `AGENT_SETUP.md`. There is **no dashboard, no ngrok, no platform
toggle**; our process calls everything directly.

---

## 1. Prerequisites

| # | Thing | Where |
| --- | --- | --- |
| 1 | Gnani API key | [app.gnani.ai](https://app.gnani.ai) → API keys |
| 2 | OpenRouter API key | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |
| 3 | Node 18+, Python 3.11+ | system |

Both keys live **only** in `backend/.env` (gitignored; template in
`backend/.env.example`). Optional env knobs:

```bash
OPENROUTER_MODEL=nvidia/nemotron-3.5-super-vl:free   # free, fast, reliable tool calls
GNANI_TTS_VOICE=Shivani                    # any Timbre v3.0 voice
```

---

## 2. PART A: smoke tests (do these first, always)

```bash
cd backend
python -m venv .venv        # first time only; activate it after:
source .venv/bin/activate   # (Windows: .venv\Scripts\activate)
pip install -r requirements.txt
cp .env.example .env        # then paste both keys in

python test_stack.py        # expect: 4/4 checks passed
```

The four checks, in order:

1. **Gnani Timbre** synthesises a test sentence into `artifacts/tts_check.wav`
2. **Gnani Prisma** transcribes that clip back, auto-detecting the language
3. **OpenRouter LLM** returns a native `get_procedure` tool call from a fault phrase
4. **OpenRouter web** returns a live search with real citation URLs

Run this before touching any UI. If a check fails, the troubleshooting table
is in `GNANI_SETUP.md`.

---

## 3. The 14 tools: nothing to set up, everything to know

**There is no per-tool setup.** All 14 are declared in `backend/main.py`
(`TOOL_SCHEMAS`, handed to the model with every turn) and all 14
implementations are live; `/api/health` reports them. Your job is knowing what
each does and how to prove it in 5 seconds.

**How the loop routes them:** the model returns `tool_calls`. Tools in the
`SERVER_TOOLS` dict run inside the backend and their results feed the next
model round. Tools in `BROWSER_TOOL_NAMES` are queued, returned to the
frontend, and fired in `clientTools.ts` right after the reply arrives, so
**the scene moves while the agent is still talking.**

### The 8 BROWSER tools (`frontend/src/clientTools.ts`)

| Tool | Does | Prove it by saying |
| --- | --- | --- |
| `switch_machine` | Loads printer / mri / pump | "I'm at the scanner now" |
| `set_explode` | 0 = assembled → 1 = fully exploded | "show me everything inside" |
| `focus_part` | Camera flies to a part | "where's the cold head?" |
| `highlight_part` | Glow + label a part | "which part fails first?" |
| `show_step` | Pins the current instruction on screen | fires on every repair step |
| `clear_scene` | Reset to assembled view | "start over" |
| `get_user_pointer` (read) | Which part is the cursor on | "what's THIS bit?" |
| `get_view_state` (read) | Machine + focus + highlights + step | the agent self-checks before answering |

### The 6 SERVER tools (`backend/main.py`, `SERVER_TOOLS` dict)

| Tool | Does | Prove it by saying |
| --- | --- | --- |
| `get_procedure` | Official steps + safety warning from the manifest | "my extruder is clicking" |
| `lookup_part` | Price, torque, tool, safety, service interval | "how much torque on the nozzle?" |
| `order_part` | Cart + order id + ETA (asks yes first) | "order me a new nozzle" |
| `log_repair` | Writes the structured service record | "log the repair" → report URL |
| `search_web` (OpenRouter web) | Live search with citations, cached per query | "what does a nozzle actually cost?" |
| `read_page` (direct GET) | Quotes the page a search result points at | "read that page and tell me" |

### Verify all 14 in 5 minutes

1. `http://127.0.0.1:8000/api/health` → all 14 across `tools.server` and
   `tools.browser`, both keys configured, models listed.
2. Click **Start session**, wait for the spoken intro, then say the phrases
   above; every call is logged in the panel's service log
   (`tool: get_procedure`, `highlight -> …`, `order …`, `web: search …`).
3. No mic? Drive the scene from the DevTools console:
   `machinery.set_explode({ level: 0.7 })` (the `window.machinery` global
   exposes all 8 browser tools).
4. Server tools via curl (same code path the agent uses):
   ```bash
   curl -H "X-Tool-Secret: machinery-dev" -H "Content-Type: application/json" \
        -d '{"part_id":"nozzle"}' http://127.0.0.1:8000/api/tools/lookup_part
   curl -H "X-Tool-Secret: machinery-dev" -H "Content-Type: application/json" \
        -d '{"query":"nozzle price"}' http://127.0.0.1:8000/api/tools/search_web
   ```
5. Tool calls not firing? Speak a fault phrase, not a greeting. The model picks
   tools off the system prompt; check `SYSTEM_PROMPT` in `main.py`.

### Adding tool #15 (if ever needed, about 15 min)

1. **Schema**: add `_fn("new_tool", "one-line description", {params}, [required])`
   to `SERVER_AND_WEB_SCHEMAS` (or the browser lists for scene tools) in
   `main.py`. The description steers the model; write it like an order.
2. **Implement**: server tool, `def _tool_new_tool(...)` plus one line in the
   `SERVER_TOOLS` dict. Browser tool, same name in `clientTools.ts`.
3. Restart uvicorn, then speak the trigger phrase.

---

## 4. PART B: run the app

Backend (from repo root):

```bash
cd backend
source .venv/bin/activate
python -m uvicorn main:app --port 8000   # keep this window open
```

Frontend (new terminal, from repo root):

```bash
cd frontend
npm install          # first time only
npm run dev          # open the printed http://localhost:5173
```

---

## 5. PART C: 10-minute verification checklist

1. Backend health: `http://127.0.0.1:8000/api/health` → 14 tools, machines
   `printer / mri / pump`, both keys configured.
2. Page loads, machine tabs switch the 3D scene.
3. Click **Start session** → the agent introduces itself out loud (this is
   **Gnani Timbre speaking**), then the status chip flips to **listening, just
   talk**. Say *"my extruder is clicking"*. Expected: agent speaks, safety
   warning first, scene explodes and highlights a part, service log and
   procedure step appear in the panel.
4. Say *"what does a replacement nozzle actually cost?"* → agent searches the
   live web (OpenRouter), answers with a source; **LIVE WEB** cards appear in
   the panel; click one.
5. Switch the machine tab to **MRI**, say *"where is the quench button?"* →
   the scene refocuses on the MRI part.
6. Say something in Hindi → the reply comes back in Hindi (Prisma detected it,
   Timbre speaks it).

If any step fails, the troubleshooting table is in `GNANI_SETUP.md`.

---

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `test_stack.py` import fails | You used the wrong Python; activate `backend/.venv` first. |
| Gnani 401/402/403 | Key invalid, out of credit, or missing scope. See `GNANI_SETUP.md`. |
| Gnani 429 | One active STT request at a time. This app only sends the next utterance after the previous turn finishes; don't fire two turns concurrently. |
| OpenRouter 401 or model errors | Check `OPENROUTER_API_KEY`; make sure `OPENROUTER_MODEL` is a tool-calling chat model. |
| STT endpoint 422 | `python-multipart` missing → `pip install python-multipart` (it is in requirements.txt). |
| Browser: agent never answers | Backend not running, or the `vite.config.ts` proxy target is not `:8000`. Check the dev-server terminal for proxy errors. |
| Agent never calls scene tools | Speak a fault phrase ("extruder clicking", "pump leaking"); greetings alone may not trigger tools. Check `/api/health`. |
| Mic permission denied | Use Chrome/Edge on `localhost`, allow the mic when prompted (hands-free: the mic stays open the whole session). |
| Agent cuts you off / talks over you | It sends about 1.3 s after you stop. A noisy room can trip the voice detector; use a headset mic, and Escape or End session to hang up. |

---

## 7. Repo map

| Path | What it is |
| --- | --- |
| `backend/main.py` | The entire agent: prompt, 14 tools, `/api/stt` `/api/agent/turn` `/api/tts`, session |
| `backend/data/*/` | Machine manifests: `parts.json`, `procedures.json` (+ GLB in `frontend`) |
| `backend/test_stack.py` | Gnani + OpenRouter smoke test, 4 checks. Run these first, always. |
| `frontend/src/voiceAgent.ts` | Hands-free voice hook: VAD → STT → turn → tools → TTS |
| `frontend/src/clientTools.ts` | The 8 browser (scene) tools + the `window.machinery` console global |
| `AGENT_SETUP.md` | Reference: the prompt and the tool contract |
| `GNANI_SETUP.md` | Gnani AI + OpenRouter details: models, endpoints, curl examples, troubleshooting |
| `README.md` | The product overview, architecture, setup, usage, API and tool reference |
