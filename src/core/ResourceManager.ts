/**
 * Tracks all GPU resources and ensures cleanup
 * Prevents resource leaks and validates usage
 */

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
      console.warn(`Buffer ${descriptor.label} already exists, destroying old one`);
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

    console.log(`Created buffer: ${descriptor.label} (${descriptor.size} bytes)`);
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
      console.log(`Destroyed buffer: ${label}`);
      return true;
    }
    return false;
  }

  // Texture management
  createTexture(descriptor: TextureDescriptor): GPUTexture {
    if (this.textures.has(descriptor.label)) {
      console.warn(`Texture ${descriptor.label} already exists, destroying old one`);
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

    console.log(`Created texture: ${descriptor.label}`);
    return texture;
  }

  getTexture(label: string): GPUTexture | undefined {
    return this.textures.get(label);
  }

  destroyTexture(label: string): boolean {
    const texture = this.textures.get(label);
    if (texture) {
      texture.destroy();
      this.textures.delete(label);
      console.log(`Destroyed texture: ${label}`);
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
    console.log(`Cleaned up ${cleanedCount} resources from scene: ${scene}`);
  }

  cleanupAll() {
    for (const [label, buffer] of this.buffers) {
      buffer.destroy();
      console.log(`Destroyed buffer: ${label}`);
    }
    this.buffers.clear();

    for (const [label, texture] of this.textures) {
      texture.destroy();
      console.log(`Destroyed texture: ${label}`);
    }
    this.textures.clear();

    this.scenes.clear();
    console.log('Cleaned up all resources');
  }

  // Reporting
  reportLeaks() {
    console.group('GPU Resource Report');
    console.log(`Active buffers: ${this.buffers.size}`);
    console.log(`Active textures: ${this.textures.size}`);

    if (this.buffers.size > 0) {
      console.log('Buffers:');
      for (const [label, buffer] of this.buffers) {
        console.log(`  - ${label}: ${buffer.size} bytes`);
      }
    }

    if (this.textures.size > 0) {
      console.log('Textures:');
      for (const label of this.textures.keys()) {
        console.log(`  - ${label}`);
      }
    }

    console.groupEnd();
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
