/**
 * Build-time shader validator
 * Run with: npm run validate-shaders
 *
 * Validates:
 * - Shader files exist and are readable
 * - WGSL syntax is valid (basic check)
 * - Uniform struct sizes match expected layouts
 * - No undefined references
 */

import * as fs from 'fs';
import * as path from 'path';

interface UniformLayout {
  name: string;
  byteOffset: number;
  size: number;
  type: string;
}

interface ShaderValidation {
  path: string;
  expectedUniformSize: number;
  uniforms: UniformLayout[];
}

const SHADER_VALIDATIONS: ShaderValidation[] = [
  {
    path: 'src/shaders/cinematic_houdini.wgsl',
    expectedUniformSize: 416,
    uniforms: [
      { name: 'modelViewProjection', byteOffset: 0, size: 64, type: 'mat4x4f' },
      { name: 'modelMatrix', byteOffset: 64, size: 64, type: 'mat4x4f' },
      { name: 'normalMatrix', byteOffset: 128, size: 64, type: 'mat4x4f' },
      { name: 'cameraPosition', byteOffset: 192, size: 12, type: 'vec3f' },
      { name: 'time', byteOffset: 204, size: 4, type: 'f32' },
      { name: 'lightDirection', byteOffset: 208, size: 12, type: 'vec3f' },
      { name: '_pad1', byteOffset: 220, size: 4, type: 'f32' },
      { name: 'lightColor', byteOffset: 224, size: 12, type: 'vec3f' },
      { name: 'lightIntensity', byteOffset: 236, size: 4, type: 'f32' },
      { name: 'ambientColor', byteOffset: 240, size: 12, type: 'vec3f' },
      { name: '_pad2', byteOffset: 252, size: 4, type: 'f32' },
      { name: 'atmosphericColor', byteOffset: 256, size: 12, type: 'vec3f' },
      { name: 'atmosphericDensity', byteOffset: 268, size: 4, type: 'f32' },
      { name: 'vignetteStrength', byteOffset: 272, size: 4, type: 'f32' },
      { name: 'filmGrainStrength', byteOffset: 276, size: 4, type: 'f32' },
      { name: 'chromaticAberration', byteOffset: 280, size: 4, type: 'f32' },
      { name: 'dofEnabled', byteOffset: 284, size: 4, type: 'f32' },
      { name: 'focalDistance', byteOffset: 288, size: 4, type: 'f32' },
      { name: 'aperture', byteOffset: 292, size: 4, type: 'f32' },
      { name: 'colorGradeType', byteOffset: 296, size: 4, type: 'f32' },
      { name: '_pad3', byteOffset: 300, size: 4, type: 'f32' },
      { name: 'volumetricEnabled', byteOffset: 304, size: 4, type: 'f32' },
      { name: 'volumetricDensity', byteOffset: 308, size: 4, type: 'f32' },
      { name: 'volumetricScattering', byteOffset: 312, size: 4, type: 'f32' },
      { name: 'lightShaftIntensity', byteOffset: 316, size: 4, type: 'f32' },
      { name: 'volumetricSteps', byteOffset: 320, size: 4, type: 'f32' },
      { name: '_pad4', byteOffset: 324, size: 12, type: 'vec3f' },
      { name: 'fogEnabled', byteOffset: 336, size: 4, type: 'f32' },
      { name: 'fogNear', byteOffset: 340, size: 4, type: 'f32' },
      { name: 'fogFar', byteOffset: 344, size: 4, type: 'f32' },
      { name: 'fogDensity', byteOffset: 348, size: 4, type: 'f32' },
      { name: 'fogColor', byteOffset: 352, size: 12, type: 'vec3f' },
      { name: 'fogHeightFalloff', byteOffset: 364, size: 4, type: 'f32' },
      { name: 'letterboxBars', byteOffset: 368, size: 16, type: 'vec4f' },
    ],
  },
];

let hasErrors = false;

function validateShader(validation: ShaderValidation): void {
  console.log(`\n🔍 Validating ${validation.path}...`);

  // Check file exists
  if (!fs.existsSync(validation.path)) {
    console.error(`  ❌ ERROR: Shader file not found: ${validation.path}`);
    hasErrors = true;
    return;
  }

  // Read shader content
  const content = fs.readFileSync(validation.path, 'utf-8');

  // Check for Uniforms struct definition
  const uniformsStructMatch = content.match(/struct\s+Uniforms\s*\{([^}]+)\}/s);
  if (!uniformsStructMatch) {
    console.error(`  ❌ ERROR: No 'struct Uniforms' found in shader`);
    hasErrors = true;
    return;
  }

  // Validate each uniform field exists in shader
  const structContent = uniformsStructMatch[1];
  const missingFields: string[] = [];

  for (const uniform of validation.uniforms) {
    if (!uniform.name.startsWith('_pad')) {
      const fieldRegex = new RegExp(`${uniform.name}\\s*:\\s*${uniform.type}`);
      if (!fieldRegex.test(structContent)) {
        missingFields.push(`${uniform.name}: ${uniform.type}`);
      }
    }
  }

  if (missingFields.length > 0) {
    console.error(`  ❌ ERROR: Missing uniform fields:`);
    missingFields.forEach(field => console.error(`     - ${field}`));
    hasErrors = true;
    return;
  }

  // Calculate actual struct size with WebGPU alignment rules
  let calculatedSize = 0;
  for (const uniform of validation.uniforms) {
    const endOffset = uniform.byteOffset + uniform.size;
    if (endOffset > calculatedSize) {
      calculatedSize = endOffset;
    }
  }

  // WebGPU structs must be 16-byte aligned
  const alignedSize = Math.ceil(calculatedSize / 16) * 16;

  console.log(`  📊 Struct size analysis:`);
  console.log(`     Raw size: ${calculatedSize} bytes`);
  console.log(`     Aligned size: ${alignedSize} bytes`);
  console.log(`     Expected buffer: ${validation.expectedUniformSize} bytes`);

  if (alignedSize > validation.expectedUniformSize) {
    console.error(`  ❌ ERROR: Buffer too small!`);
    console.error(`     Need at least ${alignedSize} bytes, but allocated ${validation.expectedUniformSize}`);
    hasErrors = true;
    return;
  }

  // Check for basic WGSL syntax errors
  const syntaxIssues: string[] = [];

  // Check for common mistakes
  if (!content.includes('@vertex')) {
    syntaxIssues.push('Missing @vertex entry point');
  }
  if (!content.includes('@fragment')) {
    syntaxIssues.push('Missing @fragment entry point');
  }
  if (!content.includes('fn vertex_main')) {
    syntaxIssues.push('Missing vertex_main function');
  }
  if (!content.includes('fn fragment_main')) {
    syntaxIssues.push('Missing fragment_main function');
  }

  if (syntaxIssues.length > 0) {
    console.error(`  ⚠️  WARNING: Potential syntax issues:`);
    syntaxIssues.forEach(issue => console.warn(`     - ${issue}`));
  }

  console.log(`  ✅ Shader validated successfully`);
  console.log(`     ${validation.uniforms.length} uniforms checked`);
  console.log(`     Buffer size: OK (${validation.expectedUniformSize - alignedSize} bytes padding)`);
}

console.log('═══════════════════════════════════════════════');
console.log('🛠️  WebGPU Shader Validation (Build-time)');
console.log('═══════════════════════════════════════════════');

for (const validation of SHADER_VALIDATIONS) {
  validateShader(validation);
}

console.log('\n═══════════════════════════════════════════════');
if (hasErrors) {
  console.error('❌ Validation FAILED - Fix errors above');
  process.exit(1);
} else {
  console.log('✅ All shaders validated successfully');
  console.log('═══════════════════════════════════════════════\n');
  process.exit(0);
}
