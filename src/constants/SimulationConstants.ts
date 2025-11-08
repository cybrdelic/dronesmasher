/**
 * All simulation parameters with units and rationale
 * Single source of truth for CPU and GPU (auto-generated shaders)
 */
export const SimulationConstants = {
  // Grid dimensions for topology optimization
  GRID: {
    // Voxel resolution
    RESOLUTION: {
      X: 64,  // voxels
      Y: 64,
      Z: 32,
      get TOTAL() { return this.X * this.Y * this.Z; }
    },

    // Physical size of simulation domain
    SIZE: {
      WIDTH: 0.5,   // meters (500mm drone frame)
      HEIGHT: 0.5,
      DEPTH: 0.25,
      get VOLUME() { return this.WIDTH * this.HEIGHT * this.DEPTH; }
    },

    // Derived values
    get CELL_SIZE() {
      return this.SIZE.WIDTH / this.RESOLUTION.X; // meters per voxel
    },

    // Minimum feature size (manufacturability constraint)
    MIN_FEATURE_SIZE: 0.002, // meters (2mm for 3D printing)
    get MIN_FEATURE_VOXELS() {
      return Math.ceil(this.MIN_FEATURE_SIZE / this.CELL_SIZE);
    }
  },

  // Topology optimization (SIMP method)
  OPTIMIZATION: {
    // Material interpolation
    PENALIZATION: 3.0,           // SIMP penalty (typically 3.0)
    MIN_DENSITY: 0.001,          // Avoid singularities
    MAX_DENSITY: 1.0,            // Solid material

    // Convergence criteria
    MAX_ITERATIONS: 200,
    CONVERGENCE_TOLERANCE: 0.001, // 0.1% change

    // Volume constraint
    TARGET_VOLUME_FRACTION: 0.3, // 30% material usage

    // Regularization (prevent checkerboarding)
    FILTER_RADIUS: 1.5,          // voxels (sensitivity filter)

    // Optimization algorithm (MMA - Method of Moving Asymptotes)
    MMA: {
      MOVE_LIMIT: 0.2,           // Max density change per iteration
      ASYMPTOTE_INIT: 0.5,
      ASYMPTOTE_DECREASE: 0.7,
      ASYMPTOTE_INCREASE: 1.2
    }
  },

  // FEA solver parameters
  FEA: {
    // Conjugate gradient solver
    CG: {
      MAX_ITERATIONS: 1000,
      TOLERANCE: 1e-6,
      PRECONDITIONER: "jacobi" as const
    },

    // Element formulation
    ELEMENT_TYPE: "hexahedral" as const,
    INTEGRATION_POINTS: 8,       // Gauss quadrature points

    // Numerical stability
    STIFFNESS_EPSILON: 1e-9,     // Regularization for void elements
  },

  // MPM crash simulation
  MPM: {
    // Particle spacing
    PARTICLES_PER_CELL: 8,       // 2x2x2 per grid cell

    // Time integration
    DT: 0.0001,                  // seconds (0.1ms timestep)
    SUBSTEPS: 5,                 // Sub-cycles per frame
    get EFFECTIVE_DT() { return this.DT / this.SUBSTEPS; },

    // Grid properties
    GRID_SPACING: 0.005,         // meters (5mm cells)

    // Transfer scheme
    FLIP_RATIO: 0.95,            // FLIP vs PIC blend (0.95 = mostly FLIP)

    // Collision
    GROUND_LEVEL: 0.0,           // meters
    COLLISION_FRICTION: 0.6,     // Coefficient
    COLLISION_RESTITUTION: 0.3,  // Bounciness

    // Stability
    CFL_SAFETY_FACTOR: 0.5,      // Courant condition
    MAX_VELOCITY: 50.0,          // m/s (cap for stability)
  },

  // Load cases for multi-scenario optimization
  LOAD_CASES: {
    HOVER: {
      THRUST_PER_MOTOR: 9.81 / 4,    // Newtons (1kg drone, 4 motors)
      DIRECTION: [0, 0, 1] as const,
      WEIGHT: 1.0                // Importance in optimization
    },

    FORWARD_FLIGHT: {
      THRUST_PER_MOTOR: 12.0 / 4,    // N
      TILT_ANGLE: 30,            // degrees
      WEIGHT: 0.8
    },

    HARD_MANEUVER: {
      MAX_DIFFERENTIAL: 15.0 / 4,    // N between motors
      ANGULAR_ACCEL: 500,        // deg/s²
      WEIGHT: 0.6
    },

    VERTICAL_CRASH: {
      IMPACT_VELOCITY: 5.0,      // m/s (terminal velocity)
      IMPACT_DURATION: 0.01,     // seconds
      WEIGHT: 1.0                // Critical safety scenario
    },

    SIDE_CRASH: {
      IMPACT_VELOCITY: 8.0,      // m/s
      IMPACT_ANGLE: 45,          // degrees
      WEIGHT: 0.7
    }
  },

  // Rendering constants
  RENDERING: {
    DEFAULT_FOV: 45,             // degrees
    NEAR_PLANE: 0.001,           // meters
    FAR_PLANE: 10.0,             // meters

    // Volume rendering
    RAYMARCHING_STEPS: 128,
    STEP_SIZE_MULTIPLIER: 1.0,

    // Shadow quality
    SHADOW_MAP_SIZE: 2048,
    PCF_SAMPLES: 16,

    // Post-processing
    EXPOSURE: 1.0,
    GAMMA: 2.2,
  }
} as const;

export type SimulationConstantsType = typeof SimulationConstants;
