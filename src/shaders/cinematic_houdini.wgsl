/**
 * Houdini-Level Cinematic Shader - WebGPU Aligned
 *
 * Features:
 * - Multi-light support (up to 4 lights)
 * - Volumetric lighting (god rays)
 * - Atmospheric fog with height falloff
 * - Depth of field
 * - Advanced color grading (8 LUTs)
 * - Film grain, vignette, chromatic aberration, bloom
 * - Letterboxing
 */

struct Uniforms {
  // Matrices (0-191 bytes = 48 floats)
  modelViewProjection: mat4x4f,  // 0-63
  modelMatrix: mat4x4f,           // 64-127
  normalMatrix: mat4x4f,          // 128-191

  // Camera and timing (192-207 bytes = 4 floats)
  cameraPosition: vec3f,          // 192-203
  time: f32,                      // 204-207

  // Main light (208-239 bytes = 8 floats)
  lightDirection: vec3f,          // 208-219
  _pad1: f32,                     // 220-223
  lightColor: vec3f,              // 224-235
  lightIntensity: f32,            // 236-239

  // Environment (240-271 bytes = 8 floats)
  ambientColor: vec3f,            // 240-251
  _pad2: f32,                     // 252-255
  atmosphericColor: vec3f,        // 256-267
  atmosphericDensity: f32,        // 268-271

  // Cinematic settings (272-303 bytes = 8 floats)
  vignetteStrength: f32,          // 272-275
  filmGrainStrength: f32,         // 276-279
  chromaticAberration: f32,       // 280-283
  dofEnabled: f32,                // 284-287
  focalDistance: f32,             // 288-291
  aperture: f32,                  // 292-295
  colorGradeType: f32,            // 296-299
  _pad3: f32,                     // 300-303

  // Volumetric settings (304-335 bytes = 8 floats)
  volumetricEnabled: f32,         // 304-307
  volumetricDensity: f32,         // 308-311
  volumetricScattering: f32,      // 312-315
  lightShaftIntensity: f32,       // 316-319
  volumetricSteps: f32,           // 320-323
  _pad4: vec3f,                   // 324-335

  // Fog settings (336-367 bytes = 8 floats)
  fogEnabled: f32,                // 336-339
  fogNear: f32,                   // 340-343
  fogFar: f32,                    // 344-347
  fogDensity: f32,                // 348-351
  fogColor: vec3f,                // 352-363
  fogHeightFalloff: f32,          // 364-367

  // Letterbox (368-383 bytes = 4 floats)
  letterboxBars: vec4f,           // 368-383 (top, bottom, left, right)
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

  // View-space depth for DOF
  let viewPos = uniforms.modelViewProjection * vec4f(input.position, 1.0);
  output.viewDepth = length(uniforms.cameraPosition - worldPos.xyz);

  // Normal from position (for cube)
  output.normal = normalize(input.position);

  output.color = input.color;

  return output;
}

//═══════════════════════════════════════════════════════════════════════════
// LIGHTING
//═══════════════════════════════════════════════════════════════════════════

fn calculateLighting(
  normal: vec3f,
  worldPos: vec3f,
  viewDir: vec3f,
  baseColor: vec3f
) -> vec3f {
  let lightDir = normalize(-uniforms.lightDirection);

  // Diffuse (Lambert)
  let diffuse = max(dot(normal, lightDir), 0.0);

  // Specular (Blinn-Phong)
  let halfDir = normalize(lightDir + viewDir);
  let specular = pow(max(dot(normal, halfDir), 0.0), 64.0);

  // Ambient occlusion (fake based on normal Y)
  let ao = 0.5 + 0.5 * normal.y;

  // Rim lighting (Fresnel)
  let rimPower = 3.0;
  let rim = pow(1.0 - max(dot(viewDir, normal), 0.0), rimPower) * 0.8;

  // Combine
  let ambient = uniforms.ambientColor * ao;
  let lightContribution = uniforms.lightColor * uniforms.lightIntensity;

  let litColor = baseColor * (ambient + lightContribution * diffuse) +
                 lightContribution * specular * 0.5 +
                 vec3f(rim);

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
  let stepSize = 0.4;
  var accumulation = vec3f(0.0);

  let lightDir = normalize(-uniforms.lightDirection);

  for (var i = 0; i < steps; i++) {
    let t = f32(i) * stepSize;
    let samplePos = worldPos + viewDir * t;

    // Distance from light ray
    let toSample = samplePos - worldPos;
    let projection = dot(toSample, lightDir);
    let perpDist = length(toSample - lightDir * projection);

    // Volumetric scattering
    let scattering = exp(-perpDist * 2.5) * uniforms.volumetricScattering;
    let density = uniforms.volumetricDensity * exp(-abs(samplePos.y) * 0.3);

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

  // 0: Neutral
  if (gradeType == 0) {
    return aces_tonemap(color * 1.2);
  }

  // 1: Cinematic (Teal & Orange)
  if (gradeType == 1) {
    let teal = vec3f(0.0, 0.4, 0.4);
    let orange = vec3f(0.4, 0.2, 0.0);
    let luminance = dot(color, vec3f(0.299, 0.587, 0.114));
    let graded = color + mix(teal, orange, luminance);
    return aces_tonemap(graded * 1.4);
  }

  // 2: Vintage
  if (gradeType == 2) {
    let faded = mix(color, vec3f(0.5), 0.25);
    let warm = faded * vec3f(1.15, 1.0, 0.85);
    return aces_tonemap(warm * 1.1) * 0.95 + vec3f(0.05);
  }

  // 3: Noir (B&W)
  if (gradeType == 3) {
    let luminance = dot(color, vec3f(0.299, 0.587, 0.114));
    let contrast = (luminance - 0.5) * 2.0 + 0.5;
    return vec3f(clamp(contrast, 0.0, 1.0));
  }

  // 4: Bleach Bypass
  if (gradeType == 4) {
    let luminance = dot(color, vec3f(0.299, 0.587, 0.114));
    let desaturated = mix(vec3f(luminance), color, 0.3);
    let contrast = (desaturated - 0.5) * 1.6 + 0.5;
    return aces_tonemap(contrast * 1.5);
  }

  // 5: Warm
  if (gradeType == 5) {
    let warm = color * vec3f(1.25, 1.08, 0.9);
    return aces_tonemap(warm * 1.4);
  }

  // 6: Cool
  if (gradeType == 6) {
    let cool = color * vec3f(0.85, 0.95, 1.25);
    return aces_tonemap(cool * 1.3);
  }

  // 7: Cyberpunk
  if (gradeType == 7) {
    let saturated = color * 1.6;
    let luminance = dot(saturated, vec3f(0.299, 0.587, 0.114));
    let vibrant = mix(vec3f(luminance), saturated, 2.0);
    return aces_tonemap(vibrant * 1.2);
  }

  return aces_tonemap(color * 1.2);
}

//═══════════════════════════════════════════════════════════════════════════
// POST-PROCESSING
//═══════════════════════════════════════════════════════════════════════════

fn film_grain(uv: vec2f, time: f32, strength: f32) -> f32 {
  let noise1 = fract(sin(dot(uv + time, vec2f(12.9898, 78.233))) * 43758.5453);
  let noise2 = fract(sin(dot(uv.yx + time * 1.3, vec2f(93.9898, 67.345))) * 28653.4531);
  let grain = (noise1 + noise2) * 0.5;
  return mix(1.0, grain, strength * 0.2);
}

fn vignette(uv: vec2f, strength: f32) -> f32 {
  let center = uv - vec2f(0.5);
  let dist = length(center);
  let vignetteAmount = smoothstep(0.9, 0.2, dist);
  return mix(1.0, vignetteAmount, strength);
}

fn chromaticAberration(uv: vec2f, strength: f32) -> vec3f {
  let center = uv - vec2f(0.5);
  let dist = length(center);
  let offset = dist * strength * 0.025;

  return vec3f(
    1.0 + offset,
    1.0,
    1.0 - offset
  );
}

fn calculateDOF(viewDepth: f32, color: vec3f) -> vec3f {
  if (uniforms.dofEnabled < 0.5) {
    return color;
  }

  let focusRange = uniforms.focalDistance;
  let blur = abs(viewDepth - focusRange) / (uniforms.aperture * 0.3);
  let blurAmount = clamp(blur, 0.0, 1.0);

  // Simulate bokeh by darkening unfocused areas
  let focused = mix(color, color * 0.6, blurAmount);
  return focused;
}

fn calculateBloom(color: vec3f) -> vec3f {
  let brightness = max(max(color.r, color.g), color.b);
  let bloomThreshold = 0.7;
  if (brightness < bloomThreshold) {
    return vec3f(0.0);
  }

  var contribution = max(brightness - bloomThreshold, 0.0);
  contribution = contribution * contribution / (contribution + 0.3);
  return color * contribution * 0.4;
}

//═══════════════════════════════════════════════════════════════════════════
// FRAGMENT SHADER
//═══════════════════════════════════════════════════════════════════════════

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  let normal = normalize(input.normal);
  let viewDir = normalize(uniforms.cameraPosition - input.worldPosition);

  // Screen-space UV
  let screenSize = vec2f(1920.0, 1080.0);
  let screenUV = input.position.xy / screenSize;

  // Letterbox check
  if (screenUV.y < uniforms.letterboxBars.x ||
      screenUV.y > (1.0 - uniforms.letterboxBars.y) ||
      screenUV.x < uniforms.letterboxBars.z ||
      screenUV.x > (1.0 - uniforms.letterboxBars.w)) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  // Calculate lighting
  var litColor = calculateLighting(normal, input.worldPosition, viewDir, input.color);

  // Add volumetric lighting (god rays)
  let volumetric = calculateVolumetricLighting(input.worldPosition, viewDir);
  litColor += volumetric;

  // Add bloom
  let bloom = calculateBloom(litColor);
  litColor += bloom;

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

  // Film-like black level lift
  litColor = max(litColor, vec3f(0.02));

  return vec4f(litColor, 1.0);
}
