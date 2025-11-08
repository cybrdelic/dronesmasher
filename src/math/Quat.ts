/**
 * Quaternion class for rotations
 * More stable than Euler angles, no gimbal lock
 */

import { Vec3 } from './Vec3';
import { Mat4 } from './Mat4';

export class Quat {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public readonly w: number
  ) {}

  // Factory methods
  static identity(): Quat {
    return new Quat(0, 0, 0, 1);
  }

  static fromAxisAngle(axis: Vec3, angleRad: number): Quat {
    const halfAngle = angleRad / 2;
    const s = Math.sin(halfAngle);
    const normalized = axis.normalize();

    return new Quat(
      normalized.x * s,
      normalized.y * s,
      normalized.z * s,
      Math.cos(halfAngle)
    );
  }

  static fromEuler(pitch: number, yaw: number, roll: number): Quat {
    // Pitch (X), Yaw (Y), Roll (Z)
    const cy = Math.cos(yaw * 0.5);
    const sy = Math.sin(yaw * 0.5);
    const cp = Math.cos(pitch * 0.5);
    const sp = Math.sin(pitch * 0.5);
    const cr = Math.cos(roll * 0.5);
    const sr = Math.sin(roll * 0.5);

    return new Quat(
      sr * cp * cy - cr * sp * sy,
      cr * sp * cy + sr * cp * sy,
      cr * cp * sy - sr * sp * cy,
      cr * cp * cy + sr * sp * sy
    );
  }

  static lookRotation(forward: Vec3, up: Vec3 = Vec3.up()): Quat {
    const f = forward.normalize();
    const r = up.cross(f).normalize();
    const u = f.cross(r);

    // Convert to quaternion from rotation matrix
    const trace = r.x + u.y + f.z;

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0);
      return new Quat(
        (u.z - f.y) * s,
        (f.x - r.z) * s,
        (r.y - u.x) * s,
        0.25 / s
      );
    } else if (r.x > u.y && r.x > f.z) {
      const s = 2.0 * Math.sqrt(1.0 + r.x - u.y - f.z);
      return new Quat(
        0.25 * s,
        (u.x + r.y) / s,
        (f.x + r.z) / s,
        (u.z - f.y) / s
      );
    } else if (u.y > f.z) {
      const s = 2.0 * Math.sqrt(1.0 + u.y - r.x - f.z);
      return new Quat(
        (u.x + r.y) / s,
        0.25 * s,
        (f.y + u.z) / s,
        (f.x - r.z) / s
      );
    } else {
      const s = 2.0 * Math.sqrt(1.0 + f.z - r.x - u.y);
      return new Quat(
        (f.x + r.z) / s,
        (f.y + u.z) / s,
        0.25 * s,
        (r.y - u.x) / s
      );
    }
  }

  // Operations
  mul(other: Quat): Quat {
    return new Quat(
      this.w * other.x + this.x * other.w + this.y * other.z - this.z * other.y,
      this.w * other.y - this.x * other.z + this.y * other.w + this.z * other.x,
      this.w * other.z + this.x * other.y - this.y * other.x + this.z * other.w,
      this.w * other.w - this.x * other.x - this.y * other.y - this.z * other.z
    );
  }

  conjugate(): Quat {
    return new Quat(-this.x, -this.y, -this.z, this.w);
  }

  normalize(): Quat {
    const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    if (len === 0) return Quat.identity();
    return new Quat(this.x / len, this.y / len, this.z / len, this.w / len);
  }

  // Rotate a vector
  rotateVec3(v: Vec3): Vec3 {
    const qv = new Quat(v.x, v.y, v.z, 0);
    const result = this.mul(qv).mul(this.conjugate());
    return new Vec3(result.x, result.y, result.z);
  }

  // Convert to Euler angles
  toEuler(): { pitch: number; yaw: number; roll: number } {
    // Pitch (X-axis)
    const sinp = 2 * (this.w * this.x + this.y * this.z);
    const cosp = 1 - 2 * (this.x * this.x + this.y * this.y);
    const pitch = Math.atan2(sinp, cosp);

    // Yaw (Y-axis)
    const siny = 2 * (this.w * this.y - this.z * this.x);
    const cosy = 1 - 2 * (this.y * this.y + this.x * this.x);
    const yaw = Math.atan2(siny, cosy);

    // Roll (Z-axis)
    const sinr = 2 * (this.w * this.z + this.x * this.y);
    const cosr = 1 - 2 * (this.z * this.z + this.x * this.x);
    const roll = Math.atan2(sinr, cosr);

    return { pitch, yaw, roll };
  }

  // Spherical linear interpolation
  static slerp(a: Quat, b: Quat, t: number): Quat {
    let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

    // If the dot product is negative, slerp won't take the shorter path
    let b2 = b;
    if (dot < 0) {
      b2 = new Quat(-b.x, -b.y, -b.z, -b.w);
      dot = -dot;
    }

    if (dot > 0.9995) {
      // Quaternions are very close, use linear interpolation
      return new Quat(
        a.x + t * (b2.x - a.x),
        a.y + t * (b2.y - a.y),
        a.z + t * (b2.z - a.z),
        a.w + t * (b2.w - a.w)
      ).normalize();
    }

    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / sinTheta;
    const wb = Math.sin(t * theta) / sinTheta;

    return new Quat(
      a.x * wa + b2.x * wb,
      a.y * wa + b2.y * wb,
      a.z * wa + b2.z * wb,
      a.w * wa + b2.w * wb
    );
  }

  // Utility
  toArray(): number[] {
    return [this.x, this.y, this.z, this.w];
  }

  toString(): string {
    return `Quat(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)}, ${this.w.toFixed(3)})`;
  }
}
