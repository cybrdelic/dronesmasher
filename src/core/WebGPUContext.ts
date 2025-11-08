/**
 * WebGPU device initialization and management
 */

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

    console.log('WebGPU Adapter:', {
      vendor: adapter.info?.vendor ?? 'unknown',
      architecture: adapter.info?.architecture ?? 'unknown',
      device: adapter.info?.device ?? 'unknown',
      limits: adapter.limits
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
      console.error('WebGPU device lost:', info.message, info.reason);
    });

    device.addEventListener('uncapturederror', (event) => {
      console.error('WebGPU uncaptured error:', event.error);
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

      context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
      });

      console.log('Canvas configured with format:', presentationFormat);
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
    this.device.destroy();
  }
}
