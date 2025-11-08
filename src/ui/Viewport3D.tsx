import React, { useEffect, useRef, useState } from 'react';
import { WebGPUContext } from '../core/WebGPUContext';
import { Camera } from '../spatial/Camera';
import { Vec3 } from '../math/Vec3';
import { Mat4 } from '../math/Mat4';
import { Logger } from '../utils/Logger';
import { ErrorManager } from '../utils/ErrorManager';

// Cube rendering resources
interface CubeResources {
  pipeline: GPURenderPipeline;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  indexCount: number;
}

export const Viewport3D: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuContextRef = useRef<WebGPUContext | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const cubeRef = useRef<CubeResources | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const rotationRef = useRef<number>(0);
  const [status, setStatus] = useState<string>('Initializing...');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // CRITICAL: Check if this canvas element already has WebGPU initialized
    // This prevents double-initialization during StrictMode double-mounting
    // We use a data attribute because refs are recreated but canvas element persists
    if (canvas.dataset.webgpuInitialized === 'true') {
      Logger.debug('Canvas already has WebGPU initialized (StrictMode remount), skipping');
      return;
    }

    // CRITICAL: Set flag IMMEDIATELY (synchronously) to prevent race condition
    // If we wait until async init() finishes, StrictMode's second mount will
    // start a second initialization before the first one completes
    canvas.dataset.webgpuInitialized = 'true';
    Logger.debug('Marked canvas as initializing to prevent concurrent initialization');

    async function init() {
      try {
        // Set canvas size FIRST
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        // Initialize WebGPU
        Logger.info('Initializing WebGPU...');
        const gpuCtx = await WebGPUContext.initialize({ canvas });
        gpuContextRef.current = gpuCtx;

        // Create camera
        const camera = new Camera({
          fovDegrees: 45,
          aspect: canvas.width / canvas.height,
          near: 0.1,
          far: 100.0
        });

        camera.lookAt(
          new Vec3(3, 3, 5),
          new Vec3(0, 0, 0),
          Vec3.up()
        );
        cameraRef.current = camera;

        // Create cube rendering resources
        cubeRef.current = await createCubeResources(gpuCtx);

        Logger.info('WebGPU initialized successfully');
        setStatus('Ready - Rendering 3D Cube');

        // Start render loop
        render();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        Logger.error('Failed to initialize WebGPU', error);
        ErrorManager.addError('runtime', 'WebGPU Initialization Failed', message);
        setStatus(`Error: ${message}`);

        // Clear flag on error so initialization can be retried
        delete canvas.dataset.webgpuInitialized;
      }
    }

    async function createCubeResources(gpuCtx: WebGPUContext): Promise<CubeResources> {
      // Cube vertices: position (3) + color (3)
      const vertices = new Float32Array([
        // Front face (red)
        -1, -1,  1,   1, 0, 0,
         1, -1,  1,   1, 0, 0,
         1,  1,  1,   1, 0, 0,
        -1,  1,  1,   1, 0, 0,
        // Back face (green)
        -1, -1, -1,   0, 1, 0,
        -1,  1, -1,   0, 1, 0,
         1,  1, -1,   0, 1, 0,
         1, -1, -1,   0, 1, 0,
        // Top face (blue)
        -1,  1, -1,   0, 0, 1,
        -1,  1,  1,   0, 0, 1,
         1,  1,  1,   0, 0, 1,
         1,  1, -1,   0, 0, 1,
        // Bottom face (yellow)
        -1, -1, -1,   1, 1, 0,
         1, -1, -1,   1, 1, 0,
         1, -1,  1,   1, 1, 0,
        -1, -1,  1,   1, 1, 0,
        // Right face (magenta)
         1, -1, -1,   1, 0, 1,
         1,  1, -1,   1, 0, 1,
         1,  1,  1,   1, 0, 1,
         1, -1,  1,   1, 0, 1,
        // Left face (cyan)
        -1, -1, -1,   0, 1, 1,
        -1, -1,  1,   0, 1, 1,
        -1,  1,  1,   0, 1, 1,
        -1,  1, -1,   0, 1, 1,
      ]);

      // Cube indices
      const indices = new Uint16Array([
        0,  1,  2,   0,  2,  3,  // front
        4,  5,  6,   4,  6,  7,  // back
        8,  9, 10,   8, 10, 11,  // top
       12, 13, 14,  12, 14, 15,  // bottom
       16, 17, 18,  16, 18, 19,  // right
       20, 21, 22,  20, 22, 23   // left
      ]);

      // Create vertex buffer
      const vertexBuffer = gpuCtx.device.createBuffer({
        label: 'cube-vertices',
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      gpuCtx.device.queue.writeBuffer(vertexBuffer, 0, vertices);

      // Create index buffer
      const indexBuffer = gpuCtx.device.createBuffer({
        label: 'cube-indices',
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      gpuCtx.device.queue.writeBuffer(indexBuffer, 0, indices);

      // Create uniform buffer for MVP matrix
      const uniformBuffer = gpuCtx.device.createBuffer({
        label: 'cube-uniforms',
        size: 64, // mat4x4 = 16 floats = 64 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      // Load shader
      const shaderCode = await fetch('/src/shaders/test_cube.wgsl').then(r => r.text());
      const shaderModule = gpuCtx.device.createShaderModule({
        label: 'cube-shader',
        code: shaderCode,
      });

      // Create render pipeline
      const pipeline = gpuCtx.device.createRenderPipeline({
        label: 'cube-pipeline',
        layout: 'auto',
        vertex: {
          module: shaderModule,
          entryPoint: 'vertex_main',
          buffers: [{
            arrayStride: 24, // 6 floats * 4 bytes = 24 bytes
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
              { shaderLocation: 1, offset: 12, format: 'float32x3' }, // color
            ],
          }],
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fragment_main',
          targets: [{
            format: gpuCtx.presentationFormat!,
          }],
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

      // Create depth texture
      const depthTexture = gpuCtx.device.createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

      // Create bind group
      const bindGroup = gpuCtx.device.createBindGroup({
        label: 'cube-bind-group',
        layout: pipeline.getBindGroupLayout(0),
        entries: [{
          binding: 0,
          resource: { buffer: uniformBuffer },
        }],
      });

      // Store depth texture for cleanup
      (depthTexture as any).label = 'cube-depth-texture';

      return {
        pipeline,
        vertexBuffer,
        indexBuffer,
        uniformBuffer,
        bindGroup,
        indexCount: indices.length,
      };
    }

    function render() {
      const gpuCtx = gpuContextRef.current;
      const camera = cameraRef.current;
      const cube = cubeRef.current;

      if (!gpuCtx || !camera || !cube) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      try {
        // Update rotation
        rotationRef.current += 0.01;

        // Compute MVP matrix
        const model = Mat4.identity()
          .rotateY(rotationRef.current)
          .rotateX(rotationRef.current * 0.7);

        const view = camera.viewMatrix;
        const projection = camera.projectionMatrix;
        const mvp = projection.mul(view).mul(model);

        // Update uniform buffer
        gpuCtx.device.queue.writeBuffer(
          cube.uniformBuffer,
          0,
          new Float32Array(mvp.toArray())
        );

        // Get current canvas texture
        const texture = gpuCtx.getCurrentTexture();
        if (!texture) {
          animationFrameRef.current = requestAnimationFrame(render);
          return;
        }

        // Create command encoder
        const encoder = gpuCtx.createCommandEncoder('frame');

        // Get or create depth texture
        const canvas = gpuCtx.canvas!;
        const depthTexture = gpuCtx.device.createTexture({
          size: [canvas.width, canvas.height],
          format: 'depth24plus',
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Render pass with depth testing
        const renderPass = encoder.beginRenderPass({
          colorAttachments: [{
            view: texture.createView(),
            clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store'
          }],
          depthStencilAttachment: {
            view: depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
        });

        renderPass.setPipeline(cube.pipeline);
        renderPass.setBindGroup(0, cube.bindGroup);
        renderPass.setVertexBuffer(0, cube.vertexBuffer);
        renderPass.setIndexBuffer(cube.indexBuffer, 'uint16');
        renderPass.drawIndexed(cube.indexCount);

        renderPass.end();

        // Submit
        gpuCtx.device.queue.submit([encoder.finish()]);

        // Clean up depth texture
        depthTexture.destroy();
      } catch (error) {
        // Log render errors but don't stop the loop
        Logger.error('Render error', error);
        if (error instanceof Error) {
          ErrorManager.addError('runtime', 'Render Loop Error', error.message);
        }
      }

      // Continue loop
      animationFrameRef.current = requestAnimationFrame(render);
    }

    // Handle resize - only update camera aspect ratio
    // Don't reconfigure canvas context as it can cause device mismatches
    const handleResize = () => {
      if (!canvas) return;

      const camera = cameraRef.current;
      if (camera) {
        const rect = canvas.getBoundingClientRect();
        camera.setAspect(rect.width / rect.height);
      }
    };

    window.addEventListener('resize', handleResize);

    // Initialize WebGPU
    init();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Only destroy on REAL unmount, not StrictMode cleanup
      // StrictMode cleanup happens immediately before remount, so canvas persists
      // We detect real unmount by checking if canvas is still in DOM after a tick
      const currentCanvas = canvasRef.current;
      if (gpuContextRef.current && currentCanvas) {
        setTimeout(() => {
          // If canvas is no longer in document, it's a real unmount
          if (!document.contains(currentCanvas)) {
            Logger.info('Real unmount detected, cleaning up WebGPU');

            // Clean up cube resources
            if (cubeRef.current) {
              cubeRef.current.vertexBuffer.destroy();
              cubeRef.current.indexBuffer.destroy();
              cubeRef.current.uniformBuffer.destroy();
              cubeRef.current = null;
            }

            if (gpuContextRef.current) {
              gpuContextRef.current.destroy();
              gpuContextRef.current = null;
            }
            if (currentCanvas) {
              delete currentCanvas.dataset.webgpuInitialized;
            }
          } else {
            Logger.debug('StrictMode cleanup, keeping WebGPU context alive');
          }
        }, 0);
      }

      cameraRef.current = null;
    };
  }, []);

  return (
    <div className="viewport">
      <canvas ref={canvasRef} className="viewport-canvas" />
      <div className="viewport-overlay">
        <div className="viewport-status">{status}</div>
      </div>
    </div>
  );
};
