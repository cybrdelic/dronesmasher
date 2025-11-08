import React, { useEffect, useRef, useState } from 'react';
import { WebGPUContext } from '../core/WebGPUContext';
import { Camera } from '../spatial/Camera';
import { Vec3 } from '../math/Vec3';
import { Logger } from '../utils/Logger';
import { ErrorManager } from '../utils/ErrorManager';

export const Viewport3D: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string>('Initializing...');
  const [gpuContext, setGpuContext] = useState<WebGPUContext | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationFrameId: number;
    let gpuCtx: WebGPUContext;
    let camera: Camera;

    async function init() {
      try {
        // Initialize WebGPU
        Logger.info('Initializing WebGPU...');
        gpuCtx = await WebGPUContext.initialize({ canvas: canvas! });
        setGpuContext(gpuCtx);

        // Create camera
        camera = new Camera({
          fovDegrees: 45,
          aspect: canvas!.width / canvas!.height,
          near: 0.001,
          far: 10.0
        });

        camera.lookAt(
          new Vec3(0, 2, 5),
          new Vec3(0, 0, 0),
          Vec3.up()
        );

        Logger.info('WebGPU initialized successfully');
        setStatus('Ready');

        // Start render loop
        render();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        Logger.error('Failed to initialize WebGPU', error);
        ErrorManager.addError('runtime', 'WebGPU Initialization Failed', message);
        setStatus(`Error: ${message}`);
      }
    }

    function render() {
      if (!gpuCtx || !camera) return;

      try {
        // Get current canvas texture
        const texture = gpuCtx.getCurrentTexture();
        if (!texture) {
          animationFrameId = requestAnimationFrame(render);
          return;
        }

        // Create command encoder
        const encoder = gpuCtx.createCommandEncoder('frame');

        // Clear pass
        const renderPass = encoder.beginRenderPass({
          colorAttachments: [{
            view: texture.createView(),
            clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store'
          }]
        });

        renderPass.end();

        // Submit
        gpuCtx.device.queue.submit([encoder.finish()]);
      } catch (error) {
        // Log render errors but don't stop the loop
        Logger.error('Render error', error);
        if (error instanceof Error) {
          ErrorManager.addError('runtime', 'Render Loop Error', error.message);
        }
      }

      // Continue loop
      animationFrameId = requestAnimationFrame(render);
    }

    // Handle resize
    const handleResize = () => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      if (camera) {
        camera.setAspect(canvas.width / canvas.height);
      }

      // If context exists, reconfigure it
      if (gpuCtx?.context && gpuCtx.presentationFormat) {
        try {
          gpuCtx.context.configure({
            device: gpuCtx.device,
            format: gpuCtx.presentationFormat,
            alphaMode: 'premultiplied',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
          });
        } catch (error) {
          Logger.warn('Failed to reconfigure canvas on resize', error);
        }
      }
    };

    // Set initial size before WebGPU init
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    window.addEventListener('resize', handleResize);

    // Initialize WebGPU after canvas is sized
    init();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (gpuCtx) {
        gpuCtx.destroy();
      }
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
