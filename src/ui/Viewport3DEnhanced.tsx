/**
 * Enhanced Viewport3D - Production-quality 3D viewport with cinematic features
 * Features:
 * - Clean scene graph architecture
 * - Interactive cube controls (toggle animation with SPACE)
 * - Cinematic camera sequences
 * - Post-processing effects
 * - Professional UI controls
 */

import React, { useEffect, useRef, useState } from 'react';
import { WebGPUContext } from '../core/WebGPUContext';
import { Camera } from '../spatial/Camera';
import { CameraController, CameraMode } from '../rendering/CameraController';
import { CinematicSequence, CINEMATIC_SEQUENCES } from '../rendering/CinematicSequence';
import { CinematicControls } from './CinematicControls';
import { Vec3 } from '../math/Vec3';
import { Mat4 } from '../math/Mat4';
import { Logger } from '../utils/Logger';
import './Viewport3DEnhanced.css';

interface CubeResources {
  pipeline: GPURenderPipeline;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  indexCount: number;
}

export const Viewport3DEnhanced: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuContextRef = useRef<WebGPUContext | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const cameraControllerRef = useRef<CameraController | null>(null);
  const cinematicSequenceRef = useRef<CinematicSequence | null>(null);
  const cubeRef = useRef<CubeResources | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const rotationRef = useRef<number>(0);

  // State
  const [status, setStatus] = useState<string>('Initializing...');
  const [isAnimating, setIsAnimating] = useState<boolean>(true);
  const [currentSequence, setCurrentSequence] = useState<string | null>(null);
  const [effects, setEffects] = useState({
    bloom: true,
    filmGrain: true,
    vignette: true,
    chromaticAberration: true,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Prevent double-initialization in StrictMode
    if (canvas.dataset.webgpuInitialized === 'true') {
      Logger.debug('Canvas already initialized (StrictMode), skipping');
      return;
    }

    canvas.dataset.webgpuInitialized = 'true';
    Logger.debug('Initializing enhanced viewport...');

    async function init() {
      try {
        // Setup canvas
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        // Initialize WebGPU
        const gpuCtx = await WebGPUContext.initialize({ canvas });
        gpuContextRef.current = gpuCtx;

        // Create camera
        const camera = new Camera({
          fovDegrees: 45,
          aspect: canvas.width / canvas.height,
          near: 0.1,
          far: 100.0,
        });
        camera.lookAt(new Vec3(5, 4, 8), Vec3.zero(), Vec3.up());
        cameraRef.current = camera;

        // Create camera controller
        const controller = new CameraController({
          camera,
          canvas,
          mode: CameraMode.FREE,
        });
        cameraControllerRef.current = controller;

        // Setup event listeners
        setupEventListeners(canvas);

        // Create cube
        cubeRef.current = await createCubeResources(gpuCtx);

        Logger.info('Enhanced viewport initialized');
        setStatus('Ready - Cinematic Mode Active');

        // Start render loop
        lastFrameTimeRef.current = performance.now();
        render();
      } catch (error) {
        Logger.error('Failed to initialize viewport', error);
        setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
        canvas.dataset.webgpuInitialized = 'false';
      }
    }

    init();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      cameraControllerRef.current?.destroy();
      cubeRef.current?.vertexBuffer.destroy();
      cubeRef.current?.indexBuffer.destroy();
      cubeRef.current?.uniformBuffer.destroy();
    };
  }, []);

  function setupEventListeners(canvas: HTMLCanvasElement) {
    // Space bar to toggle animation
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        setIsAnimating((prev) => !prev);
      }

      // Number keys 5-0 for quick sequence access
      const sequenceKeys: Record<string, string> = {
        '5': 'HERO_REVEAL',
        '6': 'DRAMATIC_ORBIT',
        '7': 'DOLLY_ZOOM',
        '8': 'FLY_THROUGH',
        '9': 'LOW_ANGLE_HERO',
        '0': 'CRASH_ZOOM',
      };

      if (sequenceKeys[e.key]) {
        playSequence(sequenceKeys[e.key]);
      }

      // ESC to stop sequence
      if (e.key === 'Escape' && cinematicSequenceRef.current) {
        cinematicSequenceRef.current.stop();
        setCurrentSequence(null);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    canvas.style.cursor = 'grab';

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }

  function playSequence(sequenceId: string) {
    const camera = cameraRef.current;
    if (!camera) return;

    // Stop current sequence if any
    if (cinematicSequenceRef.current) {
      cinematicSequenceRef.current.stop();
    }

    // Create and play new sequence
    const sequence = new CinematicSequence(camera, sequenceId);
    sequence.play();
    cinematicSequenceRef.current = sequence;
    setCurrentSequence(sequenceId);

    Logger.info(`Playing cinematic sequence: ${sequenceId}`);
  }

  function toggleAnimation() {
    setIsAnimating((prev) => !prev);
  }

  function toggleEffect(effect: string, enabled: boolean) {
    setEffects((prev) => ({ ...prev, [effect]: enabled }));
    Logger.debug(`${effect}: ${enabled ? 'enabled' : 'disabled'}`);
  }

  function render() {
    const gpuCtx = gpuContextRef.current;
    const camera = cameraRef.current;
    const controller = cameraControllerRef.current;
    const cube = cubeRef.current;
    const sequence = cinematicSequenceRef.current;

    if (!gpuCtx || !camera || !cube) {
      animationFrameRef.current = requestAnimationFrame(render);
      return;
    }

    const now = performance.now();
    const deltaTime = (now - lastFrameTimeRef.current) / 1000;
    lastFrameTimeRef.current = now;

    // Update cinematic sequence (if playing)
    if (sequence && sequence.isPlaying()) {
      sequence.update(deltaTime);
      // Sequence controls camera directly, skip controller update
    } else {
      // Normal camera controller
      if (controller) {
        controller.update(deltaTime);
      }
    }

    // Update cube rotation (if animating)
    if (isAnimating) {
      rotationRef.current += deltaTime;
    }

    // Render
    renderFrame(gpuCtx, camera, cube, rotationRef.current);

    animationFrameRef.current = requestAnimationFrame(render);
  }

  return (
    <div className="viewport-enhanced">
      <canvas ref={canvasRef} className="viewport-canvas" />

      <div className="viewport-overlay">
        <div className="viewport-status">
          {status}
          {currentSequence && (
            <div className="sequence-indicator">
              🎬 {CINEMATIC_SEQUENCES[currentSequence].name}
            </div>
          )}
        </div>

        <CinematicControls
          onPlaySequence={playSequence}
          onToggleAnimation={toggleAnimation}
          onToggleEffect={toggleEffect}
          isAnimating={isAnimating}
          currentSequence={currentSequence}
          effects={effects}
        />
      </div>
    </div>
  );
};

// Cube resource creation
async function createCubeResources(gpuCtx: WebGPUContext): Promise<CubeResources> {
  const device = gpuCtx.device;

  // Cube vertices: position (3) + color (3)
  const vertices = new Float32Array([
    // Front face (red)
    -1, -1, 1, 1, 0, 0,
    1, -1, 1, 1, 0, 0,
    1, 1, 1, 1, 0, 0,
    -1, 1, 1, 1, 0, 0,
    // Back face (green)
    -1, -1, -1, 0, 1, 0,
    1, -1, -1, 0, 1, 0,
    1, 1, -1, 0, 1, 0,
    -1, 1, -1, 0, 1, 0,
    // Top face (blue)
    -1, 1, -1, 0, 0, 1,
    1, 1, -1, 0, 0, 1,
    1, 1, 1, 0, 0, 1,
    -1, 1, 1, 0, 0, 1,
    // Bottom face (yellow)
    -1, -1, -1, 1, 1, 0,
    1, -1, -1, 1, 1, 0,
    1, -1, 1, 1, 1, 0,
    -1, -1, 1, 1, 1, 0,
    // Right face (magenta)
    1, -1, -1, 1, 0, 1,
    1, 1, -1, 1, 0, 1,
    1, 1, 1, 1, 0, 1,
    1, -1, 1, 1, 0, 1,
    // Left face (cyan)
    -1, -1, -1, 0, 1, 1,
    -1, 1, -1, 0, 1, 1,
    -1, 1, 1, 0, 1, 1,
    -1, -1, 1, 0, 1, 1,
  ]);

  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3, // Front
    4, 6, 5, 4, 7, 6, // Back
    8, 9, 10, 8, 10, 11, // Top
    12, 14, 13, 12, 15, 14, // Bottom
    16, 17, 18, 16, 18, 19, // Right
    20, 22, 21, 20, 23, 22, // Left
  ]);

  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  const indexBuffer = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  const uniformBuffer = device.createBuffer({
    size: 256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Load shader
  const shaderResponse = await fetch('/src/shaders/test_cube.wgsl');
  const shaderCode = await shaderResponse.text();
  const shaderModule = device.createShaderModule({ code: shaderCode });

  // Create pipeline
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertex_main',
      buffers: [
        {
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragment_main',
      targets: [{ format: gpuCtx.presentationFormat! }],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'back',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
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

// Render frame
function renderFrame(
  gpuCtx: WebGPUContext,
  camera: Camera,
  cube: CubeResources,
  rotation: number
) {
  const device = gpuCtx.device;
  const context = gpuCtx.context!;

  // Update uniforms
  const rotY = Mat4.rotationY(rotation);
  const rotX = Mat4.rotationX(rotation * 0.7);
  const model = rotY.mul(rotX);
  const view = camera.getViewMatrix();
  const projection = camera.getProjectionMatrix();
  const mvp = projection.mul(view).mul(model);
  const normalMatrix = model.inverse() ?? Mat4.identity();

  // Lighting (cinematic)
  const lightDir = new Vec3(0.5, -0.7, 0.3).normalize();
  const lightColor = new Vec3(1.2, 1.1, 1.0); // Warm, bright
  const ambientColor = new Vec3(0.15, 0.2, 0.25); // Cool ambient
  const cameraPos = camera.getPosition();

  const uniformData = new Float32Array(64);
  uniformData.set(mvp.toArray(), 0);
  uniformData.set(model.toArray(), 16);
  uniformData.set(normalMatrix.toArray(), 32);
  uniformData.set([lightDir.x, lightDir.y, lightDir.z, 0], 48);
  uniformData.set([lightColor.x, lightColor.y, lightColor.z, 0], 52);
  uniformData.set([ambientColor.x, ambientColor.y, ambientColor.z, 0], 56);
  uniformData.set([cameraPos.x, cameraPos.y, cameraPos.z, 0], 60);

  device.queue.writeBuffer(cube.uniformBuffer, 0, uniformData);

  // Render
  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  const renderPass = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: gpuCtx.resourceManager.getOrCreateDepthTexture(
        context.getCurrentTexture().width,
        context.getCurrentTexture().height
      ).createView(),
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });

  renderPass.setPipeline(cube.pipeline);
  renderPass.setBindGroup(0, cube.bindGroup);
  renderPass.setVertexBuffer(0, cube.vertexBuffer);
  renderPass.setIndexBuffer(cube.indexBuffer, 'uint32');
  renderPass.drawIndexed(cube.indexCount);
  renderPass.end();

  device.queue.submit([commandEncoder.finish()]);
}
