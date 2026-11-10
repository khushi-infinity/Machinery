/** Extra test assets: a plain .gltf, and a stub that *declares* meshopt so we
 *  can prove the loader gets past the decoder gate. */
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { writeFileSync, mkdirSync } from 'node:fs'

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend && this.onloadend() }) }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((b) => {
        this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(b).toString('base64')
        this.onloadend && this.onloadend()
      })
    }
  }
}

const scene = new THREE.Scene()
scene.name = 'Valve_Assembly'
const m = (c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c) })
const add = (name, g, mat, p) => { const o = new THREE.Mesh(g, mat); o.name = name; o.position.set(...p); scene.add(o) }
add('Valve_Body', new THREE.CylinderGeometry(0.5, 0.5, 0.8, 24), m('#5b6675'), [0, 0.4, 0])
add('Bonnet', new THREE.CylinderGeometry(0.32, 0.4, 0.35, 24), m('#7c8695'), [0, 0.95, 0])
add('Stem', new THREE.CylinderGeometry(0.06, 0.06, 0.9, 16), m('#c9d1d9'), [0, 1.4, 0])
add('Handwheel', new THREE.TorusGeometry(0.32, 0.05, 8, 24), m('#c0392b'), [0, 1.85, 0])
add('Gasket', new THREE.CylinderGeometry(0.42, 0.42, 0.03, 24), m('#1f2937'), [0, 0.79, 0])
add('Seat_Ring', new THREE.TorusGeometry(0.26, 0.05, 8, 20), m('#b8863b'), [0, 0.4, 0])

new GLTFExporter().parse(scene, (json) => {
  mkdirSync('public/models', { recursive: true })
  writeFileSync('public/models/valve.gltf', JSON.stringify(json))
  console.log('wrote public/models/valve.gltf (embedded buffers)')

  // and a copy that lies about needing meshopt, purely to exercise the gate
  const stub = JSON.parse(JSON.stringify(json))
  stub.extensionsRequired = [...(stub.extensionsRequired || []), 'EXT_meshopt_compression']
  stub.extensionsUsed = [...(stub.extensionsUsed || []), 'EXT_meshopt_compression']
  writeFileSync('public/models/valve-meshopt-declared.gltf', JSON.stringify(stub))
  console.log('wrote public/models/valve-meshopt-declared.gltf (declares EXT_meshopt_compression)')
}, (e) => { console.error(e); process.exit(1) }, { binary: false })
