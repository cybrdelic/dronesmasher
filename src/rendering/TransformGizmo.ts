/**
 * Transform Gizmo - Interactive 3D handles for translating, rotating, and scaling objects
 * Provides visual feedback and mouse interaction for object manipulation
 */

import { Vec3 } from '../math/Vec3';
import { Camera } from '../spatial/Camera';
import { SceneNode } from '../scene/SceneNode';

export enum GizmoMode {
  TRANSLATE = 'translate',
  ROTATE = 'rotate',
  SCALE = 'scale',
}

export enum GizmoAxis {
  NONE = 'none',
  X = 'x',
  Y = 'y',
  Z = 'z',
  XY = 'xy',
  YZ = 'yz',
  XZ = 'xz',
}

interface GizmoHandle {
  axis: GizmoAxis;
  color: Vec3;
  hoverColor: Vec3;
  vertices: Float32Array;
  indices: Uint32Array;
}

export class TransformGizmo {
  private mode: GizmoMode = GizmoMode.TRANSLATE;
  private target: SceneNode | null = null;
  private camera: Camera;
  private canvas: HTMLCanvasElement;

  // Interaction state
  private dragging = false;
  private hoveredAxis: GizmoAxis = GizmoAxis.NONE;
  private dragStartPos: Vec3 | null = null;
  private dragStartNodePos: Vec3 | null = null;

  // Handles
  private handles: Map<GizmoAxis, GizmoHandle> = new Map();

  // Visual properties
  private gizmoSize = 1.0;
  private handleSize = 0.15;

  constructor(camera: Camera, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.canvas = canvas;
    this.setupHandles();
    this.setupEventListeners();
  }

  private setupHandles(): void {
    // Translation handles - arrows along each axis
    this.handles.set(GizmoAxis.X, {
      axis: GizmoAxis.X,
      color: new Vec3(1, 0, 0), // Red
      hoverColor: new Vec3(1, 0.5, 0.5),
      vertices: this.createArrowGeometry(new Vec3(1, 0, 0)),
      indices: new Uint32Array([]), // Filled later
    });

    this.handles.set(GizmoAxis.Y, {
      axis: GizmoAxis.Y,
      color: new Vec3(0, 1, 0), // Green
      hoverColor: new Vec3(0.5, 1, 0.5),
      vertices: this.createArrowGeometry(new Vec3(0, 1, 0)),
      indices: new Uint32Array([]),
    });

    this.handles.set(GizmoAxis.Z, {
      axis: GizmoAxis.Z,
      color: new Vec3(0, 0, 1), // Blue
      hoverColor: new Vec3(0.5, 0.5, 1),
      vertices: this.createArrowGeometry(new Vec3(0, 0, 1)),
      indices: new Uint32Array([]),
    });

    // Plane handles for multi-axis movement
    this.handles.set(GizmoAxis.XY, {
      axis: GizmoAxis.XY,
      color: new Vec3(1, 1, 0), // Yellow
      hoverColor: new Vec3(1, 1, 0.5),
      vertices: this.createPlaneGeometry(new Vec3(1, 1, 0)),
      indices: new Uint32Array([]),
    });

    this.handles.set(GizmoAxis.YZ, {
      axis: GizmoAxis.YZ,
      color: new Vec3(0, 1, 1), // Cyan
      hoverColor: new Vec3(0.5, 1, 1),
      vertices: this.createPlaneGeometry(new Vec3(0, 1, 1)),
      indices: new Uint32Array([]),
    });

    this.handles.set(GizmoAxis.XZ, {
      axis: GizmoAxis.XZ,
      color: new Vec3(1, 0, 1), // Magenta
      hoverColor: new Vec3(1, 0.5, 1),
      vertices: this.createPlaneGeometry(new Vec3(1, 0, 1)),
      indices: new Uint32Array([]),
    });
  }

  private createArrowGeometry(direction: Vec3): Float32Array {
    // Simple arrow: cylinder shaft + cone tip
    const vertices: number[] = [];
    const shaftLength = this.gizmoSize * 0.8;
    const shaftRadius = this.handleSize * 0.5;
    const tipLength = this.gizmoSize * 0.2;
    const tipRadius = this.handleSize;

    // Create arrow along the specified axis
    // For simplicity, create a line representation
    vertices.push(0, 0, 0); // Start
    vertices.push(
      direction.x * this.gizmoSize,
      direction.y * this.gizmoSize,
      direction.z * this.gizmoSize
    ); // End

    return new Float32Array(vertices);
  }

  private createPlaneGeometry(normal: Vec3): Float32Array {
    // Create a small quad in the plane perpendicular to normal
    const size = this.handleSize * 2;
    const vertices: number[] = [];

    // Simplified quad representation
    const offset = this.handleSize * 1.5;

    if (normal.z === 0) {
      // XY plane
      vertices.push(offset, 0, 0, offset, offset, 0, 0, offset, 0);
    } else if (normal.x === 0) {
      // YZ plane
      vertices.push(0, offset, 0, 0, offset, offset, 0, 0, offset);
    } else {
      // XZ plane
      vertices.push(offset, 0, 0, offset, 0, offset, 0, 0, offset);
    }

    return new Float32Array(vertices);
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.target) return;

    const mousePos = this.getMouseNDC(e);

    if (this.dragging && this.dragStartPos && this.dragStartNodePos) {
      // Calculate drag delta
      const currentWorldPos = this.screenToWorld(mousePos);
      if (!currentWorldPos) return;

      const delta = currentWorldPos.sub(this.dragStartPos);

      // Apply constraint based on active axis
      let constrainedDelta = delta;
      switch (this.hoveredAxis) {
        case GizmoAxis.X:
          constrainedDelta = new Vec3(delta.x, 0, 0);
          break;
        case GizmoAxis.Y:
          constrainedDelta = new Vec3(0, delta.y, 0);
          break;
        case GizmoAxis.Z:
          constrainedDelta = new Vec3(0, 0, delta.z);
          break;
        case GizmoAxis.XY:
          constrainedDelta = new Vec3(delta.x, delta.y, 0);
          break;
        case GizmoAxis.YZ:
          constrainedDelta = new Vec3(0, delta.y, delta.z);
          break;
        case GizmoAxis.XZ:
          constrainedDelta = new Vec3(delta.x, 0, delta.z);
          break;
      }

      // Update target position
      const newPos = this.dragStartNodePos.add(constrainedDelta);
      this.target.setPosition(newPos);
    } else {
      // Check for hover
      this.updateHover(mousePos);
    }
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.target || this.hoveredAxis === GizmoAxis.NONE) return;

    this.dragging = true;
    const mousePos = this.getMouseNDC(e);
    this.dragStartPos = this.screenToWorld(mousePos);
    this.dragStartNodePos = this.target.position;
  };

  private onMouseUp = (): void => {
    this.dragging = false;
    this.dragStartPos = null;
    this.dragStartNodePos = null;
  };

  private getMouseNDC(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    return { x, y };
  }

  private screenToWorld(ndc: { x: number; y: number }): Vec3 | null {
    // Simplified screen-to-world conversion
    // In production, this would use proper unprojection
    if (!this.target) return null;

    const targetPos = this.target.position;
    const camToTarget = targetPos.sub(this.camera.getPosition()).length();

    // Project NDC onto a plane at the target's distance
    const forward = this.camera.getForward();
    const right = this.camera.getRight();
    const up = this.camera.getUp();

    const offset = right
      .mul(ndc.x * camToTarget * 0.5)
      .add(up.mul(ndc.y * camToTarget * 0.5));

    return this.camera.getPosition().add(forward.mul(camToTarget)).add(offset);
  }

  private updateHover(mousePos: { x: number; y: number }): void {
    // Simplified hover detection
    // In production, would use ray-intersection with handle geometry
    this.hoveredAxis = GizmoAxis.NONE;
  }

  // Public API
  setMode(mode: GizmoMode): void {
    this.mode = mode;
  }

  setTarget(node: SceneNode | null): void {
    this.target = node;
  }

  getTarget(): SceneNode | null {
    return this.target;
  }

  isActive(): boolean {
    return this.target !== null && this.target.interactive;
  }

  // Rendering (simplified - would integrate with WebGPU pipeline)
  render(context: any): void {
    if (!this.isActive() || !this.target) return;

    // Gizmo rendering would happen here
    // For now, this is a placeholder
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
  }
}
