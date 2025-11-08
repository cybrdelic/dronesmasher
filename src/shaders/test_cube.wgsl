/**
 * Cinematic lighting shader for colored cube
 * Features:
 * - Directional key light (sun/studio light)
 * - Ambient occlusion approximation
 * - Rim lighting for depth
 * - Tone mapping for film-like look
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
  _pad4: f32,
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

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
  let normal = normalize(input.normal);
  let lightDir = normalize(-uniforms.lightDirection);
  let viewDir = normalize(uniforms.cameraPosition - input.worldPosition);

  // Diffuse lighting (Lambert)
  let diffuse = max(dot(normal, lightDir), 0.0);

  // Rim lighting (Fresnel-like effect for depth)
  let rimPower = 3.0;
  let rimIntensity = 0.4;
  let rim = pow(1.0 - max(dot(viewDir, normal), 0.0), rimPower) * rimIntensity;

  // Ambient occlusion (fake AO based on normal Y component)
  let ao = 0.5 + 0.5 * normal.y;

  // Combine lighting
  let ambient = uniforms.ambientColor * ao;
  let diffuseContribution = uniforms.lightColor * diffuse;
  let rimContribution = vec3f(1.0, 1.0, 1.0) * rim;

  // Apply lighting to base color
  var litColor = input.color * (ambient + diffuseContribution) + rimContribution;

  // Cinematic tone mapping
  litColor = aces_tonemap(litColor * 1.2); // Slight exposure boost

  return vec4f(litColor, 1.0);
}
