# TEAM_SETUP — total setup, zero prior context

Everything below assumes you have never run this repo. Follow top to bottom.
Time: ~25 minutes.

---

## 0. The big picture

Third Hand is a voice agent for technicians standing inside broken machines.
It's our entry for the **Great Indian AI Internship Challenge (Gnani AI)**, and
it runs on **both platforms straight from our own FastAPI backend**:

| Platform | What it does for us | Where |
| --- | --- | --- |
| **Gnani AI** | **Ears + voice**: **Prisma v3.0** speech→text (`indic-auto` over 10 Indian languages) and **Timbre v3.0** text→speech (one voice, all 10 languages) | `backend/main.py` calls `api.vachana.ai` directly |
| **OpenRouter** | **Brain + live web**: a tool-calling LLM drives all 14 tools; the web-search plugin powers `search_web` with real citations, `read_page` quotes one page | `backend/main.py` calls `openrouter.ai/api/v1` |

The 3D scene (React + react-three-fiber) is our frontend. The backend
(`backend/main.py`) drives everything: the browser listens hands-free (mic +
VAD, no push-to-talk) → `/api/stt` → `/api/agent/turn` (tool loop; scene tools
fire in the browser, data tools run server-side) → `/api/tts` → audio plays →
straight back to listening.

The system prompt that powers the agent lives in `backend/main.py`
(`SYSTEM_PROMPT`) and is documented in `AGENT_SETUP.md`. There is **no
dashboard, no ngrok, no platform toggle** — our process owns every call.

---

## 1. Prerequisites

| # | Thing | Where | Status |
| --- | --- | --- | --- |
| 1 | Gnani API key | [app.gnani.ai](https://app.gnani.ai) → API keys. Registrants get **5,000 programme credits** by email after registering for the challenge. | in `backend/.env` |
| 2 | OpenRouter API key | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) | in `backend/.env` |
| 3 | Node 18+, Python 3.11+ | — | needed below |

Both keys live **only** in `backend/.env` (gitignored; template in
`backend/.env.example`). Optional env knobs:

```bash
OPENROUTER_MODEL=google/gemini-2.5-flash   # any tool-calling chat model
GNANI_TTS_VOICE=Shivani                    # any Timbre v3.0 voice
```

---

## 2. PART A — smoke tests (do these first, always)

```bash
cd backend
python -m venv .venv      # first time only; activate it next:
source .venv/bin/activate          # (Windows: .venv\Scripts\activate)
pip install -r requirements.txt
cp .env.example .env               # then paste BOTH keys in

python test_stack.py               # expect: 4/4 checks passed
```

The four checks, in order:

1. **Gnani Timbre** — synthesises a test sentence → `artifacts/tts_check.wav`
2. **Gnani Prisma** — transcribes that clip back, auto-detecting the language
3. **OpenRouter LLM** — returns a native `get_procedure` tool call from a fault phrase
4. **OpenRouter web** — live web search returning real citation URLs

Sprint rule: real platform output printed before any UI gets built. If any
check fails, fix it here — the troubleshooting table is in `GNANI_SETUP.md`.

---

## 3. The 14 tools — nothing to set up, everything to know

**There is no per-tool setup.** All 14 are already declared in
`backend/main.py` (`TOOL_SCHEMAS`, handed to the OpenRouter model with every
turn) and all 14 implementations are live. `/api/health` reports them all.
Your job is knowing what each does and how to prove it in 5 seconds.

**How the loop routes them:** the model returns `tool_calls` → tools in the
`SERVER_TOOLS` dict run inside the backend and their results feed the next
model round → tools in `BROWSER_TOOL_NAMES` are queued, returned to the
frontend, and fired in `clientTools.ts` right after the reply arrives — so
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
| `get_user_pointer` *(read)* | Which part is the cursor on | "what's THIS bit?" — the money shot |
| `get_view_state` *(read)* | Machine + focus + highlights + step | agent self-checks before answering |

### The 6 SERVER tools (`backend/main.py`, `SERVER_TOOLS` dict)

| Tool | Does | Prove it by saying |
| --- | --- | --- |
| `get_procedure` | Official steps + safety warning from the manifest | "my extruder is clicking" |
| `lookup_part` | Price, torque, tool, safety, service interval | "how much torque on the nozzle?" |
| `order_part` | Cart + order id + ETA (asks yes first) | "order me a new nozzle" |
| `log_repair` | Writes the structured service record | "log the repair" → report URL |
| `search_web` *(OpenRouter web)* | Live search with citations, cached per query | "what does a nozzle actually cost?" |
| `read_page` *(direct GET)* | Quotes the page a search result points at | "read that page and tell me" |

### Verify all 14 in 5 minutes

1. `http://127.0.0.1:8000/api/health` → all 14 across `tools.server` +
   `tools.browser`, both keys configured, models listed.
2. Click **Start session**, wait for the spoken intro, then just say the
   phrases above; every call is logged in the panel's service log
   (`tool: get_procedure`, `highlight -> …`, `order …`, `web: search …`).
3. No mic? Drive the scene from DevTools console: `__th.set_explode({ level: 0.7 })`
   (`window.__th` exposes all 8 browser tools).
4. Server tools via curl (same code path the agent uses):
   ```bash
   curl -H "X-Tool-Secret: third-hand-dev" -H "Content-Type: application/json" \
        -d '{"part_id":"nozzle"}' http://127.0.0.1:8000/api/tools/lookup_part
   curl -H "X-Tool-Secret: third-hand-dev" -H "Content-Type: application/json" \
        -d '{"query":"nozzle price"}' http://127.0.0.1:8000/api/tools/search_web
   ```
5. Tool calls not firing? Speak a fault phrase, not a greeting — the model
   picks tools off the system prompt; check `SYSTEM_PROMPT` in `main.py`.

### Adding tool #15 (if ever needed, ~15 min)

1. **Schema** — add `_fn("new_tool", "one-line description", {params}, [required])`
   to `SERVER_AND_WEB_SCHEMAS` (or the browser lists for scene tools) in
   `main.py`. The description steers the model — write it like an order.
2. **Implement** — server tool: `def _tool_new_tool(...)` + one line in the
   `SERVER_TOOLS` dict. Browser tool: same name in `clientTools.ts`.
3. Restart uvicorn → speak the trigger phrase.

---

## 4. PART B — run the app

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

## 5. PART C — 10-minute verification checklist

1. Backend health: `http://127.0.0.1:8000/api/health` → 14 tools, machines
   `printer / mri / pump`, both keys configured.
2. Page loads, machine tabs switch the 3D scene.
3. Click **Start session** → the agent introduces itself out loud (this is
   **Gnani Timbre speaking**), then the status chip flips to **listening — just
   talk**. Say *"my extruder is clicking"*. Expected: agent speaks, safety
   warning first, scene explodes + highlights a part, service log and
   procedure step appear in the panel.
4. Say *"what does a replacement nozzle actually cost?"* → agent searches the
   live web (OpenRouter), answers with a source; **LIVE WEB** cards appear in
   the panel; click one.
5. Switch machine tab to **MRI**, say *"where is the quench button?"* →
   scene refocuses on the MRI part.
6. Say something in Hindi → reply comes back in Hindi (Prisma detected it,
   Timbre speaks it — the Gnani multilingual moment).

If any step fails → troubleshooting table in `GNANI_SETUP.md`.

---

## 6. PART D — the 90-second demo + the submission

> The **screen-recorder version** — exact narration, timestamps, OBS settings,
> click-by-click — is in **`DEMO_SCRIPT.md`** at the repo root. Rehearse this
> live version first, then record from the script.

1. **(0:00)** Scene on printer. *"This is Third Hand — a voice agent that can
   see what you're looking at."*
2. **(0:10)** Click **Start session** — spoken intro (first thing the judges
   hear — it's **Gnani Timbre**). Then just talk, no buttons: *"my extruder is
   clicking"* — safety first, scene explodes and highlights the part while the
   agent speaks. **(Gnani ears + OpenRouter brain + Gnani voice + our 14 tools.)**
3. **(0:35)** Point-and-ask: *"what's this bit?"* — it reads your pointer
   and answers about THAT part.
4. **(0:45)** *"What does a nozzle actually cost?"* — live web search,
   source cards appear. **(OpenRouter.)**
5. **(0:55)** Hindi: *"हिंदी में बताओ, पावर ऑफ़ कैसे करें?"* — replies in Hindi.
   **(Gnani Prisma → Gnani Timbre, no translation layer.)**
6. **(1:05)** *"Order me a nozzle"* → cart card. (1:15) *"Log the repair"* →
   service record card.
7. **(1:20)** Wrap: *"Three machines, one manifest. The technician never puts
   their tools down."*

**Submission reminders** (closes **Nov 10, 2026** per the
[programme terms](https://www.gnani.ai/great-indian-ai-internship-registration-form#terms)):

- Post the video on **LinkedIn and/or X** naming **Gnani AI's Prisma + Timbre**,
  tagging **@GnaniAi**, with **#GnaniAI** and **#GreatIndianAIInternshipChallenge**.
- Nominate one post per platform in the submission form; engagement before the
  closing cutoff counts toward shortlisting.
- State the APIs used: `prisma-v3.0`, `timbre-v3.0` (via `api.vachana.ai`) and
  the OpenRouter LLM for reasoning.

---

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `test_stack.py` import fails | You used the wrong Python. Activate `backend/.venv` first. |
| Gnani 401/402/403 | Key invalid / out of credit / missing scope — see `GNANI_SETUP.md` §6. |
| Gnani 429 | One active STT request at a time — the app only sends the next utterance after the previous turn finishes; don't fire two turns concurrently. |
| OpenRouter 401 / model errors | Check `OPENROUTER_API_KEY`, and that `OPENROUTER_MODEL` is a tool-calling chat model. |
| STT endpoint 422 | `python-multipart` missing → `pip install python-multipart` (it's in requirements.txt). |
| Browser: agent never answers | Backend not running, or `vite.config.ts` proxy target not `:8000`. Check the dev-server terminal for proxy errors. |
| Agent never calls scene tools | Speak a fault phrase ("extruder clicking", "pump leaking") — greetings alone may not trigger tools. Check `/api/health`. |
| Mic permission denied | Use Chrome/Edge on `localhost`, allow mic when prompted (hands-free: the mic stays open for the whole session). |
| Agent cuts you off / talks over you | It sends ~1.3 s after you stop. A noisy hall can trip the voice detector — use a headset mic, and Escape or End session to hang up. |

---

## 8. Repo map

| Path | What it is |
| --- | --- |
| `backend/main.py` | The entire agent: prompt, 14 tools, `/api/stt` `/api/agent/turn` `/api/tts`, session |
| `backend/data/*/` | Machine manifests: `parts.json`, `procedures.json` (+ GLB in `frontend`) |
| `backend/test_stack.py` | Gnani + OpenRouter smoke test — 4 checks (run these first, always) |
| `frontend/src/voiceAgent.ts` | Hands-free voice hook: VAD → STT → turn → tools → TTS |
| `frontend/src/clientTools.ts` | The 8 browser (scene) tools |
| `AGENT_SETUP.md` | Reference: the prompt + tool contract |
| `GNANI_SETUP.md` | Gnani AI + OpenRouter details: models, endpoints, curl examples, troubleshooting |
| `DEMO_SCRIPT.md` | Screen-recorder version of the demo: narration, timestamps, OBS setup |
| `README.md` | The pitch, architecture, and submission notes |
