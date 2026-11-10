# DEMO_SCRIPT — record this, submit that

This is the exact running order for the screen recording. Every beat lists what is
**on screen** and the **narration** to say out loud. Total runtime ~90 s.

> Before you hit record: run the smoke test so nothing surprises you live
> (inside `backend`): `python test_stack.py`. Expect 4/4 — Gnani TTS, Gnani
> STT, OpenRouter tool call, OpenRouter web.

---

## Recording setup (2 minutes)

| Setting | Value |
|---|---|
| Recorder | OBS (best) or Xbox Game Bar `Win+Alt+R` (fine) |
| Capture | **Window capture**, not screen — pick the Chrome window on `localhost:5173` |
| Resolution | 1920×1080, **30 fps**
| Audio | Your mic ON (you narrate the beats). App sound ON (you hear the agent). Check OBS "desktop audio" + "mic" both in the mix |
| Browser | Fullscreen (`F11`), maximised. The panel (right side) must be fully visible |
| Prep | All 3 machine tabs loaded, backend on `:8000`, frontend on `:5173`, mic allowed in Chrome (click the mic icon in the address bar first) |

**The one hard rule:** the seconds between beats are silence + scene movement.
Let the agent finish talking before you say the next line — never talk over it.

---

## The script (start recording now)

### 0:00 — cold open (static wide shot, 3 s of silence)
**On screen:** printer scene, assembled. No session running.
**Say:** *"Third Hand — a voice agent that can see what you're looking at. Watch."*

### 0:08 — start the session
**Action:** click **Start session**. The mic calibrates, then the agent speaks its intro.
**On screen:** status chip → listening, spoken intro.
**Say nothing** — let the agent talk. (Gnani Timbre's voice: the first thing judges hear.)

### 0:18 — the fault (`get_procedure`)
**Say:** *"my extruder is clicking"*
**Watch:** ~3s later the scene **explodes and highlights the part while the agent
is still thinking** — the streaming tools beat.
**On screen:** STEP 1 panel, explode + glow, agent walks the first step out loud.

### 0:30 — the live web beat — THE pricing card (OpenRouter web search)
**Say:** *"what does a replacement nozzle actually cost?"*
**Watch:** the **LIVE WEB** cards appear in the panel with green **price pills**
pulled from the snippets. The agent names the shop and ~price and where it came from.
**When the cards appear, click the first one** so the source page opens.
**Say:** *"That's not our catalogue. That's the live web, right now. Sources on screen."*
**Action:** close the source tab (Ctrl+W), back to the scene.

### 0:45 — it can see you (pointer)
**Action:** hover a part — the nozzle.
**Say:** *"what is this bit?"*
**On screen:** pointer pill + the agent answers about THAT part.

### 0:55 — the multilingual beat (Gnani: Prisma hears it, Timbre speaks it)
**Say:** *"हिंदी में बताओ, पावर ऑफ़ कैसे करें?"*
**Watch:** reply comes back **in Hindi**, spoken by Gnani Timbre.

### 1:05 — it takes action (`order_part` → cart card)
**Say:** *"order me a new nozzle"*
**On screen:** **PARTS ORDERED** card + order id + ETA + total.

### 1:15 — it keeps records (`log_repair`)
**Say:** *"log the repair"*
**On screen:** **SERVICE RECORD** card with root cause, outcome, summary.

### 1:25 — wrap
**Action:** click **End session**.
**Say:** *"Three machines, one manifest. Hands on the machine — never on a manual."*

---

## Fallbacks if a beat dies live

| If... | Do |
|---|---|
| Agent didn't call tools (stayed chatty) | Repeat the phrase louder; if still chatty, say *"look up the procedure for the clicking extruder"* (forces `get_procedure`) |
| Live web search slow / empty | The card beat is optional — skip to pointer. `search_web` is cached per query, so the same question is instant on retry |
| Hindi reply came back in English | Skip it — say *"reply in Hindi"* once more; if it stays English, say *"show me the quench button on the MRI"* instead |
| Voice detection is twitchy in the room | Lean closer to the mic, pause between beats. It ships on ~1.3 s of silence |
| Anything hard-fails | Say *"we are going to restart the session"*, click End → Start, redo step 2. Edit the cut in OBS later |

Pro tip for OBS: cut the dead air at the start/end with a `OBS → Edit → Trim`. A 90 s recording cuts to ~75 s cleanly.