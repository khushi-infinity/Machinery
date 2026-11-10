import { useCallback, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, Lightformer, ContactShadows, Center } from '@react-three/drei'
import * as THREE from 'three'
import {
  analyse, loadGlb, machineTs, partsJson, proceduresJson,
  type Analysis, type Candidate, type Granularity,
} from './analyse'
import './labeller.css'

// ---------------------------------------------------------------------------
function Preview({ a, selected, onPick }: {
  a: Analysis
  selected: string | null
  onPick: (key: string | null) => void
}) {
  const sel = useRef<string | null>(selected)
  sel.current = selected

  // clone once, and remember every material's original colour so selection
  // can be undone without reloading the file
  const { root, byKey } = useMemo(() => {
    const clone = a.object.clone(true)
    const map = new Map<string, THREE.Object3D>()
    a.candidates.forEach((c, i) => {
      const original = a.nodes[i]
      // walk the clone in lockstep with the original to find the twin
      const path: number[] = []
      let cur: THREE.Object3D | null = original
      while (cur && cur !== a.object) {
        const parent: THREE.Object3D | null = cur.parent
        if (!parent) break
        path.unshift(parent.children.indexOf(cur))
        cur = parent
      }
      let twin: THREE.Object3D = clone
      for (const idx of path) twin = twin.children[idx]
      if (twin) map.set(c.key, twin)
    })
    clone.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone()
      }
    })
    return { root: clone, byKey: map }
  }, [a])

  const matsFor = useCallback((key: string) => {
    const node = byKey.get(key)
    const out: THREE.MeshStandardMaterial[] = []
    node?.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const list = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of list) if ((mat as any).isMeshStandardMaterial) out.push(mat as THREE.MeshStandardMaterial)
    })
    return out
  }, [byKey])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (const c of a.candidates) {
      const on = sel.current === c.key
      for (const m of matsFor(c.key)) {
        m.emissive.set(on ? '#ff7a1a' : '#000000')
        m.emissiveIntensity = on ? 0.5 + 0.5 * Math.sin(t * 3.2) : 0
        m.opacity = c.include ? 1 : 0.18
        m.transparent = !c.include
        m.depthWrite = c.include
      }
    }
  })

  const keyFor = (obj: THREE.Object3D | null): string | null => {
    let o: THREE.Object3D | null = obj
    while (o) {
      for (const [k, node] of byKey) if (node === o) return k
      o = o.parent
    }
    return null
  }

  return (
    <Center>
      <primitive
        object={root}
        onPointerDown={(e: any) => {
          const k = keyFor(e.object)
          if (!k) return
          e.stopPropagation()
          onPick(k)
        }}
      />
    </Center>
  )
}

// ---------------------------------------------------------------------------
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function Labeller() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [cands, setCands] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [granularity, setGranularity] = useState<Granularity>('nodes')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [machineId, setMachineId] = useState('gearbox')
  const [machineName, setMachineName] = useState('Imported Machine')
  const [spoken, setSpoken] = useState('the machine')
  const rawFiles = useRef<File[] | null>(null)

  const run = useCallback(async (files: File[], g: Granularity) => {
    setBusy(true); setErr(null)
    try {
      const main = files.find((f) => /\.(glb|gltf)$/i.test(f.name)) ?? files[0]
      const name = main?.name ?? 'model.glb'
      const obj = await loadGlb(files, name)
      const a = analyse(obj, name, g)
      setAnalysis(a)
      setCands(a.candidates)
      setSelected(null)
      setMachineId(name.replace(/\.(glb|gltf)$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'machine')
      setMachineName(name.replace(/\.(glb|gltf)$/i, ''))
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const onFiles = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list)
    rawFiles.current = files
    await run(files, granularity)
  }, [run, granularity])

  const regrain = useCallback(async (g: Granularity) => {
    setGranularity(g)
    if (rawFiles.current) await run(rawFiles.current, g)
  }, [run])

  const patch = (key: string, next: Partial<Candidate>) =>
    setCands((cs) => cs.map((c) => (c.key === key ? { ...c, ...next } : c)))

  const included = cands.filter((c) => c.include).length

  const exportAll = () => {
    if (!analysis) return
    const a = { ...analysis, candidates: cands }
    download(`${machineId}.ts`, machineTs(a, machineId, machineName, spoken))
    download(`parts.json`, partsJson(a))
    download(`procedures.json`, proceduresJson(a))
  }

  return (
    <div className="lab">
      <header className="lab-bar">
        <div>
          <h1>Labelling studio</h1>
          <p>drop a .glb → name the parts → get a working machine</p>
        </div>
        <div className="lab-actions">
          {analysis && (
            <>
              <div className="seg">
                <button className={granularity === 'nodes' ? 'on' : ''} onClick={() => regrain('nodes')}>
                  assembly nodes
                </button>
                <button className={granularity === 'meshes' ? 'on' : ''} onClick={() => regrain('meshes')}>
                  every mesh
                </button>
              </div>
              <button className="btn go" onClick={exportAll}>Export {included} parts</button>
            </>
          )}
          <a className="lab-link" href="#">← back to Machinery</a>
        </div>
      </header>

      {!analysis && (
        <label
          className="drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files
            if (f?.length) onFiles(f)
          }}
        >
          <input type="file" accept=".glb,.gltf,.bin,image/*" multiple hidden onChange={(e) => {
            const f = e.target.files
            if (f?.length) onFiles(f)
          }} />
          <div className="drop-inner">
            <strong>{busy ? 'reading model…' : 'Drop a .glb here'}</strong>
            <span>
              A model exported from CAD already carries the assembly tree and the part
              names — it was built from a bill of materials. This just reads them out.
            </span>
            <span className="fine">
              Draco, meshopt and KTX2 are all handled. If it is a <code>.gltf</code> with a
              separate <code>.bin</code>, select or drop every file together.
            </span>
            {err && <span className="err">{err}</span>}
          </div>
        </label>
      )}

      {analysis && (
        <main className="lab-main">
          <div className="lab-view">
            <Canvas shadows camera={{ position: [7, 5, 8], fov: 42 }} dpr={[1, 2]}>
              <color attach="background" args={['#0b0e14']} />
              <ambientLight intensity={0.6} />
              <directionalLight position={[6, 9, 5]} intensity={1.4} castShadow />
              <Preview a={{ ...analysis, candidates: cands }} selected={selected} onPick={setSelected} />
              <ContactShadows position={[0, -2.6, 0]} opacity={0.4} scale={20} blur={2.4} far={8} />
              <Environment resolution={256}>
                <Lightformer intensity={2.2} position={[0, 6, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} />
                <Lightformer intensity={1.0} color="#9ecbff" position={[-6, 2, -4]} scale={[8, 8, 1]} rotation-y={Math.PI / 2} />
              </Environment>
              <OrbitControls makeDefault />
            </Canvas>
            <div className="lab-stats">
              <b>{analysis.fileName}</b>
              <span>{analysis.totalMeshes} meshes · {cands.length} candidates · {included} included</span>
              <span>auto-fit: scale {analysis.scale} · floor {analysis.groupY}</span>
            </div>
          </div>

          <aside className="lab-side">
            <div className="lab-meta">
              <label>machine id<input value={machineId} onChange={(e) => setMachineId(e.target.value)} /></label>
              <label>display name<input value={machineName} onChange={(e) => setMachineName(e.target.value)} /></label>
              <label>agent says<input value={spoken} onChange={(e) => setSpoken(e.target.value)} /></label>
            </div>

            <div className="lab-hint">
              Two questions per row: would a technician ever touch it, and what do
              they call it. Explode direction is derived from where the part sits.
            </div>

            <div className="rows">
              {cands.map((c) => (
                <div
                  key={c.key}
                  className={`row ${selected === c.key ? 'sel' : ''} ${c.include ? '' : 'off'}`}
                  onMouseEnter={() => setSelected(c.key)}
                >
                  <input
                    type="checkbox"
                    checked={c.include}
                    onChange={(e) => patch(c.key, { include: e.target.checked })}
                  />
                  <div className="row-fields">
                    <input
                      className="row-id"
                      value={c.id}
                      onChange={(e) => patch(c.key, { id: e.target.value })}
                      spellCheck={false}
                    />
                    <input
                      className="row-label"
                      value={c.label}
                      onChange={(e) => patch(c.key, { label: e.target.value })}
                    />
                    <div className="row-meta">
                      <code>{c.meshName}</code>
                      <span>{c.triangles.toLocaleString()} tris</span>
                      {c.nesting > 0 && <span className="nest">nested ×{c.nesting}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </main>
      )}
    </div>
  )
}
