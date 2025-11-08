/**
 * GPU-accelerated stiffness matrix assembly for hexahedral finite elements
 *
 * This shader computes element stiffness matrices in parallel across all voxels.
 * Each workgroup processes one element, using 8 threads for the 8 Gauss points.
 *
 * Memory layout:
 * - Element connectivity is implicit (structured grid)
 * - Global stiffness matrix stored in CSR (Compressed Sparse Row) format
 * - SIMP penalization applied: K_e *= ρ^p where p=3, ρ∈[0,1]
 */

#include "../common/constants.wgsl"
#include "../common/types.wgsl"

// Binding group 0: Global uniforms
@group(0) @binding(0) var<uniform> grid: GridInfo;
@group(0) @binding(1) var<uniform> material: MaterialProperties;

// Binding group 1: Simulation state
@group(1) @binding(0) var<storage, read> densities: array<f32>; // ρ for each voxel
@group(1) @binding(1) var<storage, read_write> stiffness_values: array<f32>; // CSR values
@group(1) @binding(2) var<storage, read_write> stiffness_col_indices: array<u32>; // CSR column indices

struct MaterialProperties {
  youngs_modulus: f32,  // E (Pa)
  poisson_ratio: f32,   // ν
  density_min: f32,     // Minimum density (prevents singularity)
  simp_penalty: f32,    // p in SIMP method
}

// Gauss quadrature for 2×2×2 integration
const GAUSS_PT: f32 = 0.57735026919; // 1/√3
const GAUSS_WEIGHT: f32 = 1.0;

// Natural coordinates of 8 nodes in standard hex element
const NODE_COORDS = array<vec3f, 8>(
  vec3f(-1.0, -1.0, -1.0), vec3f(1.0, -1.0, -1.0),
  vec3f(1.0, 1.0, -1.0), vec3f(-1.0, 1.0, -1.0),
  vec3f(-1.0, -1.0, 1.0), vec3f(1.0, -1.0, 1.0),
  vec3f(1.0, 1.0, 1.0), vec3f(-1.0, 1.0, 1.0),
);

// 8 Gauss quadrature points
const QUAD_POINTS = array<vec3f, 8>(
  vec3f(-GAUSS_PT, -GAUSS_PT, -GAUSS_PT), vec3f(GAUSS_PT, -GAUSS_PT, -GAUSS_PT),
  vec3f(GAUSS_PT, GAUSS_PT, -GAUSS_PT), vec3f(-GAUSS_PT, GAUSS_PT, -GAUSS_PT),
  vec3f(-GAUSS_PT, -GAUSS_PT, GAUSS_PT), vec3f(GAUSS_PT, -GAUSS_PT, GAUSS_PT),
  vec3f(GAUSS_PT, GAUSS_PT, GAUSS_PT), vec3f(-GAUSS_PT, GAUSS_PT, GAUSS_PT),
);

/**
 * Evaluates shape function N_i at natural coordinates (ξ, η, ζ)
 */
fn shape_function(i: u32, xi: f32, eta: f32, zeta: f32) -> f32 {
  let node_coord = NODE_COORDS[i];
  return 0.125 * (1.0 + node_coord.x * xi) *
                  (1.0 + node_coord.y * eta) *
                  (1.0 + node_coord.z * zeta);
}

/**
 * Evaluates shape function derivatives ∂N_i/∂ξ, ∂N_i/∂η, ∂N_i/∂ζ
 */
fn shape_function_derivatives(i: u32, xi: f32, eta: f32, zeta: f32) -> vec3f {
  let nc = NODE_COORDS[i];

  let dN_dxi = 0.125 * nc.x * (1.0 + nc.y * eta) * (1.0 + nc.z * zeta);
  let dN_deta = 0.125 * nc.y * (1.0 + nc.x * xi) * (1.0 + nc.z * zeta);
  let dN_dzeta = 0.125 * nc.z * (1.0 + nc.x * xi) * (1.0 + nc.y * eta);

  return vec3f(dN_dxi, dN_deta, dN_dzeta);
}

/**
 * Computes Jacobian matrix J = ∂(x,y,z)/∂(ξ,η,ζ) for structured grid
 *
 * For regular hexahedral grid, Jacobian is diagonal:
 * J = diag(dx/2, dy/2, dz/2)
 */
fn compute_jacobian(element_size: vec3f) -> mat3x3f {
  // For regular grid, Jacobian is simply half the element size
  let j11 = element_size.x * 0.5;
  let j22 = element_size.y * 0.5;
  let j33 = element_size.z * 0.5;

  return mat3x3f(
    j11, 0.0, 0.0,
    0.0, j22, 0.0,
    0.0, 0.0, j33
  );
}

/**
 * Computes inverse Jacobian for regular grid
 */
fn compute_inverse_jacobian(element_size: vec3f) -> mat3x3f {
  let inv_j11 = 2.0 / element_size.x;
  let inv_j22 = 2.0 / element_size.y;
  let inv_j33 = 2.0 / element_size.z;

  return mat3x3f(
    inv_j11, 0.0, 0.0,
    0.0, inv_j22, 0.0,
    0.0, 0.0, inv_j33
  );
}

/**
 * Computes determinant of Jacobian (element volume / 8)
 */
fn compute_jacobian_det(element_size: vec3f) -> f32 {
  return element_size.x * element_size.y * element_size.z / 8.0;
}

/**
 * Transforms shape function derivatives to physical coordinates
 * ∂N/∂x = J⁻¹ * ∂N/∂ξ
 */
fn transform_derivatives(dN_dnat: vec3f, inv_J: mat3x3f) -> vec3f {
  return inv_J * dN_dnat;
}

/**
 * Computes elasticity matrix D (6×6) for isotropic material
 * Stored in column-major order for efficiency
 */
fn compute_elasticity_matrix(E: f32, nu: f32) -> array<f32, 36> {
  var D: array<f32, 36>;

  let factor = E / ((1.0 + nu) * (1.0 - 2.0 * nu));
  let diag = factor * (1.0 - nu);
  let off_diag = factor * nu;
  let shear = factor * (1.0 - 2.0 * nu) * 0.5;

  // Initialize to zero
  for (var i = 0u; i < 36u; i++) {
    D[i] = 0.0;
  }

  // Diagonal terms (column-major indexing: D[row + col*6])
  D[0 + 0*6] = diag;  // D[0][0]
  D[1 + 1*6] = diag;  // D[1][1]
  D[2 + 2*6] = diag;  // D[2][2]
  D[3 + 3*6] = shear; // D[3][3]
  D[4 + 4*6] = shear; // D[4][4]
  D[5 + 5*6] = shear; // D[5][5]

  // Off-diagonal coupling
  D[0 + 1*6] = off_diag; D[1 + 0*6] = off_diag;
  D[0 + 2*6] = off_diag; D[2 + 0*6] = off_diag;
  D[1 + 2*6] = off_diag; D[2 + 1*6] = off_diag;

  return D;
}

/**
 * Computes one row of strain-displacement matrix B (6×24)
 * for a given node i and strain component
 */
fn compute_B_row(
  node_idx: u32,
  strain_comp: u32,
  dN_dx: f32,
  dN_dy: f32,
  dN_dz: f32
) -> vec3f {
  var B_row = vec3f(0.0);

  if (strain_comp == 0u) { // εₓₓ
    B_row.x = dN_dx;
  } else if (strain_comp == 1u) { // εᵧᵧ
    B_row.y = dN_dy;
  } else if (strain_comp == 2u) { // εᵧᵧ
    B_row.z = dN_dz;
  } else if (strain_comp == 3u) { // γₓᵧ
    B_row.x = dN_dy;
    B_row.y = dN_dx;
  } else if (strain_comp == 4u) { // γᵧᵧ
    B_row.y = dN_dz;
    B_row.z = dN_dy;
  } else if (strain_comp == 5u) { // γᵧₓ
    B_row.z = dN_dx;
    B_row.x = dN_dz;
  }

  return B_row;
}

/**
 * Computes element stiffness matrix contribution at one Gauss point
 * Returns upper triangle of 24×24 symmetric matrix (300 values)
 */
@compute @workgroup_size(8, 1, 1)
fn compute_element_stiffness(
  @builtin(global_invocation_id) global_id: vec3u,
  @builtin(local_invocation_index) local_idx: u32
) {
  // Map thread ID to grid voxel
  let grid_idx = global_id.x;
  let total_elements = grid.resolution.x * grid.resolution.y * grid.resolution.z;

  if (grid_idx >= total_elements) {
    return;
  }

  // Get voxel density and apply SIMP penalization
  let density = densities[grid_idx];
  let rho_min = material.density_min;
  let rho = max(density, rho_min); // Prevent singularity
  let penalty = pow(rho, material.simp_penalty); // ρ^p

  // Compute element size
  let element_size = vec3f(
    grid.bounds.x / f32(grid.resolution.x),
    grid.bounds.y / f32(grid.resolution.y),
    grid.bounds.z / f32(grid.resolution.z)
  );

  // Get elasticity matrix
  let D = compute_elasticity_matrix(
    material.youngs_modulus * penalty, // Apply SIMP penalization
    material.poisson_ratio
  );

  // Inverse Jacobian and determinant (constant for regular grid)
  let inv_J = compute_inverse_jacobian(element_size);
  let det_J = compute_jacobian_det(element_size);

  // Each thread processes one Gauss point (8 threads per element)
  let quad_pt = QUAD_POINTS[local_idx];
  let xi = quad_pt.x;
  let eta = quad_pt.y;
  let zeta = quad_pt.z;

  // Shared memory for accumulating K_e across Gauss points
  var workgroup_Ke: array<f32, 300>; // Upper triangle of 24×24 symmetric matrix

  // Initialize K_e for this Gauss point
  var local_Ke: array<f32, 300>;
  for (var i = 0u; i < 300u; i++) {
    local_Ke[i] = 0.0;
  }

  // Compute B matrix at this Gauss point
  var B_storage: array<vec3f, 48>; // 6 strain components × 8 nodes (storing vec3 DOFs)

  for (var node = 0u; node < 8u; node++) {
    let dN_dnat = shape_function_derivatives(node, xi, eta, zeta);
    let dN_dphys = transform_derivatives(dN_dnat, inv_J);

    // Store B matrix entries for this node
    for (var strain = 0u; strain < 6u; strain++) {
      let B_row = compute_B_row(node, strain, dN_dphys.x, dN_dphys.y, dN_dphys.z);
      B_storage[strain * 8u + node] = B_row;
    }
  }

  // Compute K_e = Bᵀ D B det(J) w at this Gauss point
  // Only compute upper triangle (K is symmetric)
  let weight = GAUSS_WEIGHT * GAUSS_WEIGHT * GAUSS_WEIGHT * det_J;

  var idx = 0u;
  for (var i = 0u; i < 24u; i++) { // Row in K_e
    let node_i = i / 3u;
    let dof_i = i % 3u;

    for (var j = i; j < 24u; j++) { // Column in K_e (upper triangle)
      let node_j = j / 3u;
      let dof_j = j % 3u;

      // K[i][j] = Σₖₗ B[k][i] D[k][l] B[l][j]
      var K_ij = 0.0;

      for (var k = 0u; k < 6u; k++) { // Strain component
        for (var l = 0u; l < 6u; l++) {
          let B_ki = B_storage[k * 8u + node_i][dof_i];
          let D_kl = D[k + l * 6u];
          let B_lj = B_storage[l * 8u + node_j][dof_j];

          K_ij += B_ki * D_kl * B_lj;
        }
      }

      local_Ke[idx] = K_ij * weight;
      idx++;
    }
  }

  // Accumulate across all Gauss points using workgroup memory
  // (In practice, use atomic operations or reduction)
  workgroupBarrier();

  // Thread 0 writes final result to global memory
  if (local_idx == 0u) {
    let base_idx = grid_idx * 300u;
    for (var i = 0u; i < 300u; i++) {
      stiffness_values[base_idx + i] = workgroup_Ke[i];
    }
  }
}

/**
 * Assembles global stiffness matrix from element contributions
 * This is a separate pass that scatters element matrices to global CSR format
 */
@compute @workgroup_size(64, 1, 1)
fn assemble_global_stiffness(
  @builtin(global_invocation_id) global_id: vec3u
) {
  // TODO: Implement global assembly with atomic operations
  // For each element DOF, scatter to corresponding global DOF
  // Handle boundary conditions (fixed nodes)
}
