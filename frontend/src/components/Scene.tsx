import { Suspense, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, Lightformer, ContactShadows, Html } from '@react-three/drei'
import * as THREE from 'three'
import { MachineModel } from './MachineModel'
import { useScene } from '../store'
import { partById, partPosition } from '../machines'
import { readWorldPos } from '../machines/runtime'

/**
 * Flies to whatever part the agent focused.
 *
 * Reads live world positions rather than the manifest, so it works identically
 * for a hand-authored primitive machine and an imported GLB whose part sits
 * three levels deep in someone else's scene graph.
 */
function CameraRig() {
  const controls = useRef<any>(null)
  const { camera } = useThree()
  const machine = useScene((s) => s.machine)
  const focusedPart = useScene((s) => s.focusedPart)
  const zoom = useScene((s) => s.zoom)
  const explode = useScene((s) => s.explode)

  const wantTarget = useRef(new THREE.Vector3())
  const wantPos = useRef(new THREE.Vector3())

  useFrame(() => {
    const live = readWorldPos(focusedPart)
    const p = focusedPart ? partById(machine, focusedPart) : undefined

    if (live) {
      wantTarget.current.copy(live)
    } else if (p) {
      const [x, y, z] = partPosition(p, explode)
      wantTarget.current.set(x, y + machine.groupY, z)
    } else {
      wantTarget.current.set(0, 0, 0)
    }

    if (live || p) {
      const dist = machine.focusDistance / Math.max(0.5, zoom)
      wantPos.current.set(
        wantTarget.current.x + dist * 0.75,
        wantTarget.current.y + dist * 0.42,
        wantTarget.current.z + dist,
      )
    } else {
      wantPos.current.set(...machine.homePos)
    }

    camera.position.lerp(wantPos.current, 0.045)
    if (controls.current) {
      controls.current.target.lerp(wantTarget.current, 0.06)
      controls.current.update()
    }
  })

  return <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={0.4} maxDistance={40} />
}

function Loading() {
  return (
    <Html center>
      <div className="loading">loading model…</div>
    </Html>
  )
}

export function Scene() {
  const groupY = useScene((s) => s.machine.groupY)
  return (
    <Canvas shadows camera={{ position: [6.4, 3.2, 6.4], fov: 42 }} dpr={[1, 2]}>
      <color attach="background" args={['#0b0e14']} />
      <fog attach="fog" args={['#0b0e14', 18, 48]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 9, 5]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, 4, -5]} intensity={0.5} color="#7dd3fc" />

      <Suspense fallback={<Loading />}>
        <MachineModel />
      </Suspense>

      <ContactShadows position={[0, groupY - 0.005, 0]} opacity={0.45} scale={24} blur={2.4} far={8} />
      {/* Lightformers, not a preset. A preset downloads an HDR from a CDN and
          WILL fail on venue wifi. Everything here is generated locally. */}
      <Environment resolution={256}>
        <Lightformer intensity={2.2} position={[0, 6, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1.1} color="#9ecbff" position={[-6, 2, -4]} scale={[8, 8, 1]} rotation-y={Math.PI / 2} />
        <Lightformer intensity={0.9} color="#ffd6a5" position={[6, 1, 4]} scale={[8, 8, 1]} rotation-y={-Math.PI / 2} />
      </Environment>
      <CameraRig />
    </Canvas>
  )
}
