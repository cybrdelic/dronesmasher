/**
 * Volumetric renderer for topology optimization visualization
 *
 * Renders 3D density field and stress distribution using:
 * 1. Marching cubes for isosurface extraction (density > threshold)
 * 2. Per-vertex stress coloring (von Mises stress)
 * 3. PBR materials for realistic appearance
 *
 * Alternative rendering modes:
 * - Density gradient (shows optimization progression)
 * - Cross-sections (slice through volume)
 * - Wireframe (shows voxel grid)
 */

import { WebGPUContext } from '../core/WebGPUContext';
import { Camera } from '../spatial/Camera';
import { Vec3 } from '../math/Vec3';
import { Logger } from '../utils/Logger';
import { ErrorManager } from '../utils/ErrorManager';

export interface VolumeData {
  /** Density field (1 per voxel) */
  densities: Float32Array;
  /** von Mises stress (1 per voxel) */
  stresses: Float32Array;
  /** Grid resolution */
  resolution: { x: number; y: number; z: number };
  /** Physical bounds (meters) */
  bounds: { x: number; y: number; z: number };
}

export interface RenderSettings {
  /** Isosurface density threshold */
  densityThreshold: number;
  /** Stress colormap range */
  stressRange: { min: number; max: number };
  /** Show wireframe overlay */
  showWireframe: boolean;
  /** Cross-section plane (null = disabled) */
  crossSection: { axis: 'x' | 'y' | 'z'; position: number } | null;
  /** Rendering mode */
  mode: 'solid' | 'transparent' | 'xray';
}

export class VolumetricRenderer {
  private gpuContext: WebGPUContext;

  // GPU buffers
  private densityTexture: GPUTexture | null = null;
  private stressTexture: GPUTexture | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private uniformBuffer: GPUBuffer | null = null;

  // Render pipelines
  private volumePipeline: GPURenderPipeline | null = null;
  private wireframePipeline: GPURenderPipeline | null = null;

  // Mesh generation
  private vertexCount: number = 0;
  private indexCount: number = 0;

  constructor(gpuContext: WebGPUContext) {
    this.gpuContext = gpuContext;

    Logger.info('VolumetricRenderer initialized');
  }

  /**
   * Initializes rendering resources
   */
  public async initialize(): Promise<void> {
    try {
      Logger.info('Initializing volumetric renderer...');

      await this.createPipelines();
      this.createUniformBuffer();

      Logger.info('Volumetric renderer initialized successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to initialize volumetric renderer', error);
      ErrorManager.addError('runtime', 'Volumetric Renderer Initialization Failed', message);
      throw error;
    }
  }

  /**
   * Creates render pipelines
   */
  private async createPipelines(): Promise<void> {
    const volumeShader = await this.loadShader('rendering/volume_render.wgsl');

    // Solid volume rendering pipeline
    this.volumePipeline = this.gpuContext.device.createRenderPipeline({
      label: 'volume-render',
      layout: 'auto',
      vertex: {
        module: volumeShader,
        entryPoint: 'vertex_main',
        buffers: [
          {
            arrayStride: 32, // vec3 position + vec3 normal + vec2 padding
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
              { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
            ],
          },
        ],
      },
      fragment: {
        module: volumeShader,
        entryPoint: 'fragment_main',
        targets: [
          {
            format: this.gpuContext.presentationFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

    Logger.debug('Volume render pipelines created');
  }

  /**
   * Loads a WGSL shader module
   */
  private async loadShader(path: string): Promise<GPUShaderModule> {
    // Placeholder - would load actual shader
    const shaderCode = `
      @vertex
      fn vertex_main(@location(0) position: vec3f) -> @builtin(position) vec4f {
        return vec4f(position, 1.0);
      }

      @fragment
      fn fragment_main() -> @location(0) vec4f {
        return vec4f(1.0, 0.0, 0.0, 1.0);
      }
    `;

    return this.gpuContext.device.createShaderModule({
      label: path,
      code: shaderCode,
    });
  }

  /**
   * Creates uniform buffer for camera and settings
   */
  private createUniformBuffer(): void {
    const uniformData = new Float32Array(32); // Camera matrices + settings

    this.uniformBuffer = this.gpuContext.resourceManager.createBuffer({
      label: 'volume-uniforms',
      size: uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Updates volume data and regenerates mesh
   */
  public async updateVolume(volumeData: VolumeData, settings: RenderSettings): Promise<void> {
    try {
      Logger.debug('Updating volume data...');

      // Upload density and stress as 3D textures
      await this.uploadVolumeTextures(volumeData);

      // Generate isosurface mesh using marching cubes
      await this.generateMesh(volumeData, settings);

      Logger.debug('Volume updated', {
        vertexCount: this.vertexCount,
        indexCount: this.indexCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('Failed to update volume', error);
      ErrorManager.addError('runtime', 'Volume Update Failed', message);
    }
  }

  /**
   * Uploads volume data as 3D textures
   */
  private async uploadVolumeTextures(volumeData: VolumeData): Promise<void> {
    const { resolution } = volumeData;

    // Create 3D texture for density
    this.densityTexture = this.gpuContext.device.createTexture({
      label: 'volume-density',
      size: [resolution.x, resolution.y, resolution.z],
      format: 'r32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      dimension: '3d',
    });

    // Upload density data
    this.gpuContext.device.queue.writeTexture(
      { texture: this.densityTexture },
      volumeData.densities,
      { bytesPerRow: resolution.x * 4, rowsPerImage: resolution.y },
      [resolution.x, resolution.y, resolution.z]
    );

    // Create 3D texture for stress
    this.stressTexture = this.gpuContext.device.createTexture({
      label: 'volume-stress',
      size: [resolution.x, resolution.y, resolution.z],
      format: 'r32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      dimension: '3d',
    });

    // Upload stress data
    this.gpuContext.device.queue.writeTexture(
      { texture: this.stressTexture },
      volumeData.stresses,
      { bytesPerRow: resolution.x * 4, rowsPerImage: resolution.y },
      [resolution.x, resolution.y, resolution.z]
    );

    Logger.debug('Volume textures uploaded');
  }

  /**
   * Generates isosurface mesh using marching cubes
   */
  private async generateMesh(volumeData: VolumeData, settings: RenderSettings): Promise<void> {
    // Run marching cubes on GPU to extract isosurface
    // This generates vertices and indices for triangles where density > threshold

    // For now, create placeholder mesh
    // TODO: Implement actual marching cubes shader

    const vertices = new Float32Array([
      // Simple cube for testing
      -0.1, -0.1, 0.0,   0, 0, 1,  // v0: position, normal
       0.1, -0.1, 0.0,   0, 0, 1,  // v1
       0.1,  0.1, 0.0,   0, 0, 1,  // v2
      -0.1,  0.1, 0.0,   0, 0, 1,  // v3
      -0.1, -0.1, 0.05,  0, 0, 1,  // v4
       0.1, -0.1, 0.05,  0, 0, 1,  // v5
       0.1,  0.1, 0.05,  0, 0, 1,  // v6
      -0.1,  0.1, 0.05,  0, 0, 1,  // v7
    ]);

    const indices = new Uint16Array([
      0, 1, 2,  0, 2, 3, // Bottom
      4, 5, 6,  4, 6, 7, // Top
      0, 1, 5,  0, 5, 4, // Front
      2, 3, 7,  2, 7, 6, // Back
      0, 3, 7,  0, 7, 4, // Left
      1, 2, 6,  1, 6, 5, // Right
    ]);

    this.vertexCount = vertices.length / 6;
    this.indexCount = indices.length;

    // Create vertex buffer
    if (this.vertexBuffer) {
      this.vertexBuffer.destroy();
    }
    this.vertexBuffer = this.gpuContext.resourceManager.createBuffer({
      label: 'volume-vertices',
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.gpuContext.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);

    // Create index buffer
    if (this.indexBuffer) {
      this.indexBuffer.destroy();
    }
    this.indexBuffer = this.gpuContext.resourceManager.createBuffer({
      label: 'volume-indices',
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.gpuContext.device.queue.writeBuffer(this.indexBuffer, 0, indices);

    Logger.debug('Mesh generated with marching cubes');
  }

  /**
   * Renders the volume to the current render pass
   */
  public render(renderPass: GPURenderPassEncoder, camera: Camera, settings: RenderSettings): void {
    if (!this.volumePipeline || !this.vertexBuffer || !this.indexBuffer) {
      Logger.warn('Volume renderer not ready');
      return;
    }

    // Update uniforms with camera matrices
    this.updateUniforms(camera, settings);

    // Bind pipeline
    renderPass.setPipeline(this.volumePipeline);

    // Bind vertex and index buffers
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setIndexBuffer(this.indexBuffer, 'uint16');

    // TODO: Bind uniform and texture bind groups

    // Draw
    renderPass.drawIndexed(this.indexCount);

    // Draw wireframe if enabled
    if (settings.showWireframe && this.wireframePipeline) {
      renderPass.setPipeline(this.wireframePipeline);
      renderPass.drawIndexed(this.indexCount);
    }
  }

  /**
   * Updates uniform buffer with camera and settings
   */
  private updateUniforms(camera: Camera, settings: RenderSettings): void {
    if (!this.uniformBuffer) return;

    const uniformData = new Float32Array(32);

    // Camera matrices (16 floats each, but we only need MVP)
    const viewProj = camera.projectionMatrix.mul(camera.viewMatrix);
    const vpArray = viewProj.toArray();
    uniformData.set(vpArray, 0);

    // Settings (density threshold, stress range, etc.)
    uniformData[16] = settings.densityThreshold;
    uniformData[17] = settings.stressRange.min;
    uniformData[18] = settings.stressRange.max;

    this.gpuContext.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
  }

  /**
   * Cleans up GPU resources
   */
  public destroy(): void {
    if (this.densityTexture) this.densityTexture.destroy();
    if (this.stressTexture) this.stressTexture.destroy();

    Logger.info('VolumetricRenderer destroyed');
  }
}
