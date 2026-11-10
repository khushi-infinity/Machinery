/**
 * CLIENT TOOLS - the agent's hands and eyes inside the browser.
 *
 * Two families, and the split is the whole point of this project:
 *
 *   WRITE tools  (Wait for response = OFF in the dashboard)
 *     The agent changes what you are looking at *while it is still talking*.
 *
 *   READ tools   (Wait for response = ON  in the dashboard)
 *     The agent asks the viewport what is going on before it answers. This is
 *     what stops it being a blind chatbot: when the user says "what's THIS?",
 *     get_user_pointer tells the agent exactly which part is under the cursor.
 *
 * Every tool is machine-aware. The same seven tools drive a 3D printer or an
 * MRI scanner - only the manifest under src/machines/ changes.
 *
 * Tool names here MUST match the tool names declared in backend/main.py
 * (TOOL_SCHEMAS) exactly. They are case sensitive. See AGENT_SETUP.md.
 */

import { useScene } from './store'
import { partById, resolvePartId, resolveMachineId, selectableParts, getMachine } from './machines'

const say = (text: string) =>
  useScene.getState().push({ role: 'tool', text, ts: Date.now() })

const currentMachine = () => useScene.getState().machine

const partList = () =>
  selectableParts(currentMachine())
    .map((p) => p.id)
    .join(', ')

/** Keep the backend's idea of the active machine in sync so SERVER tools
 *  (get_procedure, lookup_part) scope to the right catalogue. */
async function syncMachineToBackend(machineId: string) {
  try {
    await fetch('/api/machine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machine: machineId }),
    })
  } catch {
    /* backend not up - the scene still switches */
  }
}

export const clientTools = {
  /**
   * Put a different machine on screen. Call this the moment the technician
   * mentions a machine that is not the one currently loaded.
   */
  switch_machine: ({ machine }: { machine: string }): string => {
    const id = resolveMachineId(machine)
    if (!id) return `No machine called ${machine}. Available: printer, mri.`
    const m = getMachine(id)
    useScene.getState().setMachine(id)
    void syncMachineToBackend(id)
    say(`machine -> ${m.name}`)
    return `${m.name} is now on screen, fully assembled. Its parts are: ${selectableParts(m).map((p) => p.id).join(', ')}`
  },

  /** Fly the camera to a part and hold it there. */
  focus_part: ({ part_id, zoom }: { part_id: string; zoom?: number }): string => {
    const m = currentMachine()
    const id = resolvePartId(m, part_id)
    if (!id) return `No part called ${part_id} on ${m.name}. Known parts: ${partList()}`
    useScene.getState().focus(id, zoom ?? 1)
    say(`camera -> ${partById(m, id)!.label}`)
    return `Camera is now on ${partById(m, id)!.label}.`
  },

  /** Glow a part and hang a label on it. This is how you "point" by voice. */
  highlight_part: ({ part_id, color, label }: { part_id: string; color?: string; label?: string }): string => {
    const m = currentMachine()
    const id = resolvePartId(m, part_id)
    if (!id) return `No part called ${part_id} on ${m.name}. Known parts: ${partList()}`
    useScene.getState().addHighlight({
      partId: id,
      color: color || '#ff7a1a',
      label: label || partById(m, id)!.label,
    })
    say(`highlight -> ${partById(m, id)!.label}`)
    return `${partById(m, id)!.label} is now glowing on screen. You can refer to it as "the part lit up in orange".`
  },

  /** 0 = assembled, 1 = fully exploded. Use it to reveal buried parts. */
  set_explode: ({ level }: { level: number }): string => {
    const v = Math.max(0, Math.min(1, Number(level)))
    useScene.getState().setExplode(v)
    say(`explode -> ${Math.round(v * 100)}%`)
    return `Assembly is ${Math.round(v * 100)} percent exploded.`
  },

  /** Put the current instruction on screen so the tech can re-read it. */
  show_step: ({ step_number, total_steps, instruction, tool, check }: {
    step_number: number; total_steps?: number; instruction: string; tool?: string; check?: string
  }): string => {
    useScene.getState().setStep({
      n: Number(step_number),
      total: Number(total_steps ?? 0),
      instruction, tool, check,
    })
    say(`step ${step_number} on screen`)
    return `Step ${step_number} is on screen.`
  },

  clear_scene: (): string => {
    useScene.getState().reset()
    say('scene reset')
    return 'Scene reset to the assembled view.'
  },

  // ------------------------------------------------------------------------
  // READ TOOLS - set "Wait for response" ON for these two.
  // ------------------------------------------------------------------------

  /**
   * THE ONE THAT MAKES PEOPLE SIT UP.
   * User says "what is this bit here?" while hovering. Agent calls this,
   * gets the exact part, and answers as if it were standing next to them.
   */
  get_user_pointer: (): string => {
    const { pointerPart, lastUserPointed, machine } = useScene.getState()
    const id = pointerPart || lastUserPointed
    if (!id) {
      return JSON.stringify({
        machine: machine.id,
        pointing_at: null,
        hint: 'The technician is not pointing at anything. Ask them to hover over or click the part on screen.',
      })
    }
    const p = partById(machine, id)!
    say(`pointer? -> ${p.label}`)
    return JSON.stringify({
      machine: machine.id,
      pointing_at: id,
      label: p.label,
      currently_hovering: Boolean(pointerPart),
      hint: `Answer about the ${p.label}. Call lookup_part with part_id "${id}" if you need specs, price, safety notes or service interval.`,
    })
  },

  /** Lets the agent avoid saying "look at the nozzle" when it is off screen. */
  get_view_state: (): string => {
    const s = useScene.getState()
    return JSON.stringify({
      machine: s.machine.id,
      machine_name: s.machine.name,
      focused_part: s.focusedPart,
      focused_label: s.focusedPart ? partById(s.machine, s.focusedPart)?.label : null,
      explode_level: Number(s.explode.toFixed(2)),
      highlighted: s.highlights.map((h) => ({ part_id: h.partId, label: h.label })),
      current_step: s.step?.n ?? null,
      pointer_on: s.pointerPart,
      visible_parts: selectableParts(s.machine).map((p) => p.id),
    })
  },
}

/**
 * Console affordance: drive the whole scene from the browser DevTools while
 * the agent is offline (handy for prep, tuning, and demos).
 *
 *   machinery.switch_machine({ machine: 'mri' })
 *   machinery.set_explode({ level: 0.7 })
 *   machinery.focus_part({ part_id: 'gradient_coil', zoom: 1.4 })
 *   machinery.highlight_part({ part_id: 'cold_head', label: 'listen for a knock' })
 *   machinery.get_user_pointer()
 */
if (typeof window !== 'undefined') {
  ;(window as any).machinery = clientTools
}
