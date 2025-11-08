/**
 * Mesh Node - Renderable geometry in the scene
 */

import { SceneNode, Transform } from './SceneNode';
import { Mat4 } from '../math/Mat4';
import { Vec3 } from '../math/Vec3';

export interface MeshGeometry {
  vertices: Float32Array;
  indices: Uint32Array;
  vertexBuffer?: GPUBuffer;
  indexBuffer?: GPUBuffer;
}

export interface MeshMaterial {
  pipeline?: GPURenderPipeline;
  bindGroup?: GPUBindGroup;
  uniformBuffer?: GPUBuffer;
}

export interface MeshNodeOptions {
  name: string;
  geometry: MeshGeometry;
  material?: MeshMaterial;
  transform?: Partial<Transform>;
}

export class MeshNode extends SceneNode {
  public geometry: MeshGeometry;
  public material: MeshMaterial;

  // Animation state
  public animating = false;
  public rotationSpeed = new Vec3(0, 1, 0);

  // Interaction state
  public selected = false;
  public hovered = false;

  constructor(options: MeshNodeOptions) {
    super(options.name, options.transform);
    this.geometry = options.geometry;
    this.material = options.material ?? {};
  }

  update(deltaTime: number): void {
    if (this.animating) {
      // Auto-rotate
      const angle = deltaTime;
      const rotQuat = this.rotation.mul(
        this.rotation.constructor.fromEuler(
          this.rotationSpeed.x * angle,
          this.rotationSpeed.y * angle,
          this.rotationSpeed.z * angle
        ) as any
      );
      this.setRotation(rotQuat);
    }

    // Update children
    for (const child of this.children) {
      child.update(deltaTime);
    }
  }

  render(context: {
    passEncoder: GPURenderPassEncoder;
    camera: any;
    viewProjectionMatrix: Mat4;
  }): void {
    if (!this.visible || !this.material.pipeline) return;

    const { passEncoder, viewProjectionMatrix } = context;

    // Set pipeline
    passEncoder.setPipeline(this.material.pipeline);

    // Update uniforms
    if (this.material.uniformBuffer && this.geometry.vertexBuffer) {
      const worldMatrix = this.getWorldMatrix();
      const mvpMatrix = viewProjectionMatrix.mul(worldMatrix);

      // Calculate normal matrix (inverse transpose of upper 3x3)
      const normalMatrix = worldMatrix.inverse() ?? Mat4.identity();

      // Pack uniform data
      const uniformData = this.packUniforms(mvpMatrix, worldMatrix, normalMatrix, context.camera);

      // Write to uniform buffer
      context.passEncoder.device?.queue.writeBuffer(
        this.material.uniformBuffer,
        0,
        uniformData
      );

      // Set bind group
      if (this.material.bindGroup) {
        passEncoder.setBindGroup(0, this.material.bindGroup);
      }

      // Set vertex buffer
      passEncoder.setVertexBuffer(0, this.geometry.vertexBuffer);

      // Set index buffer if available
      if (this.geometry.indexBuffer) {
        passEncoder.setIndexBuffer(this.geometry.indexBuffer, 'uint32');
        passEncoder.drawIndexed(this.geometry.indices.length);
      } else {
        passEncoder.draw(this.geometry.vertices.length / 6); // 6 = 3 pos + 3 color
      }
    }

    // Render children
    for (const child of this.children) {
      if (child.visible) {
        child.render(context);
      }
    }
  }

  protected packUniforms(
    mvp: Mat4,
    model: Mat4,
    normal: Mat4,
    camera: any
  ): Float32Array {
    // Base implementation - can be overridden
    const uniformData = new Float32Array(64);
    uniformData.set(mvp.toArray(), 0);
    uniformData.set(model.toArray(), 16);
    uniformData.set(normal.toArray(), 32);

    if (camera) {
      const lightDir = new Vec3(0.5, -0.7, 0.3).normalize();
      const lightColor = new Vec3(1.0, 0.95, 0.9);
      const ambientColor = new Vec3(0.2, 0.25, 0.3);
      const cameraPos = camera.getPosition();

      uniformData.set([lightDir.x, lightDir.y, lightDir.z, 0], 48);
      uniformData.set([lightColor.x, lightColor.y, lightColor.z, 0], 52);
      uniformData.set([ambientColor.x, ambientColor.y, ambientColor.z, 0], 56);
      uniformData.set([cameraPos.x, cameraPos.y, cameraPos.z, 0], 60);
    }

    return uniformData;
  }

  destroy(): void {
    // Clean up GPU resources
    this.geometry.vertexBuffer?.destroy();
    this.geometry.indexBuffer?.destroy();
    this.material.uniformBuffer?.destroy();

    super.destroy();
  }
}
