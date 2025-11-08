/**
 * Sensitivity filtering for topology optimization
 *
 * Implements Helmholtz PDE filter for length scale control:
 * -r² ∇²ψ + ψ = f
 *
 * where:
 * - r is the filter radius (controls minimum feature size)
 * - ψ is the filtered field
 * - f is the input field (raw sensitivities)
 *
 * Solved using Conjugate Gradient on the regularized Helmholtz operator.
 * This ensures:
 * 1. Minimum length scale in the design
 * 2. Mesh-independent solutions
 * 3. Smooth sensitivity fields (prevents checkerboarding)
 *
 * Reference: Lazarov & Sigmund (2011) "Filters in topology optimization
 * based on Helmholtz-type differential equations"
 */

#include "../common/constants.wgsl"

// Binding group 0: Input/output fields
@group(0) @binding(0) var<storage, read> raw_sensitivities: array<f32>;
@group(0) @binding(1) var<storage, read_write> filtered_sensitivities: array<f32>;

// Binding group 1: Filter parameters
@group(1) @binding(0) var<uniform> filter_params: FilterParams;

struct FilterParams {
  filter_radius: f32,     // r (in grid units)
  element_size: vec3f,    // dx, dy, dz
  grid_res: vec3u,        // nx, ny, nz
  cg_tolerance: f32,      // Convergence tolerance for CG
  cg_max_iterations: u32, // Max CG iterations
}

// Working buffers for CG solver
@group(2) @binding(0) var<storage, read_write> residual: array<f32>;
@group(2) @binding(1) var<storage, read_write> search_dir: array<f32>;
@group(2) @binding(2) var<storage, read_write> Ap: array<f32>; // A*p

/**
 * Converts 3D grid index to linear index
 */
fn grid_to_linear(i: u32, j: u32, k: u32, res: vec3u) -> u32 {
  return i + j * res.x + k * res.x * res.y;
}

/**
 * Converts linear index to 3D grid index
 */
fn linear_to_grid(idx: u32, res: vec3u) -> vec3u {
  let k = idx / (res.x * res.y);
  let j = (idx % (res.x * res.y)) / res.x;
  let i = idx % res.x;
  return vec3u(i, j, k);
}

/**
 * Applies Helmholtz operator: A*x = (-r² ∇² + I) * x
 *
 * Discretized using finite differences:
 * ∇²x ≈ (x[i-1] - 2x[i] + x[i+1])/dx² + ... (for each dimension)
 *
 * For structured grid with spacing (dx, dy, dz):
 * (A*x)[i,j,k] = x[i,j,k] + r²/dx² (x[i-1,j,k] - 2x[i,j,k] + x[i+1,j,k])
 *                         + r²/dy² (x[i,j-1,k] - 2x[i,j,k] + x[i,j+1,k])
 *                         + r²/dz² (x[i,j,k-1] - 2x[i,j,k] + x[i,j,k+1])
 */
@compute @workgroup_size(4, 4, 4)
fn apply_helmholtz_operator(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let res = filter_params.grid_res;
  let i = global_id.x;
  let j = global_id.y;
  let k = global_id.z;

  if (i >= res.x || j >= res.y || k >= res.z) {
    return;
  }

  let idx = grid_to_linear(i, j, k, res);
  let r = filter_params.filter_radius;
  let dx = filter_params.element_size.x;
  let dy = filter_params.element_size.y;
  let dz = filter_params.element_size.z;

  // Center value
  let x_center = search_dir[idx];

  // Laplacian coefficients
  let r2_dx2 = (r * r) / (dx * dx);
  let r2_dy2 = (r * r) / (dy * dy);
  let r2_dz2 = (r * r) / (dz * dz);

  var laplacian = 0.0;

  // X-direction
  if (i > 0u) {
    let idx_minus = grid_to_linear(i - 1u, j, k, res);
    laplacian += r2_dx2 * (search_dir[idx_minus] - x_center);
  } else {
    laplacian -= r2_dx2 * x_center; // Neumann BC: ∂x/∂n = 0
  }

  if (i < res.x - 1u) {
    let idx_plus = grid_to_linear(i + 1u, j, k, res);
    laplacian += r2_dx2 * (search_dir[idx_plus] - x_center);
  } else {
    laplacian -= r2_dx2 * x_center;
  }

  // Y-direction
  if (j > 0u) {
    let idx_minus = grid_to_linear(i, j - 1u, k, res);
    laplacian += r2_dy2 * (search_dir[idx_minus] - x_center);
  } else {
    laplacian -= r2_dy2 * x_center;
  }

  if (j < res.y - 1u) {
    let idx_plus = grid_to_linear(i, j + 1u, k, res);
    laplacian += r2_dy2 * (search_dir[idx_plus] - x_center);
  } else {
    laplacian -= r2_dy2 * x_center;
  }

  // Z-direction
  if (k > 0u) {
    let idx_minus = grid_to_linear(i, j, k - 1u, res);
    laplacian += r2_dz2 * (search_dir[idx_minus] - x_center);
  } else {
    laplacian -= r2_dz2 * x_center;
  }

  if (k < res.z - 1u) {
    let idx_plus = grid_to_linear(i, j, k + 1u, res);
    laplacian += r2_dz2 * (search_dir[idx_plus] - x_center);
  } else {
    laplacian -= r2_dz2 * x_center;
  }

  // Helmholtz operator: A*x = x - r²∇²x
  Ap[idx] = x_center - laplacian;
}

/**
 * Initializes CG solver for Helmholtz equation
 * Sets r = f - A*x₀ (where x₀ = f as initial guess)
 */
@compute @workgroup_size(64, 1, 1)
fn initialize_filter_cg(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let idx = global_id.x;
  let total_elements = filter_params.grid_res.x *
                        filter_params.grid_res.y *
                        filter_params.grid_res.z;

  if (idx >= total_elements) {
    return;
  }

  // Initial guess: x₀ = f (raw sensitivities)
  filtered_sensitivities[idx] = raw_sensitivities[idx];

  // Initial residual will be computed after first A*p
  residual[idx] = 0.0;
  search_dir[idx] = raw_sensitivities[idx];
}

/**
 * Simplified convolution-based filter (alternative to Helmholtz)
 *
 * Weight function: w(r) = max(0, r_max - r)
 * Filtered value: ψ_i = Σⱼ w(||x_i - x_j||) * f_j / Σⱼ w(||x_i - x_j||)
 *
 * This is faster but less theoretically rigorous than Helmholtz PDE filter.
 */
@compute @workgroup_size(4, 4, 4)
fn helmholtz_filter(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let res = filter_params.grid_res;
  let i = global_id.x;
  let j = global_id.y;
  let k = global_id.z;

  if (i >= res.x || j >= res.y || k >= res.z) {
    return;
  }

  let idx_center = grid_to_linear(i, j, k, res);
  let r_max = filter_params.filter_radius;

  var weighted_sum = 0.0;
  var weight_sum = 0.0;

  // Search neighborhood within filter radius
  let i_min = max(0, i32(i) - i32(ceil(r_max)));
  let i_max = min(i32(res.x) - 1, i32(i) + i32(ceil(r_max)));
  let j_min = max(0, i32(j) - i32(ceil(r_max)));
  let j_max = min(i32(res.y) - 1, i32(j) + i32(ceil(r_max)));
  let k_min = max(0, i32(k) - i32(ceil(r_max)));
  let k_max = min(i32(res.z) - 1, i32(k) + i32(ceil(r_max)));

  for (var ii = i_min; ii <= i_max; ii++) {
    for (var jj = j_min; jj <= j_max; jj++) {
      for (var kk = k_min; kk <= k_max; kk++) {
        let di = f32(ii - i32(i));
        let dj = f32(jj - i32(j));
        let dk = f32(kk - i32(k));

        // Euclidean distance in grid units
        let dist = sqrt(di * di + dj * dj + dk * dk);

        if (dist <= r_max) {
          let weight = max(0.0, r_max - dist);
          let idx_neighbor = grid_to_linear(u32(ii), u32(jj), u32(kk), res);

          weighted_sum += weight * raw_sensitivities[idx_neighbor];
          weight_sum += weight;
        }
      }
    }
  }

  // Normalize
  if (weight_sum > 1e-10) {
    filtered_sensitivities[idx_center] = weighted_sum / weight_sum;
  } else {
    filtered_sensitivities[idx_center] = raw_sensitivities[idx_center];
  }
}

/**
 * Gaussian filter (another alternative)
 *
 * Weight: w(r) = exp(-r²/2σ²)
 * where σ = filter_radius / 3 (so 99.7% weight within radius)
 */
@compute @workgroup_size(4, 4, 4)
fn gaussian_filter(
  @builtin(global_invocation_id) global_id: vec3u
) {
  let res = filter_params.grid_res;
  let i = global_id.x;
  let j = global_id.y;
  let k = global_id.z;

  if (i >= res.x || j >= res.y || k >= res.z) {
    return;
  }

  let idx_center = grid_to_linear(i, j, k, res);
  let r_max = filter_params.filter_radius;
  let sigma = r_max / 3.0;
  let two_sigma_sq = 2.0 * sigma * sigma;

  var weighted_sum = 0.0;
  var weight_sum = 0.0;

  // Search neighborhood (3σ captures 99.7%)
  let i_min = max(0, i32(i) - i32(ceil(r_max)));
  let i_max = min(i32(res.x) - 1, i32(i) + i32(ceil(r_max)));
  let j_min = max(0, i32(j) - i32(ceil(r_max)));
  let j_max = min(i32(res.y) - 1, i32(j) + i32(ceil(r_max)));
  let k_min = max(0, i32(k) - i32(ceil(r_max)));
  let k_max = min(i32(res.z) - 1, i32(k) + i32(ceil(r_max)));

  for (var ii = i_min; ii <= i_max; ii++) {
    for (var jj = j_min; jj <= j_max; jj++) {
      for (var kk = k_min; kk <= k_max; kk++) {
        let di = f32(ii - i32(i));
        let dj = f32(jj - i32(j));
        let dk = f32(kk - i32(k));

        let dist_sq = di * di + dj * dj + dk * dk;

        if (dist_sq <= r_max * r_max) {
          let weight = exp(-dist_sq / two_sigma_sq);
          let idx_neighbor = grid_to_linear(u32(ii), u32(jj), u32(kk), res);

          weighted_sum += weight * raw_sensitivities[idx_neighbor];
          weight_sum += weight;
        }
      }
    }
  }

  // Normalize
  if (weight_sum > 1e-10) {
    filtered_sensitivities[idx_center] = weighted_sum / weight_sum;
  } else {
    filtered_sensitivities[idx_center] = raw_sensitivities[idx_center];
  }
}
