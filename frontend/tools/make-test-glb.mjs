/**
 * Builds a plausible industrial assembly and writes it out as a real .glb with
 * named nodes - the same thing you would get out of SolidWorks or Fusion.
 *
 * Used to prove the import path end to end without needing a licensed CAD file.
 *   node tools/make-test-glb.mjs
 */
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { writeFileSync, mkdirSync } from 'node:fs'

// GLTFExporter reaches for a couple of browser globals when it packs the
// binary chunk. Node has Blob but not FileReader, so shim just enough of it.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((b) => {
        this.result = b
        this.onloadend && this.onloadend()
        this.onload && this.onload()
      })
    }
  }
}

const scene = new THREE.Scene()
scene.name = 'Pump_Assembly'

const mat = (hex, metal = 0.6, rough = 0.45) =>
  new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), metalness: metal, roughness: rough })

const add = (name, geom, material, [x, y, z], rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(geom, material)
  m.name = name
  m.position.set(x, y, z)
  m.rotation.set(rot[0], rot[1], rot[2])
  scene.add(m)
  return m
}

const CAST = mat('#4a5866', 0.5, 0.6)
const STEEL = mat('#9aa5b1', 0.85, 0.3)
const BRONZE = mat('#b8863b', 0.8, 0.35)
const PAINT = mat('#2f6fb0', 0.35, 0.55)
const BLACK = mat('#23272e', 0.4, 0.7)
const RUBBER = mat('#191c21', 0.1, 0.9)

const X = [0, 0, Math.PI / 2]     // lay a cylinder along X

add('Baseplate', new THREE.BoxGeometry(3.4, 0.12, 1.1), BLACK, [0, 0.06, 0])
add('Motor_Feet', new THREE.BoxGeometry(0.9, 0.16, 0.9), BLACK, [0.95, 0.2, 0])
add('Pump_Feet', new THREE.BoxGeometry(0.5, 0.16, 0.7), BLACK, [-1.0, 0.2, 0])

add('Motor_Body', new THREE.CylinderGeometry(0.42, 0.42, 1.25, 36), PAINT, [1.0, 0.72, 0], X)
add('Motor_Terminal_Box', new THREE.BoxGeometry(0.34, 0.22, 0.3), PAINT, [1.0, 1.22, 0])
add('Motor_Fan', new THREE.CylinderGeometry(0.3, 0.3, 0.12, 20), BLACK, [1.68, 0.72, 0], X)
add('Fan_Cowl', new THREE.CylinderGeometry(0.36, 0.3, 0.26, 24, 1, true), STEEL, [1.74, 0.72, 0], X)

add('Coupling', new THREE.CylinderGeometry(0.2, 0.2, 0.26, 24), RUBBER, [0.24, 0.72, 0], X)
add('Shaft', new THREE.CylinderGeometry(0.07, 0.07, 1.5, 20), STEEL, [0.1, 0.72, 0], X)

add('Bearing_Housing', new THREE.CylinderGeometry(0.26, 0.26, 0.55, 28), CAST, [-0.28, 0.72, 0], X)
add('Bearing_Front', new THREE.TorusGeometry(0.15, 0.05, 10, 24), STEEL, [-0.06, 0.72, 0], [0, Math.PI / 2, 0])
add('Bearing_Rear', new THREE.TorusGeometry(0.15, 0.05, 10, 24), STEEL, [-0.5, 0.72, 0], [0, Math.PI / 2, 0])
add('Mechanical_Seal', new THREE.CylinderGeometry(0.13, 0.13, 0.14, 24), BRONZE, [-0.66, 0.72, 0], X)

add('Pump_Casing', new THREE.CylinderGeometry(0.55, 0.55, 0.42, 36), CAST, [-1.0, 0.72, 0], X)
add('Impeller', new THREE.CylinderGeometry(0.4, 0.34, 0.18, 8), BRONZE, [-1.0, 0.72, 0], X)
add('Casing_Cover', new THREE.CylinderGeometry(0.56, 0.56, 0.07, 36), CAST, [-1.24, 0.72, 0], X)
add('Suction_Flange', new THREE.CylinderGeometry(0.28, 0.28, 0.16, 24), CAST, [-1.42, 0.72, 0], X)
add('Discharge_Flange', new THREE.CylinderGeometry(0.22, 0.22, 0.16, 24), CAST, [-1.0, 1.36, 0])
add('Drain_Plug', new THREE.CylinderGeometry(0.07, 0.07, 0.09, 12), STEEL, [-1.0, 0.16, 0])

const exporter = new GLTFExporter()
exporter.parse(
  scene,
  (buf) => {
    mkdirSync('public/models', { recursive: true })
    writeFileSync('public/models/pump.glb', Buffer.from(buf))
    const names = []
    scene.traverse((o) => { if (o.isMesh) names.push(o.name) })
    console.log('wrote public/models/pump.glb - ' + names.length + ' named meshes')
    console.log(names.join(', '))
  },
  (e) => { console.error('export failed', e); process.exit(1) },
  { binary: true },
)
