import React, { useEffect, useRef, useState } from 'react';
import { WebGPUContext } from '../core/WebGPUContext';
import { Camera } from '../spatial/Camera';
import { Vec3 } from '../math/Vec3';
import { Logger } from '../utils/Logger';
import { ErrorManager } from '../utils/ErrorManager';

export const Viewport3D: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuContextRef = useRef<WebGPUContext | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const animationFrameRef = useRef<number | null>(null);
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

        // Mark canvas as initialized (prevents StrictMode double-init)
        canvas.dataset.webgpuInitialized = 'true';

        // Create camera
        const camera = new Camera({
          fovDegrees: 45,
          aspect: canvas.width / canvas.height,
          near: 0.001,
          far: 10.0
        });

        camera.lookAt(
          new Vec3(0, 2, 5),
          new Vec3(0, 0, 0),
          Vec3.up()
        );
        cameraRef.current = camera;

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
      const gpuCtx = gpuContextRef.current;
      const camera = cameraRef.current;

      if (!gpuCtx || !camera) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      try {
        // Get current canvas texture
        const texture = gpuCtx.getCurrentTexture();
        if (!texture) {
          animationFrameRef.current = requestAnimationFrame(render);
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
