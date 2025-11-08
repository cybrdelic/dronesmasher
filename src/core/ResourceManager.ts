/**
 * Tracks all GPU resources and ensures cleanup
 * Prevents resource leaks and validates usage
 */

import { Logger } from '../utils/Logger';

export interface BufferDescriptor {
  label: string;
  size: number;
  usage: GPUBufferUsageFlags;
  scene?: string;
}

export interface TextureDescriptor {
  label: string;
  size: GPUExtent3D;
  format: GPUTextureFormat;
  usage: GPUTextureUsageFlags;
  scene?: string;
}

export class ResourceManager {
  private device: GPUDevice;
  private buffers = new Map<string, GPUBuffer>();
  private textures = new Map<string, GPUTexture>();
  private scenes = new Map<string, Set<string>>();

  constructor(device: GPUDevice) {
    this.device = device;
  }

  // Buffer management
  createBuffer(descriptor: BufferDescriptor): GPUBuffer {
    if (this.buffers.has(descriptor.label)) {
      Logger.warn(`Buffer ${descriptor.label} already exists, destroying old one`);
      this.destroyBuffer(descriptor.label);
    }

    const buffer = this.device.createBuffer({
      label: descriptor.label,
      size: descriptor.size,
      usage: descriptor.usage
    });

    this.buffers.set(descriptor.label, buffer);

    if (descriptor.scene) {
      this.trackInScene(descriptor.scene, descriptor.label);
    }

    Logger.debug(`Created buffer: ${descriptor.label}`, { size: descriptor.size });
    return buffer;
  }

  getBuffer(label: string): GPUBuffer | undefined {
    return this.buffers.get(label);
  }

  destroyBuffer(label: string): boolean {
    const buffer = this.buffers.get(label);
    if (buffer) {
      buffer.destroy();
      this.buffers.delete(label);
      Logger.debug(`Destroyed buffer: ${label}`);
      return true;
    }
    return false;
  }

  // Texture management
  createTexture(descriptor: TextureDescriptor): GPUTexture {
    if (this.textures.has(descriptor.label)) {
      Logger.warn(`Texture ${descriptor.label} already exists, destroying old one`);
      this.destroyTexture(descriptor.label);
    }

    const texture = this.device.createTexture({
      label: descriptor.label,
      size: descriptor.size,
      format: descriptor.format,
      usage: descriptor.usage
    });

    this.textures.set(descriptor.label, texture);

    if (descriptor.scene) {
      this.trackInScene(descriptor.scene, descriptor.label);
    }

    Logger.debug(`Created texture: ${descriptor.label}`);
    return texture;
  }

  // Depth texture management (auto-creates and handles resizing)
  getOrCreateDepthTexture(width: number, height: number): GPUTexture {
    const label = `depth-${width}x${height}`;

    // Check if we have a depth texture of this size
    const existing = this.textures.get(label);
    if (existing) {
      return existing;
    }

    // Clean up any old depth textures with different sizes
    const toDelete: string[] = [];
    for (const [key, texture] of this.textures) {
      if (key.startsWith('depth-')) {
        toDelete.push(key);
      }
    }
    toDelete.forEach(key => this.destroyTexture(key));

    // Create new depth texture
    return this.createTexture({
      label,
      size: { width, height },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  getTexture(label: string): GPUTexture | undefined {
    return this.textures.get(label);
  }

  destroyTexture(label: string): boolean {
    const texture = this.textures.get(label);
    if (texture) {
      texture.destroy();
      this.textures.delete(label);
      Logger.debug(`Destroyed texture: ${label}`);
      return true;
    }
    return false;
  }

  // Scene management
  private trackInScene(scene: string, resourceId: string) {
    if (!this.scenes.has(scene)) {
      this.scenes.set(scene, new Set());
    }
    this.scenes.get(scene)?.add(resourceId);
  }

  cleanupScene(scene: string) {
    const resources = this.scenes.get(scene);
    if (!resources) return;

    let cleanedCount = 0;
    for (const id of resources) {
      if (this.destroyBuffer(id) || this.destroyTexture(id)) {
        cleanedCount++;
      }
    }

    this.scenes.delete(scene);
    Logger.info(`Cleaned up scene: ${scene}`, { resourceCount: cleanedCount });
  }

  cleanupAll() {
    const bufferCount = this.buffers.size;
    const textureCount = this.textures.size;

    for (const [label, buffer] of this.buffers) {
      buffer.destroy();
      Logger.debug(`Destroyed buffer: ${label}`);
    }
    this.buffers.clear();

    for (const [label, texture] of this.textures) {
      texture.destroy();
      Logger.debug(`Destroyed texture: ${label}`);
    }
    this.textures.clear();

    this.scenes.clear();
    Logger.info('Cleaned up all resources', { buffers: bufferCount, textures: textureCount });
  }

  // Reporting
  reportLeaks() {
    if (this.buffers.size === 0 && this.textures.size === 0) {
      Logger.info('GPU Resource Report: No leaks detected');
      return;
    }

    Logger.warn('GPU Resource Report - Potential leaks', {
      buffers: this.buffers.size,
      textures: this.textures.size
    });

    for (const [label, buffer] of this.buffers) {
      Logger.warn(`Leaked buffer: ${label}`, { size: buffer.size });
    }

    for (const label of this.textures.keys()) {
      Logger.warn(`Leaked texture: ${label}`);
    }
  }

  // Get total memory usage estimate
  getTotalBufferSize(): number {
    let total = 0;
    for (const buffer of this.buffers.values()) {
      total += buffer.size;
    }
    return total;
  }
}
