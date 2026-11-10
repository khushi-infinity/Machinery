import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { PARTS, PartDef, partPosition } from '../parts'
import { useScene } from '../store'

/**
 * Every part is its own mesh so it can be moved, glowed and hovered
 * independently. If you later drop in a GLB, replace <Geometry/> with
 * <primitive object={gltf.nodes[meshName]} /> and keep everything else.
 */
function Geometry({ p }: { p: PartDef }) {
  switch (p.kind) {
    case 'box':
      return <boxGeometry args={p.size} />
    case 'cyl':
      return <cylinderGeometry args={[p.size[0], p.size[0], p.size[1], p.size[2]]} />
    case 'cone':
      return <coneGeometry args={[p.size[0], p.size[1], p.size[2]]} />
    case 'torus':
      return <torusGeometry args={[p.size[0], p.size[1], 12, p.size[2]]} />
  }
}

function Part({ p }: { p: PartDef }) {
  const ref = useRef<THREE.Mesh>(null!)
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  const explode = useScene((s) => s.explode)
  const highlight = useScene((s) => s.highlights.find((h) => h.partId === p.id))
  const pointerPart = useScene((s) => s.pointerPart)
  const setPointer = useScene((s) => s.setPointer)

  const selectable = p.selectable !== false
  const hovered = pointerPart === p.id

  useFrame((state) => {
    if (!ref.current) return
    const [x, y, z] = partPosition(p, explode)
    ref.current.position.lerp(new THREE.Vector3(x, y, z), 0.12)

    if (!matRef.current) return
    const t = state.clock.elapsedTime
    if (highlight) {
      // slow breathing glow so it reads on a projector
      const pulse = 0.55 + 0.45 * Math.sin(t * 3.2)
      matRef.current.emissive.set(highlight.color)
      matRef.current.emissiveIntensity = 0.35 + pulse * 1.15
    } else if (hovered && selectable) {
      matRef.current.emissive.set('#38bdf8')
      matRef.current.emissiveIntensity = 0.7
    } else {
      matRef.current.emissiveIntensity += (0 - matRef.current.emissiveIntensity) * 0.15
    }
  })

  return (
    <mesh
      ref={ref}
      position={p.pos}
      rotation={p.rot ?? [0, 0, 0]}
      castShadow
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
        color={p.color}
        metalness={p.kind === 'cone' || p.kind === 'cyl' ? 0.75 : 0.35}
        roughness={0.42}
      />
      {highlight && (
        <Html center distanceFactor={9} zIndexRange={[10, 0]}>
          <div className="callout" style={{ borderColor: highlight.color }}>
            <span className="callout-dot" style={{ background: highlight.color }} />
            {highlight.label}
          </div>
        </Html>
      )}
    </mesh>
  )
}

export function Printer() {
  return (
    <group position={[0, -2.2, 0]}>
      {PARTS.map((p) => (
        <Part key={p.id} p={p} />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#0d1117" roughness={1} />
      </mesh>
    </group>
  )
}
