/**
 * AtmosphericEffects - Volumetric lighting, fog, and atmosphere
 * Creates depth and cinematic mood through atmospheric scattering
 */

import { Vec3 } from '../math/Vec3';

export interface VolumetricSettings {
  enabled: boolean;
  density: number; // 0-1
  scattering: number; // 0-1
  lightShaftIntensity: number; // 0-2
  steps: number; // Ray marching steps (8-32)
}

export interface FogSettings {
  enabled: boolean;
  color: Vec3;
  near: number; // Start distance
  far: number; // End distance
  density: number; // Exponential fog density
  heightFalloff: number; // Vertical fog density falloff
}

export enum AtmosphericPreset {
  CLEAR = 'clear',
  HAZY = 'hazy',
  FOGGY = 'foggy',
  DUSTY = 'dusty',
  STORMY = 'stormy',
  ETHEREAL = 'ethereal',
}

const ATMOSPHERIC_PRESETS: Record<AtmosphericPreset, { volumetric: VolumetricSettings; fog: FogSettings }> = {
  [AtmosphericPreset.CLEAR]: {
    volumetric: {
      enabled: true,
      density: 0.02,
      scattering: 0.1,
      lightShaftIntensity: 0.3,
      steps: 12,
    },
    fog: {
      enabled: false,
      color: new Vec3(0.6, 0.7, 0.8),
      near: 50,
      far: 100,
      density: 0.01,
      heightFalloff: 0.05,
    },
  },

  [AtmosphericPreset.HAZY]: {
    volumetric: {
      enabled: true,
      density: 0.08,
      scattering: 0.3,
      lightShaftIntensity: 0.8,
      steps: 16,
    },
    fog: {
      enabled: true,
      color: new Vec3(0.7, 0.75, 0.8),
      near: 10,
      far: 40,
      density: 0.05,
      heightFalloff: 0.03,
    },
  },

  [AtmosphericPreset.FOGGY]: {
    volumetric: {
      enabled: true,
      density: 0.15,
      scattering: 0.5,
      lightShaftIntensity: 1.2,
      steps: 20,
    },
    fog: {
      enabled: true,
      color: new Vec3(0.6, 0.65, 0.7),
      near: 5,
      far: 25,
      density: 0.15,
      heightFalloff: 0.02,
    },
  },

  [AtmosphericPreset.DUSTY]: {
    volumetric: {
      enabled: true,
      density: 0.12,
      scattering: 0.6,
      lightShaftIntensity: 1.5,
      steps: 24,
    },
    fog: {
      enabled: true,
      color: new Vec3(0.8, 0.7, 0.5),
      near: 8,
      far: 30,
      density: 0.10,
      heightFalloff: 0.08,
    },
  },

  [AtmosphericPreset.STORMY]: {
    volumetric: {
      enabled: true,
      density: 0.20,
      scattering: 0.4,
      lightShaftIntensity: 0.6,
      steps: 16,
    },
    fog: {
      enabled: true,
      color: new Vec3(0.3, 0.35, 0.4),
      near: 3,
      far: 20,
      density: 0.20,
      heightFalloff: 0.01,
    },
  },

  [AtmosphericPreset.ETHEREAL]: {
    volumetric: {
      enabled: true,
      density: 0.10,
      scattering: 0.8,
      lightShaftIntensity: 2.0,
      steps: 32,
    },
    fog: {
      enabled: true,
      color: new Vec3(0.5, 0.6, 0.8),
      near: 5,
      far: 35,
      density: 0.08,
      heightFalloff: 0.15,
    },
  },
};

export class AtmosphericEffects {
  private volumetric: VolumetricSettings;
  private fog: FogSettings;

  constructor() {
    // Start with clear atmosphere
    const preset = ATMOSPHERIC_PRESETS[AtmosphericPreset.CLEAR];
    this.volumetric = { ...preset.volumetric };
    this.fog = { ...preset.fog };
  }

  loadPreset(preset: AtmosphericPreset): void {
    const config = ATMOSPHERIC_PRESETS[preset];
    if (!config) {
      throw new Error(`Unknown atmospheric preset: ${preset}`);
    }

    this.volumetric = { ...config.volumetric };
    this.fog = { ...config.fog };
  }

  // Volumetric lighting controls
  setVolumetricEnabled(enabled: boolean): void {
    this.volumetric.enabled = enabled;
  }

  setVolumetricDensity(density: number): void {
    this.volumetric.density = Math.max(0, Math.min(1, density));
  }

  setVolumetricScattering(scattering: number): void {
    this.volumetric.scattering = Math.max(0, Math.min(1, scattering));
  }

  setLightShaftIntensity(intensity: number): void {
    this.volumetric.lightShaftIntensity = Math.max(0, Math.min(2, intensity));
  }

  setVolumetricSteps(steps: number): void {
    this.volumetric.steps = Math.max(8, Math.min(32, steps));
  }

  getVolumetricSettings(): VolumetricSettings {
    return { ...this.volumetric };
  }

  // Fog controls
  setFogEnabled(enabled: boolean): void {
    this.fog.enabled = enabled;
  }

  setFogColor(color: Vec3): void {
    this.fog.color = color;
  }

  setFogRange(near: number, far: number): void {
    this.fog.near = near;
    this.fog.far = far;
  }

  setFogDensity(density: number): void {
    this.fog.density = Math.max(0, density);
  }

  setFogHeightFalloff(falloff: number): void {
    this.fog.heightFalloff = Math.max(0, falloff);
  }

  getFogSettings(): FogSettings {
    return { ...this.fog };
  }

  /**
   * Pack atmospheric data for GPU upload
   */
  packAtmosphericData(): Float32Array {
    const data = new Float32Array(16);

    // Volumetric settings (0-7)
    data[0] = this.volumetric.enabled ? 1.0 : 0.0;
    data[1] = this.volumetric.density;
    data[2] = this.volumetric.scattering;
    data[3] = this.volumetric.lightShaftIntensity;
    data[4] = this.volumetric.steps;
    data[5] = 0.0; // Reserved
    data[6] = 0.0; // Reserved
    data[7] = 0.0; // Reserved

    // Fog settings (8-15)
    data[8] = this.fog.enabled ? 1.0 : 0.0;
    data[9] = this.fog.color.x;
    data[10] = this.fog.color.y;
    data[11] = this.fog.color.z;
    data[12] = this.fog.near;
    data[13] = this.fog.far;
    data[14] = this.fog.density;
    data[15] = this.fog.heightFalloff;

    return data;
  }
}
