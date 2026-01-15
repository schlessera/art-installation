/**
 * FilterAPI Implementation
 *
 * Implements the FilterAPI interface using Pixi.js filters.
 */

import {
  Container,
  BlurFilter,
  ColorMatrixFilter,
  NoiseFilter,
  DisplacementFilter,
  Sprite,
  Texture,
  Filter,
  GlProgram,
} from 'pixi.js';
import { PixelateFilter } from 'pixi-filters/pixelate';
import { DropShadowFilter } from 'pixi-filters/drop-shadow';
import { BulgePinchFilter } from 'pixi-filters/bulge-pinch';
import { TwistFilter } from 'pixi-filters/twist';
import { RGBSplitFilter } from 'pixi-filters/rgb-split';
import { OldFilmFilter } from 'pixi-filters/old-film';
import type { FilterAPI, ColorMatrix, Rectangle, FilterDefinition } from '@art/types';
import type { CanvasManager, Layer } from '../engine/CanvasManager';

/**
 * Parse color string to RGB values.
 */
function parseColorToRGB(color: string): { r: number; g: number; b: number } {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    return {
      r: parseInt(hex.substring(0, 2), 16) / 255,
      g: parseInt(hex.substring(2, 4), 16) / 255,
      b: parseInt(hex.substring(4, 6), 16) / 255,
    };
  }

  // Handle rgb/rgba
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]) / 255,
      g: parseInt(rgbMatch[2]) / 255,
      b: parseInt(rgbMatch[3]) / 255,
    };
  }

  return { r: 1, g: 1, b: 1 };
}

/**
 * Implementation of FilterAPI using Pixi.js filters.
 */
export class FilterAPIImpl implements FilterAPI {
  private _canvasManager: CanvasManager;
  private _layer: Layer;
  private container: Container;
  private activeFilters: Map<string, unknown> = new Map();
  // Support multiple custom shaders by caching each unique shader code
  private customShaderCache: Map<string, { code: string; filter: Filter }> = new Map();
  // Track failed shaders to avoid retrying compilation
  private failedShaders: Set<string> = new Set();

  constructor(canvasManager: CanvasManager, layer: Layer, container?: Container) {
    this._canvasManager = canvasManager;
    this._layer = layer;
    // Use provided container or get from layer
    this.container = container ?? canvasManager.getLayer(layer);
  }

  // ============ Color Adjustments ============

  colorMatrix(matrix: ColorMatrix, _region?: Rectangle): void {
    const filter = new ColorMatrixFilter();
    // ColorMatrixFilter uses a 5x4 matrix in Pixi.js v8
    // Cast through unknown to bypass strict type checking
    (filter as unknown as { matrix: number[] }).matrix = [...matrix];
    this.applyFilter(filter, 'colorMatrix');
  }

  brightness(amount: number, _region?: Rectangle): void {
    const filter = new ColorMatrixFilter();
    filter.brightness(1 + amount, false);
    this.applyFilter(filter, 'brightness');
  }

  contrast(amount: number, _region?: Rectangle): void {
    const filter = new ColorMatrixFilter();
    filter.contrast(amount, false);
    this.applyFilter(filter, 'contrast');
  }

  saturate(amount: number, _region?: Rectangle): void {
    const filter = new ColorMatrixFilter();
    filter.saturate(amount, false);
    this.applyFilter(filter, 'saturate');
  }

  hueRotate(degrees: number, _region?: Rectangle): void {
    const filter = new ColorMatrixFilter();
    filter.hue(degrees, false);
    this.applyFilter(filter, 'hueRotate');
  }

  grayscale(amount = 1, _region?: Rectangle): void {
    const filter = new ColorMatrixFilter();
    filter.greyscale(amount, false);
    this.applyFilter(filter, 'grayscale');
  }

  invert(amount = 1, _region?: Rectangle): void {
    const filter = new ColorMatrixFilter();
    filter.negative(amount < 1);
    this.applyFilter(filter, 'invert');
  }

  sepia(amount = 1, _region?: Rectangle): void {
    const filter = new ColorMatrixFilter();
    filter.sepia(amount < 1);
    this.applyFilter(filter, 'sepia');
  }

  // ============ Blur & Sharpen ============

  blur(amount: number, _region?: Rectangle): void {
    const filter = new BlurFilter({
      strength: amount,
      quality: 4,
    });
    this.applyFilter(filter, 'blur');
  }

  gaussianBlur(strength: number, quality = 4, _region?: Rectangle): void {
    const filter = new BlurFilter({
      strength,
      quality,
    });
    this.applyFilter(filter, 'gaussianBlur');
  }

  motionBlur(velocity: [number, number], kernelSize = 9, _region?: Rectangle): void {
    // Motion blur requires a custom shader or filter
    // Using directional blur approximation with blur filter
    const filter = new BlurFilter({
      strength: Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2),
      quality: Math.ceil(kernelSize / 3),
    });
    this.applyFilter(filter, 'motionBlur');
  }

  sharpen(_amount: number, _region?: Rectangle): void {
    // Sharpen is implemented via convolution or unsharp mask
    // Using a color matrix approximation
    const filter = new ColorMatrixFilter();
    // Sharpen matrix approximation
    filter.matrix = [
      1.5, -0.25, 0, 0, 0,
      -0.25, 1.5, -0.25, 0, 0,
      0, -0.25, 1.5, 0, 0,
      0, 0, 0, 1, 0,
    ];
    this.applyFilter(filter, 'sharpen');
  }

  // ============ Effects ============

  noise(amount: number, seed?: number, _region?: Rectangle): void {
    const filter = new NoiseFilter({
      noise: amount,
      seed: seed ?? Math.random() * 1000,
    });
    this.applyFilter(filter, 'noise');
  }

  pixelate(size: number, _region?: Rectangle): void {
    const filter = new PixelateFilter(size);
    this.applyFilter(filter, 'pixelate');
  }

  vignette(intensity: number, softness: number): void {
    // Use OldFilmFilter with only vignette enabled (disable other effects)
    const filter = new OldFilmFilter({
      sepia: 0,
      noise: 0,
      scratch: 0,
      scratchDensity: 0,
      vignetting: softness,
      vignettingAlpha: intensity,
      vignettingBlur: softness * 0.3,
    });
    this.applyFilter(filter, 'vignette');
  }

  glow(color: string, intensity: number, distance = 10, _region?: Rectangle): void {
    // Glow effect using blur and color blend
    // This is a simplified version
    const rgb = parseColorToRGB(color);
    const filter = new ColorMatrixFilter();
    // Add slight color tint for glow effect
    filter.matrix = [
      1 + intensity * rgb.r * 0.5, 0, 0, 0, intensity * rgb.r * 50,
      0, 1 + intensity * rgb.g * 0.5, 0, 0, intensity * rgb.g * 50,
      0, 0, 1 + intensity * rgb.b * 0.5, 0, intensity * rgb.b * 50,
      0, 0, 0, 1, 0,
    ];
    this.applyFilter(filter, 'glow');

    // Add blur for soft glow
    const blurFilter = new BlurFilter({
      strength: distance * intensity,
      quality: 2,
    });
    this.applyFilter(blurFilter, 'glowBlur');
  }

  dropShadow(
    color: string,
    blur: number,
    offsetX: number,
    offsetY: number,
    _region?: Rectangle
  ): void {
    const rgb = parseColorToRGB(color);
    const colorValue = ((rgb.r * 255) << 16) | ((rgb.g * 255) << 8) | (rgb.b * 255);

    const filter = new DropShadowFilter({
      color: colorValue,
      alpha: 1,
      blur,
      offset: { x: offsetX, y: offsetY },
      quality: 3,
    });
    this.applyFilter(filter, 'dropShadow');
  }

  displace(map: ImageData, scale: number, _region?: Rectangle): void {
    // Clean up previous displacement resources if any
    const existingFilter = this.activeFilters.get('displace') as (DisplacementFilter & { sprite?: Sprite }) | undefined;
    if (existingFilter) {
      existingFilter.sprite?.destroy({ texture: true, textureSource: true });
      existingFilter.destroy();
    }

    // Create texture from ImageData
    const canvas = document.createElement('canvas');
    canvas.width = map.width;
    canvas.height = map.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.putImageData(map, 0, 0);
    const texture = Texture.from(canvas);
    const sprite = new Sprite(texture);

    const filter = new DisplacementFilter({
      sprite,
      scale: { x: scale, y: scale },
    });
    this.applyFilter(filter, 'displace');
  }

  // ============ Distortion ============

  bulge(centerX: number, centerY: number, radius: number, strength: number): void {
    const { width, height } = this._canvasManager.getSize();

    // BulgePinchFilter uses normalized center (0-1) and pixel radius
    const filter = new BulgePinchFilter({
      center: { x: centerX, y: centerY },
      radius: radius * Math.min(width, height),
      strength,
    });
    this.applyFilter(filter, 'bulge');
  }

  twist(centerX: number, centerY: number, radius: number, angle: number): void {
    const { width, height } = this._canvasManager.getSize();

    // TwistFilter uses pixel offset and radius
    const filter = new TwistFilter({
      offset: { x: centerX * width, y: centerY * height },
      radius: radius * Math.min(width, height),
      angle,
    });
    this.applyFilter(filter, 'twist');
  }

  // ============ Compositing ============

  chromaticAberration(offsetR: [number, number], offsetB: [number, number]): void {
    // RGBSplitFilter separates all three channels
    // Green stays at origin, red and blue get offset
    const filter = new RGBSplitFilter({
      red: { x: offsetR[0], y: offsetR[1] },
      green: { x: 0, y: 0 },
      blue: { x: offsetB[0], y: offsetB[1] },
    });
    this.applyFilter(filter, 'chromaticAberration');
  }

  // ============ Custom & Chaining ============

  customShader(fragmentShader: string, uniforms?: Record<string, unknown>): void {
    // Generate a unique key for this shader based on its code
    // Simple hash: use first 100 chars + length to create reasonably unique key
    const shaderKey = `customShader_${fragmentShader.length}_${this.simpleHash(fragmentShader)}`;

    // Skip shaders that previously failed to compile
    if (this.failedShaders.has(shaderKey)) {
      return;
    }

    // Check if we can reuse cached shader (same code)
    const cached = this.customShaderCache.get(shaderKey);
    if (cached && cached.code === fragmentShader) {
      // Re-add to active filters if cleared (e.g., by clearFiltersPreserveCache)
      if (!this.activeFilters.has(shaderKey)) {
        this.activeFilters.set(shaderKey, cached.filter);
        this.updateContainerFilters();
      }
      // Reuse existing shader, update uniforms
      this.updateCustomShaderUniformsForKey(shaderKey, uniforms || {});
      return;
    }

    // Default vertex shader for full-screen filters
    const defaultVertex = `
      in vec2 aPosition;
      out vec2 vTextureCoord;

      uniform vec4 uInputSize;
      uniform vec4 uOutputFrame;
      uniform vec4 uOutputTexture;

      vec4 filterVertexPosition(void) {
        vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
        position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
        position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
        return vec4(position, 0.0, 1.0);
      }

      vec2 filterTextureCoord(void) {
        return aPosition * (uOutputFrame.zw * uInputSize.zw);
      }

      void main(void) {
        gl_Position = filterVertexPosition();
        vTextureCoord = filterTextureCoord();
      }
    `;

    // Wrap user's fragment shader with required Pixi.js boilerplate
    const wrappedFragment = `
      in vec2 vTextureCoord;
      out vec4 finalColor;

      uniform sampler2D uTexture;
      uniform vec4 uInputSize;
      uniform float uTime;
      uniform vec2 uResolution;
      ${uniforms ? Object.entries(uniforms).map(([name, value]) => {
        if (typeof value === 'number') return `uniform float ${name};`;
        if (Array.isArray(value) && value.length === 2) return `uniform vec2 ${name};`;
        if (Array.isArray(value) && value.length === 3) return `uniform vec3 ${name};`;
        if (Array.isArray(value) && value.length === 4) return `uniform vec4 ${name};`;
        return '';
      }).join('\n') : ''}

      ${fragmentShader}
    `;

    try {
      // Build resources object for uniforms
      const resources: Record<string, unknown> = {
        customUniforms: {
          uTime: { value: performance.now() / 1000, type: 'f32' },
          uResolution: { value: [this._canvasManager.getSize().width, this._canvasManager.getSize().height], type: 'vec2<f32>' },
        },
      };

      // Add user-provided uniforms
      if (uniforms) {
        const customUniformsObj = resources.customUniforms as Record<string, unknown>;
        for (const [name, value] of Object.entries(uniforms)) {
          if (typeof value === 'number') {
            customUniformsObj[name] = { value, type: 'f32' };
          } else if (Array.isArray(value)) {
            if (value.length === 2) {
              customUniformsObj[name] = { value, type: 'vec2<f32>' };
            } else if (value.length === 3) {
              customUniformsObj[name] = { value, type: 'vec3<f32>' };
            } else if (value.length === 4) {
              customUniformsObj[name] = { value, type: 'vec4<f32>' };
            }
          }
        }
      }

      const filter = new Filter({
        glProgram: new GlProgram({
          vertex: defaultVertex,
          fragment: wrappedFragment,
        }),
        resources,
      });

      // Cache the shader with its unique key
      this.customShaderCache.set(shaderKey, { code: fragmentShader, filter });

      this.applyFilter(filter, shaderKey);
    } catch (error) {
      console.error('[FilterAPI] Failed to compile custom shader:', error);
      // Mark this shader as failed to prevent retry loops
      this.failedShaders.add(shaderKey);
    }
  }

  /**
   * Simple hash function for shader code to generate unique keys.
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Update uniforms for a custom shader by key.
   */
  private updateCustomShaderUniformsForKey(shaderKey: string, uniforms: Record<string, unknown>): void {
    const filter = this.activeFilters.get(shaderKey) as Filter | undefined;
    if (!filter) {
      return;
    }

    // Update time uniform
    const customUniforms = (filter.resources as Record<string, unknown>).customUniforms as Record<string, { value: unknown }>;
    if (customUniforms.uTime) {
      customUniforms.uTime.value = performance.now() / 1000;
    }

    // Update user uniforms
    for (const [name, value] of Object.entries(uniforms)) {
      if (customUniforms[name]) {
        customUniforms[name].value = value;
      }
    }
  }

  /**
   * Update uniforms for an existing custom shader (legacy method for compatibility).
   */
  updateCustomShaderUniforms(uniforms: Record<string, unknown>): void {
    // Find first custom shader in active filters
    for (const [key, filter] of this.activeFilters.entries()) {
      if (key.startsWith('customShader_')) {
        this.updateCustomShaderUniformsForKey(key, uniforms);
        return;
      }
    }
    console.warn('[FilterAPI] No custom shader to update');
  }

  /**
   * Legacy method - keeping for compatibility but now handled internally.
   */
  private updateCustomShaderUniformsLegacy(uniforms: Record<string, unknown>): void {
    const filter = this.activeFilters.get('customShader') as Filter | undefined;
    if (!filter) {
      console.warn('[FilterAPI] No custom shader to update');
      return;
    }

    try {
      // Access the uniforms through the filter's resources
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resources = filter.resources as any;
      if (resources.customUniforms) {
        for (const [name, value] of Object.entries(uniforms)) {
          if (resources.customUniforms[name]) {
            resources.customUniforms[name].value = value;
          }
        }
        // Update time uniform
        if (resources.customUniforms.uTime) {
          resources.customUniforms.uTime.value = performance.now() / 1000;
        }
      }
    } catch (error) {
      console.error('[FilterAPI] Failed to update custom shader uniforms:', error);
    }
  }

  chain(...filters: FilterDefinition[]): void {
    for (const filterDef of filters) {
      this.applyFilterDefinition(filterDef);
    }
  }

  clearFilters(): void {
    // Destroy all filters to release GPU resources
    for (const filter of this.activeFilters.values()) {
      const f = filter as import('pixi.js').Filter & { sprite?: Sprite };
      // Handle displacement filter sprite cleanup
      if (f.sprite) {
        f.sprite.destroy({ texture: true, textureSource: true });
      }
      f.destroy?.();
    }
    this.container.filters = [];
    this.activeFilters.clear();
    // Clear all custom shader caches
    this.customShaderCache.clear();
  }

  /**
   * Clear filters for new frame, but preserve custom shader cache for reuse.
   * Used by ActorContainerManager at frame boundaries to avoid shader recompilation.
   */
  clearFiltersPreserveCache(): void {
    // Remove filters from container but don't destroy custom shaders (they'll be reused)
    for (const [key, filter] of this.activeFilters.entries()) {
      // Don't destroy custom shaders - they're cached and will be reused
      if (key.startsWith('customShader_')) {
        continue;
      }
      const f = filter as import('pixi.js').Filter & { sprite?: Sprite };
      // Handle displacement filter sprite cleanup
      if (f.sprite) {
        f.sprite.destroy({ texture: true, textureSource: true });
      }
      f.destroy?.();
    }
    this.container.filters = [];
    this.activeFilters.clear();
    // NOTE: Do NOT clear customShaderCache - shaders will be reused
  }

  // ============ Helper Methods ============

  private applyFilter(filter: unknown, key: string): void {
    // Destroy existing filter with same key to prevent memory leak
    const existing = this.activeFilters.get(key) as import('pixi.js').Filter | undefined;
    if (existing) {
      existing.destroy?.();
    }
    this.activeFilters.set(key, filter);
    this.updateContainerFilters();
  }

  private updateContainerFilters(): void {
    const filters = Array.from(this.activeFilters.values()) as import('pixi.js').Filter[];
    this.container.filters = filters.length > 0 ? filters : [];
  }

  private applyFilterDefinition(filterDef: FilterDefinition): void {
    switch (filterDef.type) {
      case 'blur':
        this.blur(filterDef.params.amount as number, filterDef.region);
        break;
      case 'brightness':
        this.brightness(filterDef.params.amount as number, filterDef.region);
        break;
      case 'contrast':
        this.contrast(filterDef.params.amount as number, filterDef.region);
        break;
      case 'saturate':
        this.saturate(filterDef.params.amount as number, filterDef.region);
        break;
      case 'hue-rotate':
        this.hueRotate(filterDef.params.degrees as number, filterDef.region);
        break;
      case 'grayscale':
        this.grayscale(filterDef.params.amount as number, filterDef.region);
        break;
      case 'invert':
        this.invert(filterDef.params.amount as number, filterDef.region);
        break;
      case 'sepia':
        this.sepia(filterDef.params.amount as number, filterDef.region);
        break;
      case 'noise':
        this.noise(
          filterDef.params.amount as number,
          filterDef.params.seed as number | undefined,
          filterDef.region
        );
        break;
      case 'pixelate':
        this.pixelate(filterDef.params.size as number, filterDef.region);
        break;
      case 'glow':
        this.glow(
          filterDef.params.color as string,
          filterDef.params.intensity as number,
          filterDef.params.distance as number | undefined,
          filterDef.region
        );
        break;
      case 'vignette':
        this.vignette(
          filterDef.params.intensity as number,
          filterDef.params.softness as number
        );
        break;
      case 'color-matrix':
        this.colorMatrix(filterDef.params.matrix as ColorMatrix, filterDef.region);
        break;
      default:
        console.warn(`[FilterAPI] Unknown filter type: ${filterDef.type}`);
    }
  }

  /**
   * Remove a specific filter by key.
   */
  removeFilter(key: string): void {
    const filter = this.activeFilters.get(key) as import('pixi.js').Filter & { sprite?: Sprite } | undefined;
    if (filter) {
      // Handle displacement filter sprite cleanup
      if (filter.sprite) {
        filter.sprite.destroy({ texture: true, textureSource: true });
      }
      filter.destroy?.();
    }
    this.activeFilters.delete(key);
    this.updateContainerFilters();
  }

  /**
   * Get the underlying container.
   */
  getContainer(): Container {
    return this.container;
  }

  /**
   * Destroy all resources.
   * Call when this FilterAPI instance is no longer needed.
   */
  destroy(): void {
    this.clearFilters();
    // Clear failed shaders so they can be retried if actor restarts
    this.failedShaders.clear();
  }
}
