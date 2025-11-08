/**
 * Viewport3DCinematic - Houdini-level cinematic rendering
 * Clean, decoupled architecture with advanced rendering features
 */

import React, { useEffect, useRef, useState } from 'react';
import { WebGPUContext } from '../core/WebGPUContext';
import { Camera } from '../spatial/Camera';
import { CameraController, CameraMode } from '../rendering/CameraController';
import { CinematicSequence } from '../rendering/CinematicSequence';
import { LightingSystem, LIGHTING_PRESETS } from '../rendering/LightingSystem';
import { AtmosphericEffects, AtmosphericPreset } from '../rendering/AtmosphericEffects';
import { CinematicRenderer, AspectRatio, ColorGrade } from '../rendering/CinematicRenderer';
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

/**
 * Render systems - cleanly separated concerns
 */
interface RenderSystems {
  lighting: LightingSystem;
  atmosphere: AtmosphericEffects;
  cinematic: CinematicRenderer;
}

export const Viewport3DCinematic: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuContextRef = useRef<WebGPUContext | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const cameraControllerRef = useRef<CameraController | null>(null);
  const cinematicSequenceRef = useRef<CinematicSequence | null>(null);
  const cubeRef = useRef<CubeResources | null>(null);
  const renderSystemsRef = useRef<RenderSystems | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const rotationRef = useRef<number>(0);
  const isAnimatingRef = useRef<boolean>(true);

  // State
  const [status, setStatus] = useState<string>('Initializing...');
  const [isAnimating, setIsAnimating] = useState<boolean>(true);
  const [currentSequence, setCurrentSequence] = useState<string | null>(null);
  const [lightingPreset, setLightingPreset] = useState<string>('THREE_POINT');
  const [atmosphericPreset, setAtmosphericPreset] = useState<string>(AtmosphericPreset.HAZY);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.ANAMORPHIC);
  const [colorGrade, setColorGrade] = useState<ColorGrade>(ColorGrade.CINEMATIC);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (canvas.dataset.webgpuInitialized === 'true') {
      Logger.debug('Canvas already initialized, skipping');
      return;
    }

    canvas.dataset.webgpuInitialized = 'true';
    Logger.info('Initializing cinematic viewport...');

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

        // Initialize render systems (decoupled)
        const lighting = new LightingSystem();
        lighting.loadPreset('THREE_POINT');

        const atmosphere = new AtmosphericEffects();
        atmosphere.loadPreset(AtmosphericPreset.HAZY);

        const cinematic = new CinematicRenderer(canvas);
        cinematic.setAspectRatio(AspectRatio.ANAMORPHIC);
        cinematic.setColorGrading(ColorGrade.CINEMATIC);

        renderSystemsRef.current = { lighting, atmosphere, cinematic };

        // Create camera
        const camera = new Camera({
          fovDegrees: 45,
          aspect: canvas.width / canvas.height,
          near: 0.1,
          far: 100.0,
        });
        camera.lookAt(new Vec3(5, 4, 8), Vec3.zero(), Vec3.up());
        cameraRef.current = camera;

        lastFrameTimeRef.current = performance.now();

        // Create camera controller
        const controller = new CameraController({
          camera,
          canvas,
          mode: CameraMode.FREE,
        });
        cameraControllerRef.current = controller;

        // Setup event listeners
        setupEventListeners(canvas);

        // Create cube geometry
        cubeRef.current = await createCubeResources(gpuCtx);

        Logger.info('Cinematic viewport ready');
        setStatus('Ready - Cinematic Mode');

        // Start render loop
        render();
      } catch (error) {
        Logger.error('Failed to initialize cinematic viewport', error);
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
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        toggleAnimation();
      }

      // Number keys for sequences
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

    if (cinematicSequenceRef.current) {
      cinematicSequenceRef.current.stop();
    }

    const sequence = new CinematicSequence(camera, sequenceId);
    sequence.play();
    cinematicSequenceRef.current = sequence;
    setCurrentSequence(sequenceId);

    Logger.info(`Playing sequence: ${sequenceId}`);
  }

  function toggleAnimation() {
    setIsAnimating((prev) => {
      const newValue = !prev;
      isAnimatingRef.current = newValue;
      return newValue;
    });
  }

  function changeLightingPreset(preset: string) {
    renderSystemsRef.current?.lighting.loadPreset(preset);
    setLightingPreset(preset);
    Logger.info(`Lighting preset: ${preset}`);
  }

  function changeAtmosphericPreset(preset: string) {
    renderSystemsRef.current?.atmosphere.loadPreset(preset as AtmosphericPreset);
    setAtmosphericPreset(preset);
    Logger.info(`Atmospheric preset: ${preset}`);
  }

  function changeAspectRatio(ratio: AspectRatio) {
    renderSystemsRef.current?.cinematic.setAspectRatio(ratio);
    setAspectRatio(ratio);
    Logger.info(`Aspect ratio: ${ratio}`);
  }

  function changeColorGrade(grade: ColorGrade) {
    renderSystemsRef.current?.cinematic.setColorGrading(grade);
    setColorGrade(grade);
    Logger.info(`Color grade: ${grade}`);
  }

  function render() {
    const gpuCtx = gpuContextRef.current;
    const camera = cameraRef.current;
    const controller = cameraControllerRef.current;
    const cube = cubeRef.current;
    const sequence = cinematicSequenceRef.current;
    const systems = renderSystemsRef.current;

    if (!gpuCtx || !camera || !cube || !systems) {
      animationFrameRef.current = requestAnimationFrame(render);
      return;
    }

    const now = performance.now();
    let deltaTime = (now - lastFrameTimeRef.current) / 1000;
    deltaTime = Math.min(deltaTime, 0.1);
    lastFrameTimeRef.current = now;

    // Update cinematic sequence or controller
    if (sequence && sequence.isPlaying()) {
      sequence.update(deltaTime);
    } else if (controller) {
      controller.update(deltaTime);
    }

    // Update cube rotation
    if (isAnimatingRef.current) {
      rotationRef.current += deltaTime;
    }

    // Render frame using decoupled systems
    renderFrame(gpuCtx, camera, cube, rotationRef.current, systems, now);

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
              🎬 {currentSequence}
            </div>
          )}
        </div>

        {/* Advanced Cinematic Controls - will create separate component */}
        <div className="cinematic-controls-advanced">
          <div className="control-group">
            <label>Lighting:</label>
            <select value={lightingPreset} onChange={(e) => changeLightingPreset(e.target.value)}>
              {Object.keys(LIGHTING_PRESETS).map(key => (
                <option key={key} value={key}>{LIGHTING_PRESETS[key].name}</option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label>Atmosphere:</label>
            <select value={atmosphericPreset} onChange={(e) => changeAtmosphericPreset(e.target.value)}>
              {Object.values(AtmosphericPreset).map(preset => (
                <option key={preset} value={preset}>{preset.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label>Aspect Ratio:</label>
            <select value={aspectRatio} onChange={(e) => changeAspectRatio(e.target.value as AspectRatio)}>
              {Object.values(AspectRatio).map(ratio => (
                <option key={ratio} value={ratio}>{ratio}</option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label>Color Grade:</label>
            <select value={colorGrade} onChange={(e) => changeColorGrade(e.target.value as ColorGrade)}>
              {Object.values(ColorGrade).map(grade => (
                <option key={grade} value={grade}>{grade.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <button onClick={toggleAnimation}>
            {isAnimating ? '⏸ Pause' : '▶ Play'}
          </button>
        </div>
      </div>
    </div>
  );
};

//═══════════════════════════════════════════════════════════════════════════
// RESOURCE CREATION
//═══════════════════════════════════════════════════════════════════════════

async function createCubeResources(gpuCtx: WebGPUContext): Promise<CubeResources> {
  const device = gpuCtx.device;

  // Cube vertices with colors
  const vertices = new Float32Array([
    // Front (red)
    -1, -1, 1, 1, 0, 0,
    1, -1, 1, 1, 0, 0,
    1, 1, 1, 1, 0, 0,
    -1, 1, 1, 1, 0, 0,
    // Back (green)
    -1, -1, -1, 0, 1, 0,
    1, -1, -1, 0, 1, 0,
    1, 1, -1, 0, 1, 0,
    -1, 1, -1, 0, 1, 0,
    // Top (blue)
    -1, 1, -1, 0, 0, 1,
    1, 1, -1, 0, 0, 1,
    1, 1, 1, 0, 0, 1,
    -1, 1, 1, 0, 0, 1,
    // Bottom (yellow)
    -1, -1, -1, 1, 1, 0,
    1, -1, -1, 1, 1, 0,
    1, -1, 1, 1, 1, 0,
    -1, -1, 1, 1, 1, 0,
    // Right (magenta)
    1, -1, -1, 1, 0, 1,
    1, 1, -1, 1, 0, 1,
    1, 1, 1, 1, 0, 1,
    1, -1, 1, 1, 0, 1,
    // Left (cyan)
    -1, -1, -1, 0, 1, 1,
    -1, 1, -1, 0, 1, 1,
    -1, 1, 1, 0, 1, 1,
    -1, -1, 1, 0, 1, 1,
  ]);

  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3,       // Front
    4, 5, 6, 4, 6, 7,       // Back
    8, 9, 10, 8, 10, 11,    // Top
    12, 13, 14, 12, 14, 15, // Bottom
    16, 17, 18, 16, 18, 19, // Right
    20, 21, 22, 20, 22, 23, // Left
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

  // Uniform buffer for Houdini-level cinematic shader
  // 96 floats * 4 bytes = 384 bytes (WebGPU aligned)
  const uniformBuffer = device.createBuffer({
    size: 384,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Load Houdini-level cinematic shader
  Logger.info('Loading Houdini-level cinematic shader...');
  const shaderResponse = await fetch('/src/shaders/cinematic_houdini.wgsl');
  const shaderCode = await shaderResponse.text();
  Logger.info('Shader loaded, length:', shaderCode.length);

  const shaderModule = device.createShaderModule({ code: shaderCode });

  // Check for shader compilation errors
  const compilationInfo = await shaderModule.getCompilationInfo();
  if (compilationInfo.messages.length > 0) {
    for (const msg of compilationInfo.messages) {
      if (msg.type === 'error') {
        Logger.error(`Shader error at line ${msg.lineNum}: ${msg.message}`);
      } else if (msg.type === 'warning') {
        Logger.warn(`Shader warning at line ${msg.lineNum}: ${msg.message}`);
      }
    }
  }

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
      cullMode: 'none', // Disabled due to winding order issues
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

//═══════════════════════════════════════════════════════════════════════════
// RENDER FRAME - Integrates all systems
//═══════════════════════════════════════════════════════════════════════════

function renderFrame(
  gpuCtx: WebGPUContext,
  camera: Camera,
  cube: CubeResources,
  rotation: number,
  systems: RenderSystems,
  time: number
) {
  const device = gpuCtx.device;
  const context = gpuCtx.context!;

  // Calculate matrices
  const rotY = Mat4.rotationY(rotation);
  const rotX = Mat4.rotationX(rotation * 0.7);
  const model = rotY.mul(rotX);
  const view = camera.getViewMatrix();
  const projection = camera.getProjectionMatrix();
  const mvp = projection.mul(view).mul(model);
  const normalMatrix = model.inverse() ?? Mat4.identity();
  const cameraPos = camera.getPosition();

  // Pack uniforms for Houdini-level shader (96 floats = 384 bytes)
  const uniformData = new Float32Array(96);

  // Matrices (0-47)
  uniformData.set(mvp.toArray(), 0);              // 0-15: MVP matrix
  uniformData.set(model.toArray(), 16);           // 16-31: Model matrix
  uniformData.set(normalMatrix.toArray(), 32);    // 32-47: Normal matrix

  // Camera and time (48-51)
  uniformData.set([cameraPos.x, cameraPos.y, cameraPos.z], 48);
  uniformData[51] = time * 0.001;

  // Main light (52-60)
  const lights = systems.lighting.getAllLights();
  const mainLight = lights[0] || {
    direction: new Vec3(0.5, -0.7, 0.3).normalize(),
    color: new Vec3(1.2, 1.1, 1.0),
    intensity: 1.5,
  };
  uniformData.set([mainLight.direction.x, mainLight.direction.y, mainLight.direction.z], 52);
  uniformData[55] = 0; // padding
  uniformData.set([mainLight.color.x, mainLight.color.y, mainLight.color.z], 56);
  uniformData[59] = mainLight.intensity;

  // Environment (60-68)
  const ambient = systems.lighting.getAmbient();
  const atmosColor = systems.lighting.getAtmosphericColor();
  const atmosDensity = systems.lighting.getAtmosphericDensity();

  uniformData.set([ambient.x, ambient.y, ambient.z], 60);
  uniformData[63] = 0; // padding
  uniformData.set([atmosColor.x, atmosColor.y, atmosColor.z], 64);
  uniformData[67] = atmosDensity;

  // Cinematic settings (68-76)
  const cinematicSettings = systems.cinematic.getSettings();
  uniformData[68] = cinematicSettings.vignetteStrength;
  uniformData[69] = cinematicSettings.filmGrainStrength;
  uniformData[70] = cinematicSettings.chromaticAberration;
  uniformData[71] = cinematicSettings.depthOfField ? 1.0 : 0.0;
  uniformData[72] = cinematicSettings.focalDistance;
  uniformData[73] = cinematicSettings.aperture;
  uniformData[74] = systems.cinematic.getColorGradeId();
  uniformData[75] = 0; // padding

  // Volumetric settings (76-84)
  const volumetric = systems.atmosphere.getVolumetricSettings();
  uniformData[76] = volumetric.enabled ? 1.0 : 0.0;
  uniformData[77] = volumetric.density;
  uniformData[78] = volumetric.scattering;
  uniformData[79] = volumetric.lightShaftIntensity;
  uniformData[80] = volumetric.steps;
  uniformData.set([0, 0, 0], 81); // padding vec3

  // Fog settings (84-92)
  const fog = systems.atmosphere.getFogSettings();
  uniformData[84] = fog.enabled ? 1.0 : 0.0;
  uniformData[85] = fog.near;
  uniformData[86] = fog.far;
  uniformData[87] = fog.density;
  uniformData.set([fog.color.x, fog.color.y, fog.color.z], 88);
  uniformData[91] = fog.heightFalloff;

  // Letterbox (92-95)
  const letterbox = systems.cinematic.getLetterboxDimensions();
  const canvas = systems.cinematic.getCanvas();
  uniformData.set([
    letterbox.top / canvas.height,
    letterbox.bottom / canvas.height,
    letterbox.left / canvas.width,
    letterbox.right / canvas.width,
  ], 92);

  device.queue.writeBuffer(cube.uniformBuffer, 0, uniformData);

  // Render
  try {
    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.01, g: 0.01, b: 0.02, a: 1.0 },
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
  } catch (error) {
    Logger.error('Render error:', error);
  }
}
