import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

/**
 * Turn an arbitrary .glb into a labelling worksheet.
 *
 * This is the part people assume has to be magic. It does not. A model that
 * came out of CAD already carries the assembly tree and the part names,
 * because it was built from a bill of materials. All this does is read them
 * out, propose ids, and derive the things a human should not have to type -
 * explode directions, scale, camera framing.
 *
 * The human's job is then only to answer two questions per node: is this a
 * part a technician would ever touch, and what do they call it.
 */

export interface Candidate {
  key: string
  /** the node name as it exists inside the .glb - this is the join key */
  meshName: string
  /** proposed part id, editable */
  id: string
  /** proposed human label, editable */
  label: string
  include: boolean
  depth: number
  /** how many larger parts enclose this one - drives extra explode travel */
  nesting: number
  triangles: number
  size: [number, number, number]
  centre: [number, number, number]
  /** derived: which way this part should fly when exploded */
  explode: [number, number, number]
}

export interface Analysis {
  fileName: string
  object: THREE.Object3D
  candidates: Candidate[]
  /** same order as candidates - the live node, for picking and preview */
  nodes: THREE.Object3D[]
  /** derived fit so the model lands on the floor at a sensible size */
  scale: number
  groupY: number
  homePos: [number, number, number]
  focusDistance: number
  totalMeshes: number
}

/** "Gearbox_Housing.001" -> "gearbox_housing" */
export function toPartId(raw: string): string {
  return raw
    .replace(/\.\d+$/, '')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'part'
}

/** words that should stay shouty when they turn up in a part name */
const ACRONYMS = new Set([
  'rf', 'ac', 'dc', 'hv', 'lv', 'id', 'od', 'ptfe', 'pei', 'pom', 'gt2', 'usb',
  'led', 'plc', 'hmi', 'pcb', 'cpu', 'ecu', 'abs', 'pvc', 'npt', 'bsp', 'iso',
])

/** "Gearbox_Housing" -> "Gearbox Housing", "rf_coil" -> "RF Coil" */
export function toLabel(raw: string): string {
  return toPartId(raw)
    .split('_')
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

function triangleCount(node: THREE.Object3D): number {
  let n = 0
  node.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry) return
    const g = m.geometry as THREE.BufferGeometry
    n += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3
  })
  return Math.round(n)
}

function hasGeometry(node: THREE.Object3D): boolean {
  let found = false
  node.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) found = true
  })
  return found
}

/**
 * Real-world models are almost never plain glTF.
 *
 * Anything that has been through gltfpack or downloaded from Sketchfab is
 * meshopt compressed; anything out of a Blender pipeline is often Draco; and
 * production web models carry KTX2/Basis textures. GLTFLoader refuses all
 * three unless you hand it the matching decoder, with an error message that
 * reads like your file is broken when it is not.
 *
 * So wire up all three, once, and serve the decoders from our own public/
 * folder rather than a CDN - because the one place this will be used is a
 * venue wifi that blocks gstatic.
 */
let sharedRenderer: THREE.WebGLRenderer | null = null
let sharedLoader: { loader: GLTFLoader; manager: THREE.LoadingManager } | null = null

function buildLoader() {
  const manager = new THREE.LoadingManager()
  const loader = new GLTFLoader(manager)

  loader.setDRACOLoader(new DRACOLoader(manager).setDecoderPath('/decoders/draco/'))
  loader.setMeshoptDecoder(MeshoptDecoder)

  // KTX2 needs to know what the GPU can transcode to, which needs a context.
  // One throwaway renderer, reused, disposed never - it is 1 context for the
  // life of the tab.
  try {
    if (!sharedRenderer) sharedRenderer = new THREE.WebGLRenderer()
    const ktx2 = new KTX2Loader(manager).setTranscoderPath('/decoders/basis/')
    ktx2.detectSupport(sharedRenderer)
    loader.setKTX2Loader(ktx2)
  } catch {
    // no WebGL2 - KTX2 models will fail, everything else still works
  }

  return { loader, manager }
}

/** Turn a loader error into something that says what to actually do. */
function explain(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/meshopt/i.test(msg))
    return new Error('This model is meshopt compressed and the decoder did not load. Check that /decoders/ is being served.')
  if (/draco/i.test(msg))
    return new Error('This model is Draco compressed and the decoder did not load. Check that /decoders/draco/ exists in public/.')
  if (/ktx2|basisu/i.test(msg))
    return new Error('This model uses KTX2 textures and the transcoder did not load. Check /decoders/basis/. Geometry-only export usually avoids this.')
  const buf = /Failed to load buffer "([^"]+)"/.exec(msg)
  if (buf)
    return new Error(`This .gltf needs "${buf[1]}", which was not dropped with it. Select the .gltf and every file next to it (the .bin and any textures) at the same time — or ask for a .glb, which packs everything into one file.`)
  if (/Unexpected token|JSON|Unsupported|magic/i.test(msg))
    return new Error(`Could not parse this file. If it is a .gltf with a separate .bin, drop the whole folder's files together. (${msg})`)
  return new Error(msg)
}

/**
 * Accepts a single .glb, or a .gltf plus its .bin and textures dropped
 * together - CAD exporters routinely emit the multi-file form.
 */
export async function loadGlb(
  input: File | File[] | FileList | ArrayBuffer,
  name = 'model.glb',
): Promise<THREE.Object3D> {
  if (!sharedLoader) sharedLoader = buildLoader()
  const { loader, manager } = sharedLoader

  // meshopt's wasm is lazy - make sure it is ready before we parse
  try { await (MeshoptDecoder as any).ready } catch { /* older three, sync decoder */ }

  const urls: string[] = []
  const byName = new Map<string, string>()
  let mainUrl: string

  if (input instanceof ArrayBuffer) {
    mainUrl = URL.createObjectURL(new Blob([input]))
    urls.push(mainUrl)
  } else {
    const files = Array.from(input instanceof File ? [input] : input)
    const main =
      files.find((f) => /\.(glb|gltf)$/i.test(f.name)) ?? files[0]
    if (!main) throw new Error('No .glb or .gltf in what you dropped.')
    name = main.name
    for (const f of files) {
      const u = URL.createObjectURL(f)
      urls.push(u)
      byName.set(f.name, u)
    }
    mainUrl = byName.get(main.name)!
  }

  // Sibling files (.bin, textures) are referenced by relative path inside the
  // gltf. Because the main file is a blob URL with no real directory, three
  // resolves them to "blob:http://host/scene.bin" - which does not exist. So
  // match on filename alone and swap in the right blob.
  //
  // Order matters here: check the map FIRST. Short-circuiting on "blob:"
  // before the lookup is exactly the bug that makes external .bin files fail.
  manager.setURLModifier((url) => {
    if (url.startsWith('data:')) return url
    const base = decodeURIComponent(url.split('?')[0].split('#')[0].split(/[\\/]/).pop() ?? '')
    return byName.get(base) ?? url
  })

  try {
    const gltf = await loader.loadAsync(mainUrl)
    gltf.scene.name = gltf.scene.name || name.replace(/\.(glb|gltf)$/i, '')
    return gltf.scene
  } catch (e) {
    throw explain(e)
  } finally {
    manager.setURLModifier((u) => u)
    for (const u of urls) URL.revokeObjectURL(u)
  }
}

export type Granularity = 'nodes' | 'meshes'

export function analyse(
  object: THREE.Object3D,
  fileName: string,
  granularity: Granularity = 'nodes',
): Analysis {
  object.updateWorldMatrix(true, true)

  // ---- pick the candidate nodes ------------------------------------------
  const raw: { node: THREE.Object3D; depth: number }[] = []
  if (granularity === 'meshes') {
    object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) raw.push({ node: o, depth: 1 })
    })
  } else {
    // one entry per named child of the root that actually contains geometry.
    // This is what a CAD export gives you: one node per part in the BOM.
    const walk = (n: THREE.Object3D, depth: number) => {
      for (const child of n.children) {
        if (!hasGeometry(child)) continue
        const named = Boolean(child.name)
        const childHasNamedKids = child.children.some((c) => c.name && hasGeometry(c))
        if (named && !childHasNamedKids) raw.push({ node: child, depth })
        else if (childHasNamedKids) walk(child, depth + 1)
        else if (named) raw.push({ node: child, depth })
      }
    }
    walk(object, 0)
    if (raw.length === 0) object.traverse((o) => { if ((o as THREE.Mesh).isMesh) raw.push({ node: o, depth: 1 }) })
  }

  // ---- overall fit --------------------------------------------------------
  const whole = new THREE.Box3().setFromObject(object)
  const wholeSize = whole.getSize(new THREE.Vector3())
  const wholeCentre = whole.getCenter(new THREE.Vector3())
  const biggest = Math.max(wholeSize.x, wholeSize.y, wholeSize.z) || 1

  // put the machine at a comfortable ~5 units across whatever units it arrived in
  const scale = 5 / biggest
  const groupY = -whole.min.y * scale
  const reach = 5

  // ---- per candidate ------------------------------------------------------
  // Measure everything first: throw distance depends on how big a part is
  // relative to its neighbours, and we cannot know that one at a time.
  const boxes = raw.map(({ node }) => new THREE.Box3().setFromObject(node))
  const radii = boxes.map((b) => b.getSize(new THREE.Vector3()).length() * 0.5)
  const rMin = Math.min(...radii)
  const rMax = Math.max(...radii)

  // How many other parts' boxes swallow this part's centre? That is its
  // nesting depth, and it is the single most useful number here: an impeller
  // inside a casing inside nothing has depth 1, so it must travel one shell's
  // worth further than the casing or it never becomes visible.
  const centres = boxes.map((b) => b.getCenter(new THREE.Vector3()))
  const nesting = centres.map((c, i) =>
    boxes.reduce(
      (n, b, j) => (j !== i && radii[j] > radii[i] && b.containsPoint(c) ? n + 1 : n),
      0,
    ),
  )
  const maxNest = Math.max(1, ...nesting)

  const seen = new Set<string>()
  const candidates: Candidate[] = raw.map(({ node, depth }, i) => {
    const box = boxes[i]
    const c = box.getCenter(new THREE.Vector3())
    const s = box.getSize(new THREE.Vector3())

    // Direction: straight out from the machine's centre.
    const dir = c.clone().sub(wholeCentre)
    const dist = dir.length()
    if (dist < 1e-6) dir.set(0, 1, 0)
    else dir.normalize()

    // Distance: this is the bit that matters on imported models.
    //
    // A naive centroid explode fails on any nested assembly - an impeller
    // sitting inside a casing shares its centre, so both fly the same way by
    // the same amount and the impeller stays hidden. Real exploded diagrams
    // solve it by throwing the SMALL parts furthest, because small almost
    // always means inner. So size rank drives the throw, and the radial
    // distance only trims it.
    const spread = rMax - rMin || 1
    const sizeRank = (radii[i] - rMin) / spread          // 0 = smallest, 1 = biggest
    const bySize = 1.9 - 1.35 * sizeRank                  // small parts travel ~3x further
    const byDepth = 0.45 + 0.55 * (1 - Math.min(1, dist / (biggest * 0.5)))
    // one clear shell-width of extra travel per layer of nesting
    const byNesting = 1 + 0.85 * nesting[i]
    const explode = dir.multiplyScalar(bySize * byDepth * byNesting * reach * 0.34)

    const nm = node.name || `mesh_${i}`
    let id = toPartId(nm)
    while (seen.has(id)) id = `${id}_${seen.size}`
    seen.add(id)

    return {
      key: `${nm}#${i}`,
      meshName: nm,
      id,
      label: toLabel(nm),
      include: true,
      depth,
      nesting: nesting[i],
      triangles: triangleCount(node),
      size: [+(s.x * scale).toFixed(2), +(s.y * scale).toFixed(2), +(s.z * scale).toFixed(2)],
      centre: [+(c.x * scale).toFixed(2), +(c.y * scale).toFixed(2), +(c.z * scale).toFixed(2)],
      explode: [+explode.x.toFixed(2), +explode.y.toFixed(2), +explode.z.toFixed(2)],
    }
  })

  let totalMeshes = 0
  object.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) totalMeshes++
  })

  return {
    fileName,
    object,
    candidates,
    nodes: raw.map((r) => r.node),
    scale: +scale.toFixed(4),
    groupY: +groupY.toFixed(2),
    homePos: [reach * 1.3, reach * 0.7, reach * 1.45],
    focusDistance: +(reach * 0.9).toFixed(1),
    totalMeshes,
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function machineTs(a: Analysis, machineId: string, name: string, spoken: string): string {
  const parts = a.candidates.filter((c) => c.include)
  const lines = parts
    .map(
      (c) =>
        `    { id: '${c.id}', label: ${JSON.stringify(c.label)}, kind: 'glb', ` +
        `meshName: ${JSON.stringify(c.meshName)}, explode: [${c.explode.join(', ')}] },`,
    )
    .join('\n')

  return `import type { Machine } from './types'

/**
 * Generated by the Third Hand labelling studio from ${a.fileName}.
 * ${parts.length} of ${a.candidates.length} nodes marked serviceable.
 *
 * Drop ${a.fileName} into frontend/public/models/ and this is a working machine.
 */
export const ${machineId}: Machine = {
  id: '${machineId}',
  name: ${JSON.stringify(name)},
  subtitle: 'imported model  ·  ${parts.length} serviceable parts',
  spokenName: ${JSON.stringify(spoken)},
  glbUrl: '/models/${a.fileName}',
  groupY: ${a.groupY},
  scale: ${a.scale},
  homePos: [${a.homePos.join(', ')}],
  focusDistance: ${a.focusDistance},
  parts: [
${lines}
  ],
}
`
}

export function partsJson(a: Analysis): string {
  const out: Record<string, unknown> = {}
  for (const c of a.candidates.filter((x) => x.include)) {
    out[c.id] = {
      id: c.id,
      name: c.label,
      sku: `TODO-${c.id.toUpperCase().slice(0, 8)}`,
      price_inr: 0,
      in_stock: 0,
      lead_time_days: 0,
      torque: 'TODO',
      tool_required: 'TODO',
      service_interval: 'TODO',
      safety: 'TODO',
      notes: 'TODO - this is the field that makes the agent sound like it has done the job before.',
    }
  }
  return JSON.stringify(out, null, 2)
}

export function proceduresJson(a: Analysis): string {
  const first = a.candidates.find((c) => c.include)
  return JSON.stringify(
    {
      example_fault: {
        id: 'example_fault',
        title: 'TODO - describe the fault the way a technician would say it',
        symptoms: ['TODO', 'the words they actually use', 'not the words in the manual'],
        est_minutes: 15,
        safety: 'TODO - the hazard, stated before the first instruction',
        steps: [
          {
            n: 1,
            part_id: first?.id ?? 'TODO',
            explode: 0.4,
            instruction: 'TODO - one action, in one breath',
            tool: 'TODO',
            check: 'TODO - how they know this step is done',
          },
        ],
        likely_parts: first ? [first.id] : [],
      },
    },
    null,
    2,
  )
}
