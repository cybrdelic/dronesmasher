import React, { useEffect, useRef, useState } from 'react';
import { WebGPUContext } from '../core/WebGPUContext';
import { Camera } from '../spatial/Camera';
import { Vec3 } from '../math/Vec3';

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

        setStatus('Ready');

        // Start render loop
        render();
      } catch (error) {
        console.error('Failed to initialize WebGPU:', error);
        setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    function render() {
      if (!gpuCtx || !camera) return;

      // Get current canvas texture
      const texture = gpuCtx.getCurrentTexture();
      if (!texture) return;

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

      // Continue loop
      animationFrameId = requestAnimationFrame(render);
    }

    init();

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
    };

    window.addEventListener('resize', handleResize);
    handleResize();

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
