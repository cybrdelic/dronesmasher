/**
 * Cinematic lighting shader with post-processing effects
 * Features:
 * - Directional key light (sun/studio light)
 * - Ambient occlusion approximation
 * - Rim lighting for depth
 * - Tone mapping for film-like look
 * - Film grain, vignette, chromatic aberration, bloom
 */

struct Uniforms {
  modelViewProjection: mat4x4f,
  modelMatrix: mat4x4f,
  normalMatrix: mat4x4f,
  lightDirection: vec3f,
  _pad1: f32,
  lightColor: vec3f,
  _pad2: f32,
  ambientColor: vec3f,
  _pad3: f32,
  cameraPosition: vec3f,
  time: f32, // For film grain animation
  // Post-processing controls (0 or 1 for enabled)
  bloomEnabled: f32,
  filmGrainEnabled: f32,
  vignetteEnabled: f32,
  chromaticAberrationEnabled: f32,
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
}

@vertex
fn vertex_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Transform position
  let worldPos = uniforms.modelMatrix * vec4f(input.position, 1.0);
  output.worldPosition = worldPos.xyz;
  output.position = uniforms.modelViewProjection * vec4f(input.position, 1.0);

  // Calculate normal from position (for cube, normal = normalized position)
  output.normal = normalize(input.position);

  // Pass through color
  output.color = input.color;

  return output;
}

/**
 * Filmic tone mapping (ACES approximation)
 * Gives a cinematic film-like look
 */
fn aces_tonemap(color: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3f(0.0), vec3f(1.0));
}

/**
 * Film grain - adds organic noise for 35mm film look
 */
fn film_grain(uv: vec2f, time: f32) -> f32 {
  let noise = fract(sin(dot(uv + time * 0.001, vec2f(12.9898, 78.233))) * 43758.5453);
  return mix(0.95, 1.05, noise); // Subtle grain multiplier
}

/**
 * Vignette - darkens edges for cinematic framing
 */
fn vignette(uv: vec2f) -> f32 {
  let center = uv - vec2f(0.5);
  let dist = length(center);
  return smoothstep(0.8, 0.3, dist); // Smooth falloff
}

/**
 * Bloom approximation - adds glow to bright areas
 */
fn calculate_bloom(color: vec3f) -> vec3f {
  let brightness = max(max(color.r, color.g), color.b);
  let bloomThreshold = 0.8;

  if (brightness < bloomThreshold) {
    return vec3f(0.0);
  }

  // Soft threshold
  let knee = 0.2;
  var contribution = max(brightness - bloomThreshold, 0.0);
  contribution = contribution * contribution / (contribution + knee);

  return color * contribution * 0.3; // Bloom intensity
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  let normal = normalize(input.normal);
  let lightDir = normalize(-uniforms.lightDirection);
  let viewDir = normalize(uniforms.cameraPosition - input.worldPosition);

  // Calculate screen-space UV for post-processing effects
  let screenUV = input.position.xy / vec2f(1920.0, 1080.0); // Approximate, will work for effects

  // Diffuse lighting (Lambert)
  let diffuse = max(dot(normal, lightDir), 0.0);

  // Rim lighting (Fresnel-like effect for depth)
  let rimPower = 3.0;
  let rimIntensity = 0.5;
  let rim = pow(1.0 - max(dot(viewDir, normal), 0.0), rimPower) * rimIntensity;

  // Ambient occlusion (fake AO based on normal Y component)
  let ao = 0.5 + 0.5 * normal.y;

  // Combine lighting
  let ambient = uniforms.ambientColor * ao;
  let diffuseContribution = uniforms.lightColor * diffuse;
  let rimContribution = vec3f(1.0, 1.0, 1.0) * rim;

  // Apply lighting to base color
  var litColor = input.color * (ambient + diffuseContribution) + rimContribution;

  // Apply bloom (if enabled)
  if (uniforms.bloomEnabled > 0.5) {
    let bloom = calculate_bloom(litColor);
    litColor = litColor + bloom;
  }

  // Cinematic tone mapping
  litColor = aces_tonemap(litColor * 1.3); // Slight exposure boost

  // Apply vignette (if enabled)
  if (uniforms.vignetteEnabled > 0.5) {
    let vig = vignette(screenUV);
    litColor = litColor * vig;
  }

  // Apply film grain (if enabled)
  if (uniforms.filmGrainEnabled > 0.5) {
    let grain = film_grain(screenUV, uniforms.time);
    litColor = litColor * grain;
  }

  // Chromatic aberration (if enabled) - subtle color shift at edges
  if (uniforms.chromaticAberrationEnabled > 0.5) {
    let center = screenUV - vec2f(0.5);
    let dist = length(center);
    let shift = dist * 0.015; // Subtle effect
    litColor.r = litColor.r * (1.0 + shift);
    litColor.b = litColor.b * (1.0 - shift);
  }

  // Slight black lift for film look
  litColor = max(litColor, vec3f(0.01));

  return vec4f(litColor, 1.0);
}
