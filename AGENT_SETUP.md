# AGENT_SETUP — the prompt and tool contract (reference)

> **Where the agent lives now:** in code. The system prompt is `SYSTEM_PROMPT`
> in `backend/main.py`; the 14 tool schemas are the Python list next to it; the
> model that consumes them is OpenRouter (`OPENROUTER_MODEL` in
> `backend/.env`, default `google/gemini-2.5-flash`). There is no dashboard, no
> ngrok, no config UI — edit `main.py`, restart uvicorn, done.
>
> This doc is the *contract* the code implements: what the model is told and
> what each tool does. Keep it open while tuning.

One agent drives **all three machines**. Nothing in the prompt is
printer-specific or MRI-specific — it discovers the parts list at runtime from
`switch_machine` and `get_procedure`.

---

## 1. What the model gets, every turn

| Input | Source |
|---|---|
| `SYSTEM_PROMPT + BROWSER_NOTE` | `backend/main.py` — persona, three modes (repair / learn / quiz), safety rules, hard rules |
| `# Screen state right now` | The frontend's `viewSnapshot()` — machine, focused part, explode level, highlights, step, pointer part. **Fresh every turn**, appended to the system prompt |
| Last 8 conversation turns | `history` from `frontend/src/voiceAgent.ts` |
| The utterance | Transcript from **Gnani Prisma v3.0** (`/api/stt`), which also returns the detected language |
| 14 tool schemas | `TOOL_SCHEMAS` — OpenAI function format over OpenRouter |

Temperature 0.2, max_tokens 400, max 6 tool rounds per turn. Spoken replies
are hard-capped at three sentences; anything longer belongs on screen
(`show_step`), not in the air.

---

## 2. Client tools (run in the browser — names match `frontend/src/clientTools.ts`)

### `switch_machine`
> Put a different machine on screen. Call this as soon as the technician says which machine they are working on. The response lists every part id available on that machine — use only those ids afterwards.

| Param | Type | Req | Description |
|---|---|---|---|
| `machine` | string | ✅ | `printer`, `mri` or `pump`. Also accepts loose words like "scanner", "Ender" or "impeller". |

### `focus_part`
> Fly the on-screen camera to a part so the technician can see it. Call this before you talk about any part.

| Param | Type | Req | Description |
|---|---|---|---|
| `part_id` | string | ✅ | A part id from the current machine |
| `zoom` | number | ✖ | 1 = normal, 2 = close up, 0.7 = pull back to see context. Default 1. |

### `highlight_part`
> Make a part glow on screen and hang a short label on it. This is how you point at things. Everything else on screen dims, so use it on every step.

| Param | Type | Req | Description |
|---|---|---|---|
| `part_id` | string | ✅ | A part id from the current machine |
| `color` | string | ✖ | Hex. Default orange `#ff7a1a`. `#ef4444` danger, `#38bdf8` reference/second answer. |
| `label` | string | ✖ | 3–5 words max. Shown on screen next to the part. |

### `set_explode`
> Pull the assembly apart so buried parts become visible. 0 is fully assembled, 1 is fully exploded. On the scanner this telescopes the seven concentric shells apart — it is the clearest thing on screen, use it generously.

| Param | Type | Req | Description |
|---|---|---|---|
| `level` | number | ✅ | 0 to 1. Use the `explode` value from the current procedure step. |

### `show_step`
> Put the current instruction on screen so the technician can re-read it with dirty hands.

| Param | Type | Req |
|---|---|---|
| `step_number` | number | ✅ |
| `total_steps` | number | ✖ |
| `instruction` | string | ✅ |
| `tool` | string | ✖ |
| `check` | string | ✖ |

### `clear_scene`
> Reset to the fully assembled view with no highlights. Call when starting a new fault or beginning a tour.

*(no parameters)*

### `get_user_pointer` ⭐
> Find out which part the technician's cursor is on. Call this the instant they say "this", "that", "here" or "this bit" instead of asking them which part they mean. Also use it to mark answers in quiz mode.

*(no parameters)*

### `get_view_state`
> Read back what is on screen: current machine, focused part, explode level, highlights, step, and the full list of parts available. Use it if you are unsure whether a part is visible.

*(no parameters)*

Client tools during a turn are **queued and streamed as NDJSON** — the browser
fires them on the scene *while the model is still composing the reply*. The
`BROWSER_NOTE` in the prompt tells the model exactly that, so it never waits
on them.

---

## 3. Server tools (run inside `backend/main.py`, results feed the next round)

### `get_procedure`
> Look up the official service procedure for a fault. ALWAYS call this first, with the technician's own words.

Body: `symptom` (string, required), `machine` (string, optional).
Fuzzy-matches the spoken complaint against `backend/data/<machine>/procedures.json`.
When it matches, the backend **also pre-fires step 1's scene tools** (explode →
focus → highlight → show_step) and tells the model so — ~4–5 s saved per turn.

### `lookup_part`
> Get price, stock, torque spec, required tool, safety note and service interval for a part.

Body: `part_id` (string, required), `machine` (string, optional — omit to use
whatever is on screen).

### `order_part`
> Order a replacement part. Only call after the technician says yes. Refuses parts that are not field-serviceable.

Body: `part_id` (string, required), `quantity` (integer, default 1), `machine` (string, optional).

### `log_repair`
> Write the service record at the end of the job.

Body: `summary` (string, required), `root_cause` (string), `steps_completed`
(array of string), `parts_used` (array of string), `outcome`
(resolved | escalated | abandoned).

### `search_web` *(OpenRouter web-search plugin)*
> Search the LIVE internet for community fixes, recalls, or current part prices beyond our catalogue.

Body: `query` (string, required). Real citations come back as annotations —
the panel shows them as source cards, cached per query.

### `read_page`
> Fetch and read one web page when a search snippet is not enough.

Body: `url` (string, required). Direct GET + HTML→text, no scraper service.

---

## 4. Part ids

The agent gets these at runtime from `switch_machine`, so you do not need to
paste them anywhere. They are here for you, for testing.

**printer** — `nozzle`, `heatbreak`, `ptfe_tube`, `extruder_gear`, `hotend_fan`,
`bed_spring`, `bed_glass`, `x_belt`, `y_belt`, `z_leadscrew`, `gantry_wheel`,
`mainboard`, `filament_spool`

**mri** — `bore_liner`, `rf_body_coil`, `gradient_coil`, `shim_tray`,
`magnet_coil`, `cryostat`, `gantry_cover`, `patient_table`, `head_coil`,
`cold_head`, `quench_pipe`, `he_level_sensor`, `compressor`, `chiller`,
`gradient_amplifier`, `penetration_panel`, `rf_door_seal`, `erdu`

**pump** — `motor_body`, `motor_terminal_box`, `motor_fan`, `fan_cowl`,
`coupling`, `shaft`, `bearing_housing`, `bearing_front`, `bearing_rear`,
`mechanical_seal`, `pump_casing`, `impeller`, `casing_cover`, `suction_flange`,
`discharge_flange`, `drain_plug`
*(these ids were generated by the labelling studio from pump.glb, not typed)*

**Procedures**

| printer | mri | pump |
|---|---|---|
| first layer not sticking | helium boil-off | seal leak |
| extruder clicking / under-extrusion | zipper / RF artifact | low flow / cavitation |
| layer shift | gradient over-temperature | vibration |
| stringing | low SNR on head coil | |
| thermal runaway | quench emergency | |

---

## 5. Smoke tests

```bash
cd backend
python test_stack.py       # 4/4: Gnani TTS, Gnani STT, OpenRouter tool call, OpenRouter web
uvicorn main:app --port 8000
# then, with the app open:
#   "my extruder is clicking"     -> get_procedure (5 steps)
#   "how much is a nozzle"        -> lookup_part (₹180)
#   "I'm on the MRI, helium is dropping" -> boil-off procedure
#   "order a magnet coil"         -> refused, not field-orderable
#   "on the pump, there's water on the floor" -> seal-leak procedure
```

If those voice-phrase checks work, everything between the ears and the screen
is wired.
