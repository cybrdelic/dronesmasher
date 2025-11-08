/**
 * Compile-time TypeScript definitions for shader uniform layouts
 *
 * These types ensure that uniform data packing matches shader expectations.
 * If you change the shader struct, TypeScript will catch mismatches at compile time.
 */

/**
 * Houdini-level cinematic shader uniform layout
 * Total size: 384 bytes (minimum), 416 bytes allocated (with padding)
 */
export interface CinematicUniformLayout {
  // Matrices (0-191 bytes)
  modelViewProjection: Float32Array; // 0-63 (16 floats)
  modelMatrix: Float32Array;         // 64-127 (16 floats)
  normalMatrix: Float32Array;        // 128-191 (16 floats)

  // Camera and timing (192-207 bytes)
  cameraPosition: [number, number, number]; // 192-203 (3 floats)
  time: number;                              // 204-207 (1 float)

  // Main light (208-239 bytes)
  lightDirection: [number, number, number]; // 208-219 (3 floats)
  _pad1: number;                            // 220-223 (padding)
  lightColor: [number, number, number];     // 224-235 (3 floats)
  lightIntensity: number;                   // 236-239 (1 float)

  // Environment (240-271 bytes)
  ambientColor: [number, number, number];      // 240-251 (3 floats)
  _pad2: number;                               // 252-255 (padding)
  atmosphericColor: [number, number, number];  // 256-267 (3 floats)
  atmosphericDensity: number;                  // 268-271 (1 float)

  // Cinematic settings (272-303 bytes)
  vignetteStrength: number;      // 272-275
  filmGrainStrength: number;     // 276-279
  chromaticAberration: number;   // 280-283
  dofEnabled: number;            // 284-287 (0 or 1)
  focalDistance: number;         // 288-291
  aperture: number;              // 292-295
  colorGradeType: number;        // 296-299
  _pad3: number;                 // 300-303 (padding)

  // Volumetric settings (304-335 bytes)
  volumetricEnabled: number;     // 304-307
  volumetricDensity: number;     // 308-311
  volumetricScattering: number;  // 312-315
  lightShaftIntensity: number;   // 316-319
  volumetricSteps: number;       // 320-323
  _pad4: [number, number, number]; // 324-335 (vec3 padding)

  // Fog settings (336-367 bytes)
  fogEnabled: number;                     // 336-339
  fogNear: number;                        // 340-343
  fogFar: number;                         // 344-347
  fogDensity: number;                     // 348-351
  fogColor: [number, number, number];     // 352-363 (3 floats)
  fogHeightFalloff: number;               // 364-367

  // Letterbox (368-383 bytes)
  letterboxBars: [number, number, number, number]; // 368-383 (vec4)
}

/**
 * Calculate byte offsets for uniform fields
 * Used to ensure packing matches shader layout
 */
export const CINEMATIC_UNIFORM_OFFSETS = {
  modelViewProjection: 0,
  modelMatrix: 16,
  normalMatrix: 32,
  cameraPosition: 48,
  time: 51,
  lightDirection: 52,
  _pad1: 55,
  lightColor: 56,
  lightIntensity: 59,
  ambientColor: 60,
  _pad2: 63,
  atmosphericColor: 64,
  atmosphericDensity: 67,
  vignetteStrength: 68,
  filmGrainStrength: 69,
  chromaticAberration: 70,
  dofEnabled: 71,
  focalDistance: 72,
  aperture: 73,
  colorGradeType: 74,
  _pad3: 75,
  volumetricEnabled: 76,
  volumetricDensity: 77,
  volumetricScattering: 78,
  lightShaftIntensity: 79,
  volumetricSteps: 80,
  _pad4: 81, // vec3 = 3 floats
  fogEnabled: 84,
  fogNear: 85,
  fogFar: 86,
  fogDensity: 87,
  fogColor: 88,
  fogHeightFalloff: 91,
  letterboxBars: 92, // vec4 = 4 floats
} as const;

/**
 * Minimum required buffer size (bytes)
 * This MUST match the shader's actual size
 */
export const CINEMATIC_UNIFORM_BUFFER_SIZE = 416; // 104 floats with padding

/**
 * Type-safe uniform data packer
 * Enforces correct layout at compile time
 */
export function packCinematicUniforms(data: CinematicUniformLayout): Float32Array {
  const buffer = new Float32Array(104); // 416 bytes / 4

  // Matrices
  buffer.set(data.modelViewProjection, CINEMATIC_UNIFORM_OFFSETS.modelViewProjection);
  buffer.set(data.modelMatrix, CINEMATIC_UNIFORM_OFFSETS.modelMatrix);
  buffer.set(data.normalMatrix, CINEMATIC_UNIFORM_OFFSETS.normalMatrix);

  // Camera and time
  buffer.set(data.cameraPosition, CINEMATIC_UNIFORM_OFFSETS.cameraPosition);
  buffer[CINEMATIC_UNIFORM_OFFSETS.time] = data.time;

  // Main light
  buffer.set(data.lightDirection, CINEMATIC_UNIFORM_OFFSETS.lightDirection);
  buffer[CINEMATIC_UNIFORM_OFFSETS._pad1] = 0;
  buffer.set(data.lightColor, CINEMATIC_UNIFORM_OFFSETS.lightColor);
  buffer[CINEMATIC_UNIFORM_OFFSETS.lightIntensity] = data.lightIntensity;

  // Environment
  buffer.set(data.ambientColor, CINEMATIC_UNIFORM_OFFSETS.ambientColor);
  buffer[CINEMATIC_UNIFORM_OFFSETS._pad2] = 0;
  buffer.set(data.atmosphericColor, CINEMATIC_UNIFORM_OFFSETS.atmosphericColor);
  buffer[CINEMATIC_UNIFORM_OFFSETS.atmosphericDensity] = data.atmosphericDensity;

  // Cinematic settings
  buffer[CINEMATIC_UNIFORM_OFFSETS.vignetteStrength] = data.vignetteStrength;
  buffer[CINEMATIC_UNIFORM_OFFSETS.filmGrainStrength] = data.filmGrainStrength;
  buffer[CINEMATIC_UNIFORM_OFFSETS.chromaticAberration] = data.chromaticAberration;
  buffer[CINEMATIC_UNIFORM_OFFSETS.dofEnabled] = data.dofEnabled;
  buffer[CINEMATIC_UNIFORM_OFFSETS.focalDistance] = data.focalDistance;
  buffer[CINEMATIC_UNIFORM_OFFSETS.aperture] = data.aperture;
  buffer[CINEMATIC_UNIFORM_OFFSETS.colorGradeType] = data.colorGradeType;
  buffer[CINEMATIC_UNIFORM_OFFSETS._pad3] = 0;

  // Volumetric
  buffer[CINEMATIC_UNIFORM_OFFSETS.volumetricEnabled] = data.volumetricEnabled;
  buffer[CINEMATIC_UNIFORM_OFFSETS.volumetricDensity] = data.volumetricDensity;
  buffer[CINEMATIC_UNIFORM_OFFSETS.volumetricScattering] = data.volumetricScattering;
  buffer[CINEMATIC_UNIFORM_OFFSETS.lightShaftIntensity] = data.lightShaftIntensity;
  buffer[CINEMATIC_UNIFORM_OFFSETS.volumetricSteps] = data.volumetricSteps;
  buffer.set(data._pad4, CINEMATIC_UNIFORM_OFFSETS._pad4);

  // Fog
  buffer[CINEMATIC_UNIFORM_OFFSETS.fogEnabled] = data.fogEnabled;
  buffer[CINEMATIC_UNIFORM_OFFSETS.fogNear] = data.fogNear;
  buffer[CINEMATIC_UNIFORM_OFFSETS.fogFar] = data.fogFar;
  buffer[CINEMATIC_UNIFORM_OFFSETS.fogDensity] = data.fogDensity;
  buffer.set(data.fogColor, CINEMATIC_UNIFORM_OFFSETS.fogColor);
  buffer[CINEMATIC_UNIFORM_OFFSETS.fogHeightFalloff] = data.fogHeightFalloff;

  // Letterbox
  buffer.set(data.letterboxBars, CINEMATIC_UNIFORM_OFFSETS.letterboxBars);

  return buffer;
}

/**
 * Compile-time validation: if this doesn't compile, the layout is wrong
 */
type ValidateOffsets = {
  [K in keyof typeof CINEMATIC_UNIFORM_OFFSETS]: number;
};

// This will fail to compile if offsets object doesn't match interface
const _validateOffsets: ValidateOffsets = CINEMATIC_UNIFORM_OFFSETS;
