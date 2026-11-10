import * as THREE from 'three'

/**
 * Where every part actually is, in world space, right now.
 *
 * Written every frame by whichever model is mounted (primitive or GLB), read
 * by the camera rig and the callout layer. Deliberately NOT in the zustand
 * store - this changes 60 times a second and nothing should re-render for it.
 */
export const worldPos: Record<string, THREE.Vector3> = {}

export function clearWorldPos() {
  for (const k of Object.keys(worldPos)) delete worldPos[k]
}

export function readWorldPos(id: string | null | undefined): THREE.Vector3 | null {
  return id ? worldPos[id] ?? null : null
}
