/**
 * WebGPU device initialization and management
 */

import { Logger } from '../utils/Logger';
import { ErrorManager } from '../utils/ErrorManager';

export interface WebGPUContextOptions {
  canvas?: HTMLCanvasElement;
  powerPreference?: 'low-power' | 'high-performance';
  requiredFeatures?: GPUFeatureName[];
}

export class WebGPUContext {
  public readonly adapter: GPUAdapter;
  public readonly device: GPUDevice;
  public readonly context?: GPUCanvasContext;
  public readonly presentationFormat?: GPUTextureFormat;
  public readonly canvas?: HTMLCanvasElement;

  private constructor(
    adapter: GPUAdapter,
    device: GPUDevice,
    context?: GPUCanvasContext,
    presentationFormat?: GPUTextureFormat,
    canvas?: HTMLCanvasElement
  ) {
    this.adapter = adapter;
    this.device = device;
    this.context = context;
    this.presentationFormat = presentationFormat;
    this.canvas = canvas;
  }

  static async initialize(options: WebGPUContextOptions = {}): Promise<WebGPUContext> {
    // Check WebGPU support
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported in this browser');
    }

    // Request adapter
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: options.powerPreference ?? 'high-performance'
    });

    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }

    Logger.info('WebGPU Adapter initialized', {
      vendor: adapter.info?.vendor ?? 'unknown',
      architecture: adapter.info?.architecture ?? 'unknown',
      device: adapter.info?.device ?? 'unknown',
    });

    // Request device
    const device = await adapter.requestDevice({
      requiredFeatures: options.requiredFeatures,
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      }
    });

    device.lost.then((info) => {
      ErrorManager.handleDeviceLost(info);
      Logger.error('WebGPU device lost', { reason: info.reason, message: info.message });
    });

    device.addEventListener('uncapturederror', (event) => {
      if (event.error) {
        ErrorManager.handleWebGPUError(event.error);
      }
    });

    // Set up canvas context if provided
    let context: GPUCanvasContext | undefined;
    let presentationFormat: GPUTextureFormat | undefined;

    if (options.canvas) {
      context = options.canvas.getContext('webgpu') as GPUCanvasContext;
      if (!context) {
        throw new Error('Failed to get WebGPU context from canvas');
      }

      presentationFormat = navigator.gpu.getPreferredCanvasFormat();

      // CRITICAL: Unconfigure first to clear any existing device association
      // This prevents texture/device mismatch during hot reload
      try {
        context.unconfigure();
        Logger.debug('Unconfigured existing canvas context');
      } catch (e) {
        // Context might not be configured yet, that's fine
        Logger.debug('No existing canvas configuration to clear');
      }

      context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
      });

      Logger.info('Canvas configured', { format: presentationFormat });
    }

    return new WebGPUContext(adapter, device, context, presentationFormat, options.canvas);
  }

  // Get device limits
  get limits() {
    return this.device.limits;
  }

  // Get device features
  get features() {
    return this.device.features;
  }

  // Resize canvas
  resizeCanvas(width: number, height: number) {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  // Get current canvas texture
  getCurrentTexture(): GPUTexture | null {
    return this.context?.getCurrentTexture() ?? null;
  }

  // Utility for creating command encoder
  createCommandEncoder(label?: string): GPUCommandEncoder {
    return this.device.createCommandEncoder({ label });
  }

  // Cleanup
  destroy() {
    Logger.debug('Destroying WebGPU context');

    // Unconfigure canvas context first to break device association
    if (this.context) {
      try {
        this.context.unconfigure();
        Logger.debug('Canvas context unconfigured');
      } catch (e) {
        Logger.warn('Failed to unconfigure canvas context', e);
      }
    }

    // Then destroy the device
    this.device.destroy();
    Logger.debug('Device destroyed');
  }
}
