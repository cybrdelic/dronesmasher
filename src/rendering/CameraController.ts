/**
 * Camera controller with mouse/keyboard input and cinematic modes
 */

import { Camera } from '../spatial/Camera';
import { Vec3 } from '../math/Vec3';

export enum CameraMode {
  FREE = 'free',           // Smooth orbital controls
  ORBIT = 'orbit',         // Locked orbit around target
  DRONE_FPV = 'drone_fpv', // First-person drone view
  CINEMATIC = 'cinematic', // Smooth cinematic fly-through
}

export interface CameraControllerOptions {
  camera: Camera;
  canvas: HTMLCanvasElement;
  mode?: CameraMode;
}

export class CameraController {
  private camera: Camera;
  private canvas: HTMLCanvasElement;
  private mode: CameraMode;

  // Mouse state
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private mouseSensitivity = 0.005;

  // Camera state
  private azimuth = 0;      // Horizontal angle
  private elevation = 0.5;   // Vertical angle (radians from horizontal)
  private distance = 8;      // Distance from target
  private target = Vec3.zero();

  // Smooth interpolation
  private targetAzimuth = 0;
  private targetElevation = 0.5;
  private targetDistance = 8;
  private smoothness = 0.1; // Lower = smoother (0.05 - 0.2)

  // Cinematic mode
  private cinematicTime = 0;
  private cinematicSpeed = 0.3;

  // Drone FPV mode
  private dronePitch = 0;
  private droneYaw = 0;
  private dronePosition = new Vec3(0, 2, 0);

  constructor(options: CameraControllerOptions) {
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.mode = options.mode ?? CameraMode.FREE;

    this.setupEventListeners();
    this.updateCameraFromState();
  }

  private setupEventListeners() {
    // Mouse drag for rotation
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mouseleave', this.onMouseUp);

    // Mouse wheel for zoom
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });

    // Keyboard for camera modes
    window.addEventListener('keydown', this.onKeyDown);

    // Prevent context menu on right-click
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onMouseDown = (e: MouseEvent) => {
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.canvas.style.cursor = 'grabbing';
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.lastMouseX;
    const deltaY = e.clientY - this.lastMouseY;

    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    if (this.mode === CameraMode.DRONE_FPV) {
      // FPV mode - direct look control
      this.droneYaw -= deltaX * this.mouseSensitivity;
      this.dronePitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1,
        this.dronePitch - deltaY * this.mouseSensitivity));
    } else {
      // Orbit modes
      if (e.shiftKey) {
        // Pan with shift+drag
        const panSpeed = this.distance * 0.001;
        const right = this.camera.getRight();
        const up = this.camera.getUp();

        const offset = right.mul(-deltaX * panSpeed).add(up.mul(deltaY * panSpeed));
        this.target = this.target.add(offset);
      } else {
        // Rotate
        this.targetAzimuth -= deltaX * this.mouseSensitivity;
        this.targetElevation = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1,
          this.targetElevation - deltaY * this.mouseSensitivity));
      }
    }
  };

  private onMouseUp = () => {
    this.isDragging = false;
    this.canvas.style.cursor = 'grab';
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();

    if (this.mode === CameraMode.DRONE_FPV) {
      // Move forward/backward in FPV mode
      const forward = this.camera.getForward();
      const delta = e.deltaY * -0.01;
      this.dronePosition = this.dronePosition.add(forward.mul(delta));
    } else {
      // Zoom in orbit modes
      const zoomSpeed = 0.1;
      this.targetDistance *= (1 + e.deltaY * zoomSpeed * 0.01);
      this.targetDistance = Math.max(1, Math.min(50, this.targetDistance));
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case '1':
        this.setMode(CameraMode.FREE);
        break;
      case '2':
        this.setMode(CameraMode.ORBIT);
        break;
      case '3':
        this.setMode(CameraMode.DRONE_FPV);
        break;
      case '4':
        this.setMode(CameraMode.CINEMATIC);
        break;
      case 'r':
      case 'R':
        this.resetCamera();
        break;
    }

    // WASD movement in FPV mode
    if (this.mode === CameraMode.DRONE_FPV) {
      const moveSpeed = 0.1;
      const forward = this.camera.getForward();
      const right = this.camera.getRight();

      switch (e.key.toLowerCase()) {
        case 'w':
          this.dronePosition = this.dronePosition.add(forward.mul(moveSpeed));
          break;
        case 's':
          this.dronePosition = this.dronePosition.add(forward.mul(-moveSpeed));
          break;
        case 'a':
          this.dronePosition = this.dronePosition.add(right.mul(-moveSpeed));
          break;
        case 'd':
          this.dronePosition = this.dronePosition.add(right.mul(moveSpeed));
          break;
        case 'q':
          this.dronePosition = this.dronePosition.add(Vec3.up().mul(moveSpeed));
          break;
        case 'e':
          this.dronePosition = this.dronePosition.add(Vec3.up().mul(-moveSpeed));
          break;
      }
    }
  };

  public setMode(mode: CameraMode) {
    this.mode = mode;
    console.log(`Camera mode: ${mode}`);

    // Reset cinematic animation
    if (mode === CameraMode.CINEMATIC) {
      this.cinematicTime = 0;
    }

    // Reset FPV position
    if (mode === CameraMode.DRONE_FPV) {
      this.dronePosition = new Vec3(0, 2, 5);
      this.dronePitch = 0;
      this.droneYaw = 0;
    }
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public resetCamera() {
    this.targetAzimuth = 0;
    this.targetElevation = 0.5;
    this.targetDistance = 8;
    this.target = Vec3.zero();
    this.azimuth = 0;
    this.elevation = 0.5;
    this.distance = 8;
  }

  public update(deltaTime: number) {
    // Smooth interpolation
    this.azimuth += (this.targetAzimuth - this.azimuth) * this.smoothness;
    this.elevation += (this.targetElevation - this.elevation) * this.smoothness;
    this.distance += (this.targetDistance - this.distance) * this.smoothness;

    switch (this.mode) {
      case CameraMode.FREE:
      case CameraMode.ORBIT:
        this.updateOrbitMode();
        break;
      case CameraMode.DRONE_FPV:
        this.updateFPVMode();
        break;
      case CameraMode.CINEMATIC:
        this.updateCinematicMode(deltaTime);
        break;
    }
  }

  private updateOrbitMode() {
    // Spherical to Cartesian
    const x = this.distance * Math.cos(this.elevation) * Math.sin(this.azimuth);
    const y = this.distance * Math.sin(this.elevation);
    const z = this.distance * Math.cos(this.elevation) * Math.cos(this.azimuth);

    const position = this.target.add(new Vec3(x, y, z));
    this.camera.lookAt(position, this.target, Vec3.up());
  }

  private updateFPVMode() {
    // Calculate look direction from pitch/yaw
    const forward = new Vec3(
      Math.cos(this.dronePitch) * Math.sin(this.droneYaw),
      Math.sin(this.dronePitch),
      Math.cos(this.dronePitch) * Math.cos(this.droneYaw)
    );

    const lookTarget = this.dronePosition.add(forward);
    this.camera.lookAt(this.dronePosition, lookTarget, Vec3.up());
  }

  private updateCinematicMode(deltaTime: number) {
    this.cinematicTime += deltaTime * this.cinematicSpeed;

    // Smooth circular motion with varying height
    const radius = 6;
    const x = radius * Math.cos(this.cinematicTime);
    const z = radius * Math.sin(this.cinematicTime);
    const y = 2 + Math.sin(this.cinematicTime * 0.5) * 2; // Gentle wave motion

    const position = new Vec3(x, y, z);
    const lookTarget = new Vec3(0, 0.5, 0); // Look slightly above center

    this.camera.lookAt(position, lookTarget, Vec3.up());
  }

  private updateCameraFromState() {
    this.updateOrbitMode();
  }

  public destroy() {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mouseleave', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
  }
}
