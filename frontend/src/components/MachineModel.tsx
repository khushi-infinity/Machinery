import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { partPosition, selectableParts, type Machine, type PartDef } from '../machines'
import { clearWorldPos, worldPos } from '../machines/runtime'
import { useScene } from '../store'

const HL = '#ff7a1a'
const HOVER = '#38bdf8'

// --------------------------------------------------------------------------
// shared look-and-feel: glow the subject, dim everything else
// --------------------------------------------------------------------------
function applyLook(
  mat: THREE.MeshStandardMaterial,
  base: THREE.Color,
  dim: THREE.Color,
  opts: { highlightColor?: string; hovered: boolean; anyHighlight: boolean; t: number; baseOpacity: number },
) {
  const { highlightColor, hovered, anyHighlight, t, baseOpacity } = opts
  const isSubject = Boolean(highlightColor)
  mat.color.lerp(anyHighlight && !isSubject ? dim : base, 0.09)

  if (highlightColor) {
    const pulse = 0.55 + 0.45 * Math.sin(t * 3.2)
    mat.emissive.set(highlightColor)
    mat.emissiveIntensity = 0.35 + pulse * 1.15
    if (mat.transparent) mat.opacity = 0.85
  } else if (hovered) {
    mat.emissive.set(HOVER)
    mat.emissiveIntensity = 0.7
    if (mat.transparent) mat.opacity = Math.min(0.7, baseOpacity + 0.3)
  } else {
    mat.emissiveIntensity += (0 - mat.emissiveIntensity) * 0.15
    if (mat.transparent) mat.opacity += (baseOpacity - mat.opacity) * 0.15
  }
}

// --------------------------------------------------------------------------
// PRIMITIVE machines - built from boxes and cylinders, no assets
// --------------------------------------------------------------------------
function Geometry({ p }: { p: PartDef }) {
  const s = p.size ?? [1, 1, 1]
  switch (p.kind) {
    case 'box':
      return <boxGeometry args={s} />
    case 'cyl':
      return <cylinderGeometry args={[s[0], s[0], s[1], s[2]]} />
    case 'tube':
      return <cylinderGeometry args={[s[0], s[0], s[1], s[2], 1, true]} />
    case 'cone':
      return <coneGeometry args={[s[0], s[1], s[2]]} />
    case 'torus':
      return <torusGeometry args={[s[0], s[1], 12, s[2]]} />
    default:
      return <boxGeometry args={s} />
  }
}

function PrimitivePart({ p }: { p: PartDef }) {
  const ref = useRef<THREE.Mesh>(null!)
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  const explode = useScene((s) => s.explode)
  const highlight = useScene((s) => s.highlights.find((h) => h.partId === p.id))
  const anyHighlight = useScene((s) => s.highlights.length > 0)
  const pointerPart = useScene((s) => s.pointerPart)
  const setPointer = useScene((s) => s.setPointer)

  const selectable = p.selectable !== false
  const transparent = p.opacity !== undefined && p.opacity < 1
  const color = p.color ?? '#8d97a6'

  const base = useMemo(() => new THREE.Color(color), [color])
  const dim = useMemo(() => new THREE.Color(color).multiplyScalar(0.3), [color])

  useFrame((state) => {
    if (!ref.current) return
    const [x, y, z] = partPosition(p, explode)
    ref.current.position.lerp(new THREE.Vector3(x, y, z), 0.12)
    worldPos[p.id] = ref.current.getWorldPosition(worldPos[p.id] ?? new THREE.Vector3())
    if (!matRef.current) return
    applyLook(matRef.current, base, dim, {
      highlightColor: highlight?.color,
      hovered: pointerPart === p.id && selectable,
      anyHighlight,
      t: state.clock.elapsedTime,
      baseOpacity: p.opacity ?? 1,
    })
  })

  return (
    <mesh
      ref={ref}
      position={p.pos ?? [0, 0, 0]}
      rotation={p.rot ?? [0, 0, 0]}
      castShadow={!transparent}
      receiveShadow
      onPointerOver={(e) => {
        if (!selectable) return
        e.stopPropagation()
        setPointer(p.id)
      }}
      onPointerOut={(e) => {
        if (!selectable) return
        e.stopPropagation()
        if (useScene.getState().pointerPart === p.id) setPointer(null)
      }}
    >
      <Geometry p={p} />
      <meshStandardMaterial
        ref={matRef}
        color={color}
        metalness={p.kind === 'cone' || p.kind === 'cyl' ? 0.75 : 0.35}
        roughness={0.42}
        transparent={transparent}
        opacity={p.opacity ?? 1}
        side={p.kind === 'tube' ? THREE.DoubleSide : THREE.FrontSide}
        depthWrite={!transparent}
      />
    </mesh>
  )
}

function PrimitiveModel({ machine }: { machine: Machine }) {
  return (
    <>
      {machine.parts.map((p) => (
        <PrimitivePart key={`${machine.id}:${p.id}`} p={p} />
      ))}
    </>
  )
}

// --------------------------------------------------------------------------
// GLB machines - a real imported model, parts mapped to node names
// --------------------------------------------------------------------------
interface Bound {
  part: PartDef
  node: THREE.Object3D
  home: THREE.Vector3
  mats: THREE.MeshStandardMaterial[]
  base: THREE.Color[]
  dim: THREE.Color[]
}

function GlbModel({ machine }: { machine: Machine }) {
  const gltf = useGLTF(machine.glbUrl!)
  const setPointer = useScene((s) => s.setPointer)

  // clone so hot reload / machine switching never mutates the cached original
  const root = useMemo(() => {
    const c = gltf.scene.clone(true)
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
        m.material = Array.isArray(m.material)
          ? m.material.map((x) => x.clone())
          : m.material.clone()
      }
    })
    return c
  }, [gltf.scene])

  // bind each part id to its node, remember where it started and what colour
  // it was, so explode and dim are both reversible
  const bounds = useMemo<Bound[]>(() => {
    const out: Bound[] = []
    for (const part of machine.parts) {
      const name = part.meshName ?? part.id
      const node = root.getObjectByName(name)
      if (!node) {
        console.warn(`[third-hand] "${machine.id}": no node named "${name}" in ${machine.glbUrl}`)
        continue
      }
      const mats: THREE.MeshStandardMaterial[] = []
      node.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const list = Array.isArray(m.material) ? m.material : [m.material]
        for (const mat of list) if ((mat as any).isMeshStandardMaterial) mats.push(mat as THREE.MeshStandardMaterial)
      })
      if (part.color) for (const m of mats) m.color.set(part.color)
      out.push({
        part,
        node,
        home: node.position.clone(),
        mats,
        base: mats.map((m) => m.color.clone()),
        dim: mats.map((m) => m.color.clone().multiplyScalar(0.3)),
      })
    }
    return out
  }, [root, machine])

  useLayoutEffect(() => () => clearWorldPos(), [machine.id])

  const tmp = useRef(new THREE.Vector3())

  useFrame((state) => {
    const s = useScene.getState()
    const anyHighlight = s.highlights.length > 0
    const t = state.clock.elapsedTime
    for (const b of bounds) {
      tmp.current.set(
        b.home.x + b.part.explode[0] * s.explode,
        b.home.y + b.part.explode[1] * s.explode,
        b.home.z + b.part.explode[2] * s.explode,
      )
      b.node.position.lerp(tmp.current, 0.12)
      worldPos[b.part.id] = b.node.getWorldPosition(worldPos[b.part.id] ?? new THREE.Vector3())

      const hl = s.highlights.find((h) => h.partId === b.part.id)
      const hovered = s.pointerPart === b.part.id && b.part.selectable !== false
      b.mats.forEach((m, i) =>
        applyLook(m, b.base[i], b.dim[i], {
          highlightColor: hl?.color,
          hovered,
          anyHighlight,
          t,
          baseOpacity: b.part.opacity ?? 1,
        }),
      )
    }
  })

  /** raycast lands on a leaf mesh - walk up until we hit a node we know */
  const idFor = (obj: THREE.Object3D | null): string | null => {
    let o: THREE.Object3D | null = obj
    while (o) {
      const hit = bounds.find((b) => b.node === o)
      if (hit) return hit.part.selectable === false ? null : hit.part.id
      o = o.parent
    }
    return null
  }

  return (
    <primitive
      object={root}
      onPointerOver={(e: any) => {
        const id = idFor(e.object)
        if (!id) return
        e.stopPropagation()
        setPointer(id)
      }}
      onPointerOut={(e: any) => {
        const id = idFor(e.object)
        if (!id) return
        e.stopPropagation()
        if (useScene.getState().pointerPart === id) setPointer(null)
      }}
    />
  )
}

// --------------------------------------------------------------------------
// Callouts live outside both models so they work the same either way -
// they just follow whatever worldPos says.
// --------------------------------------------------------------------------
function Callouts() {
  const highlights = useScene((s) => s.highlights)
  const refs = useRef<Record<string, THREE.Group | null>>({})

  useFrame(() => {
    for (const h of highlights) {
      const g = refs.current[h.partId]
      const wp = worldPos[h.partId]
      if (g && wp) g.position.copy(wp)
    }
  })

  return (
    <>
      {highlights.map((h) => (
        <group key={h.partId} ref={(el) => (refs.current[h.partId] = el)}>
          <Html center distanceFactor={9} zIndexRange={[10, 0]}>
            <div className="callout" style={{ borderColor: h.color }}>
              <span className="callout-dot" style={{ background: h.color }} />
              {h.label}
            </div>
          </Html>
        </group>
      ))}
    </>
  )
}

// --------------------------------------------------------------------------
export function MachineModel() {
  const machine = useScene((s) => s.machine)

  useEffect(() => {
    clearWorldPos()
  }, [machine.id])

  return (
    <>
      <group position={[0, machine.groupY, 0]} scale={machine.scale ?? 1}>
        {machine.glbUrl ? (
          <GlbModel key={machine.id} machine={machine} />
        ) : (
          <PrimitiveModel machine={machine} />
        )}
      </group>
      <Callouts />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, machine.groupY - 0.01, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0d1117" roughness={1} />
      </mesh>
    </>
  )
}

export { HL, HOVER, selectableParts }
