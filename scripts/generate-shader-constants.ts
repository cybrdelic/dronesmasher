#!/usr/bin/env tsx

/**
 * Generate shader constants from TypeScript
 * Ensures CPU and GPU always use same values
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { SimulationConstants } from '../src/constants/SimulationConstants';
import { BindingRegistry, generateBindingDeclaration } from '../src/constants/BindingRegistry';

function generateShaderConstants(): string {
  const { GRID, OPTIMIZATION, FEA, MPM } = SimulationConstants;

  return `// AUTO-GENERATED - DO NOT EDIT
// Generated from src/constants/SimulationConstants.ts

// Grid constants
const GRID_RES_X: u32 = ${GRID.RESOLUTION.X}u;
const GRID_RES_Y: u32 = ${GRID.RESOLUTION.Y}u;
const GRID_RES_Z: u32 = ${GRID.RESOLUTION.Z}u;
const GRID_TOTAL: u32 = ${GRID.RESOLUTION.TOTAL}u;

const GRID_CELL_SIZE: f32 = ${GRID.CELL_SIZE};
const GRID_WIDTH: f32 = ${GRID.SIZE.WIDTH};
const GRID_HEIGHT: f32 = ${GRID.SIZE.HEIGHT};
const GRID_DEPTH: f32 = ${GRID.SIZE.DEPTH};

// Optimization constants
const SIMP_PENALTY: f32 = ${OPTIMIZATION.PENALIZATION};
const MIN_DENSITY: f32 = ${OPTIMIZATION.MIN_DENSITY};
const MAX_DENSITY: f32 = ${OPTIMIZATION.MAX_DENSITY};
const FILTER_RADIUS: f32 = ${OPTIMIZATION.FILTER_RADIUS};

// FEA constants
const FEA_TOLERANCE: f32 = ${FEA.CG.TOLERANCE};
const FEA_MAX_ITER: u32 = ${FEA.CG.MAX_ITERATIONS}u;
const STIFFNESS_EPSILON: f32 = ${FEA.STIFFNESS_EPSILON};

// MPM constants
const MPM_DT: f32 = ${MPM.EFFECTIVE_DT};
const MPM_GRID_SPACING: f32 = ${MPM.GRID_SPACING};
const MPM_FLIP_RATIO: f32 = ${MPM.FLIP_RATIO};
const MPM_FRICTION: f32 = ${MPM.COLLISION_FRICTION};
const MPM_RESTITUTION: f32 = ${MPM.COLLISION_RESTITUTION};
const MPM_MAX_VELOCITY: f32 = ${MPM.MAX_VELOCITY};

// Helper functions using constants
fn grid_index_to_pos(idx: vec3u) -> vec3f {
    return vec3f(idx) * GRID_CELL_SIZE;
}

fn world_pos_to_grid_index(pos: vec3f) -> vec3u {
    return vec3u(pos / GRID_CELL_SIZE);
}

fn flatten_grid_index(idx: vec3u) -> u32 {
    return idx.x + idx.y * GRID_RES_X + idx.z * GRID_RES_X * GRID_RES_Y;
}

fn is_valid_grid_index(idx: vec3u) -> bool {
    return idx.x < GRID_RES_X && idx.y < GRID_RES_Y && idx.z < GRID_RES_Z;
}
`;
}

function generateBindingHelpers(): string {
  let output = '\n// Binding declarations\n';

  output += '// Global bindings\n';
  output += generateBindingDeclaration('GLOBAL', 'CAMERA', 'var<uniform> camera: Camera') + ';\n';
  output += generateBindingDeclaration('GLOBAL', 'TIME', 'var<uniform> time: TimeInfo') + ';\n';
  output += generateBindingDeclaration('GLOBAL', 'GRID_INFO', 'var<uniform> grid: GridInfo') + ';\n';

  output += '\n// Simulation bindings\n';
  output += generateBindingDeclaration('SIMULATION', 'DENSITIES', 'var<storage, read_write> densities: array<f32>') + ';\n';
  output += generateBindingDeclaration('SIMULATION', 'SENSITIVITIES', 'var<storage, read_write> sensitivities: array<f32>') + ';\n';

  return output;
}

function main() {
  console.log('Generating shader constants...');

  const shaderCode = generateShaderConstants();
  const bindingCode = generateBindingHelpers();

  const outputPath = join(__dirname, '../src/shaders/common/constants.wgsl');

  writeFileSync(outputPath, shaderCode + bindingCode, 'utf-8');

  console.log(`✅ Generated shader constants at ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateShaderConstants, generateBindingHelpers };
