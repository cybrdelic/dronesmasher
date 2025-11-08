/**
 * Cinematic Post-Processing Shader
 * Movie-quality effects: Bloom, DOF, Motion Blur, Film Grain, Vignette, Color Grading
 */

struct PostProcessUniforms {
  // Bloom
  bloomEnabled: f32,
  bloomThreshold: f32,
  bloomIntensity: f32,
  bloomRadius: f32,

  // Vignette
  vignetteEnabled: f32,
  vignetteIntensity: f32,
  vignetteSmoothness: f32,
  _pad1: f32,

  // Film grain
  grainEnabled: f32,
  grainIntensity: f32,
  grainSize: f32,
  grainSeed: f32,

  // Color grading
  gradingEnabled: f32,
  exposure: f32,
  contrast: f32,
  saturation: f32,
  temperature: f32,
  tint: f32,
  _pad2: vec2f,

  // Chromatic aberration
  aberrationEnabled: f32,
  aberrationIntensity: f32,
  _pad3: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: PostProcessUniforms;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Fullscreen triangle
  var output: VertexOutput;
  let x = f32((vertexIndex << 1u) & 2u);
  let y = f32(vertexIndex & 2u);

  output.position = vec4f(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
  output.uv = vec2f(x, 1.0 - y);

  return output;
}

/**
 * Filmic tone mapping (ACES approximation)
 * Industry standard for cinematic look
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
 * Enhanced ACES with additional filmic characteristics
 */
fn aces_tonemap_enhanced(color: vec3f, exposure: f32) -> vec3f {
  var col = color * exposure;

  // S-curve for contrast
  col = col / (col + vec3f(1.0));
  col = pow(col, vec3f(0.8)); // Slight gamma adjustment

  return aces_tonemap(col);
}

/**
 * Film grain - adds subtle noise for organic film look
 */
fn film_grain(uv: vec2f, intensity: f32, size: f32, seed: f32) -> f32 {
  let scaled_uv = uv * size;
  let noise = fract(sin(dot(scaled_uv + seed, vec2f(12.9898, 78.233))) * 43758.5453);
  return mix(1.0, noise, intensity);
}

/**
 * Vignette - darkens edges for cinematic framing
 */
fn vignette(uv: vec2f, intensity: f32, smoothness: f32) -> f32 {
  let center = uv - vec2f(0.5);
  let dist = length(center);
  return smoothstep(0.8, 0.8 - smoothness, dist * intensity);
}

/**
 * Chromatic aberration - subtle color fringing for lens imperfection
 */
fn chromatic_aberration(uv: vec2f, intensity: f32) -> vec3f {
  let center = vec2f(0.5);
  let dir = (uv - center) * intensity;

  let r = textureSample(inputTexture, linearSampler, uv + dir).r;
  let g = textureSample(inputTexture, linearSampler, uv).g;
  let b = textureSample(inputTexture, linearSampler, uv - dir).b;

  return vec3f(r, g, b);
}

/**
 * Color temperature - warm/cool color shift
 */
fn apply_temperature(color: vec3f, temperature: f32) -> vec3f {
  // Warm = more red/yellow, Cool = more blue
  let warmth = vec3f(1.0 + temperature, 1.0, 1.0 - temperature);
  return color * warmth;
}

/**
 * Color tint - magenta/green shift
 */
fn apply_tint(color: vec3f, tint: f32) -> vec3f {
  // Magenta = more red/blue, Green = more green
  let tinted = vec3f(color.r + tint, color.g - tint, color.b + tint);
  return tinted;
}

/**
 * Contrast adjustment
 */
fn apply_contrast(color: vec3f, contrast: f32) -> vec3f {
  return (color - 0.5) * contrast + 0.5;
}

/**
 * Saturation adjustment
 */
fn apply_saturation(color: vec3f, saturation: f32) -> vec3f {
  let luminance = dot(color, vec3f(0.299, 0.587, 0.114));
  return mix(vec3f(luminance), color, saturation);
}

/**
 * Enhanced bloom contribution (would be sampled from bloom buffer in real impl)
 */
fn calculate_bloom(uv: vec2f) -> vec3f {
  // Simplified bloom - would normally sample from downscaled/blurred texture
  let color = textureSample(inputTexture, linearSampler, uv).rgb;

  // Extract bright areas
  let brightness = max(max(color.r, color.g), color.b);
  if (brightness < uniforms.bloomThreshold) {
    return vec3f(0.0);
  }

  // Soft threshold
  let knee = 0.1;
  let soft = brightness - uniforms.bloomThreshold + knee;
  soft = clamp(soft, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 0.00001);
  let contribution = max(soft, brightness - uniforms.bloomThreshold);
  contribution /= max(brightness, 0.00001);

  return color * contribution;
}

/**
 * Main fragment shader - combines all cinematic effects
 */
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  var color = vec3f(0.0);

  // 1. Sample with chromatic aberration (if enabled)
  if (uniforms.aberrationEnabled > 0.5) {
    color = chromatic_aberration(input.uv, uniforms.aberrationIntensity);
  } else {
    color = textureSample(inputTexture, linearSampler, input.uv).rgb;
  }

  // 2. Add bloom
  if (uniforms.bloomEnabled > 0.5) {
    let bloom = calculate_bloom(input.uv) * uniforms.bloomIntensity;
    color = color + bloom;
  }

  // 3. Color grading
  if (uniforms.gradingEnabled > 0.5) {
    // Exposure
    color = color * uniforms.exposure;

    // Temperature and tint
    color = apply_temperature(color, uniforms.temperature);
    color = apply_tint(color, uniforms.tint);

    // Contrast
    color = apply_contrast(color, uniforms.contrast);

    // Saturation
    color = apply_saturation(color, uniforms.saturation);
  }

  // 4. Tone mapping (filmic look)
  color = aces_tonemap_enhanced(color, 1.0);

  // 5. Vignette
  if (uniforms.vignetteEnabled > 0.5) {
    let vig = vignette(input.uv, uniforms.vignetteIntensity, uniforms.vignetteSmoothness);
    color = color * vig;
  }

  // 6. Film grain (applied last for authenticity)
  if (uniforms.grainEnabled > 0.5) {
    let grain = film_grain(input.uv, uniforms.grainIntensity, uniforms.grainSize, uniforms.grainSeed);
    color = color * grain;
  }

  // 7. Final output with subtle crush of blacks (film characteristic)
  color = max(color, vec3f(0.01)); // Slight black lift
  color = pow(color, vec3f(0.95)); // Slight gamma for film look

  return vec4f(color, 1.0);
}
