/**
 * CinematicRenderer - Professional film-like rendering with letterboxing
 * Handles aspect ratios, letterboxing, and film-quality post-processing
 */

export enum AspectRatio {
  STANDARD = '16:9',    // 1.778 - Standard HD
  WIDESCREEN = '1.85:1', // 1.85 - Theatrical widescreen
  ANAMORPHIC = '2.39:1', // 2.39 - Anamorphic scope (Cinemascope)
  IMAX = '1.90:1',      // 1.90 - IMAX
  SQUARE = '1:1',       // 1.0 - Square (Instagram)
  VERTICAL = '9:16',    // 0.5625 - Vertical (TikTok/Stories)
}

export interface CinematicSettings {
  aspectRatio: AspectRatio;
  letterboxOpacity: number; // 0-1
  vignetteStrength: number; // 0-1
  filmGrainStrength: number; // 0-1
  chromaticAberration: number; // 0-1
  depthOfField: boolean;
  focalDistance: number; // Distance to focus plane
  aperture: number; // 0.1-16 (f-stop)
  colorGrading: ColorGrade;
}

export enum ColorGrade {
  NEUTRAL = 'neutral',
  CINEMATIC = 'cinematic',      // Teal and orange
  VINTAGE = 'vintage',           // Faded film look
  NOIR = 'noir',                 // High contrast B&W
  BLEACH_BYPASS = 'bleachBypass', // Desaturated high contrast
  WARM = 'warm',                 // Golden warm tones
  COOL = 'cool',                 // Blue cool tones
  CYBERPUNK = 'cyberpunk',       // Neon saturation
}

export class CinematicRenderer {
  private settings: CinematicSettings;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.settings = {
      aspectRatio: AspectRatio.ANAMORPHIC,
      letterboxOpacity: 1.0,
      vignetteStrength: 0.6,
      filmGrainStrength: 0.15,
      chromaticAberration: 0.3,
      depthOfField: true,
      focalDistance: 8.0,
      aperture: 2.8, // Wide aperture for cinematic DOF
      colorGrading: ColorGrade.CINEMATIC,
    };
  }

  getSettings(): CinematicSettings {
    return { ...this.settings };
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  setAspectRatio(ratio: AspectRatio): void {
    this.settings.aspectRatio = ratio;
  }

  setLetterboxOpacity(opacity: number): void {
    this.settings.letterboxOpacity = Math.max(0, Math.min(1, opacity));
  }

  setVignetteStrength(strength: number): void {
    this.settings.vignetteStrength = Math.max(0, Math.min(1, strength));
  }

  setFilmGrainStrength(strength: number): void {
    this.settings.filmGrainStrength = Math.max(0, Math.min(1, strength));
  }

  setChromaticAberration(strength: number): void {
    this.settings.chromaticAberration = Math.max(0, Math.min(1, strength));
  }

  setDepthOfField(enabled: boolean): void {
    this.settings.depthOfField = enabled;
  }

  setFocalDistance(distance: number): void {
    this.settings.focalDistance = distance;
  }

  setAperture(aperture: number): void {
    this.settings.aperture = Math.max(0.1, Math.min(16, aperture));
  }

  setColorGrading(grade: ColorGrade): void {
    this.settings.colorGrading = grade;
  }

  /**
   * Get the numeric aspect ratio value
   */
  getAspectRatioValue(): number {
    switch (this.settings.aspectRatio) {
      case AspectRatio.STANDARD:
        return 16 / 9;
      case AspectRatio.WIDESCREEN:
        return 1.85;
      case AspectRatio.ANAMORPHIC:
        return 2.39;
      case AspectRatio.IMAX:
        return 1.90;
      case AspectRatio.SQUARE:
        return 1.0;
      case AspectRatio.VERTICAL:
        return 9 / 16;
      default:
        return 16 / 9;
    }
  }

  /**
   * Calculate letterbox dimensions
   * Returns { top, bottom, left, right } bars in pixels
   */
  getLetterboxDimensions(): { top: number; bottom: number; left: number; right: number } {
    const canvasRatio = this.canvas.width / this.canvas.height;
    const targetRatio = this.getAspectRatioValue();

    let top = 0;
    let bottom = 0;
    let left = 0;
    let right = 0;

    if (canvasRatio > targetRatio) {
      // Canvas is wider - add pillar boxes (left/right)
      const targetWidth = this.canvas.height * targetRatio;
      const barWidth = (this.canvas.width - targetWidth) / 2;
      left = barWidth;
      right = barWidth;
    } else {
      // Canvas is taller - add letter boxes (top/bottom)
      const targetHeight = this.canvas.width / targetRatio;
      const barHeight = (this.canvas.height - targetHeight) / 2;
      top = barHeight;
      bottom = barHeight;
    }

    return { top, bottom, left, right };
  }

  /**
   * Pack cinematic settings for GPU upload
   */
  packSettingsData(): Float32Array {
    const data = new Float32Array(16);

    data[0] = this.settings.vignetteStrength;
    data[1] = this.settings.filmGrainStrength;
    data[2] = this.settings.chromaticAberration;
    data[3] = this.settings.depthOfField ? 1.0 : 0.0;

    data[4] = this.settings.focalDistance;
    data[5] = this.settings.aperture;
    data[6] = this.getAspectRatioValue();
    data[7] = 0.0; // Padding

    // Color grading type (as numeric ID)
    data[8] = this.getColorGradeId();
    data[9] = 0.0; // Reserved
    data[10] = 0.0; // Reserved
    data[11] = 0.0; // Reserved

    // Letterbox dimensions (normalized 0-1)
    const letterbox = this.getLetterboxDimensions();
    data[12] = letterbox.top / this.canvas.height;
    data[13] = letterbox.bottom / this.canvas.height;
    data[14] = letterbox.left / this.canvas.width;
    data[15] = letterbox.right / this.canvas.width;

    return data;
  }

  getColorGradeId(): number {
    switch (this.settings.colorGrading) {
      case ColorGrade.NEUTRAL:
        return 0.0;
      case ColorGrade.CINEMATIC:
        return 1.0;
      case ColorGrade.VINTAGE:
        return 2.0;
      case ColorGrade.NOIR:
        return 3.0;
      case ColorGrade.BLEACH_BYPASS:
        return 4.0;
      case ColorGrade.WARM:
        return 5.0;
      case ColorGrade.COOL:
        return 6.0;
      case ColorGrade.CYBERPUNK:
        return 7.0;
      default:
        return 0.0;
    }
  }

  /**
   * Render letterbox bars on canvas (for UI overlay)
   */
  renderLetterboxOverlay(ctx: CanvasRenderingContext2D): void {
    const { top, bottom, left, right } = this.getLetterboxDimensions();
    const opacity = this.settings.letterboxOpacity;

    if (opacity <= 0) return;

    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;

    // Top bar
    if (top > 0) {
      ctx.fillRect(0, 0, this.canvas.width, top);
    }

    // Bottom bar
    if (bottom > 0) {
      ctx.fillRect(0, this.canvas.height - bottom, this.canvas.width, bottom);
    }

    // Left bar
    if (left > 0) {
      ctx.fillRect(0, 0, left, this.canvas.height);
    }

    // Right bar
    if (right > 0) {
      ctx.fillRect(this.canvas.width - right, 0, right, this.canvas.height);
    }
  }
}
