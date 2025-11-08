/**
 * Immutable 3D vector
 * All operations return new instances
 */
export class Vec3 {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number
  ) {}

  // Factory methods
  static zero(): Vec3 {
    return new Vec3(0, 0, 0);
  }

  static one(): Vec3 {
    return new Vec3(1, 1, 1);
  }

  static up(): Vec3 {
    return new Vec3(0, 1, 0);
  }

  static right(): Vec3 {
    return new Vec3(1, 0, 0);
  }

  static forward(): Vec3 {
    return new Vec3(0, 0, 1);
  }

  static from Array(arr: number[]): Vec3 {
    return new Vec3(arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0);
  }

  // Basic operations
  add(other: Vec3): Vec3 {
    return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  sub(other: Vec3): Vec3 {
    return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  mul(scalar: number): Vec3 {
    return new Vec3(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  div(scalar: number): Vec3 {
    const invScalar = 1 / scalar;
    return new Vec3(this.x * invScalar, this.y * invScalar, this.z * invScalar);
  }

  negate(): Vec3 {
    return new Vec3(-this.x, -this.y, -this.z);
  }

  // Component-wise operations
  mulComponents(other: Vec3): Vec3 {
    return new Vec3(this.x * other.x, this.y * other.y, this.z * other.z);
  }

  divComponents(other: Vec3): Vec3 {
    return new Vec3(this.x / other.x, this.y / other.y, this.z / other.z);
  }

  // Dot and cross products
  dot(other: Vec3): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  cross(other: Vec3): Vec3 {
    return new Vec3(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x
    );
  }

  // Length operations
  length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  normalize(): Vec3 {
    const len = this.length();
    if (len < 1e-10) {
      return Vec3.zero();
    }
    return this.div(len);
  }

  // Distance operations
  distanceTo(other: Vec3): number {
    return this.sub(other).length();
  }

  distanceSquaredTo(other: Vec3): number {
    return this.sub(other).lengthSquared();
  }

  // Interpolation
  lerp(other: Vec3, t: number): Vec3 {
    return new Vec3(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t,
      this.z + (other.z - this.z) * t
    );
  }

  // Clamping
  clamp(min: Vec3, max: Vec3): Vec3 {
    return new Vec3(
      Math.max(min.x, Math.min(max.x, this.x)),
      Math.max(min.y, Math.min(max.y, this.y)),
      Math.max(min.z, Math.min(max.z, this.z))
    );
  }

  clampLength(maxLength: number): Vec3 {
    const len = this.length();
    if (len > maxLength) {
      return this.mul(maxLength / len);
    }
    return this;
  }

  // Component access
  get(index: number): number {
    switch (index) {
      case 0: return this.x;
      case 1: return this.y;
      case 2: return this.z;
      default: throw new Error(`Invalid index ${index}`);
    }
  }

  // Min/max components
  minComponent(): number {
    return Math.min(this.x, this.y, this.z);
  }

  maxComponent(): number {
    return Math.max(this.x, this.y, this.z);
  }

  // Reflection
  reflect(normal: Vec3): Vec3 {
    const d = this.dot(normal);
    return this.sub(normal.mul(2 * d));
  }

  // Projection
  projectOnto(other: Vec3): Vec3 {
    const d = this.dot(other) / other.lengthSquared();
    return other.mul(d);
  }

  // Angle between vectors
  angleTo(other: Vec3): number {
    const cosAngle = this.dot(other) / (this.length() * other.length());
    return Math.acos(Math.max(-1, Math.min(1, cosAngle)));
  }

  // Utility
  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  toFloat32Array(): Float32Array {
    return new Float32Array([this.x, this.y, this.z]);
  }

  toString(): string {
    return `Vec3(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`;
  }

  equals(other: Vec3, epsilon = 1e-10): boolean {
    return (
      Math.abs(this.x - other.x) < epsilon &&
      Math.abs(this.y - other.y) < epsilon &&
      Math.abs(this.z - other.z) < epsilon
    );
  }

  // Rotation helpers
  rotate90(): Vec3 {
    return new Vec3(-this.y, this.x, this.z);
  }

  // Swizzling (common patterns)
  get xy(): [number, number] {
    return [this.x, this.y];
  }

  get xz(): [number, number] {
    return [this.x, this.z];
  }

  get yz(): [number, number] {
    return [this.y, this.z];
  }
}
