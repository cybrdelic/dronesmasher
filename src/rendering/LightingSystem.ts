/**
 * LightingSystem - Professional multi-light management
 * Supports cinematic three-point lighting and advanced setups
 */

import { Vec3 } from '../math/Vec3';

export enum LightType {
  DIRECTIONAL = 'directional',
  POINT = 'point',
  SPOT = 'spot',
}

export interface Light {
  type: LightType;
  position: Vec3; // For point/spot lights
  direction: Vec3; // For directional/spot lights
  color: Vec3;
  intensity: number;
  radius?: number; // For point lights
  spotAngle?: number; // For spot lights (in radians)
  castShadows?: boolean;
}

export interface LightingPreset {
  name: string;
  lights: Light[];
  ambient: Vec3;
  atmosphericDensity: number;
  atmosphericColor: Vec3;
}

// Cinematic lighting presets
export const LIGHTING_PRESETS: Record<string, LightingPreset> = {
  THREE_POINT: {
    name: 'Three-Point Studio',
    lights: [
      {
        type: LightType.DIRECTIONAL,
        position: Vec3.zero(),
        direction: new Vec3(0.5, -0.7, 0.3).normalize(),
        color: new Vec3(1.0, 0.95, 0.9), // Warm key light
        intensity: 1.5,
        castShadows: true,
      },
      {
        type: LightType.DIRECTIONAL,
        position: Vec3.zero(),
        direction: new Vec3(-0.7, -0.3, 0.5).normalize(),
        color: new Vec3(0.6, 0.7, 0.9), // Cool fill light
        intensity: 0.6,
        castShadows: false,
      },
      {
        type: LightType.DIRECTIONAL,
        position: Vec3.zero(),
        direction: new Vec3(0.0, 0.5, -1.0).normalize(),
        color: new Vec3(1.0, 1.0, 1.0), // Rim/back light
        intensity: 1.2,
        castShadows: false,
      },
    ],
    ambient: new Vec3(0.1, 0.12, 0.15),
    atmosphericDensity: 0.02,
    atmosphericColor: new Vec3(0.2, 0.3, 0.5),
  },

  GOLDEN_HOUR: {
    name: 'Golden Hour',
    lights: [
      {
        type: LightType.DIRECTIONAL,
        position: Vec3.zero(),
        direction: new Vec3(0.8, -0.3, 0.4).normalize(),
        color: new Vec3(1.0, 0.7, 0.4), // Warm sunset light
        intensity: 2.0,
        castShadows: true,
      },
      {
        type: LightType.DIRECTIONAL,
        position: Vec3.zero(),
        direction: new Vec3(-0.3, -0.5, -0.2).normalize(),
        color: new Vec3(0.4, 0.5, 0.8), // Blue sky bounce
        intensity: 0.4,
        castShadows: false,
      },
    ],
    ambient: new Vec3(0.2, 0.15, 0.12),
    atmosphericDensity: 0.08,
    atmosphericColor: new Vec3(1.0, 0.6, 0.3),
  },

  DRAMATIC_DARK: {
    name: 'Dramatic Dark',
    lights: [
      {
        type: LightType.DIRECTIONAL,
        position: Vec3.zero(),
        direction: new Vec3(0.3, -0.9, 0.2).normalize(),
        color: new Vec3(1.0, 0.95, 0.9),
        intensity: 2.5,
        castShadows: true,
      },
      {
        type: LightType.DIRECTIONAL,
        position: Vec3.zero(),
        direction: new Vec3(0.0, 0.3, -1.0).normalize(),
        color: new Vec3(0.3, 0.4, 0.6), // Subtle rim
        intensity: 0.8,
        castShadows: false,
      },
    ],
    ambient: new Vec3(0.02, 0.03, 0.04), // Very dark ambient
    atmosphericDensity: 0.15,
    atmosphericColor: new Vec3(0.1, 0.15, 0.25),
  },

  CYBERPUNK: {
    name: 'Cyberpunk Neon',
    lights: [
      {
        type: LightType.DIRECTIONAL,
        position: Vec3.zero(),
        direction: new Vec3(0.5, -0.6, 0.4).normalize(),
        color: new Vec3(0.0, 0.8, 1.0), // Cyan key
        intensity: 1.5,
        castShadows: true,
      },
      {
        type: LightType.DIRECTIONAL,
        position: Vec3.zero(),
        direction: new Vec3(-0.6, -0.4, 0.3).normalize(),
        color: new Vec3(1.0, 0.0, 0.5), // Magenta fill
        intensity: 1.2,
        castShadows: false,
      },
      {
        type: LightType.DIRECTIONAL,
        position: Vec3.zero(),
        direction: new Vec3(0.0, 0.5, -1.0).normalize(),
        color: new Vec3(0.8, 0.0, 1.0), // Purple rim
        intensity: 1.0,
        castShadows: false,
      },
    ],
    ambient: new Vec3(0.05, 0.02, 0.08),
    atmosphericDensity: 0.12,
    atmosphericColor: new Vec3(0.2, 0.0, 0.4),
  },

  MOONLIGHT: {
    name: 'Moonlight',
    lights: [
      {
        type: LightType.DIRECTIONAL,
        position: Vec3.zero(),
        direction: new Vec3(0.2, -0.8, 0.3).normalize(),
        color: new Vec3(0.6, 0.7, 1.0), // Cool moonlight
        intensity: 0.8,
        castShadows: true,
      },
    ],
    ambient: new Vec3(0.02, 0.025, 0.04),
    atmosphericDensity: 0.05,
    atmosphericColor: new Vec3(0.1, 0.15, 0.3),
  },
};

export class LightingSystem {
  private lights: Light[] = [];
  private ambient: Vec3 = new Vec3(0.1, 0.12, 0.15);
  private atmosphericDensity: number = 0.02;
  private atmosphericColor: Vec3 = new Vec3(0.2, 0.3, 0.5);

  constructor() {
    this.loadPreset('THREE_POINT');
  }

  loadPreset(presetName: string): void {
    const preset = LIGHTING_PRESETS[presetName];
    if (!preset) {
      throw new Error(`Unknown lighting preset: ${presetName}`);
    }

    this.lights = [...preset.lights];
    this.ambient = preset.ambient;
    this.atmosphericDensity = preset.atmosphericDensity;
    this.atmosphericColor = preset.atmosphericColor;
  }

  addLight(light: Light): void {
    this.lights.push(light);
  }

  removeLight(index: number): void {
    this.lights.splice(index, 1);
  }

  getLight(index: number): Light | undefined {
    return this.lights[index];
  }

  getAllLights(): Light[] {
    return [...this.lights];
  }

  getLightCount(): number {
    return this.lights.length;
  }

  setAmbient(color: Vec3): void {
    this.ambient = color;
  }

  getAmbient(): Vec3 {
    return this.ambient;
  }

  setAtmosphericDensity(density: number): void {
    this.atmosphericDensity = density;
  }

  getAtmosphericDensity(): number {
    return this.atmosphericDensity;
  }

  setAtmosphericColor(color: Vec3): void {
    this.atmosphericColor = color;
  }

  getAtmosphericColor(): Vec3 {
    return this.atmosphericColor;
  }

  /**
   * Pack lighting data into a Float32Array for GPU upload
   * Layout: [light0_dir, light0_color, light1_dir, light1_color, ...]
   */
  packLightingData(): Float32Array {
    const maxLights = 4; // Support up to 4 lights
    const floatsPerLight = 8; // 4 for direction+padding, 4 for color+intensity
    const data = new Float32Array(maxLights * floatsPerLight + 12); // +12 for ambient, atmospheric

    // Pack each light
    for (let i = 0; i < maxLights; i++) {
      const light = this.lights[i];
      const offset = i * floatsPerLight;

      if (light) {
        // Direction (or position for point lights)
        data[offset + 0] = light.direction.x;
        data[offset + 1] = light.direction.y;
        data[offset + 2] = light.direction.z;
        data[offset + 3] = light.type === LightType.POINT ? 1.0 : 0.0; // Type flag

        // Color and intensity
        data[offset + 4] = light.color.x * light.intensity;
        data[offset + 5] = light.color.y * light.intensity;
        data[offset + 6] = light.color.z * light.intensity;
        data[offset + 7] = light.intensity;
      } else {
        // Zero out unused light
        for (let j = 0; j < floatsPerLight; j++) {
          data[offset + j] = 0.0;
        }
      }
    }

    // Pack ambient and atmospheric at the end
    const envOffset = maxLights * floatsPerLight;
    data[envOffset + 0] = this.ambient.x;
    data[envOffset + 1] = this.ambient.y;
    data[envOffset + 2] = this.ambient.z;
    data[envOffset + 3] = 0.0; // Padding

    data[envOffset + 4] = this.atmosphericColor.x;
    data[envOffset + 5] = this.atmosphericColor.y;
    data[envOffset + 6] = this.atmosphericColor.z;
    data[envOffset + 7] = this.atmosphericDensity;

    data[envOffset + 8] = this.lights.length; // Active light count
    data[envOffset + 9] = 0.0; // Reserved
    data[envOffset + 10] = 0.0; // Reserved
    data[envOffset + 11] = 0.0; // Reserved

    return data;
  }
}
