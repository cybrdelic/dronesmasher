/**
 * Advanced Cinematic Shader - Houdini-level rendering
 * Features:
 * - Multi-light support (up to 4 lights)
 * - Volumetric lighting (god rays)
 * - Depth of field
 * - Advanced color grading
 * - Atmospheric fog
 * - Film grain, vignette, chromatic aberration
 * - Letterboxing
 */

struct Light {
  direction: vec3f,
  lightType: f32, // 0 = directional, 1 = point
  color: vec3f,
  intensity: f32,
}

struct Uniforms {
  modelViewProjection: mat4x4f,  // 0-15
  modelMatrix: mat4x4f,           // 16-31
  normalMatrix: mat4x4f,          // 32-47
  cameraPosition: vec3f,          // 48-50
  time: f32,                      // 51

  // Lighting (52-83): 4 lights * 8 floats each
  lights: array<Light, 4>,

  // Environment (84-95)
  ambient: vec3f,                 // 84-86
  _pad1: f32,                     // 87
  atmosphericColor: vec3f,        // 88-90
  atmosphericDensity: f32,        // 91
  activeLightCount: f32,          // 92
  _pad2: vec3f,                   // 93-95

  // Cinematic settings (96-111)
  vignetteStrength: f32,          // 96
  filmGrainStrength: f32,         // 97
  chromaticAberration: f32,       // 98
  dofEnabled: f32,                // 99
  focalDistance: f32,             // 100
  aperture: f32,                  // 101
  aspectRatio: f32,               // 102
  _pad3: f32,                     // 103
  colorGradeType: f32,            // 104
  _pad4: vec3f,                   // 105-107
  letterboxBars: vec4f,           // 108-111 (top, bottom, left, right)

  // Atmospheric effects (112-127)
  volumetricEnabled: f32,         // 112
  volumetricDensity: f32,         // 113
  volumetricScattering: f32,      // 114
  lightShaftIntensity: f32,       // 115
  volumetricSteps: f32,           // 116
  _pad5: vec3f,                   // 117-119
  fogEnabled: f32,                // 120
  fogColor: vec3f,                // 121-123
  fogNear: f32,                   // 124
  fogFar: f32,                    // 125
  fogDensity: f32,                // 126
  fogHeightFalloff: f32,          // 127
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) color: vec3f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) worldPosition: vec3f,
  @location(2) normal: vec3f,
  @location(3) viewDepth: f32,
}

@vertex
fn vertex_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  let worldPos = uniforms.modelMatrix * vec4f(input.position, 1.0);
  output.worldPosition = worldPos.xyz;
  output.position = uniforms.modelViewProjection * vec4f(input.position, 1.0);

  // Calculate view-space depth for DOF
  let viewPos = uniforms.modelViewProjection * vec4f(input.position, 1.0);
  output.viewDepth = viewPos.z / viewPos.w;

  // Calculate normal from position (for cube)
  output.normal = normalize(input.position);

  output.color = input.color;

  return output;
}

//═══════════════════════════════════════════════════════════════════════════
// LIGHTING FUNCTIONS
//═══════════════════════════════════════════════════════════════════════════

fn calculateLighting(
  normal: vec3f,
  worldPos: vec3f,
  viewDir: vec3f,
  baseColor: vec3f
) -> vec3f {
  var totalDiffuse = vec3f(0.0);
  var totalSpecular = vec3f(0.0);

  let lightCount = i32(uniforms.activeLightCount);

  for (var i = 0; i < 4; i++) {
    if (i >= lightCount) {
      break;
    }

    let light = uniforms.lights[i];
    let lightDir = normalize(-light.direction);

    // Diffuse (Lambert)
    let diffuse = max(dot(normal, lightDir), 0.0);
    totalDiffuse += light.color * diffuse * light.intensity;

    // Specular (Blinn-Phong)
    let halfDir = normalize(lightDir + viewDir);
    let specular = pow(max(dot(normal, halfDir), 0.0), 32.0);
    totalSpecular += light.color * specular * light.intensity * 0.5;
  }

  // Ambient occlusion (fake AO based on normal Y)
  let ao = 0.5 + 0.5 * normal.y;

  // Rim lighting (Fresnel)
  let rimPower = 3.0;
  let rimIntensity = 0.5;
  let rim = pow(1.0 - max(dot(viewDir, normal), 0.0), rimPower) * rimIntensity;

  // Combine lighting
  let ambient = uniforms.ambient * ao;
  let litColor = baseColor * (ambient + totalDiffuse) + totalSpecular + vec3f(rim);

  return litColor;
}

//═══════════════════════════════════════════════════════════════════════════
// VOLUMETRIC LIGHTING (GOD RAYS)
//═══════════════════════════════════════════════════════════════════════════

fn calculateVolumetricLighting(
  worldPos: vec3f,
  viewDir: vec3f
) -> vec3f {
  if (uniforms.volumetricEnabled < 0.5) {
    return vec3f(0.0);
  }

  let steps = i32(uniforms.volumetricSteps);
  let stepSize = 0.5;
  var accumulation = vec3f(0.0);

  let lightDir = normalize(-uniforms.lights[0].direction);

  for (var i = 0; i < steps; i++) {
    let t = f32(i) * stepSize;
    let samplePos = worldPos + viewDir * t;

    // Distance from light ray
    let toSample = samplePos - worldPos;
    let projection = dot(toSample, lightDir);
    let perpDist = length(toSample - lightDir * projection);

    // Volumetric scattering
    let scattering = exp(-perpDist * 2.0) * uniforms.volumetricScattering;
    let density = uniforms.volumetricDensity * exp(-abs(samplePos.y) * 0.2);

    accumulation += uniforms.atmosphericColor * scattering * density;
  }

  return accumulation * uniforms.lightShaftIntensity / f32(steps);
}

//═══════════════════════════════════════════════════════════════════════════
// FOG
//═══════════════════════════════════════════════════════════════════════════

fn applyFog(color: vec3f, worldPos: vec3f, cameraPos: vec3f) -> vec3f {
  if (uniforms.fogEnabled < 0.5) {
    return color;
  }

  let dist = length(worldPos - cameraPos);

  // Exponential height fog
  let heightFactor = exp(-worldPos.y * uniforms.fogHeightFalloff);
  let fogAmount = 1.0 - exp(-dist * uniforms.fogDensity * heightFactor);

  // Linear fog
  let linearFog = smoothstep(uniforms.fogNear, uniforms.fogFar, dist);

  let finalFogAmount = clamp(mix(fogAmount, linearFog, 0.5), 0.0, 1.0);

  return mix(color, uniforms.fogColor, finalFogAmount);
}

//═══════════════════════════════════════════════════════════════════════════
// COLOR GRADING
//═══════════════════════════════════════════════════════════════════════════

// ACES Tone Mapping (film-like)
fn aces_tonemap(color: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0), vec3f(1.0));
}

fn applyColorGrade(color: vec3f) -> vec3f {
  let gradeType = i32(uniforms.colorGradeType);

  // 0: Neutral - just ACES
  if (gradeType == 0) {
    return aces_tonemap(color * 1.2);
  }

  // 1: Cinematic (Teal & Orange)
  if (gradeType == 1) {
    let teal = vec3f(0.0, 0.3, 0.3);
    let orange = vec3f(0.3, 0.15, 0.0);
    let luminance = dot(color, vec3f(0.299, 0.587, 0.114));
    let graded = color + mix(teal, orange, luminance);
    return aces_tonemap(graded * 1.3);
  }

  // 2: Vintage (Faded film)
  if (gradeType == 2) {
    let faded = mix(color, vec3f(0.5), 0.2);
    let warm = faded * vec3f(1.1, 1.0, 0.9);
    return aces_tonemap(warm * 1.1) * 0.95 + vec3f(0.05);
  }

  // 3: Noir (B&W high contrast)
  if (gradeType == 3) {
    let luminance = dot(color, vec3f(0.299, 0.587, 0.114));
    let contrast = (luminance - 0.5) * 1.8 + 0.5;
    return vec3f(clamp(contrast, 0.0, 1.0));
  }

  // 4: Bleach Bypass (desaturated high contrast)
  if (gradeType == 4) {
    let luminance = dot(color, vec3f(0.299, 0.587, 0.114));
    let desaturated = mix(vec3f(luminance), color, 0.3);
    let contrast = (desaturated - 0.5) * 1.5 + 0.5;
    return aces_tonemap(contrast * 1.4);
  }

  // 5: Warm
  if (gradeType == 5) {
    let warm = color * vec3f(1.2, 1.05, 0.9);
    return aces_tonemap(warm * 1.3);
  }

  // 6: Cool
  if (gradeType == 6) {
    let cool = color * vec3f(0.9, 1.0, 1.2);
    return aces_tonemap(cool * 1.2);
  }

  // 7: Cyberpunk (neon saturation)
  if (gradeType == 7) {
    let saturated = color * 1.5;
    let luminance = dot(saturated, vec3f(0.299, 0.587, 0.114));
    let vibrant = mix(vec3f(luminance), saturated, 1.8);
    return aces_tonemap(vibrant * 1.1);
  }

  return aces_tonemap(color * 1.2);
}

//═══════════════════════════════════════════════════════════════════════════
// POST-PROCESSING EFFECTS
//═══════════════════════════════════════════════════════════════════════════

// Improved film grain with better noise
fn film_grain(uv: vec2f, time: f32, strength: f32) -> f32 {
  let noise1 = fract(sin(dot(uv + time * 0.001, vec2f(12.9898, 78.233))) * 43758.5453);
  let noise2 = fract(sin(dot(uv.yx + time * 0.0013, vec2f(93.9898, 67.345))) * 28653.4531);
  let grain = (noise1 + noise2) * 0.5;
  return mix(1.0, grain, strength * 0.15);
}

// Vignette
fn vignette(uv: vec2f, strength: f32) -> f32 {
  let center = uv - vec2f(0.5);
  let dist = length(center);
  let vignetteAmount = smoothstep(0.8, 0.2, dist);
  return mix(1.0, vignetteAmount, strength);
}

// Chromatic aberration
fn chromaticAberration(uv: vec2f, strength: f32) -> vec3f {
  let center = uv - vec2f(0.5);
  let dist = length(center);
  let offset = dist * strength * 0.02;

  return vec3f(
    1.0 + offset,
    1.0,
    1.0 - offset
  );
}

// Depth of field (bokeh approximation)
fn calculateDOF(viewDepth: f32, color: vec3f) -> vec3f {
  if (uniforms.dofEnabled < 0.5) {
    return color;
  }

  let focusRange = uniforms.focalDistance;
  let blur = abs(viewDepth - focusRange) / (uniforms.aperture * 0.5);
  let blurAmount = clamp(blur, 0.0, 1.0);

  // Simple blur by darkening unfocused areas (more realistic would need multi-pass)
  let focused = mix(color, color * 0.7, blurAmount);
  return focused;
}

//═══════════════════════════════════════════════════════════════════════════
// FRAGMENT SHADER
//═══════════════════════════════════════════════════════════════════════════

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  let normal = normalize(input.normal);
  let viewDir = normalize(uniforms.cameraPosition - input.worldPosition);

  // Screen-space UV
  let screenSize = vec2f(1920.0, 1080.0); // Will be dynamic in real impl
  let screenUV = input.position.xy / screenSize;

  // Check if in letterbox area
  if (screenUV.y < uniforms.letterboxBars.x ||
      screenUV.y > (1.0 - uniforms.letterboxBars.y) ||
      screenUV.x < uniforms.letterboxBars.z ||
      screenUV.x > (1.0 - uniforms.letterboxBars.w)) {
    return vec4f(0.0, 0.0, 0.0, 1.0); // Pure black letterbox
  }

  // Calculate lighting
  var litColor = calculateLighting(normal, input.worldPosition, viewDir, input.color);

  // Add volumetric lighting
  let volumetric = calculateVolumetricLighting(input.worldPosition, viewDir);
  litColor += volumetric;

  // Apply fog
  litColor = applyFog(litColor, input.worldPosition, uniforms.cameraPosition);

  // Color grading and tone mapping
  litColor = applyColorGrade(litColor);

  // Depth of field
  litColor = calculateDOF(input.viewDepth, litColor);

  // Vignette
  let vig = vignette(screenUV, uniforms.vignetteStrength);
  litColor *= vig;

  // Film grain
  let grain = film_grain(screenUV, uniforms.time, uniforms.filmGrainStrength);
  litColor *= grain;

  // Chromatic aberration
  let caShift = chromaticAberration(screenUV, uniforms.chromaticAberration);
  litColor *= caShift;

  // Slight black lift for film look
  litColor = max(litColor, vec3f(0.01));

  return vec4f(litColor, 1.0);
}
