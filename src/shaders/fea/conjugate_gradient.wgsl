/**
 * GPU-accelerated Conjugate Gradient solver for sparse linear systems
 *
 * Solves: K * u = f
 * where:
 * - K is the global stiffness matrix (sparse, symmetric positive definite)
 * - u is the displacement vector (unknown)
 * - f is the force vector (known loads)
 *
 * Algorithm:
 * 1. r₀ = f - K*u₀ (initial residual)
 * 2. p₀ = r₀ (initial search direction)
 * 3. For k = 0, 1, 2, ...:
 *    α = (rₖᵀrₖ) / (pₖᵀKpₖ)
 *    uₖ₊₁ = uₖ + α*pₖ
 *    rₖ₊₁ = rₖ - α*K*pₖ
 *    β = (rₖ₊₁ᵀrₖ₊₁) / (rₖᵀrₖ)
 *    pₖ₊₁ = rₖ₊₁ + β*pₖ
 * 4. Converge when ||rₖ|| < tolerance
 */

#include "../common/constants.wgsl"

// Stiffness matrix in CSR (Compressed Sparse Row) format
@group(0) @binding(0) var<storage, read> K_values: array<f32>;
@group(0) @binding(1) var<storage, read> K_col_indices: array<u32>;
@group(0) @binding(2) var<storage, read> K_row_ptrs: array<u32>;

// Vectors
@group(1) @binding(0) var<storage, read_write> u: array<f32>; // Displacement (solution)
@group(1) @binding(1) var<storage, read> f: array<f32>;       // Force (RHS)
@group(1) @binding(2) var<storage, read_write> r: array<f32>; // Residual
@group(1) @binding(3) var<storage, read_write> p: array<f32>; // Search direction
@group(1) @binding(4) var<storage, read_write> Kp: array<f32>; // Matrix-vector product K*p

// Scalar reduction results
@group(2) @binding(0) var<storage, read_write> dot_r_r: atomic<u32>; // ||r||² as uint bits
@group(2) @binding(1) var<storage, read_write> dot_p_Kp: atomic<u32>; // pᵀKp as uint bits
@group(2) @binding(2) var<storage, read_write> converged: atomic<u32>; // 1 if converged

const TOLERANCE: f32 = 1e-6;
const MAX_ITERATIONS: u32 = 1000u;

/**
 * Sparse matrix-vector multiplication: y = K * x
 * K is in CSR format
 */
@compute @workgroup_size(256, 1, 1)
fn sparse_matvec(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let row = global_id.x;
  let n = arrayLength(&u);

  if (row >= n) {
    return;
  }

  let row_start = K_row_ptrs[row];
  let row_end = K_row_ptrs[row + 1u];

  var sum = 0.0;
  for (var idx = row_start; idx < row_end; idx++) {
    let col = K_col_indices[idx];
    let value = K_values[idx];
    sum += value * p[col];
  }

  Kp[row] = sum;
}

/**
 * Vector dot product: result = xᵀy
 * Uses parallel reduction in shared memory
 */
var<workgroup> shared_data: array<f32, 256>;

@compute @workgroup_size(256, 1, 1)
fn dot_product(
  @builtin(global_invocation_id) global_id: vec3u,
  @builtin(local_invocation_id) local_id: vec3u,
  @builtin(local_invocation_index) local_idx: u32,
  @builtin(num_workgroups) num_workgroups: vec3u
) {
  let tid = global_id.x;
  let n = arrayLength(&u);

  // Load data into shared memory
  if (tid < n) {
    shared_data[local_idx] = r[tid] * r[tid]; // Computing r·r
  } else {
    shared_data[local_idx] = 0.0;
  }

  workgroupBarrier();

  // Parallel reduction in shared memory
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (local_idx < s) {
      shared_data[local_idx] += shared_data[local_idx + s];
    }
    workgroupBarrier();
  }

  // Thread 0 writes result
  if (local_idx == 0u) {
    // Atomic add (converting f32 to u32 for atomic operations)
    let result_bits = bitcast<u32>(shared_data[0]);
    atomicAdd(&dot_r_r, result_bits);
  }
}

/**
 * Dot product for p·Kp
 */
@compute @workgroup_size(256, 1, 1)
fn dot_product_p_Kp(
  @builtin(global_invocation_id) global_id: vec3u,
  @builtin(local_invocation_id) local_id: vec3u,
  @builtin(local_invocation_index) local_idx: u32
) {
  let tid = global_id.x;
  let n = arrayLength(&u);

  // Load data into shared memory
  if (tid < n) {
    shared_data[local_idx] = p[tid] * Kp[tid];
  } else {
    shared_data[local_idx] = 0.0;
  }

  workgroupBarrier();

  // Parallel reduction
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (local_idx < s) {
      shared_data[local_idx] += shared_data[local_idx + s];
    }
    workgroupBarrier();
  }

  if (local_idx == 0u) {
    let result_bits = bitcast<u32>(shared_data[0]);
    atomicAdd(&dot_p_Kp, result_bits);
  }
}

/**
 * Update solution: u = u + α*p
 */
@compute @workgroup_size(256, 1, 1)
fn update_solution(
  @builtin(global_invocation_id) global_id: vec3u,
  @builtin(num_workgroups) num_workgroups: vec3u
) {
  let tid = global_id.x;
  let n = arrayLength(&u);

  if (tid >= n) {
    return;
  }

  // Read alpha from global memory (stored in dot_r_r temporarily)
  let alpha_bits = atomicLoad(&dot_r_r);
  let alpha = bitcast<f32>(alpha_bits);

  u[tid] += alpha * p[tid];
}

/**
 * Update residual: r = r - α*K*p
 */
@compute @workgroup_size(256, 1, 1)
fn update_residual(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let tid = global_id.x;
  let n = arrayLength(&u);

  if (tid >= n) {
    return;
  }

  let alpha_bits = atomicLoad(&dot_r_r);
  let alpha = bitcast<f32>(alpha_bits);

  r[tid] -= alpha * Kp[tid];
}

/**
 * Update search direction: p = r + β*p
 */
@compute @workgroup_size(256, 1, 1)
fn update_search_direction(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let tid = global_id.x;
  let n = arrayLength(&u);

  if (tid >= n) {
    return;
  }

  let beta_bits = atomicLoad(&dot_p_Kp);
  let beta = bitcast<f32>(beta_bits);

  p[tid] = r[tid] + beta * p[tid];
}

/**
 * Initialize CG solver: r = f - K*u₀, p = r
 */
@compute @workgroup_size(256, 1, 1)
fn initialize_cg(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let tid = global_id.x;
  let n = arrayLength(&u);

  if (tid >= n) {
    return;
  }

  // Compute r = f - K*u (Kp already contains K*u from initial matvec)
  r[tid] = f[tid] - Kp[tid];
  p[tid] = r[tid];

  // Initialize convergence flag
  if (tid == 0u) {
    atomicStore(&converged, 0u);
  }
}

/**
 * Check convergence: ||r|| < tolerance
 */
@compute @workgroup_size(1, 1, 1)
fn check_convergence() {
  let r_norm_sq_bits = atomicLoad(&dot_r_r);
  let r_norm_sq = bitcast<f32>(r_norm_sq_bits);
  let r_norm = sqrt(r_norm_sq);

  if (r_norm < TOLERANCE) {
    atomicStore(&converged, 1u);
  }
}

/**
 * Apply boundary conditions (Dirichlet: fixed displacement)
 * Sets specified DOFs to fixed values and zeros corresponding rows/cols in K
 */
@compute @workgroup_size(256, 1, 1)
fn apply_boundary_conditions(
  @builtin(global_invocation_id) global_id: vec3u,
  @builtin(num_workgroups) num_workgroups: vec3u
) {
  // TODO: Implement boundary condition application
  // - Zero rows and columns for fixed DOFs
  // - Set diagonal to 1.0 for conditioning
  // - Set RHS to prescribed displacement values
}

/**
 * Computes residual norm for monitoring convergence
 */
@compute @workgroup_size(256, 1, 1)
fn compute_residual_norm(
  @builtin(global_invocation_id) global_id: vec3u,
  @builtin(local_invocation_index) local_idx: u32
) {
  let tid = global_id.x;
  let n = arrayLength(&u);

  // Compute ||f - K*u||
  if (tid < n) {
    let residual = f[tid] - Kp[tid];
    shared_data[local_idx] = residual * residual;
  } else {
    shared_data[local_idx] = 0.0;
  }

  workgroupBarrier();

  // Parallel reduction
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (local_idx < s) {
      shared_data[local_idx] += shared_data[local_idx + s];
    }
    workgroupBarrier();
  }

  if (local_idx == 0u) {
    let result_bits = bitcast<u32>(sqrt(shared_data[0]));
    atomicStore(&dot_r_r, result_bits);
  }
}
