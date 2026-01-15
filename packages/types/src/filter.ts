/**
 * Filter Types
 *
 * Defines the filter/effects API for actors.
 */

import type { Rectangle } from './canvas';

/**
 * Filter types available.
 */
export type FilterType =
  | 'blur'
  | 'brightness'
  | 'contrast'
  | 'saturate'
  | 'hue-rotate'
  | 'grayscale'
  | 'invert'
  | 'sepia'
  | 'noise'
  | 'pixelate'
  | 'glow'
  | 'vignette'
  | 'displacement'
  | 'color-matrix';

/**
 * Filter definition for chaining.
 */
export interface FilterDefinition {
  type: FilterType;
  params: Record<string, unknown>;
  region?: Rectangle;
}

/**
 * Color matrix (4x5 matrix for RGBA transformation).
 * Format: [r, g, b, a, offset] for each of R, G, B, A rows.
 */
export type ColorMatrix = [
  number, number, number, number, number, // R
  number, number, number, number, number, // G
  number, number, number, number, number, // B
  number, number, number, number, number  // A
];

/**
 * Filter API for applying effects to the canvas.
 */
export interface FilterAPI {
  // ============ Color Adjustments ============

  /**
   * Apply a color matrix transformation.
   * @param matrix - 4x5 color matrix
   * @param region - Optional region to apply to
   */
  colorMatrix(matrix: ColorMatrix, region?: Rectangle): void;

  /**
   * Adjust brightness.
   * @param amount - Brightness adjustment (-1 to 1, 0 = no change)
   * @param region - Optional region to apply to
   */
  brightness(amount: number, region?: Rectangle): void;

  /**
   * Adjust contrast.
   * @param amount - Contrast adjustment (0 = gray, 1 = normal, 2 = high)
   * @param region - Optional region to apply to
   */
  contrast(amount: number, region?: Rectangle): void;

  /**
   * Adjust saturation.
   * @param amount - Saturation (0 = grayscale, 1 = normal, 2 = vivid)
   * @param region - Optional region to apply to
   */
  saturate(amount: number, region?: Rectangle): void;

  /**
   * Rotate hue.
   * @param degrees - Hue rotation in degrees (0-360)
   * @param region - Optional region to apply to
   */
  hueRotate(degrees: number, region?: Rectangle): void;

  /**
   * Convert to grayscale.
   * @param amount - Grayscale amount (0 = color, 1 = full grayscale)
   * @param region - Optional region to apply to
   */
  grayscale(amount?: number, region?: Rectangle): void;

  /**
   * Invert colors.
   * @param amount - Invert amount (0 = normal, 1 = fully inverted)
   * @param region - Optional region to apply to
   */
  invert(amount?: number, region?: Rectangle): void;

  /**
   * Apply sepia tone.
   * @param amount - Sepia amount (0 = normal, 1 = full sepia)
   * @param region - Optional region to apply to
   */
  sepia(amount?: number, region?: Rectangle): void;

  // ============ Blur & Sharpen ============

  /**
   * Apply blur.
   * @param amount - Blur radius in pixels
   * @param region - Optional region to apply to
   */
  blur(amount: number, region?: Rectangle): void;

  /**
   * Apply gaussian blur.
   * @param strength - Blur strength (0-10)
   * @param quality - Blur quality passes (1-10)
   * @param region - Optional region to apply to
   */
  gaussianBlur(strength: number, quality?: number, region?: Rectangle): void;

  /**
   * Apply motion blur.
   * @param velocity - Blur velocity [x, y]
   * @param kernelSize - Blur kernel size
   * @param region - Optional region to apply to
   */
  motionBlur(velocity: [number, number], kernelSize?: number, region?: Rectangle): void;

  /**
   * Sharpen the image.
   * @param amount - Sharpen amount (0-1)
   * @param region - Optional region to apply to
   */
  sharpen(amount: number, region?: Rectangle): void;

  // ============ Effects ============

  /**
   * Apply noise/grain.
   * @param amount - Noise amount (0-1)
   * @param seed - Random seed for reproducibility
   * @param region - Optional region to apply to
   */
  noise(amount: number, seed?: number, region?: Rectangle): void;

  /**
   * Apply pixelation effect.
   *
   * **Performance:** Low cost. Safe to use every frame.
   *
   * @param size - Pixel size (larger = more pixelated)
   * @param region - Optional region to apply to
   */
  pixelate(size: number, region?: Rectangle): void;

  /**
   * Apply vignette effect (darkened edges).
   *
   * **Performance:** Low cost. Safe to use every frame.
   *
   * @param intensity - Vignette opacity (0-1)
   * @param softness - Edge softness (0-1, smaller = harder edge)
   */
  vignette(intensity: number, softness: number): void;

  /**
   * Apply glow effect.
   * @param color - Glow color
   * @param intensity - Glow intensity (0-1)
   * @param distance - Glow distance in pixels
   * @param region - Optional region to apply to
   */
  glow(color: string, intensity: number, distance?: number, region?: Rectangle): void;

  /**
   * Apply drop shadow.
   *
   * **Performance:** High cost (multi-pass blur). Use sparingly.
   * Prefer CSS shadows or pre-rendered shadow textures for many objects.
   *
   * @param color - Shadow color (hex or rgb string)
   * @param blur - Shadow blur radius (2-10 typical)
   * @param offsetX - X offset in pixels
   * @param offsetY - Y offset in pixels
   * @param region - Optional region to apply to
   */
  dropShadow(
    color: string,
    blur: number,
    offsetX: number,
    offsetY: number,
    region?: Rectangle
  ): void;

  /**
   * Apply displacement map.
   * @param map - Displacement map ImageData
   * @param scale - Displacement scale
   * @param region - Optional region to apply to
   */
  displace(map: ImageData, scale: number, region?: Rectangle): void;

  // ============ Distortion ============

  /**
   * Apply bulge/pinch distortion.
   *
   * **Performance:** Moderate cost. Avoid applying multiple times per frame.
   *
   * @param centerX - Center X (0-1 normalized)
   * @param centerY - Center Y (0-1 normalized)
   * @param radius - Effect radius (0-1 normalized)
   * @param strength - Strength (-1 = pinch, 0 = none, 1 = bulge)
   */
  bulge(centerX: number, centerY: number, radius: number, strength: number): void;

  /**
   * Apply twist distortion.
   *
   * **Performance:** Moderate cost. Avoid applying multiple times per frame.
   *
   * @param centerX - Center X (0-1 normalized)
   * @param centerY - Center Y (0-1 normalized)
   * @param radius - Effect radius (0-1 normalized)
   * @param angle - Twist angle in radians
   */
  twist(centerX: number, centerY: number, radius: number, angle: number): void;

  // ============ Compositing ============

  /**
   * Apply chromatic aberration (RGB channel splitting).
   *
   * **Performance:** Moderate cost. Common in glitch effects.
   *
   * @param offsetR - Red channel offset [x, y] in pixels
   * @param offsetB - Blue channel offset [x, y] in pixels
   */
  chromaticAberration(offsetR: [number, number], offsetB: [number, number]): void;

  // ============ Custom & Chaining ============

  /**
   * Apply custom shader (advanced).
   * @param fragmentShader - GLSL fragment shader code (main function should write to finalColor)
   * @param uniforms - Uniform values (number, vec2, vec3, vec4 as arrays)
   *
   * Built-in uniforms available in shader:
   * - uTexture: sampler2D - the input texture
   * - uTime: float - time in seconds
   * - uResolution: vec2 - canvas resolution
   * - vTextureCoord: vec2 - texture coordinates (0-1)
   *
   * @example
   * ```glsl
   * void main() {
   *   vec2 uv = vTextureCoord;
   *   vec4 color = texture(uTexture, uv);
   *   finalColor = color;
   * }
   * ```
   */
  customShader(fragmentShader: string, uniforms?: Record<string, unknown>): void;

  /**
   * Update uniforms for an existing custom shader.
   * @param uniforms - New uniform values
   */
  updateCustomShaderUniforms?(uniforms: Record<string, unknown>): void;

  /**
   * Chain multiple filters.
   * @param filters - Array of filter definitions
   */
  chain(...filters: FilterDefinition[]): void;

  /**
   * Remove all active filters.
   */
  clearFilters(): void;
}

// ============ Common Color Matrices ============

/**
 * Predefined color matrices for common effects.
 */
export const COLOR_MATRICES = {
  /** Identity matrix (no change) */
  identity: [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0,
  ] as ColorMatrix,

  /** Grayscale conversion */
  grayscale: [
    0.299, 0.587, 0.114, 0, 0,
    0.299, 0.587, 0.114, 0, 0,
    0.299, 0.587, 0.114, 0, 0,
    0, 0, 0, 1, 0,
  ] as ColorMatrix,

  /** Sepia tone */
  sepia: [
    0.393, 0.769, 0.189, 0, 0,
    0.349, 0.686, 0.168, 0, 0,
    0.272, 0.534, 0.131, 0, 0,
    0, 0, 0, 1, 0,
  ] as ColorMatrix,

  /** Invert colors */
  invert: [
    -1, 0, 0, 0, 255,
    0, -1, 0, 0, 255,
    0, 0, -1, 0, 255,
    0, 0, 0, 1, 0,
  ] as ColorMatrix,

  /** Polaroid-like effect */
  polaroid: [
    1.438, -0.062, -0.062, 0, 0,
    -0.122, 1.378, -0.122, 0, 0,
    -0.016, -0.016, 1.483, 0, 0,
    0, 0, 0, 1, 0,
  ] as ColorMatrix,

  /** Kodachrome-like effect */
  kodachrome: [
    1.128, -0.397, -0.040, 0, 63.72,
    -0.164, 1.084, -0.054, 0, 24.73,
    -0.167, -0.561, 1.601, 0, 35.62,
    0, 0, 0, 1, 0,
  ] as ColorMatrix,

  /** Vintage/retro effect */
  vintage: [
    0.628, 0.320, 0.052, 0, 0,
    0.026, 0.644, 0.330, 0, 0,
    0.047, 0.170, 0.783, 0, 0,
    0, 0, 0, 1, 0,
  ] as ColorMatrix,

  /** Night vision effect */
  nightVision: [
    0.1, 0.4, 0, 0, 0,
    0.3, 1, 0.3, 0, 0,
    0, 0.4, 0.1, 0, 0,
    0, 0, 0, 1, 0,
  ] as ColorMatrix,
} as const;
