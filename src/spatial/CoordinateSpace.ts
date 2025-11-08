import { Vec3 } from '../math/Vec3';
import { Mat4 } from '../math/Mat4';

/**
 * Coordinate space type system
 * Prevents mixing incompatible coordinate systems at compile time
 */

export enum Space {
  World,      // Drone frame in meters
  View,       // Camera-relative
  Clip,       // Post-projection [-1, 1]
  Screen,     // Pixels [0, width]x[0, height]
  Grid,       // Simulation voxel indices
  UV,         // Texture coordinates [0, 1]
}

/**
 * Tagged vector type with compile-time space safety
 */
export class SpatialVec3<S extends Space> {
  readonly space: S;
  readonly vec: Vec3;

  constructor(x: number, y: number, z: number, space: S) {
    this.vec = new Vec3(x, y, z);
    this.space = space;
  }

  get x(): number { return this.vec.x; }
  get y(): number { return this.vec.y; }
  get z(): number { return this.vec.z; }

  // Can only add vectors in same space
  add(other: SpatialVec3<S>): SpatialVec3<S> {
    const result = this.vec.add(other.vec);
    return new SpatialVec3(result.x, result.y, result.z, this.space);
  }

  sub(other: SpatialVec3<S>): SpatialVec3<S> {
    const result = this.vec.sub(other.vec);
    return new SpatialVec3(result.x, result.y, result.z, this.space);
  }

  mul(scalar: number): SpatialVec3<S> {
    const result = this.vec.mul(scalar);
    return new SpatialVec3(result.x, result.y, result.z, this.space);
  }

  // Utility
  toVec3(): Vec3 {
    return this.vec;
  }

  toString(): string {
    return `SpatialVec3<${Space[this.space]}>(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`;
  }
}

/**
 * Transform between coordinate spaces
 */
export class SpaceTransform<From extends Space, To extends Space> {
  readonly matrix: Mat4;
  readonly from: From;
  readonly to: To;

  constructor(matrix: Mat4, from: From, to: To) {
    this.matrix = matrix;
    this.from = from;
    this.to = to;
  }

  transform(vec: SpatialVec3<From>): SpatialVec3<To> {
    const result = this.matrix.mulVec3(vec.vec);
    return new SpatialVec3(result.x, result.y, result.z, this.to);
  }

  // Compose transforms
  then<Next extends Space>(
    next: SpaceTransform<To, Next>
  ): SpaceTransform<From, Next> {
    return new SpaceTransform(
      next.matrix.mul(this.matrix),
      this.from,
      next.to
    );
  }
}

/**
 * Factory functions for creating spatial vectors
 */
export const WorldVec3 = (x: number, y: number, z: number) =>
  new SpatialVec3(x, y, z, Space.World);

export const ViewVec3 = (x: number, y: number, z: number) =>
  new SpatialVec3(x, y, z, Space.View);

export const GridVec3 = (x: number, y: number, z: number) =>
  new SpatialVec3(x, y, z, Space.Grid);
