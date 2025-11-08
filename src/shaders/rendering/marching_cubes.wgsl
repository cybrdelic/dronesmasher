/**
 * Marching Cubes isosurface extraction on GPU
 *
 * Extracts triangle mesh from 3D scalar field (density) at given threshold.
 * Classic algorithm by Lorensen & Cline (1987) with GPU parallelization.
 *
 * Process:
 * 1. For each voxel, determine which corners are inside/outside (8-bit case)
 * 2. Look up triangle configuration from edge table (256 cases)
 * 3. Interpolate vertex positions along edges where isosurface crosses
 * 4. Emit triangles (up to 5 per cube)
 *
 * GPU optimization:
 * - Pass 1: Count triangles per voxel (prefix sum for allocation)
 * - Pass 2: Generate vertices and indices
 */

#include "../common/constants.wgsl"

// Binding group 0: Volume data
@group(0) @binding(0) var density_volume: texture_3d<f32>;
@group(0) @binding(1) var stress_volume: texture_3d<f32>;
@group(0) @binding(2) var volume_sampler: sampler;

// Binding group 1: Output buffers
@group(1) @binding(0) var<storage, read_write> vertices: array<Vertex>;
@group(1) @binding(1) var<storage, read_write> indices: array<u32>;
@group(1) @binding(2) var<storage, read_write> vertex_count: atomic<u32>;
@group(1) @binding(3) var<storage, read_write> index_count: atomic<u32>;

// Binding group 2: Parameters
@group(2) @binding(0) var<uniform> params: MarchingCubesParams;

struct MarchingCubesParams {
  grid_resolution: vec3u,
  grid_bounds: vec3f,
  iso_value: f32,
  interpolate_normals: u32,
}

struct Vertex {
  position: vec3f,
  normal: vec3f,
  stress: f32,
  _padding: f32,
}

// Marching cubes edge table (256 entries, 12 edges per cube)
// Precomputed lookup table for which edges are intersected
// This would be stored in a storage buffer or computed on-the-fly

// Edge connections (each edge connects two cube vertices)
const EDGE_CONNECTIONS = array<vec2u, 12>(
  vec2u(0u, 1u), vec2u(1u, 2u), vec2u(2u, 3u), vec2u(3u, 0u), // Bottom square
  vec2u(4u, 5u), vec2u(5u, 6u), vec2u(6u, 7u), vec2u(7u, 4u), // Top square
  vec2u(0u, 4u), vec2u(1u, 5u), vec2u(2u, 6u), vec2u(3u, 7u), // Vertical edges
);

// Cube vertex offsets (0-7)
const CUBE_VERTICES = array<vec3i, 8>(
  vec3i(0, 0, 0), vec3i(1, 0, 0), vec3i(1, 1, 0), vec3i(0, 1, 0),
  vec3i(0, 0, 1), vec3i(1, 0, 1), vec3i(1, 1, 1), vec3i(0, 1, 1),
);

/**
 * Samples density at grid position
 */
fn sample_density(grid_pos: vec3i) -> f32 {
  let res = vec3f(params.grid_resolution);
  let tex_coord = (vec3f(grid_pos) + 0.5) / res;
  return textureSampleLevel(density_volume, volume_sampler, tex_coord, 0.0).r;
}

/**
 * Samples stress at grid position
 */
fn sample_stress(grid_pos: vec3i) -> f32 {
  let res = vec3f(params.grid_resolution);
  let tex_coord = (vec3f(grid_pos) + 0.5) / res;
  return textureSampleLevel(stress_volume, volume_sampler, tex_coord, 0.0).r;
}

/**
 * Computes gradient (numerical derivative) for normal estimation
 */
fn compute_gradient(grid_pos: vec3i) -> vec3f {
  let dx = sample_density(grid_pos + vec3i(1, 0, 0)) - sample_density(grid_pos - vec3i(1, 0, 0));
  let dy = sample_density(grid_pos + vec3i(0, 1, 0)) - sample_density(grid_pos - vec3i(0, 1, 0));
  let dz = sample_density(grid_pos + vec3i(0, 0, 1)) - sample_density(grid_pos - vec3i(0, 0, 1));

  return normalize(vec3f(dx, dy, dz));
}

/**
 * Interpolates vertex position along edge where isosurface crosses
 */
fn interpolate_vertex(
  grid_pos1: vec3i,
  grid_pos2: vec3i,
  value1: f32,
  value2: f32
) -> Vertex {
  // Linear interpolation parameter
  let t = (params.iso_value - value1) / (value2 - value1 + 1e-6);

  // Interpolate position
  let p1 = vec3f(grid_pos1) / vec3f(params.grid_resolution) * params.grid_bounds;
  let p2 = vec3f(grid_pos2) / vec3f(params.grid_resolution) * params.grid_bounds;
  let position = mix(p1, p2, t);

  // Interpolate or compute normal
  var normal: vec3f;
  if (params.interpolate_normals > 0u) {
    let n1 = compute_gradient(grid_pos1);
    let n2 = compute_gradient(grid_pos2);
    normal = normalize(mix(n1, n2, t));
  } else {
    // Compute at interpolated position
    let grid_interp = mix(vec3f(grid_pos1), vec3f(grid_pos2), t);
    normal = compute_gradient(vec3i(grid_interp));
  }

  // Interpolate stress
  let stress1 = sample_stress(grid_pos1);
  let stress2 = sample_stress(grid_pos2);
  let stress = mix(stress1, stress2, t);

  var vertex: Vertex;
  vertex.position = position;
  vertex.normal = normal;
  vertex.stress = stress;
  vertex._padding = 0.0;

  return vertex;
}

/**
 * Determines which edges are intersected for a given cube configuration
 *
 * Returns 12-bit mask where bit i indicates if edge i is intersected
 */
fn get_edge_mask(cube_case: u32) -> u32 {
  // In practice, this would be a lookup table stored in a storage buffer
  // For brevity, we'll compute it on-the-fly using the edge table logic

  // Simplified: each bit in cube_case indicates if vertex is inside
  // Edges are intersected if one endpoint is inside and one is outside

  var edge_mask = 0u;

  for (var edge = 0u; edge < 12u; edge++) {
    let v1 = EDGE_CONNECTIONS[edge].x;
    let v2 = EDGE_CONNECTIONS[edge].y;

    let inside1 = (cube_case & (1u << v1)) != 0u;
    let inside2 = (cube_case & (1u << v2)) != 0u;

    if (inside1 != inside2) {
      edge_mask |= (1u << edge);
    }
  }

  return edge_mask;
}

/**
 * Returns triangle configuration for a given cube case
 *
 * Each cube case (0-255) has a specific set of triangles (max 5 triangles = 15 edges)
 * This is the heart of the marching cubes algorithm.
 *
 * In practice, this should be a precomputed 256×15 lookup table.
 */
fn get_triangle_edges(cube_case: u32) -> array<i32, 15> {
  // Placeholder: would be loaded from storage buffer
  // Format: triplets of edge indices, -1 terminates list
  // Example: [0, 8, 3, -1, ...] means one triangle with edges 0, 8, 3

  var edges: array<i32, 15>;
  for (var i = 0; i < 15; i++) {
    edges[i] = -1;
  }

  // TODO: Implement full marching cubes triangle table
  // For now, just handle simple cases

  if (cube_case == 0u || cube_case == 255u) {
    // Empty or full cube - no triangles
    return edges;
  }

  // Simplified example (not complete)
  if (cube_case == 1u) { // Only vertex 0 inside
    edges[0] = 0; edges[1] = 8; edges[2] = 3;
  }

  return edges;
}

/**
 * Main marching cubes kernel - generates triangles for each voxel
 */
@compute @workgroup_size(4, 4, 4)
fn marching_cubes_main(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let voxel_pos = vec3i(global_id.xyz);
  let res = vec3i(params.grid_resolution);

  // Skip if out of bounds
  if (voxel_pos.x >= res.x - 1 || voxel_pos.y >= res.y - 1 || voxel_pos.z >= res.z - 1) {
    return;
  }

  // Sample density at 8 cube corners
  var cube_values: array<f32, 8>;
  var cube_case = 0u;

  for (var i = 0u; i < 8u; i++) {
    let corner_pos = voxel_pos + CUBE_VERTICES[i];
    let value = sample_density(corner_pos);
    cube_values[i] = value;

    if (value >= params.iso_value) {
      cube_case |= (1u << i);
    }
  }

  // Skip if cube is completely inside or outside
  if (cube_case == 0u || cube_case == 255u) {
    return;
  }

  // Get triangle configuration
  let triangle_edges = get_triangle_edges(cube_case);

  // Generate vertices and triangles
  var edge_vertices: array<u32, 12>; // Stores vertex index for each edge

  // Process each edge that's intersected
  let edge_mask = get_edge_mask(cube_case);
  for (var edge = 0u; edge < 12u; edge++) {
    if ((edge_mask & (1u << edge)) != 0u) {
      // Interpolate vertex on this edge
      let v1_idx = EDGE_CONNECTIONS[edge].x;
      let v2_idx = EDGE_CONNECTIONS[edge].y;

      let grid_pos1 = voxel_pos + CUBE_VERTICES[v1_idx];
      let grid_pos2 = voxel_pos + CUBE_VERTICES[v2_idx];

      let vertex = interpolate_vertex(
        grid_pos1,
        grid_pos2,
        cube_values[v1_idx],
        cube_values[v2_idx]
      );

      // Add vertex to buffer
      let vertex_idx = atomicAdd(&vertex_count, 1u);
      vertices[vertex_idx] = vertex;
      edge_vertices[edge] = vertex_idx;
    }
  }

  // Generate triangles from edge triplets
  for (var i = 0; i < 15; i += 3) {
    let e0 = triangle_edges[i];
    let e1 = triangle_edges[i + 1];
    let e2 = triangle_edges[i + 2];

    if (e0 < 0) {
      break; // End of triangle list
    }

    // Add triangle indices
    let base_idx = atomicAdd(&index_count, 3u);
    indices[base_idx + 0u] = edge_vertices[u32(e0)];
    indices[base_idx + 1u] = edge_vertices[u32(e1)];
    indices[base_idx + 2u] = edge_vertices[u32(e2)];
  }
}

/**
 * Pass 1: Count triangles per voxel for buffer allocation
 */
@compute @workgroup_size(4, 4, 4)
fn marching_cubes_count(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let voxel_pos = vec3i(global_id.xyz);
  let res = vec3i(params.grid_resolution);

  if (voxel_pos.x >= res.x - 1 || voxel_pos.y >= res.y - 1 || voxel_pos.z >= res.z - 1) {
    return;
  }

  // Sample cube corners
  var cube_case = 0u;
  for (var i = 0u; i < 8u; i++) {
    let corner_pos = voxel_pos + CUBE_VERTICES[i];
    let value = sample_density(corner_pos);

    if (value >= params.iso_value) {
      cube_case |= (1u << i);
    }
  }

  if (cube_case == 0u || cube_case == 255u) {
    return;
  }

  // Count triangles for this cube
  let triangle_edges = get_triangle_edges(cube_case);
  var triangle_count = 0u;

  for (var i = 0; i < 15; i += 3) {
    if (triangle_edges[i] < 0) {
      break;
    }
    triangle_count++;
  }

  // Accumulate counts (would use prefix sum for allocation)
  atomicAdd(&vertex_count, triangle_count * 3u);
  atomicAdd(&index_count, triangle_count * 3u);
}
