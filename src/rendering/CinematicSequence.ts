/**
 * Cinematic Camera Sequences - Movie trailer style camera movements
 * Dramatic, choreographed camera paths with easing and timing
 */

import { Camera } from '../spatial/Camera';
import { Vec3 } from '../math/Vec3';
import { Quat } from '../math/Quat';

export enum EasingType {
  LINEAR = 'linear',
  EASE_IN = 'easeIn',
  EASE_OUT = 'easeOut',
  EASE_IN_OUT = 'easeInOut',
  DRAMATIC = 'dramatic', // Sharp then slow
  ANTICIPATION = 'anticipation', // Slight pullback then push
}

export interface CameraKeyframe {
  time: number; // Seconds from sequence start
  position: Vec3;
  lookTarget: Vec3;
  fov?: number;
  easing?: EasingType;
}

export interface SequenceConfig {
  name: string;
  duration: number;
  keyframes: CameraKeyframe[];
  loop?: boolean;
}

// Predefined cinematic sequences
export const CINEMATIC_SEQUENCES: Record<string, SequenceConfig> = {
  HERO_REVEAL: {
    name: 'Hero Reveal',
    duration: 8.0,
    loop: false,
    keyframes: [
      {
        time: 0.0,
        position: new Vec3(0, 0.5, 15),
        lookTarget: Vec3.zero(),
        fov: 60,
        easing: EasingType.EASE_IN_OUT,
      },
      {
        time: 2.0,
        position: new Vec3(-8, 3, 8),
        lookTarget: new Vec3(0, 0.5, 0),
        fov: 45,
        easing: EasingType.DRAMATIC,
      },
      {
        time: 5.0,
        position: new Vec3(5, 2, 10),
        lookTarget: new Vec3(0, 0, 0),
        fov: 35,
        easing: EasingType.EASE_OUT,
      },
      {
        time: 8.0,
        position: new Vec3(0, 2, 8),
        lookTarget: Vec3.zero(),
        fov: 45,
        easing: EasingType.EASE_IN_OUT,
      },
    ],
  },

  DRAMATIC_ORBIT: {
    name: 'Dramatic Orbit',
    duration: 12.0,
    loop: true,
    keyframes: [
      {
        time: 0.0,
        position: new Vec3(10, 3, 0),
        lookTarget: new Vec3(0, 1, 0),
        fov: 50,
        easing: EasingType.EASE_IN_OUT,
      },
      {
        time: 3.0,
        position: new Vec3(0, 8, 10),
        lookTarget: new Vec3(0, 0, 0),
        fov: 40,
        easing: EasingType.DRAMATIC,
      },
      {
        time: 6.0,
        position: new Vec3(-10, 3, 0),
        lookTarget: new Vec3(0, 1, 0),
        fov: 50,
        easing: EasingType.EASE_IN_OUT,
      },
      {
        time: 9.0,
        position: new Vec3(0, 1, -10),
        lookTarget: new Vec3(0, 0.5, 0),
        fov: 45,
        easing: EasingType.EASE_IN_OUT,
      },
      {
        time: 12.0,
        position: new Vec3(10, 3, 0),
        lookTarget: new Vec3(0, 1, 0),
        fov: 50,
        easing: EasingType.EASE_IN_OUT,
      },
    ],
  },

  DOLLY_ZOOM: {
    name: 'Dolly Zoom (Vertigo Effect)',
    duration: 5.0,
    loop: false,
    keyframes: [
      {
        time: 0.0,
        position: new Vec3(0, 2, 15),
        lookTarget: Vec3.zero(),
        fov: 25, // Wide angle at distance
        easing: EasingType.EASE_IN_OUT,
      },
      {
        time: 2.5,
        position: new Vec3(0, 2, 8),
        lookTarget: Vec3.zero(),
        fov: 45, // Medium FOV at medium distance
        easing: EasingType.LINEAR,
      },
      {
        time: 5.0,
        position: new Vec3(0, 2, 4),
        lookTarget: Vec3.zero(),
        fov: 75, // Telephoto close up - keeps subject same size
        easing: EasingType.EASE_IN_OUT,
      },
    ],
  },

  FLY_THROUGH: {
    name: 'Dynamic Fly-Through',
    duration: 6.0,
    loop: false,
    keyframes: [
      {
        time: 0.0,
        position: new Vec3(-15, 5, -15),
        lookTarget: Vec3.zero(),
        fov: 60,
        easing: EasingType.EASE_IN,
      },
      {
        time: 2.0,
        position: new Vec3(-5, 3, -5),
        lookTarget: new Vec3(2, 0, 2),
        fov: 50,
        easing: EasingType.DRAMATIC,
      },
      {
        time: 4.0,
        position: new Vec3(3, 1, 3),
        lookTarget: new Vec3(0, 0.5, 0),
        fov: 40,
        easing: EasingType.EASE_OUT,
      },
      {
        time: 6.0,
        position: new Vec3(8, 2, 8),
        lookTarget: Vec3.zero(),
        fov: 45,
        easing: EasingType.EASE_IN_OUT,
      },
    ],
  },

  LOW_ANGLE_HERO: {
    name: 'Low Angle Hero Shot',
    duration: 5.0,
    loop: false,
    keyframes: [
      {
        time: 0.0,
        position: new Vec3(0, 0.3, 8),
        lookTarget: new Vec3(0, 2, 0),
        fov: 35,
        easing: EasingType.EASE_IN_OUT,
      },
      {
        time: 2.5,
        position: new Vec3(-3, 0.5, 6),
        lookTarget: new Vec3(0, 1.5, 0),
        fov: 40,
        easing: EasingType.DRAMATIC,
      },
      {
        time: 5.0,
        position: new Vec3(3, 0.8, 5),
        lookTarget: new Vec3(0, 1, 0),
        fov: 45,
        easing: EasingType.EASE_OUT,
      },
    ],
  },

  CRASH_ZOOM: {
    name: 'Crash Zoom (Intense)',
    duration: 1.5,
    loop: false,
    keyframes: [
      {
        time: 0.0,
        position: new Vec3(0, 2, 20),
        lookTarget: Vec3.zero(),
        fov: 40,
        easing: EasingType.EASE_IN,
      },
      {
        time: 1.5,
        position: new Vec3(0, 2, 4),
        lookTarget: Vec3.zero(),
        fov: 50,
        easing: EasingType.DRAMATIC,
      },
    ],
  },
};

export class CinematicSequence {
  private camera: Camera;
  private config: SequenceConfig;
  private currentTime: number = 0;
  private playing: boolean = false;
  private paused: boolean = false;

  constructor(camera: Camera, sequence: SequenceConfig | string) {
    this.camera = camera;

    if (typeof sequence === 'string') {
      this.config = CINEMATIC_SEQUENCES[sequence];
      if (!this.config) {
        throw new Error(`Unknown cinematic sequence: ${sequence}`);
      }
    } else {
      this.config = sequence;
    }
  }

  play(): void {
    this.playing = true;
    this.paused = false;
    this.currentTime = 0;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.playing = false;
    this.paused = false;
    this.currentTime = 0;
  }

  isPlaying(): boolean {
    return this.playing && !this.paused;
  }

  update(deltaTime: number): void {
    if (!this.playing || this.paused) return;

    this.currentTime += deltaTime;

    // Handle looping
    if (this.currentTime >= this.config.duration) {
      if (this.config.loop) {
        this.currentTime = this.currentTime % this.config.duration;
      } else {
        this.playing = false;
        return;
      }
    }

    // Find current keyframe pair
    const { keyframes } = this.config;
    let prevKeyframe = keyframes[0];
    let nextKeyframe = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (this.currentTime >= keyframes[i].time && this.currentTime < keyframes[i + 1].time) {
        prevKeyframe = keyframes[i];
        nextKeyframe = keyframes[i + 1];
        break;
      }
    }

    // Interpolate between keyframes
    const duration = nextKeyframe.time - prevKeyframe.time;
    const t = (this.currentTime - prevKeyframe.time) / duration;
    const easedT = this.applyEasing(t, prevKeyframe.easing ?? EasingType.LINEAR);

    // Interpolate position
    const position = this.lerpVec3(prevKeyframe.position, nextKeyframe.position, easedT);

    // Interpolate look target
    const lookTarget = this.lerpVec3(prevKeyframe.lookTarget, nextKeyframe.lookTarget, easedT);

    // Interpolate FOV
    if (prevKeyframe.fov !== undefined && nextKeyframe.fov !== undefined) {
      const fov = this.lerp(prevKeyframe.fov, nextKeyframe.fov, easedT);
      this.camera.setPerspective(
        fov,
        this.camera.getAspect(), // Maintain current aspect ratio
        this.camera.getNear(),
        this.camera.getFar()
      );
    }

    // Apply to camera
    this.camera.lookAt(position, lookTarget, Vec3.up());
  }

  private lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
    return new Vec3(
      this.lerp(a.x, b.x, t),
      this.lerp(a.y, b.y, t),
      this.lerp(a.z, b.z, t)
    );
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private applyEasing(t: number, easing: EasingType): number {
    switch (easing) {
      case EasingType.LINEAR:
        return t;

      case EasingType.EASE_IN:
        return t * t * t;

      case EasingType.EASE_OUT:
        return 1 - Math.pow(1 - t, 3);

      case EasingType.EASE_IN_OUT:
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      case EasingType.DRAMATIC:
        // Fast start, dramatic slow-down
        return 1 - Math.pow(1 - t, 4);

      case EasingType.ANTICIPATION:
        // Slight pullback then push forward
        const anticipation = -0.1;
        return t < 0.2
          ? anticipation * (t / 0.2)
          : anticipation + (1 - anticipation) * ((t - 0.2) / 0.8);

      default:
        return t;
    }
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getDuration(): number {
    return this.config.duration;
  }

  getProgress(): number {
    return this.currentTime / this.config.duration;
  }
}
