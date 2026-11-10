import type { Machine } from './types'

const STEEL = '#3f4854'
const ALU = '#8d97a6'
const BRASS = '#c79a3c'
const BLACK = '#22262e'
const PCB = '#1f6b4a'

export const printer: Machine = {
  id: 'printer',
  name: 'Ender-3 class FDM printer',
  subtitle: 'desktop 3D printer  ·  13 serviceable parts',
  spokenName: 'the printer',
  groupY: -2.2,
  homePos: [6.4, 3.2, 6.4],
  focusDistance: 4.6,
  parts: [
    // ---- frame (not selectable) -------------------------------------------
    { id: 'frame_base', label: 'Base', kind: 'box', pos: [0, 0.25, 0], size: [4.4, 0.5, 2.0], color: BLACK, explode: [0, -1, 0], selectable: false },
    { id: 'frame_left', label: 'Left extrusion', kind: 'box', pos: [-1.9, 2.4, 0], size: [0.22, 4.0, 0.22], color: ALU, explode: [-1, 0, 0], selectable: false },
    { id: 'frame_right', label: 'Right extrusion', kind: 'box', pos: [1.9, 2.4, 0], size: [0.22, 4.0, 0.22], color: ALU, explode: [1, 0, 0], selectable: false },
    { id: 'frame_top', label: 'Top extrusion', kind: 'box', pos: [0, 4.3, 0], size: [4.0, 0.22, 0.22], color: ALU, explode: [0, 1, 0], selectable: false },
    { id: 'frame_gantry', label: 'X gantry', kind: 'box', pos: [0, 2.7, 0], size: [3.8, 0.22, 0.22], color: ALU, explode: [0, 1, 0], selectable: false },

    // ---- serviceable parts -------------------------------------------------
    { id: 'mainboard', label: '32-bit Mainboard', kind: 'box', pos: [0, 0.18, -0.55], size: [1.5, 0.06, 1.0], color: PCB, explode: [0, -2.2, -0.6] },
    { id: 'y_belt', label: 'Y-Axis Belt', kind: 'box', pos: [0, 0.56, 0], size: [0.06, 0.05, 1.9], color: BLACK, explode: [0, -1.4, 0] },
    { id: 'bed_spring', label: 'Bed Leveling Spacers', kind: 'cyl', pos: [0, 0.72, 0], size: [0.11, 0.22, 16], color: '#d9b23a', explode: [0, -0.9, 1.2] },
    { id: 'bed_glass', label: 'PEI Spring Steel Sheet', kind: 'box', pos: [0, 0.92, 0], size: [2.9, 0.07, 1.75], color: '#6d7787', explode: [0, 1.3, 1.5] },
    { id: 'z_leadscrew', label: 'Z Lead Screw', kind: 'cyl', pos: [-1.6, 2.4, 0], size: [0.06, 3.6, 12], color: STEEL, explode: [-1.6, 0, 0] },
    { id: 'x_belt', label: 'X-Axis Belt', kind: 'box', pos: [0, 2.92, 0], size: [3.5, 0.05, 0.06], color: BLACK, explode: [0, 1.5, 0] },
    { id: 'gantry_wheel', label: 'POM Gantry Wheels', kind: 'cyl', pos: [0.34, 2.7, 0.2], size: [0.16, 0.1, 20], rot: [Math.PI / 2, 0, 0], color: '#e2e6ea', explode: [0.4, 0.9, 1.3] },
    { id: 'extruder_gear', label: 'Dual-Drive Extruder', kind: 'box', pos: [1.15, 2.62, 0.22], size: [0.42, 0.5, 0.36], color: '#4a5162', explode: [1.4, 0.7, 1.0] },
    { id: 'ptfe_tube', label: 'PTFE Bowden Tube', kind: 'cyl', pos: [0.75, 2.5, 0.22], size: [0.045, 0.9, 10], rot: [0, 0, Math.PI / 2.4], color: '#eef1f4', explode: [0.9, 1.2, 1.1] },
    { id: 'hotend_fan', label: '40 mm Heatsink Fan', kind: 'box', pos: [0.34, 2.32, 0.34], size: [0.42, 0.42, 0.11], color: BLACK, explode: [0, 0.4, 1.7] },
    { id: 'heatbreak', label: 'All-Metal Heatbreak', kind: 'cyl', pos: [0.34, 2.22, 0], size: [0.09, 0.42, 14], color: '#b9c0c9', explode: [0, -1.5, 0.3] },
    { id: 'nozzle', label: '0.4 mm Brass Nozzle', kind: 'cone', pos: [0.34, 1.9, 0], size: [0.14, 0.3, 20], rot: [Math.PI, 0, 0], color: BRASS, explode: [0, -2.0, 0] },
    { id: 'filament_spool', label: 'PLA+ Filament Spool', kind: 'torus', pos: [0, 4.75, -0.1], size: [0.55, 0.22, 24], rot: [Math.PI / 2, 0, 0], color: '#2f7fd6', explode: [0, 1.4, -0.8] },
  ],
}
