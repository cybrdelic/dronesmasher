import React, { useEffect, useRef, useState } from 'react';
import { WebGPUContext } from '../core/WebGPUContext';
import { Camera } from '../spatial/Camera';
import { CameraController, CameraMode } from '../rendering/CameraController';
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
  const cameraControllerRef = useRef<CameraController | null>(null);
  const cubeRef = useRef<CubeResources | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const rotationRef = useRef<number>(0);
  const [status, setStatus] = useState<string>('Initializing...');
  const [cameraMode, setCameraMode] = useState<string>('free');

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

        // Create camera controller
        const controller = new CameraController({
          camera,
          canvas,
          mode: CameraMode.FREE
        });
        cameraControllerRef.current = controller;

        // Set canvas cursor
        canvas.style.cursor = 'grab';

        // Create cube rendering resources
        cubeRef.current = await createCubeResources(gpuCtx);

        Logger.info('WebGPU initialized successfully');
        setStatus('Ready - Cinematic Controls Active');

        // Start render loop
        lastFrameTimeRef.current = performance.now();
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

      // Create uniform buffer - now much larger for lighting data
      // MVP (64) + Model (64) + Normal (64) + Light Dir (16) + Light Color (16) + Ambient (16) + Camera Pos (16) = 256 bytes
      const uniformBuffer = gpuCtx.device.createBuffer({
        label: 'cube-uniforms',
        size: 256,
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

      // Create bind group
      const bindGroup = gpuCtx.device.createBindGroup({
        label: 'cube-bind-group',
        layout: pipeline.getBindGroupLayout(0),
        entries: [{
          binding: 0,
          resource: { buffer: uniformBuffer },
        }],
      });

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
      const controller = cameraControllerRef.current;
      const cube = cubeRef.current;

      if (!gpuCtx || !camera || !controller || !cube) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      try {
        // Calculate delta time
        const now = performance.now();
        const deltaTime = (now - lastFrameTimeRef.current) / 1000; // Convert to seconds
        lastFrameTimeRef.current = now;

        // Update camera controller
        controller.update(deltaTime);

        // Update camera mode display
        const newMode = controller.getMode();
        const modeNames: Record<CameraMode, string> = {
          [CameraMode.FREE]: 'Free Orbit (Drag to rotate, Shift+Drag to pan, Scroll to zoom)',
          [CameraMode.ORBIT]: 'Locked Orbit',
          [CameraMode.DRONE_FPV]: 'Drone FPV (WASD to move, QE up/down, Mouse to look)',
          [CameraMode.CINEMATIC]: 'Cinematic Fly-Through'
        };
        setCameraMode(modeNames[newMode]);

        // Update rotation for spinning cube
        rotationRef.current += 0.01;

        // Compute matrices
        const rotY = Mat4.rotationY(rotationRef.current);
        const rotX = Mat4.rotationX(rotationRef.current * 0.7);
        const model = rotY.mul(rotX);

        const view = camera.getViewMatrix();
        const projection = camera.getProjectionMatrix();
        const mvp = projection.mul(view).mul(model);

        // Normal matrix (inverse transpose of model matrix for non-uniform scaling)
        const normalMatrix = model; // For uniform scaling, model matrix is fine

        // Lighting parameters (cinematic 3-point lighting inspired)
        const lightDir = new Vec3(0.5, -0.7, 0.3).normalize(); // Key light from upper-right
        const lightColor = new Vec3(1.0, 0.95, 0.9); // Warm sunlight
        const ambientColor = new Vec3(0.2, 0.25, 0.3); // Cool ambient (blue-ish)
        const cameraPos = camera.getPosition();

        // Pack uniform data
        const uniformData = new Float32Array(64); // 256 bytes / 4 = 64 floats
        let offset = 0;

        // MVP matrix (16 floats)
        uniformData.set(mvp.toArray(), offset);
        offset += 16;

        // Model matrix (16 floats)
        uniformData.set(model.toArray(), offset);
        offset += 16;

        // Normal matrix (16 floats)
        uniformData.set(normalMatrix.toArray(), offset);
        offset += 16;

        // Light direction (vec3 + padding)
        uniformData.set([lightDir.x, lightDir.y, lightDir.z, 0], offset);
        offset += 4;

        // Light color (vec3 + padding)
        uniformData.set([lightColor.x, lightColor.y, lightColor.z, 0], offset);
        offset += 4;

        // Ambient color (vec3 + padding)
        uniformData.set([ambientColor.x, ambientColor.y, ambientColor.z, 0], offset);
        offset += 4;

        // Camera position (vec3 + padding)
        uniformData.set([cameraPos.x, cameraPos.y, cameraPos.z, 0], offset);

        // Update uniform buffer
        gpuCtx.device.queue.writeBuffer(
          cube.uniformBuffer,
          0,
          uniformData
        );

        // Get current canvas texture
        const texture = gpuCtx.getCurrentTexture();
        if (!texture) {
          animationFrameRef.current = requestAnimationFrame(render);
          return;
        }

        // Create command encoder
        const encoder = gpuCtx.createCommandEncoder('frame');

        // Create depth texture
        const canvasEl = gpuCtx.canvas!;
        const depthTexture = gpuCtx.device.createTexture({
          size: [canvasEl.width, canvasEl.height],
          format: 'depth24plus',
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Render pass with cinematic background
        const renderPass = encoder.beginRenderPass({
          colorAttachments: [{
            view: texture.createView(),
            clearValue: { r: 0.05, g: 0.06, b: 0.08, a: 1.0 }, // Dark blue-gray
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

            // Clean up camera controller
            if (cameraControllerRef.current) {
              cameraControllerRef.current.destroy();
              cameraControllerRef.current = null;
            }

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
        <div className="viewport-controls">
          <div style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            background: 'rgba(26, 26, 36, 0.95)',
            padding: '1rem',
            borderRadius: '8px',
            fontSize: '0.875rem',
            color: '#e0e0e0',
            backdropFilter: 'blur(10px)',
            maxWidth: '400px',
          }}>
            <div style={{ marginBottom: '0.5rem', color: '#4a9eff', fontWeight: 600 }}>
              Camera: {cameraMode}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#888', lineHeight: '1.5' }}>
              <div>1 - Free Orbit</div>
              <div>2 - Locked Orbit</div>
              <div>3 - Drone FPV</div>
              <div>4 - Cinematic</div>
              <div>R - Reset Camera</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
