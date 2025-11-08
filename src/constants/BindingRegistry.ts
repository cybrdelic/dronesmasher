/**
 * Centralized bind group layout definitions
 * Prevents binding number collisions across shaders
 */

export const BindingRegistry = {
  // Group 0: Global/Camera uniforms (shared across all passes)
  GLOBAL: {
    GROUP: 0,
    BINDINGS: {
      CAMERA: 0,
      TIME: 1,
      GRID_INFO: 2,
    }
  },

  // Group 1: Simulation data (FEA/Optimization)
  SIMULATION: {
    GROUP: 1,
    BINDINGS: {
      DENSITIES: 0,           // Storage buffer (read/write)
      SENSITIVITIES: 1,       // Storage buffer (read/write)
      COMPLIANCE: 2,          // Storage buffer (read only)
      CONSTRAINTS: 3,         // Uniform buffer (read only)
    }
  },

  // Group 2: FEA solver
  FEA: {
    GROUP: 2,
    BINDINGS: {
      DISPLACEMENTS: 0,       // Storage buffer (read/write)
      FORCES: 1,              // Storage buffer (read only)
      STIFFNESS_MATRIX: 2,    // Storage buffer (read only)
      SOLVER_STATE: 3,        // Storage buffer (read/write)
    }
  },

  // Group 3: MPM simulation
  MPM: {
    GROUP: 3,
    BINDINGS: {
      PARTICLES: 0,           // Storage buffer (read/write)
      GRID: 1,                // Storage buffer (read/write)
      MATERIAL_PARAMS: 2,     // Uniform buffer (read only)
    }
  },

  // Group 4: Rendering
  RENDERING: {
    GROUP: 4,
    BINDINGS: {
      VOLUME_TEXTURE: 0,      // Texture 3D
      SAMPLER: 1,             // Sampler
      TRANSFER_FUNCTION: 2,   // Texture 1D (color map)
    }
  }
} as const;

type BindingGroup = keyof typeof BindingRegistry;
type BindingName<G extends BindingGroup> = keyof typeof BindingRegistry[G]['BINDINGS'];

/**
 * Helper to generate WGSL binding declarations
 */
export function generateBindingDeclaration<G extends BindingGroup>(
  groupName: G,
  bindingName: BindingName<G>,
  type: string
): string {
  const group = BindingRegistry[groupName];
  const binding = group.BINDINGS[bindingName as string];

  return `@group(${group.GROUP}) @binding(${binding}) ${type}`;
}

/**
 * Get binding number for use in TypeScript
 */
export function getBinding<G extends BindingGroup>(
  groupName: G,
  bindingName: BindingName<G>
): { group: number; binding: number } {
  const group = BindingRegistry[groupName];
  const binding = group.BINDINGS[bindingName as string];

  return {
    group: group.GROUP,
    binding: binding as number
  };
}
