import type { Machine } from './types'

/**
 * 1.5T superconducting MRI scanner.
 *
 * The gantry is seven concentric shells around the bore. In the assembled view
 * the outer cover is semi-transparent so you can already see something is in
 * there; as the agent raises the explode level they telescope apart along the
 * bore axis, innermost travelling furthest. That is the classic service
 * diagram, and it is the one thing you cannot do with a photograph.
 *
 * Peripherals (compressor, chiller, gradient amplifier) sit where they really
 * do - in the equipment room, not the magnet room.
 */

const WHITE = '#e8ecf1'
const STEEL = '#5b6675'
const COPPER = '#b87333'
const NIOBIUM = '#6f8fb5'
const EPOXY = '#2e4a3f'
const BRASS = '#b08d3a'
const CABINET = '#39434f'

// every shell shares this centre and this rotation - bore axis runs along Z
const BORE_Y = 1.5
const AXIAL: [number, number, number] = [Math.PI / 2, 0, 0]

export const mri: Machine = {
  id: 'mri',
  name: '1.5T Superconducting MRI',
  subtitle: 'magnet room + equipment room  ·  18 serviceable parts',
  spokenName: 'the scanner',
  groupY: -1.8,
  homePos: [8.0, 4.2, 9.0],
  focusDistance: 5.2,
  parts: [
    // ---- room structure (not selectable) -----------------------------------
    { id: 'gantry_pedestal', label: 'Gantry pedestal', kind: 'box', pos: [0, 0.3, 0], size: [4.4, 0.6, 2.2], color: '#2a303a', explode: [0, -1, 0], selectable: false },
    { id: 'table_pedestal', label: 'Table pedestal', kind: 'box', pos: [0, 0.5, 2.9], size: [0.6, 1.0, 0.8], color: '#2a303a', explode: [0, -1, 0], selectable: false },

    // ---- the seven shells, innermost first ---------------------------------
    {
      id: 'bore_liner', label: 'Bore Liner', kind: 'tube',
      pos: [0, BORE_Y, 0], size: [0.62, 2.0, 40], rot: AXIAL, color: WHITE,
      explode: [0, 0, 3.4],
    },
    {
      id: 'rf_body_coil', label: 'RF Body Coil (transmit)', kind: 'tube',
      pos: [0, BORE_Y, 0], size: [0.74, 1.5, 40], rot: AXIAL, color: COPPER,
      explode: [0, 0, 2.5],
    },
    {
      id: 'gradient_coil', label: 'Gradient Coil Assembly', kind: 'tube',
      pos: [0, BORE_Y, 0], size: [0.9, 1.6, 40], rot: AXIAL, color: EPOXY,
      explode: [0, 0, 1.7],
    },
    {
      id: 'shim_tray', label: 'Passive Shim Trays', kind: 'tube',
      pos: [0, BORE_Y, 0], size: [1.02, 1.2, 40], rot: AXIAL, color: BRASS,
      explode: [0, 0, 1.0],
    },
    {
      id: 'magnet_coil', label: 'Superconducting Magnet Coils', kind: 'tube',
      pos: [0, BORE_Y, 0], size: [1.2, 1.35, 40], rot: AXIAL, color: NIOBIUM,
      explode: [0, 0, 0.35],
    },
    {
      id: 'cryostat', label: 'Cryostat / Helium Vessel', kind: 'tube',
      pos: [0, BORE_Y, 0], size: [1.52, 1.75, 40], rot: AXIAL, color: STEEL,
      explode: [0, 0, -0.6],
    },
    {
      id: 'gantry_cover', label: 'Gantry Cover', kind: 'tube',
      pos: [0, BORE_Y, 0], size: [2.05, 1.9, 48], rot: AXIAL, color: WHITE,
      explode: [0, 0, -1.7], opacity: 0.26,
    },

    // ---- patient side -------------------------------------------------------
    {
      id: 'patient_table', label: 'Patient Table', kind: 'box',
      pos: [0, 1.06, 2.0], size: [0.7, 0.11, 2.6], color: '#cdd5df',
      explode: [0, 0, 2.2],
    },
    {
      id: 'head_coil', label: 'Head Receive Coil', kind: 'box',
      pos: [0, 1.32, 2.55], size: [0.52, 0.42, 0.5], color: '#46506a',
      explode: [0, 1.6, 1.6],
    },

    // ---- cryogenics ---------------------------------------------------------
    {
      id: 'cold_head', label: 'Cold Head (cryocooler)', kind: 'box',
      pos: [0, 3.3, -0.15], size: [0.5, 0.6, 0.5], color: '#7b8595',
      explode: [0, 1.8, 0],
    },
    {
      id: 'quench_pipe', label: 'Quench Pipe', kind: 'cyl',
      pos: [0.85, 3.9, -0.4], size: [0.2, 2.0, 20], color: '#8d97a6',
      explode: [0.8, 1.4, -0.6],
    },
    {
      id: 'he_level_sensor', label: 'Helium Level Sensor', kind: 'box',
      pos: [-0.75, 3.2, 0.15], size: [0.3, 0.22, 0.26], color: '#d0a23a',
      explode: [-1.2, 1.2, 0.6],
    },

    // ---- equipment room -----------------------------------------------------
    {
      id: 'compressor', label: 'Helium Compressor', kind: 'box',
      pos: [3.8, 0.58, -1.7], size: [0.95, 1.15, 0.85], color: '#414b5b',
      explode: [1.6, 0, -0.5],
    },
    {
      id: 'chiller', label: 'Water Chiller', kind: 'box',
      pos: [3.8, 0.63, 0.4], size: [1.0, 1.25, 0.9], color: CABINET,
      explode: [1.7, 0, 0.5],
    },
    {
      id: 'gradient_amplifier', label: 'Gradient Amplifier', kind: 'box',
      pos: [-3.7, 0.75, -0.9], size: [0.85, 1.5, 0.75], color: '#333b48',
      explode: [-1.6, 0, -0.4],
    },

    // ---- RF shielding -------------------------------------------------------
    {
      id: 'penetration_panel', label: 'RF Penetration Panel', kind: 'box',
      pos: [-3.5, 1.4, 2.2], size: [1.3, 1.1, 0.14], color: '#667486',
      explode: [-1.4, 0.4, 0.8],
    },
    {
      id: 'rf_door_seal', label: 'RF Shielded Door + Finger Stock', kind: 'box',
      pos: [-3.5, 1.1, -0.1], size: [0.12, 2.2, 1.1], color: '#7c8695',
      explode: [-1.5, 0, -0.3],
    },
    {
      id: 'erdu', label: 'Emergency Rundown Unit', kind: 'box',
      pos: [2.9, 1.7, 2.9], size: [0.32, 0.42, 0.14], color: '#d33a3a',
      explode: [1.2, 0.6, 0.8],
    },
  ],
}
