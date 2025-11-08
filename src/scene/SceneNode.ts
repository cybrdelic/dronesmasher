/**
 * Scene Graph Node - Base class for all scene objects
 * Provides transform hierarchy and update lifecycle
 */

import { Vec3 } from '../math/Vec3';
import { Mat4 } from '../math/Mat4';
import { Quat } from '../math/Quat';

export interface Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export abstract class SceneNode {
  public name: string;
  public parent: SceneNode | null = null;
  public children: SceneNode[] = [];

  // Local transform
  public position: Vec3;
  public rotation: Quat;
  public scale: Vec3;

  // Cached matrices
  private localMatrix: Mat4;
  private worldMatrix: Mat4;
  private needsUpdate = true;

  // Visibility and interaction
  public visible = true;
  public interactive = true;

  constructor(name: string, transform?: Partial<Transform>) {
    this.name = name;
    this.position = transform?.position ?? Vec3.zero();
    this.rotation = transform?.rotation ?? Quat.identity();
    this.scale = transform?.scale ?? new Vec3(1, 1, 1);

    this.localMatrix = Mat4.identity();
    this.worldMatrix = Mat4.identity();
  }

  // Hierarchy management
  addChild(child: SceneNode): void {
    if (child.parent) {
      child.parent.removeChild(child);
    }
    child.parent = this;
    this.children.push(child);
    child.markDirty();
  }

  removeChild(child: SceneNode): void {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parent = null;
      child.markDirty();
    }
  }

  // Transform methods
  setPosition(pos: Vec3): void {
    this.position = pos;
    this.markDirty();
  }

  setRotation(rot: Quat): void {
    this.rotation = rot;
    this.markDirty();
  }

  setScale(scale: Vec3): void {
    this.scale = scale;
    this.markDirty();
  }

  translate(delta: Vec3): void {
    this.position = this.position.add(delta);
    this.markDirty();
  }

  rotate(deltaQuat: Quat): void {
    this.rotation = this.rotation.mul(deltaQuat);
    this.markDirty();
  }

  // Matrix getters
  getLocalMatrix(): Mat4 {
    if (this.needsUpdate) {
      this.updateMatrices();
    }
    return this.localMatrix;
  }

  getWorldMatrix(): Mat4 {
    if (this.needsUpdate) {
      this.updateMatrices();
    }
    return this.worldMatrix;
  }

  private updateMatrices(): void {
    // Compose local matrix: T * R * S
    const T = Mat4.translation(this.position);
    const R = Mat4.fromQuaternion(this.rotation);
    const S = Mat4.scaling(this.scale);
    this.localMatrix = T.mul(R).mul(S);

    // World matrix = parent world * local
    if (this.parent) {
      this.worldMatrix = this.parent.getWorldMatrix().mul(this.localMatrix);
    } else {
      this.worldMatrix = this.localMatrix;
    }

    this.needsUpdate = false;
  }

  private markDirty(): void {
    this.needsUpdate = true;
    // Propagate to children
    for (const child of this.children) {
      child.markDirty();
    }
  }

  // Lifecycle hooks
  abstract update(deltaTime: number): void;
  abstract render(context: any): void;

  // Traverse tree
  traverse(callback: (node: SceneNode) => void): void {
    callback(this);
    for (const child of this.children) {
      child.traverse(callback);
    }
  }

  // Find nodes
  findByName(name: string): SceneNode | null {
    if (this.name === name) return this;

    for (const child of this.children) {
      const found = child.findByName(name);
      if (found) return found;
    }

    return null;
  }

  destroy(): void {
    // Remove from parent
    if (this.parent) {
      this.parent.removeChild(this);
    }

    // Destroy all children
    for (const child of [...this.children]) {
      child.destroy();
    }
  }
}
