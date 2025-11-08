/**
 * SIMP topology optimization - sensitivity analysis and density update
 *
 * Computes design sensitivities and updates densities using the
 * Optimality Criteria (OC) method.
 */

#include "../common/constants.wgsl"

// Binding group 0: Current state
@group(0) @binding(0) var<storage, read> densities: array<f32>;
@group(0) @binding(1) var<storage, read> displacements: array<f32>;
@group(0) @binding(2) var<storage, read_write> sensitivities: array<f32>;

// Binding group 1: Material and optimization parameters
@group(1) @binding(0) var<uniform> params: OptimizationParams;

struct OptimizationParams {
  simp_penalty: f32,         // p in ρ^p
  density_min: f32,          // Minimum density (prevents singularity)
  volume_fraction: f32,      // Target volume fraction
  move_limit: f32,           // Maximum density change per iteration
  lagrange_multiplier: f32,  // λ for volume constraint
  youngs_modulus: f32,       // E_0 (base material stiffness)
}

/**
 * Computes element stiffness energy: u_e^T K_e u_e
 *
 * For a hexahedral element with 8 nodes × 3 DOF = 24 DOFs
 */
fn compute_element_strain_energy(
  element_idx: u32,
  element_stiffness: array<f32, 300>, // Upper triangle of 24×24 symmetric matrix
  displacements: array<f32>
) -> f32 {
  var energy = 0.0;

  // Get node indices for this element (structured grid)
  let nx = GRID_RES_X;
  let ny = GRID_RES_Y;
  let nz = GRID_RES_Z;

  let iz = element_idx / (nx * ny);
  let iy = (element_idx % (nx * ny)) / nx;
  let ix = element_idx % nx;

  // 8 nodes of hexahedron (corner connectivity)
  let nodes_per_x = nx + 1u;
  let nodes_per_y = ny + 1u;

  let n0 = ix + iy * nodes_per_x + iz * nodes_per_x * nodes_per_y;
  let n1 = n0 + 1u;
  let n2 = n0 + nodes_per_x + 1u;
  let n3 = n0 + nodes_per_x;
  let n4 = n0 + nodes_per_x * nodes_per_y;
  let n5 = n4 + 1u;
  let n6 = n4 + nodes_per_x + 1u;
  let n7 = n4 + nodes_per_x;

  let node_indices = array<u32, 8>(n0, n1, n2, n3, n4, n5, n6, n7);

  // Extract element displacement vector (24 values)
  var u_e: array<f32, 24>;
  for (var i = 0u; i < 8u; i++) {
    let node = node_indices[i];
    u_e[i * 3u + 0u] = displacements[node * 3u + 0u]; // u_x
    u_e[i * 3u + 1u] = displacements[node * 3u + 1u]; // u_y
    u_e[i * 3u + 2u] = displacements[node * 3u + 2u]; // u_z
  }

  // Compute u^T K u using upper triangle storage
  // K is symmetric, so K[i][j] = K[j][i]
  var idx = 0u;
  for (var i = 0u; i < 24u; i++) {
    for (var j = i; j < 24u; j++) {
      let K_ij = element_stiffness[idx];
      if (i == j) {
        energy += u_e[i] * K_ij * u_e[j];
      } else {
        // Off-diagonal: add contribution from both K[i][j] and K[j][i]
        energy += 2.0 * u_e[i] * K_ij * u_e[j];
      }
      idx++;
    }
  }

  return energy;
}

/**
 * Computes design sensitivity ∂C/∂ρ for SIMP
 *
 * ∂C/∂ρ_e = -p * ρ_e^(p-1) * u_e^T * K_0 * u_e
 *
 * where K_0 is the element stiffness for solid material (ρ=1)
 */
@compute @workgroup_size(64, 1, 1)
fn compute_sensitivity(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let element_idx = global_id.x;
  let total_elements = GRID_RES_X * GRID_RES_Y * GRID_RES_Z;

  if (element_idx >= total_elements) {
    return;
  }

  let rho = densities[element_idx];
  let rho_clamped = max(rho, params.density_min);

  // Get base element stiffness K_0 (for ρ=1)
  // In practice, this would be precomputed and stored
  // For regular grid, K_0 is identical for all elements
  var K_0: array<f32, 300>; // Placeholder
  // TODO: Load K_0 from uniform buffer or compute on-the-fly

  // Compute strain energy with base stiffness
  let strain_energy = compute_element_strain_energy(element_idx, K_0, displacements);

  // SIMP sensitivity: ∂C/∂ρ = -p * ρ^(p-1) * (u^T K_0 u)
  let p = params.simp_penalty;
  let sensitivity = -p * pow(rho_clamped, p - 1.0) * strain_energy;

  sensitivities[element_idx] = sensitivity;
}

/**
 * Updates densities using Optimality Criteria (OC) method
 *
 * Update formula (heuristic damping):
 * ρ_new = max(ρ_min, max(ρ - m, min(1, min(ρ + m, ρ * B_e^η))))
 *
 * where:
 * - B_e = sqrt(-∂C/∂ρ_e / λ) (optimality condition)
 * - λ is Lagrange multiplier (found via bisection)
 * - m is move limit
 * - η is damping exponent (typically 0.5)
 */
@compute @workgroup_size(64, 1, 1)
fn update_density_oc(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let element_idx = global_id.x;
  let total_elements = GRID_RES_X * GRID_RES_Y * GRID_RES_Z;

  if (element_idx >= total_elements) {
    return;
  }

  let rho_old = densities[element_idx];
  let sensitivity = sensitivities[element_idx]; // Already filtered
  let lambda = params.lagrange_multiplier;
  let m = params.move_limit;

  // Optimality condition: B_e = sqrt(-∂C/∂ρ / λ)
  let B_e = sqrt(max(-sensitivity / lambda, 0.0));

  // Damped update with η = 0.5
  let rho_oc = rho_old * sqrt(B_e);

  // Apply move limits and bounds
  let rho_lower = max(params.density_min, rho_old - m);
  let rho_upper = min(1.0, rho_old + m);
  let rho_new = max(rho_lower, min(rho_upper, rho_oc));

  densities[element_idx] = rho_new;
}

/**
 * Computes total volume for bisection search of Lagrange multiplier
 */
@compute @workgroup_size(256, 1, 1)
fn compute_volume(
  @builtin(global_invocation_id) global_id: vec3u,
  @builtin(local_invocation_index) local_idx: u32
) {
  let element_idx = global_id.x;
  let total_elements = GRID_RES_X * GRID_RES_Y * GRID_RES_Z;

  var<workgroup> shared_volume: array<f32, 256>;

  if (element_idx < total_elements) {
    shared_volume[local_idx] = densities[element_idx];
  } else {
    shared_volume[local_idx] = 0.0;
  }

  workgroupBarrier();

  // Parallel reduction
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (local_idx < s) {
      shared_volume[local_idx] += shared_volume[local_idx + s];
    }
    workgroupBarrier();
  }

  // TODO: Thread 0 writes result to global buffer
}

/**
 * Applies density bounds (post-processing)
 */
@compute @workgroup_size(64, 1, 1)
fn apply_density_bounds(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let element_idx = global_id.x;
  let total_elements = GRID_RES_X * GRID_RES_Y * GRID_RES_Z;

  if (element_idx >= total_elements) {
    return;
  }

  let rho = densities[element_idx];
  densities[element_idx] = clamp(rho, params.density_min, 1.0);
}

/**
 * Projects densities to 0/1 (final post-processing for manufacturing)
 * Uses Heaviside projection with threshold β
 */
@compute @workgroup_size(64, 1, 1)
fn heaviside_projection(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let element_idx = global_id.x;
  let total_elements = GRID_RES_X * GRID_RES_Y * GRID_RES_Z;

  if (element_idx >= total_elements) {
    return;
  }

  let rho = densities[element_idx];
  let beta = 8.0; // Projection sharpness
  let threshold = 0.5;

  // Smooth Heaviside: H(ρ) = tanh(βη) + tanh(β(ρ-η)) / (tanh(βη) + tanh(β(1-η)))
  let eta = threshold;
  let num = tanh(beta * eta) + tanh(beta * (rho - eta));
  let den = tanh(beta * eta) + tanh(beta * (1.0 - eta));
  let projected = num / den;

  densities[element_idx] = projected;
}
