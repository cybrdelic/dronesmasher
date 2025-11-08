/**
 * Hexahedral (8-node brick) finite element for structural analysis
 *
 * Node numbering (right-hand rule, z-up):
 *      7------6
 *     /|     /|
 *    4------5 |
 *    | |    | |
 *    | 3----|-2
 *    |/     |/
 *    0------1
 *
 * Natural coordinates (ξ, η, ζ) ∈ [-1, 1]³
 * Shape functions: Nᵢ = (1 + ξᵢξ)(1 + ηᵢη)(1 + ζᵢζ) / 8
 */

import { Vec3 } from '../../math/Vec3';
import { Mat3 } from '../../math/Mat3';
import { SimulationConstants } from '../../constants/SimulationConstants';

export interface HexElementNodes {
  /** 8 node positions in world space */
  positions: [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
}

export interface MaterialProps {
  /** Young's modulus (Pa) */
  E: number;
  /** Poisson's ratio (dimensionless) */
  nu: number;
}

/**
 * Computes the 24×24 element stiffness matrix for a hexahedral element
 * using 2×2×2 Gauss quadrature integration.
 *
 * K_e = ∫∫∫ Bᵀ D B |J| dξdηdζ
 *
 * where:
 * - B is the 6×24 strain-displacement matrix
 * - D is the 6×6 elasticity matrix
 * - J is the Jacobian of the isoparametric mapping
 */
export class HexElement {
  private static readonly GAUSS_POINTS = 1.0 / Math.sqrt(3); // ±1/√3
  private static readonly GAUSS_WEIGHTS = 1.0; // All weights = 1 for 2×2×2

  /** Natural coordinates of the 8 nodes */
  private static readonly NODE_COORDS: [number, number, number][] = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],  // Bottom face
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],      // Top face
  ];

  /**
   * Evaluates shape function for node i at natural coordinates (ξ, η, ζ)
   */
  private static shapeFunction(i: number, xi: number, eta: number, zeta: number): number {
    const [xi_i, eta_i, zeta_i] = this.NODE_COORDS[i];
    return 0.125 * (1 + xi_i * xi) * (1 + eta_i * eta) * (1 + zeta_i * zeta);
  }

  /**
   * Evaluates shape function derivatives ∂N/∂ξ, ∂N/∂η, ∂N/∂ζ
   */
  private static shapeFunctionDerivatives(
    i: number,
    xi: number,
    eta: number,
    zeta: number
  ): [number, number, number] {
    const [xi_i, eta_i, zeta_i] = this.NODE_COORDS[i];

    const dN_dxi = 0.125 * xi_i * (1 + eta_i * eta) * (1 + zeta_i * zeta);
    const dN_deta = 0.125 * eta_i * (1 + xi_i * xi) * (1 + zeta_i * zeta);
    const dN_dzeta = 0.125 * zeta_i * (1 + xi_i * xi) * (1 + eta_i * eta);

    return [dN_dxi, dN_deta, dN_dzeta];
  }

  /**
   * Computes the Jacobian matrix J = ∂(x,y,z)/∂(ξ,η,ζ)
   *
   * J[i][j] = ∂xᵢ/∂ξⱼ = Σ (∂Nₖ/∂ξⱼ) * xₖ,ᵢ
   */
  private static computeJacobian(
    nodes: HexElementNodes,
    xi: number,
    eta: number,
    zeta: number
  ): { J: number[][], detJ: number, invJ: number[][] } {
    const J = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];

    // J[i][j] = Σₖ (∂Nₖ/∂ξⱼ) * xₖ,ᵢ
    for (let k = 0; k < 8; k++) {
      const [dN_dxi, dN_deta, dN_dzeta] = this.shapeFunctionDerivatives(k, xi, eta, zeta);
      const pos = nodes.positions[k];

      J[0][0] += dN_dxi * pos.x;
      J[0][1] += dN_deta * pos.x;
      J[0][2] += dN_dzeta * pos.x;

      J[1][0] += dN_dxi * pos.y;
      J[1][1] += dN_deta * pos.y;
      J[1][2] += dN_dzeta * pos.y;

      J[2][0] += dN_dxi * pos.z;
      J[2][1] += dN_deta * pos.z;
      J[2][2] += dN_dzeta * pos.z;
    }

    // Compute determinant
    const detJ =
      J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) -
      J[0][1] * (J[1][0] * J[2][2] - J[1][2] * J[2][0]) +
      J[0][2] * (J[1][0] * J[2][1] - J[1][1] * J[2][0]);

    if (Math.abs(detJ) < 1e-12) {
      throw new Error('Degenerate element: Jacobian determinant near zero');
    }

    // Compute inverse Jacobian (needed for ∂N/∂x derivatives)
    const invDet = 1.0 / detJ;
    const invJ = [
      [
        invDet * (J[1][1] * J[2][2] - J[1][2] * J[2][1]),
        invDet * (J[0][2] * J[2][1] - J[0][1] * J[2][2]),
        invDet * (J[0][1] * J[1][2] - J[0][2] * J[1][1]),
      ],
      [
        invDet * (J[1][2] * J[2][0] - J[1][0] * J[2][2]),
        invDet * (J[0][0] * J[2][2] - J[0][2] * J[2][0]),
        invDet * (J[0][2] * J[1][0] - J[0][0] * J[1][2]),
      ],
      [
        invDet * (J[1][0] * J[2][1] - J[1][1] * J[2][0]),
        invDet * (J[0][1] * J[2][0] - J[0][0] * J[2][1]),
        invDet * (J[0][0] * J[1][1] - J[0][1] * J[1][0]),
      ],
    ];

    return { J, detJ, invJ };
  }

  /**
   * Computes strain-displacement matrix B (6×24)
   *
   * Relates nodal displacements to strain:
   * ε = B * u
   *
   * where ε = [εₓₓ, εᵧᵧ, εᵧᵧ, γₓᵧ, γᵧᵧ, γᵧₓ]ᵀ (Voigt notation)
   */
  private static computeStrainDisplacementMatrix(
    nodes: HexElementNodes,
    xi: number,
    eta: number,
    zeta: number
  ): number[][] {
    const { invJ } = this.computeJacobian(nodes, xi, eta, zeta);

    // B matrix is 6 rows × 24 columns (3 DOF per node × 8 nodes)
    const B: number[][] = Array(6)
      .fill(0)
      .map(() => Array(24).fill(0));

    for (let i = 0; i < 8; i++) {
      const [dN_dxi, dN_deta, dN_dzeta] = this.shapeFunctionDerivatives(i, xi, eta, zeta);

      // Transform derivatives to physical coordinates
      // ∂N/∂x = J⁻¹ * ∂N/∂ξ
      const dN_dx = invJ[0][0] * dN_dxi + invJ[0][1] * dN_deta + invJ[0][2] * dN_dzeta;
      const dN_dy = invJ[1][0] * dN_dxi + invJ[1][1] * dN_deta + invJ[1][2] * dN_dzeta;
      const dN_dz = invJ[2][0] * dN_dxi + invJ[2][1] * dN_deta + invJ[2][2] * dN_dzeta;

      const col = i * 3; // Column offset for this node

      // Normal strains
      B[0][col + 0] = dN_dx; // εₓₓ from uₓ
      B[1][col + 1] = dN_dy; // εᵧᵧ from uᵧ
      B[2][col + 2] = dN_dz; // εᵧᵧ from uᵧ

      // Shear strains (engineering notation: γ = 2ε)
      B[3][col + 0] = dN_dy; // γₓᵧ from uₓ
      B[3][col + 1] = dN_dx; // γₓᵧ from uᵧ

      B[4][col + 1] = dN_dz; // γᵧᵧ from uᵧ
      B[4][col + 2] = dN_dy; // γᵧᵧ from uᵧ

      B[5][col + 2] = dN_dx; // γᵧₓ from uᵧ
      B[5][col + 0] = dN_dz; // γᵧₓ from uₓ
    }

    return B;
  }

  /**
   * Computes elasticity matrix D (6×6) for isotropic linear elastic material
   *
   * Relates stress to strain: σ = D * ε
   */
  private static computeElasticityMatrix(material: MaterialProps): number[][] {
    const { E, nu } = material;
    const factor = E / ((1 + nu) * (1 - 2 * nu));

    const D = Array(6)
      .fill(0)
      .map(() => Array(6).fill(0));

    // Diagonal terms (normal stresses)
    const diag = factor * (1 - nu);
    D[0][0] = diag;
    D[1][1] = diag;
    D[2][2] = diag;

    // Off-diagonal coupling (Poisson effect)
    const offDiag = factor * nu;
    D[0][1] = offDiag;
    D[0][2] = offDiag;
    D[1][0] = offDiag;
    D[1][2] = offDiag;
    D[2][0] = offDiag;
    D[2][1] = offDiag;

    // Shear terms
    const shear = factor * (1 - 2 * nu) / 2;
    D[3][3] = shear;
    D[4][4] = shear;
    D[5][5] = shear;

    return D;
  }

  /**
   * Matrix multiplication: C = A * B
   */
  private static matmul(A: number[][], B: number[][]): number[][] {
    const rowsA = A.length;
    const colsA = A[0].length;
    const colsB = B[0].length;

    const C = Array(rowsA)
      .fill(0)
      .map(() => Array(colsB).fill(0));

    for (let i = 0; i < rowsA; i++) {
      for (let j = 0; j < colsB; j++) {
        for (let k = 0; k < colsA; k++) {
          C[i][j] += A[i][k] * B[k][j];
        }
      }
    }

    return C;
  }

  /**
   * Matrix transpose
   */
  private static transpose(A: number[][]): number[][] {
    const rows = A.length;
    const cols = A[0].length;

    const AT = Array(cols)
      .fill(0)
      .map(() => Array(rows).fill(0));

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        AT[j][i] = A[i][j];
      }
    }

    return AT;
  }

  /**
   * Computes element stiffness matrix using numerical integration
   *
   * K_e = ∫∫∫ Bᵀ D B |J| dξdηdζ
   *
   * Uses 2×2×2 Gauss quadrature (8 integration points)
   */
  public static computeStiffnessMatrix(
    nodes: HexElementNodes,
    material: MaterialProps
  ): number[][] {
    const K = Array(24)
      .fill(0)
      .map(() => Array(24).fill(0));

    const D = this.computeElasticityMatrix(material);
    const gp = this.GAUSS_POINTS;
    const gw = this.GAUSS_WEIGHTS;

    // 2×2×2 Gauss quadrature points
    const quadPoints = [
      [-gp, -gp, -gp],
      [gp, -gp, -gp],
      [gp, gp, -gp],
      [-gp, gp, -gp],
      [-gp, -gp, gp],
      [gp, -gp, gp],
      [gp, gp, gp],
      [-gp, gp, gp],
    ];

    for (const [xi, eta, zeta] of quadPoints) {
      const B = this.computeStrainDisplacementMatrix(nodes, xi, eta, zeta);
      const { detJ } = this.computeJacobian(nodes, xi, eta, zeta);

      // K_e += Bᵀ D B |J| w (weight is 1.0 for all points)
      const BT = this.transpose(B);
      const DB = this.matmul(D, B);
      const BTDB = this.matmul(BT, DB);

      const weight = gw * gw * gw * detJ; // w³ × |J|

      for (let i = 0; i < 24; i++) {
        for (let j = 0; j < 24; j++) {
          K[i][j] += BTDB[i][j] * weight;
        }
      }
    }

    return K;
  }

  /**
   * Computes element volume using numerical integration
   */
  public static computeVolume(nodes: HexElementNodes): number {
    let volume = 0;
    const gp = this.GAUSS_POINTS;
    const gw = this.GAUSS_WEIGHTS;

    const quadPoints = [
      [-gp, -gp, -gp],
      [gp, -gp, -gp],
      [gp, gp, -gp],
      [-gp, gp, -gp],
      [-gp, -gp, gp],
      [gp, -gp, gp],
      [gp, gp, gp],
      [-gp, gp, gp],
    ];

    for (const [xi, eta, zeta] of quadPoints) {
      const { detJ } = this.computeJacobian(nodes, xi, eta, zeta);
      volume += detJ * gw * gw * gw;
    }

    return volume;
  }

  /**
   * Computes stress tensor at element center given nodal displacements
   *
   * σ = D * B * u
   *
   * Returns stress in Voigt notation: [σₓₓ, σᵧᵧ, σᵧᵧ, τₓᵧ, τᵧᵧ, τᵧₓ]
   */
  public static computeStress(
    nodes: HexElementNodes,
    material: MaterialProps,
    displacements: number[] // 24 values (3 per node)
  ): number[] {
    const B = this.computeStrainDisplacementMatrix(nodes, 0, 0, 0); // Evaluate at center
    const D = this.computeElasticityMatrix(material);

    // ε = B * u
    const strain = Array(6).fill(0);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 24; j++) {
        strain[i] += B[i][j] * displacements[j];
      }
    }

    // σ = D * ε
    const stress = Array(6).fill(0);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        stress[i] += D[i][j] * strain[j];
      }
    }

    return stress;
  }

  /**
   * Computes von Mises stress from stress tensor (Voigt notation)
   */
  public static computeVonMisesStress(stress: number[]): number {
    const [sxx, syy, szz, txy, tyz, tzx] = stress;

    // von Mises = √(½((σₓₓ-σᵧᵧ)² + (σᵧᵧ-σᵧᵧ)² + (σᵧᵧ-σₓₓ)² + 6(τₓᵧ² + τᵧᵧ² + τᵧₓ²)))
    const diff1 = sxx - syy;
    const diff2 = syy - szz;
    const diff3 = szz - sxx;

    const vonMises = Math.sqrt(
      0.5 * (diff1 * diff1 + diff2 * diff2 + diff3 * diff3) +
        3 * (txy * txy + tyz * tyz + tzx * tzx)
    );

    return vonMises;
  }
}
