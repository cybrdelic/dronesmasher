import { Vec3 } from './Vec3';

/**
 * Immutable 3x3 matrix
 * Used for stress tensors, rotation matrices, and 3D transformations
 */
export class Mat3 {
  // Stored in column-major order
  private readonly m: Float32Array;

  constructor(values?: Float32Array | number[]) {
    if (values) {
      this.m = new Float32Array(values);
      if (this.m.length !== 9) {
        throw new Error('Mat3 requires exactly 9 values');
      }
    } else {
      this.m = new Float32Array(9);
    }
  }

  // Factory methods
  static identity(): Mat3 {
    const m = new Float32Array(9);
    m[0] = 1; m[4] = 1; m[8] = 1;
    return new Mat3(m);
  }

  static zero(): Mat3 {
    return new Mat3();
  }

  static fromRows(
    row0: [number, number, number],
    row1: [number, number, number],
    row2: [number, number, number]
  ): Mat3 {
    // Convert row-major to column-major
    const m = new Float32Array([
      row0[0], row1[0], row2[0],
      row0[1], row1[1], row2[1],
      row0[2], row1[2], row2[2],
    ]);
    return new Mat3(m);
  }

  static fromColumns(col0: Vec3, col1: Vec3, col2: Vec3): Mat3 {
    const m = new Float32Array([
      col0.x, col0.y, col0.z,
      col1.x, col1.y, col1.z,
      col2.x, col2.y, col2.z
    ]);
    return new Mat3(m);
  }

  static diagonal(x: number, y: number, z: number): Mat3 {
    const m = new Float32Array(9);
    m[0] = x; m[4] = y; m[8] = z;
    return new Mat3(m);
  }

  // Matrix operations
  add(other: Mat3): Mat3 {
    const result = new Float32Array(9);
    for (let i = 0; i < 9; i++) {
      result[i] = (this.m[i] ?? 0) + (other.m[i] ?? 0);
    }
    return new Mat3(result);
  }

  sub(other: Mat3): Mat3 {
    const result = new Float32Array(9);
    for (let i = 0; i < 9; i++) {
      result[i] = (this.m[i] ?? 0) - (other.m[i] ?? 0);
    }
    return new Mat3(result);
  }

  mul(other: Mat3 | number): Mat3 {
    if (typeof other === 'number') {
      // Scalar multiplication
      const result = new Float32Array(9);
      for (let i = 0; i < 9; i++) {
        result[i] = (this.m[i] ?? 0) * other;
      }
      return new Mat3(result);
    }

    // Matrix multiplication
    const result = new Float32Array(9);
    const a = this.m;
    const b = other.m;

    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) {
          sum += (a[k * 3 + row] ?? 0) * (b[col * 3 + k] ?? 0);
        }
        result[col * 3 + row] = sum;
      }
    }

    return new Mat3(result);
  }

  mulVec(v: Vec3): Vec3 {
    const x = (this.m[0] ?? 0) * v.x + (this.m[3] ?? 0) * v.y + (this.m[6] ?? 0) * v.z;
    const y = (this.m[1] ?? 0) * v.x + (this.m[4] ?? 0) * v.y + (this.m[7] ?? 0) * v.z;
    const z = (this.m[2] ?? 0) * v.x + (this.m[5] ?? 0) * v.y + (this.m[8] ?? 0) * v.z;
    return new Vec3(x, y, z);
  }

  transpose(): Mat3 {
    const result = new Float32Array(9);
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        result[row * 3 + col] = this.m[col * 3 + row] ?? 0;
      }
    }
    return new Mat3(result);
  }

  trace(): number {
    return (this.m[0] ?? 0) + (this.m[4] ?? 0) + (this.m[8] ?? 0);
  }

  determinant(): number {
    const m = this.m;
    return (
      (m[0] ?? 0) * ((m[4] ?? 0) * (m[8] ?? 0) - (m[5] ?? 0) * (m[7] ?? 0)) -
      (m[3] ?? 0) * ((m[1] ?? 0) * (m[8] ?? 0) - (m[2] ?? 0) * (m[7] ?? 0)) +
      (m[6] ?? 0) * ((m[1] ?? 0) * (m[5] ?? 0) - (m[2] ?? 0) * (m[4] ?? 0))
    );
  }

  inverse(): Mat3 | null {
    const det = this.determinant();
    if (Math.abs(det) < 1e-10) {
      return null;
    }

    const m = this.m;
    const invDet = 1 / det;

    const result = new Float32Array([
      ((m[4] ?? 0) * (m[8] ?? 0) - (m[5] ?? 0) * (m[7] ?? 0)) * invDet,
      ((m[2] ?? 0) * (m[7] ?? 0) - (m[1] ?? 0) * (m[8] ?? 0)) * invDet,
      ((m[1] ?? 0) * (m[5] ?? 0) - (m[2] ?? 0) * (m[4] ?? 0)) * invDet,

      ((m[5] ?? 0) * (m[6] ?? 0) - (m[3] ?? 0) * (m[8] ?? 0)) * invDet,
      ((m[0] ?? 0) * (m[8] ?? 0) - (m[2] ?? 0) * (m[6] ?? 0)) * invDet,
      ((m[2] ?? 0) * (m[3] ?? 0) - (m[0] ?? 0) * (m[5] ?? 0)) * invDet,

      ((m[3] ?? 0) * (m[7] ?? 0) - (m[4] ?? 0) * (m[6] ?? 0)) * invDet,
      ((m[1] ?? 0) * (m[6] ?? 0) - (m[0] ?? 0) * (m[7] ?? 0)) * invDet,
      ((m[0] ?? 0) * (m[4] ?? 0) - (m[1] ?? 0) * (m[3] ?? 0)) * invDet
    ]);

    return new Mat3(result);
  }

  // Frobenius norm
  norm(): number {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      const val = this.m[i] ?? 0;
      sum += val * val;
    }
    return Math.sqrt(sum);
  }

  // Physics-specific operations

  /**
   * Compute deviatoric part (subtract hydrostatic pressure)
   * Used in plasticity and stress analysis
   */
  deviatoric(): Mat3 {
    const pressure = this.trace() / 3;
    const m = this.m.slice();
    m[0] = (m[0] ?? 0) - pressure;
    m[4] = (m[4] ?? 0) - pressure;
    m[8] = (m[8] ?? 0) - pressure;
    return new Mat3(m);
  }

  /**
   * Von Mises equivalent stress
   * Used for plasticity yield criterion
   */
  vonMisesStress(): number {
    const dev = this.deviatoric();
    const J2 = 0.5 * (
      dev.get(0, 0) ** 2 + dev.get(1, 1) ** 2 + dev.get(2, 2) ** 2 +
      2 * (dev.get(0, 1) ** 2 + dev.get(0, 2) ** 2 + dev.get(1, 2) ** 2)
    );
    return Math.sqrt(3 * J2);
  }

  /**
   * Principal values (eigenvalues) - simplified iterative method
   * For production, use QR algorithm
   */
  principalValues(): { values: [number, number, number]; maxIndex: number } {
    // Simplified - returns diagonal for diagonal matrices
    // Full implementation would use QR decomposition
    const v1 = this.m[0] ?? 0;
    const v2 = this.m[4] ?? 0;
    const v3 = this.m[8] ?? 0;

    const maxVal = Math.max(v1, v2, v3);
    const maxIndex = maxVal === v1 ? 0 : maxVal === v2 ? 1 : 2;

    return {
      values: [v1, v2, v3],
      maxIndex
    };
  }

  /**
   * Principal direction (eigenvector) for given index
   * Simplified version
   */
  principalDirection(index: number): Vec3 {
    // Simplified - returns basis vector
    // Full implementation would compute actual eigenvector
    switch (index) {
      case 0: return new Vec3(1, 0, 0);
      case 1: return new Vec3(0, 1, 0);
      case 2: return new Vec3(0, 0, 1);
      default: return Vec3.zero();
    }
  }

  // Element access
  get(row: number, col: number): number {
    return this.m[col * 3 + row] ?? 0;
  }

  // Utility
  toArray(): Float32Array {
    return new Float32Array(this.m);
  }

  toString(): string {
    return `Mat3(\n  [${this.m[0]?.toFixed(3)}, ${this.m[3]?.toFixed(3)}, ${this.m[6]?.toFixed(3)}]\n  [${this.m[1]?.toFixed(3)}, ${this.m[4]?.toFixed(3)}, ${this.m[7]?.toFixed(3)}]\n  [${this.m[2]?.toFixed(3)}, ${this.m[5]?.toFixed(3)}, ${this.m[8]?.toFixed(3)}]\n)`;
  }
}
