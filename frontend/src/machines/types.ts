/**
 * A machine, described as data.
 *
 * This is the only file that knows anything about geometry. Everything else in
 * the app - the agent, the tools, the camera, the highlight system - works
 * against these types and has no idea whether it is looking at a 3D printer,
 * an MRI scanner, or a GLB somebody dragged in ten minutes ago.
 *
 * A machine gets its shape one of two ways:
 *
 *   PRIMITIVES  parts carry kind/pos/size and are built from boxes and
 *               cylinders. Zero asset dependencies. Good for demos and for
 *               machines nobody has modelled yet.
 *
 *   GLB         the machine carries `glbUrl` and each part carries `meshName`,
 *               pointing at a node inside that file. This is the real path:
 *               you import the manufacturer's model and label its meshes.
 *
 * Both behave identically from the agent's side. focus_part, highlight_part
 * and set_explode do not care which one they are driving.
 */

export type PartKind = 'box' | 'cyl' | 'cone' | 'torus' | 'tube' | 'glb'

export interface PartDef {
  /** Stable id. This is the word the agent and the renderer both agree on. */
  id: string
  label: string
  kind: PartKind

  /** GLB machines: the node name inside the .glb this part maps to. */
  meshName?: string

  /** Primitive machines only. Resting position. */
  pos?: [number, number, number]
  /**
   * Primitive machines only.
   * box:   [w, h, d]
   * cyl:   [radius, height, segments]
   * tube:  [radius, length, segments]   (open ended - a shell)
   * cone:  [radius, height, segments]
   * torus: [radius, tubeRadius, segments]
   */
  size?: [number, number, number]
  rot?: [number, number, number]

  /** Primitive machines: the colour. GLB machines: optional override. */
  color?: string

  /** direction and distance the part travels when the assembly is exploded */
  explode: [number, number, number]

  /** false for frame/structure the agent should not talk about */
  selectable?: boolean
  /** slightly see-through, for outer shells that hide everything else */
  opacity?: number
}

export interface Machine {
  id: string
  name: string
  /** one line, shown under the machine name in the UI */
  subtitle: string
  /** what the agent should call it when speaking */
  spokenName: string

  /**
   * Set this and the machine is rendered from a real model instead of
   * primitives. Path is relative to the frontend's public/ folder,
   * e.g. '/models/gearbox.glb'.
   */
  glbUrl?: string

  parts: PartDef[]
  /** vertical offset applied to the whole model so it sits on the floor */
  groupY: number
  /** uniform scale, mostly for imported models that arrive in the wrong units */
  scale?: number
  /** camera resting position when nothing is focused */
  homePos: [number, number, number]
  /** base camera distance when focusing a part. Bigger machine, bigger number. */
  focusDistance: number
}

export const ORIGIN: [number, number, number] = [0, 0, 0]

export function partPosition(p: PartDef, explode: number): [number, number, number] {
  const base = p.pos ?? ORIGIN
  return [
    base[0] + p.explode[0] * explode,
    base[1] + p.explode[1] * explode,
    base[2] + p.explode[2] * explode,
  ]
}

/** Tolerant lookup - the LLM will say "the nozzle" or "Nozzle" or "nozzle_04". */
export function resolvePartId(machine: Machine, raw: string): string | null {
  if (!raw) return null
  const k = raw.toLowerCase().trim().replace(/[\s-]+/g, '_')
  const exact = machine.parts.find((p) => p.id === k && p.selectable !== false)
  if (exact) return exact.id
  const hit = machine.parts.find(
    (p) =>
      p.selectable !== false &&
      (k.includes(p.id) || p.id.includes(k) || p.label.toLowerCase().includes(k)),
  )
  return hit ? hit.id : null
}

export function selectableParts(machine: Machine): PartDef[] {
  return machine.parts.filter((p) => p.selectable !== false)
}

export function partById(machine: Machine, id: string): PartDef | undefined {
  return machine.parts.find((p) => p.id === id)
}
