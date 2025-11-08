/**
 * Volumetric rendering with PBR materials and stress visualization
 *
 * Renders isosurface extracted from topology optimization density field.
 * Colors vertices by von Mises stress using turbo colormap.
 * Applies PBR lighting for realistic material appearance.
 */

#include "../common/types.wgsl"
#include "../common/constants.wgsl"

// Binding group 0: Camera and lighting
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> lighting: LightingParams;

// Binding group 1: Volume data
@group(1) @binding(0) var density_texture: texture_3d<f32>;
@group(1) @binding(1) var stress_texture: texture_3d<f32>;
@group(1) @binding(2) var volume_sampler: sampler;

// Binding group 2: Render settings
@group(2) @binding(0) var<uniform> settings: RenderSettings;

struct LightingParams {
  light_direction: vec3f,      // Directional light
  light_color: vec3f,
  ambient_color: vec3f,
  pbr_roughness: f32,
  pbr_metallic: f32,
}

struct RenderSettings {
  density_threshold: f32,
  stress_min: f32,
  stress_max: f32,
  show_stress: u32,           // 1 = color by stress, 0 = solid color
  opacity: f32,
  cross_section_axis: u32,    // 0=none, 1=x, 2=y, 3=z
  cross_section_position: f32,
}

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) stress: f32,  // von Mises stress at this vertex
}

struct VertexOutput {
  @builtin(position) clip_position: vec4f,
  @location(0) world_position: vec3f,
  @location(1) world_normal: vec3f,
  @location(2) stress: f32,
}

@vertex
fn vertex_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;

  // Transform to clip space
  let world_pos = vec4f(in.position, 1.0);
  let view_pos = camera.view_matrix * world_pos;
  let clip_pos = camera.projection_matrix * view_pos;

  out.clip_position = clip_pos;
  out.world_position = in.position;
  out.world_normal = normalize(in.normal);
  out.stress = in.stress;

  return out;
}

/**
 * Turbo colormap for stress visualization
 * Maps scalar value [0, 1] to perceptually uniform rainbow colors
 *
 * Reference: Anton Mikhailov (2019) "Turbo, An Improved Rainbow Colormap for Visualization"
 */
fn turbo_colormap(t: f32) -> vec3f {
  let t_clamped = clamp(t, 0.0, 1.0);

  // Polynomial approximation of Turbo colormap
  let r = -0.71318 + t_clamped * (1.32422 + t_clamped * (1.84192 + t_clamped * (-3.37676 + t_clamped * 1.33803)));
  let g = -0.48572 + t_clamped * (3.30314 + t_clamped * (-5.53311 + t_clamped * (4.01937 + t_clamped * -1.30513)));
  let b = 0.62896 + t_clamped * (0.32114 + t_clamped * (2.48859 + t_clamped * (-4.91511 + t_clamped * 2.01724)));

  return clamp(vec3f(r, g, b), vec3f(0.0), vec3f(1.0));
}

/**
 * PBR shading with Cook-Torrance BRDF
 *
 * f(l, v) = D(h) G(l, v, h) F(v, h) / (4 (n·l) (n·v))
 *
 * where:
 * - D is normal distribution function (GGX)
 * - G is geometry function (Smith)
 * - F is Fresnel term (Schlick approximation)
 */
fn pbr_cook_torrance(
  N: vec3f,  // Normal
  V: vec3f,  // View direction
  L: vec3f,  // Light direction
  roughness: f32,
  metallic: f32,
  base_color: vec3f
) -> vec3f {
  let H = normalize(V + L);
  let NdotL = max(dot(N, L), 0.0);
  let NdotV = max(dot(N, V), 0.001); // Prevent division by zero
  let NdotH = max(dot(N, H), 0.0);
  let VdotH = max(dot(V, H), 0.0);

  // GGX normal distribution
  let alpha = roughness * roughness;
  let alpha2 = alpha * alpha;
  let denom = NdotH * NdotH * (alpha2 - 1.0) + 1.0;
  let D = alpha2 / (3.14159265 * denom * denom);

  // Schlick-GGX geometry function
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  let G1_L = NdotL / (NdotL * (1.0 - k) + k);
  let G1_V = NdotV / (NdotV * (1.0 - k) + k);
  let G = G1_L * G1_V;

  // Fresnel (Schlick approximation)
  let F0 = mix(vec3f(0.04), base_color, metallic);
  let F = F0 + (vec3f(1.0) - F0) * pow(1.0 - VdotH, 5.0);

  // Specular BRDF
  let specular = (D * G * F) / (4.0 * NdotL * NdotV + 0.001);

  // Diffuse (Lambert)
  let kD = (vec3f(1.0) - F) * (1.0 - metallic);
  let diffuse = kD * base_color / 3.14159265;

  return (diffuse + specular) * NdotL;
}

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) vec4f {
  // Check cross-section clipping
  if (settings.cross_section_axis > 0u) {
    var coord = 0.0;
    if (settings.cross_section_axis == 1u) {
      coord = in.world_position.x;
    } else if (settings.cross_section_axis == 2u) {
      coord = in.world_position.y;
    } else {
      coord = in.world_position.z;
    }

    if (coord > settings.cross_section_position) {
      discard;
    }
  }

  // Determine base color from stress if enabled
  var base_color = vec3f(0.8, 0.8, 0.8); // Default gray

  if (settings.show_stress > 0u) {
    // Normalize stress to [0, 1]
    let stress_normalized = (in.stress - settings.stress_min) /
                             (settings.stress_max - settings.stress_min);

    base_color = turbo_colormap(stress_normalized);
  }

  // Lighting setup
  let N = normalize(in.world_normal);
  let V = normalize(camera.position - in.world_position);
  let L = normalize(-lighting.light_direction);

  // PBR shading
  let lit_color = pbr_cook_torrance(
    N, V, L,
    lighting.pbr_roughness,
    lighting.pbr_metallic,
    base_color
  );

  // Add ambient term
  let ambient = lighting.ambient_color * base_color * 0.3;
  let final_color = lit_color * lighting.light_color + ambient;

  return vec4f(final_color, settings.opacity);
}

/**
 * Wireframe rendering (alternative fragment shader)
 */
@fragment
fn fragment_wireframe(in: VertexOutput) -> @location(0) vec4f {
  return vec4f(0.0, 0.0, 0.0, 0.5); // Semi-transparent black lines
}

/**
 * X-Ray rendering (shows internal structure)
 */
@fragment
fn fragment_xray(in: VertexOutput) -> @location(0) vec4f {
  let N = normalize(in.world_normal);
  let V = normalize(camera.position - in.world_position);

  // Fresnel-like falloff (edges brighter)
  let fresnel = 1.0 - abs(dot(N, V));
  let intensity = pow(fresnel, 2.0);

  // Color by stress
  let stress_normalized = (in.stress - settings.stress_min) /
                           (settings.stress_max - settings.stress_min);
  let color = turbo_colormap(stress_normalized);

  return vec4f(color * intensity, intensity * 0.5);
}

/**
 * Density gradient rendering (shows optimization convergence)
 */
@fragment
fn fragment_density_gradient(in: VertexOutput) -> @location(0) vec4f {
  // Sample density at world position
  // TODO: Map world position to texture coordinates
  let tex_coord = (in.world_position + vec3f(0.1)) / vec3f(0.2);

  // Would sample density texture here
  // let density = textureSample(density_texture, volume_sampler, tex_coord).r;

  // Color from gray (void) to blue (solid)
  let density = 0.5; // Placeholder
  let color = mix(vec3f(0.2, 0.2, 0.2), vec3f(0.2, 0.4, 1.0), density);

  return vec4f(color, 1.0);
}
