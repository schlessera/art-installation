/**
 * BrushAPI Implementation
 *
 * Implements the BrushAPI interface using Pixi.js Graphics.
 */

import { Graphics, Container, Text, TextStyle, Sprite, Texture, FillGradient } from 'pixi.js';
import type {
  BrushAPI,
  PathBuilder,
  Point,
  Rectangle,
  Color,
  ShapeStyle,
  LineStyle,
  StrokeStyle,
  TextStyle as BrushTextStyle,
  ImageOptions,
  BlendMode,
  Gradient,
} from '@art/types';
import type { CanvasManager, Layer } from '../engine/CanvasManager';

// Color cache to avoid repeated parsing (clears when > 2000 entries)
const colorCache = new Map<string, number>();
const MAX_COLOR_CACHE_SIZE = 2000;

// Named colors (static, no need to recreate)
const NAMED_COLORS: Record<string, number> = {
  black: 0x000000,
  white: 0xffffff,
  red: 0xff0000,
  green: 0x00ff00,
  blue: 0x0000ff,
  yellow: 0xffff00,
  cyan: 0x00ffff,
  magenta: 0xff00ff,
  orange: 0xffa500,
  purple: 0x800080,
  pink: 0xffc0cb,
  gray: 0x808080,
  grey: 0x808080,
};

/**
 * Convert hex/rgb color string to number with caching.
 */
function parseColor(color: Color): number {
  if (typeof color === 'number') return color;

  // Check cache first
  const cached = colorCache.get(color);
  if (cached !== undefined) return cached;

  let result: number;

  // Handle hex colors
  if (color.startsWith('#')) {
    result = parseInt(color.slice(1, 7), 16);  // Only parse first 6 hex chars (ignore alpha suffix)
  }
  // Handle rgb/rgba
  else if (color.startsWith('rgb')) {
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      result = (r << 16) | (g << 8) | b;
    } else {
      result = 0x000000;
    }
  }
  // Handle hsl/hsla (common in actors)
  else if (color.startsWith('hsl')) {
    const hslMatch = color.match(/hsla?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)%?,\s*(\d+(?:\.\d+)?)%?/);
    if (hslMatch) {
      const h = parseFloat(hslMatch[1]) / 360;
      const s = parseFloat(hslMatch[2]) / 100;
      const l = parseFloat(hslMatch[3]) / 100;
      result = hslToRgbNumber(h, s, l);
    } else {
      result = 0x000000;
    }
  }
  // Named colors
  else {
    result = NAMED_COLORS[color.toLowerCase()] ?? 0x000000;
  }

  // Cache the result (clear cache if too large to prevent memory issues)
  if (colorCache.size >= MAX_COLOR_CACHE_SIZE) {
    colorCache.clear();
  }
  colorCache.set(color, result);

  return result;
}

/**
 * Extract alpha value from color string.
 * Returns 1 if no alpha component found.
 */
function extractAlpha(color: Color): number {
  if (typeof color === 'number') return 1;

  // rgba(r, g, b, a)
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
    if (match) return parseFloat(match[1]);
  }
  // hsla(h, s%, l%, a)
  else if (color.startsWith('hsl')) {
    const match = color.match(/hsla?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
    if (match) return parseFloat(match[1]);
  }
  // #RRGGBBAA (8-char hex with alpha)
  else if (color.startsWith('#') && color.length === 9) {
    return parseInt(color.slice(7, 9), 16) / 255;
  }

  return 1;
}

/**
 * Convert HSL to RGB number (for caching HSL colors).
 */
function hslToRgbNumber(h: number, s: number, l: number): number {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/**
 * Map blend mode string to Pixi.js blend mode.
 */
function mapBlendMode(mode?: BlendMode): string {
  const modeMap: Record<BlendMode, string> = {
    normal: 'normal',
    add: 'add',
    multiply: 'multiply',
    screen: 'screen',
    overlay: 'overlay',
    darken: 'darken',
    lighten: 'lighten',
    'color-dodge': 'color-dodge',
    'color-burn': 'color-burn',
    'hard-light': 'hard-light',
    'soft-light': 'soft-light',
    difference: 'difference',
    exclusion: 'exclusion',
  };
  return mode ? modeMap[mode] || 'normal' : 'normal';
}

/**
 * Apply fill style to graphics.
 */
function applyFill(graphics: Graphics, style?: ShapeStyle): void {
  if (!style?.fill) {
    graphics.fill({ color: 0xffffff, alpha: style?.alpha ?? 1 });
    return;
  }

  const fill = style.fill;

  if (typeof fill === 'number') {
    // Numeric color (0xRRGGBB)
    graphics.fill({ color: fill, alpha: style.alpha ?? 1 });
  } else if (typeof fill === 'string') {
    // String color - extract alpha from color string if not provided in style
    const colorAlpha = extractAlpha(fill);
    graphics.fill({ color: parseColor(fill), alpha: style.alpha ?? colorAlpha });
  } else if ('type' in fill && (fill.type === 'linear' || fill.type === 'radial')) {
    // Gradient fill using FillGradient
    const gradient = fill as Gradient;
    if (gradient.stops.length > 0) {
      const fillGradient = getOrCreateFillGradient(gradient);
      graphics.fill(fillGradient);
      // Note: alpha is applied via the graphics object in applyTransformAndBlend
    }
  } else if ('type' in fill && fill.type === 'pattern') {
    // Pattern fill (not yet implemented)
    console.warn('[BrushAPI] Pattern fills not yet implemented');
    graphics.fill({ color: 0xffffff, alpha: style.alpha ?? 1 });
  } else {
    graphics.fill({ color: 0xffffff, alpha: style.alpha ?? 1 });
  }
}

/**
 * Apply stroke style to graphics.
 */
function applyStroke(graphics: Graphics, style?: ShapeStyle | LineStyle): void {
  if (!style) return;

  // Get the color string to extract both color and alpha
  const strokeColorStr = 'stroke' in style && style.stroke ? style.stroke :
                         'color' in style && style.color ? style.color : undefined;

  if (strokeColorStr === undefined) return;

  const strokeColor = parseColor(strokeColorStr);
  const strokeAlpha = extractAlpha(strokeColorStr);

  const strokeWidth = 'strokeWidth' in style ? style.strokeWidth :
                      'width' in style ? style.width : 1;

  graphics.stroke({
    color: strokeColor,
    width: strokeWidth ?? 1,
    alpha: style.alpha ?? strokeAlpha,
    cap: 'cap' in style ? style.cap : 'round',
    join: 'join' in style ? style.join : 'round',
  });
}

/**
 * Path builder implementation.
 */
class PathBuilderImpl implements PathBuilder {
  private graphics: Graphics;
  private hasStarted = false;

  constructor(graphics: Graphics) {
    this.graphics = graphics;
  }

  moveTo(x: number, y: number): PathBuilder {
    this.graphics.moveTo(x, y);
    this.hasStarted = true;
    return this;
  }

  lineTo(x: number, y: number): PathBuilder {
    if (!this.hasStarted) {
      this.graphics.moveTo(x, y);
      this.hasStarted = true;
    } else {
      this.graphics.lineTo(x, y);
    }
    return this;
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): PathBuilder {
    this.graphics.quadraticCurveTo(cpx, cpy, x, y);
    return this;
  }

  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): PathBuilder {
    this.graphics.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
    return this;
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise = false
  ): PathBuilder {
    this.graphics.arc(x, y, radius, startAngle, endAngle, counterclockwise);
    return this;
  }

  closePath(): PathBuilder {
    this.graphics.closePath();
    return this;
  }

  fill(style?: ShapeStyle): void {
    applyFill(this.graphics, style);
  }

  stroke(style?: LineStyle): void {
    applyStroke(this.graphics, style);
  }
}

/**
 * Graphics object pool to avoid per-frame allocations.
 * This dramatically reduces memory pressure from creating/destroying
 * thousands of Graphics objects every frame.
 */
class GraphicsPool {
  private pool: Graphics[] = [];
  private activeCount = 0;
  private container: Container;
  private initialSize: number;
  private maxSize: number;
  private hasWarnedGrowth = false;

  constructor(container: Container, initialSize = 1000, maxSize = 10000) {
    this.container = container;
    this.initialSize = initialSize;
    this.maxSize = maxSize;
    // Pre-allocate pool
    for (let i = 0; i < initialSize; i++) {
      const g = new Graphics();
      g.visible = false;
      this.pool.push(g);
      container.addChild(g);
    }
  }

  acquire(): Graphics {
    let g: Graphics;

    if (this.activeCount < this.pool.length) {
      // Reuse from pool
      g = this.pool[this.activeCount];
      g.clear();
      g.visible = true;
      // Reset transform to prevent accumulation across frames
      g.position.set(0, 0);
      g.rotation = 0;
      g.scale.set(1, 1);
      g.alpha = 1;
    } else if (this.pool.length < this.maxSize) {
      // Pool exhausted but under max, create new (will be reused next frame)
      g = new Graphics();
      this.pool.push(g);
      this.container.addChild(g);

      // Warn once when pool grows beyond initial size
      if (!this.hasWarnedGrowth && this.pool.length > this.initialSize) {
        console.warn(`[GraphicsPool] Pool grew beyond initial size: ${this.pool.length}/${this.initialSize}`);
        this.hasWarnedGrowth = true;
      }
    } else {
      // At max size, reuse oldest active (visual glitch but prevents crash)
      g = this.pool[this.activeCount % this.pool.length];
      g.clear();
      g.visible = true;
    }

    this.activeCount++;
    return g;
  }

  releaseAll(): void {
    // Hide all active graphics instead of destroying
    for (let i = 0; i < this.activeCount; i++) {
      this.pool[i].visible = false;
    }
    this.activeCount = 0;
  }

  destroy(): void {
    for (const g of this.pool) {
      g.destroy();
    }
    this.pool = [];
    this.activeCount = 0;
  }
}

/**
 * Texture cache to avoid recreating textures from data URLs.
 * Uses LRU-style eviction when max size is exceeded.
 */
class TextureCache {
  private cache = new Map<string, Texture>();
  private maxSize: number;
  private accessOrder: string[] = [];

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(key: string): Texture | undefined {
    const texture = this.cache.get(key);
    if (texture) {
      // Move to end of access order (most recently used)
      const idx = this.accessOrder.indexOf(key);
      if (idx !== -1) {
        this.accessOrder.splice(idx, 1);
      }
      this.accessOrder.push(key);
    }
    return texture;
  }

  set(key: string, texture: Texture): void {
    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder.shift()!;
      const oldTexture = this.cache.get(oldestKey);
      if (oldTexture) {
        oldTexture.destroy(true);
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, texture);
    this.accessOrder.push(key);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  destroy(): void {
    for (const texture of this.cache.values()) {
      texture.destroy(true);
    }
    this.cache.clear();
    this.accessOrder = [];
  }
}

/**
 * Sprite object pool to avoid per-frame allocations.
 * Similar to GraphicsPool but for Sprite objects.
 */
class SpritePool {
  private pool: Sprite[] = [];
  private activeCount = 0;
  private container: Container;
  private initialSize: number;
  private maxSize: number;
  private hasWarnedGrowth = false;

  constructor(container: Container, initialSize = 500, maxSize = 2000) {
    this.container = container;
    this.initialSize = initialSize;
    this.maxSize = maxSize;
    // Pre-allocate pool with white texture placeholder
    for (let i = 0; i < initialSize; i++) {
      const s = new Sprite(Texture.WHITE);
      s.visible = false;
      this.pool.push(s);
      container.addChild(s);
    }
  }

  acquire(): Sprite {
    let s: Sprite;

    if (this.activeCount < this.pool.length) {
      // Reuse from pool
      s = this.pool[this.activeCount];
      s.visible = true;
      // Reset transform to prevent accumulation across frames
      s.position.set(0, 0);
      s.rotation = 0;
      s.scale.set(1, 1);
      s.alpha = 1;
      s.anchor.set(0.5, 0.5); // Default center anchor
      s.tint = 0xffffff; // Reset tint
      s.blendMode = 'normal';
    } else if (this.pool.length < this.maxSize) {
      // Pool exhausted but under max, create new
      s = new Sprite(Texture.WHITE);
      this.pool.push(s);
      this.container.addChild(s);

      if (!this.hasWarnedGrowth && this.pool.length > this.initialSize) {
        console.warn(`[SpritePool] Pool grew beyond initial size: ${this.pool.length}/${this.initialSize}`);
        this.hasWarnedGrowth = true;
      }
    } else {
      // At max size, reuse oldest active
      s = this.pool[this.activeCount % this.pool.length];
      s.visible = true;
    }

    this.activeCount++;
    return s;
  }

  releaseAll(): void {
    for (let i = 0; i < this.activeCount; i++) {
      this.pool[i].visible = false;
    }
    this.activeCount = 0;
  }

  destroy(): void {
    for (const s of this.pool) {
      s.destroy();
    }
    this.pool = [];
    this.activeCount = 0;
  }
}

// Gradient cache to reuse FillGradient objects
const gradientCache = new Map<string, FillGradient>();
const MAX_GRADIENT_CACHE_SIZE = 200;

/**
 * Generate cache key for a gradient.
 */
function getGradientCacheKey(gradient: Gradient): string {
  const stopsKey = gradient.stops
    .map(s => `${s.offset}:${s.color}`)
    .join('|');

  if (gradient.type === 'radial') {
    return `radial-${gradient.cx ?? 0.5}-${gradient.cy ?? 0.5}-${gradient.radius ?? 0.5}-${stopsKey}`;
  } else {
    return `linear-${gradient.x0 ?? 0}-${gradient.y0 ?? 0}-${gradient.x1 ?? 0}-${gradient.y1 ?? 1}-${stopsKey}`;
  }
}

/**
 * Get or create a FillGradient from our Gradient interface.
 */
function getOrCreateFillGradient(gradient: Gradient): FillGradient {
  const cacheKey = getGradientCacheKey(gradient);

  let fillGradient = gradientCache.get(cacheKey);
  if (fillGradient) {
    // Check if the cached gradient's texture is still valid
    // If texture exists but source is null/undefined, we need to recreate
    if (fillGradient.texture && !fillGradient.texture.source) {
      console.warn('[BrushAPI] Cached gradient has invalid texture, recreating');
      fillGradient.destroy();
      gradientCache.delete(cacheKey);
      fillGradient = undefined;
    } else {
      return fillGradient;
    }
  }

  // Evict old entries if cache is full
  if (gradientCache.size >= MAX_GRADIENT_CACHE_SIZE) {
    const firstKey = gradientCache.keys().next().value;
    if (firstKey) {
      const oldGradient = gradientCache.get(firstKey);
      if (oldGradient) {
        oldGradient.destroy();
      }
      gradientCache.delete(firstKey);
    }
  }

  // Convert our color stops to Pixi format
  const colorStops = gradient.stops.map(stop => ({
    offset: stop.offset,
    color: stop.color,
  }));

  if (gradient.type === 'radial') {
    fillGradient = new FillGradient({
      type: 'radial',
      center: { x: gradient.cx ?? 0.5, y: gradient.cy ?? 0.5 },
      innerRadius: 0,
      outerRadius: gradient.radius ?? 0.5,
      outerCenter: { x: gradient.cx ?? 0.5, y: gradient.cy ?? 0.5 },
      colorStops,
      textureSpace: 'local',
    });
  } else {
    fillGradient = new FillGradient({
      type: 'linear',
      start: { x: gradient.x0 ?? 0, y: gradient.y0 ?? 0 },
      end: { x: gradient.x1 ?? 0, y: gradient.y1 ?? 1 },
      colorStops,
      textureSpace: 'local',
    });
  }

  // Force build the gradient texture immediately to catch any errors early
  fillGradient.buildGradient();

  // Validate that the texture was properly created
  if (!fillGradient.texture || !fillGradient.texture.source) {
    console.error('[BrushAPI] Failed to build gradient texture', {
      type: gradient.type,
      hasTexture: !!fillGradient.texture,
      hasSource: fillGradient.texture ? !!fillGradient.texture.source : false,
    });
    // Don't cache invalid gradients
    return fillGradient;
  }

  gradientCache.set(cacheKey, fillGradient);
  return fillGradient;
}

/**
 * Implementation of BrushAPI using Pixi.js.
 */
export class BrushAPIImpl implements BrushAPI {
  private canvasManager: CanvasManager;
  private _layer: Layer;
  private graphics: Graphics;
  private container: Container;
  private graphicsPool: GraphicsPool;
  private spritePool: SpritePool;
  private textureCache: TextureCache;
  private pendingImages = new Map<string, HTMLImageElement>();
  private transformStack: { x: number; y: number; rotation: number; scaleX: number; scaleY: number }[] = [];
  private currentTransform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  private globalAlpha = 1;
  private globalBlendMode: BlendMode = 'normal';

  constructor(canvasManager: CanvasManager, layer: Layer, container?: Container) {
    this.canvasManager = canvasManager;
    this._layer = layer;
    // Use provided container or get from layer
    this.container = container ?? canvasManager.getLayer(layer);
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    // Per-actor pools use smaller size vs shared pool
    const graphicsPoolSize = container ? 2000 : 5000;
    const spritePoolSize = container ? 500 : 1000;
    this.graphicsPool = new GraphicsPool(this.container, graphicsPoolSize);
    this.spritePool = new SpritePool(this.container, spritePoolSize);
    this.textureCache = new TextureCache(100);
  }

  // ============ Basic Shapes ============

  ellipse(x: number, y: number, width: number, height: number, style?: ShapeStyle): void {
    const g = this.graphicsPool.acquire();
    g.ellipse(x, y, width / 2, height / 2);
    applyFill(g, style);
    applyStroke(g, style);
    this.applyTransformAndBlend(g, style);
  }

  circle(x: number, y: number, radius: number, style?: ShapeStyle): void {
    const g = this.graphicsPool.acquire();
    g.circle(x, y, radius);
    applyFill(g, style);
    applyStroke(g, style);
    this.applyTransformAndBlend(g, style);
  }

  rect(x: number, y: number, width: number, height: number, style?: ShapeStyle): void {
    const g = this.graphicsPool.acquire();
    g.rect(x, y, width, height);
    applyFill(g, style);
    applyStroke(g, style);
    this.applyTransformAndBlend(g, style);
  }

  roundRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    style?: ShapeStyle
  ): void {
    const g = this.graphicsPool.acquire();
    g.roundRect(x, y, width, height, radius);
    applyFill(g, style);
    applyStroke(g, style);
    this.applyTransformAndBlend(g, style);
  }

  polygon(points: Point[], style?: ShapeStyle): void {
    if (points.length < 3) return;

    const g = this.graphicsPool.acquire();
    g.poly(points.flatMap((p) => [p.x, p.y]));
    applyFill(g, style);
    applyStroke(g, style);
    this.applyTransformAndBlend(g, style);
  }

  regularPolygon(x: number, y: number, radius: number, sides: number, style?: ShapeStyle): void {
    const points: Point[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      points.push({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
      });
    }
    this.polygon(points, style);
  }

  star(
    x: number,
    y: number,
    outerRadius: number,
    innerRadius: number,
    points: number,
    style?: ShapeStyle
  ): void {
    const starPoints: Point[] = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      starPoints.push({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
      });
    }
    this.polygon(starPoints, style);
  }

  // ============ Lines & Curves ============

  line(x1: number, y1: number, x2: number, y2: number, style?: LineStyle): void {
    const g = this.graphicsPool.acquire();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);

    const color = style?.color ? parseColor(style.color) : 0xffffff;
    const colorAlpha = style?.color ? extractAlpha(style.color) : 1;
    g.stroke({
      color,
      width: style?.width ?? 1,
      alpha: style?.alpha ?? (colorAlpha * this.globalAlpha),
      cap: style?.cap ?? 'round',
      join: style?.join ?? 'round',
    });

    this.applyTransformAndBlend(g, style);
  }

  stroke(points: Point[], style?: StrokeStyle): void {
    if (points.length < 2) return;

    const g = this.graphicsPool.acquire();

    if (style?.smooth) {
      // Smooth curve through points using catmull-rom
      this.drawSmoothCurve(g, points);
    } else {
      g.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        g.lineTo(points[i].x, points[i].y);
      }
    }

    const color = style?.color ? parseColor(style.color) : 0xffffff;
    const colorAlpha = style?.color ? extractAlpha(style.color) : 1;
    g.stroke({
      color,
      width: style?.width ?? 2,
      alpha: style?.alpha ?? (colorAlpha * this.globalAlpha),
      cap: style?.cap ?? 'round',
      join: style?.join ?? 'round',
    });

    this.applyTransformAndBlend(g, style);
  }

  private drawSmoothCurve(g: Graphics, points: Point[]): void {
    if (points.length < 2) return;

    g.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      g.lineTo(points[1].x, points[1].y);
      return;
    }

    // Catmull-Rom spline interpolation
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[Math.min(points.length - 1, i + 1)];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      g.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  bezier(start: Point, cp1: Point, cp2: Point, end: Point, style?: LineStyle): void {
    const g = this.graphicsPool.acquire();
    g.moveTo(start.x, start.y);
    g.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);

    const color = style?.color ? parseColor(style.color) : 0xffffff;
    const colorAlpha = style?.color ? extractAlpha(style.color) : 1;
    g.stroke({
      color,
      width: style?.width ?? 1,
      alpha: style?.alpha ?? (colorAlpha * this.globalAlpha),
    });

    this.applyTransformAndBlend(g, style);
  }

  quadratic(start: Point, control: Point, end: Point, style?: LineStyle): void {
    const g = this.graphicsPool.acquire();
    g.moveTo(start.x, start.y);
    g.quadraticCurveTo(control.x, control.y, end.x, end.y);

    const color = style?.color ? parseColor(style.color) : 0xffffff;
    const colorAlpha = style?.color ? extractAlpha(style.color) : 1;
    g.stroke({
      color,
      width: style?.width ?? 1,
      alpha: style?.alpha ?? (colorAlpha * this.globalAlpha),
    });

    this.applyTransformAndBlend(g, style);
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    style?: LineStyle
  ): void {
    const g = this.graphicsPool.acquire();
    g.arc(x, y, radius, startAngle, endAngle);

    const color = style?.color ? parseColor(style.color) : 0xffffff;
    const colorAlpha = style?.color ? extractAlpha(style.color) : 1;
    g.stroke({
      color,
      width: style?.width ?? 1,
      alpha: style?.alpha ?? (colorAlpha * this.globalAlpha),
    });

    this.applyTransformAndBlend(g, style);
  }

  // ============ Text ============

  text(content: string, x: number, y: number, style?: BrushTextStyle): void {
    const textStyle = new TextStyle({
      fontFamily: style?.font ?? 'Arial',
      fontSize: style?.fontSize ?? 16,
      fill: style?.fill ? parseColor(style.fill as string) : 0xffffff,
      stroke: style?.stroke
        ? { color: parseColor(style.stroke), width: style.strokeWidth ?? 1 }
        : undefined,
      align: style?.align ?? 'left',
      letterSpacing: style?.letterSpacing ?? 0,
      lineHeight: style?.lineHeight ?? (style?.fontSize ?? 16) * 1.2,
    });

    const textObject = new Text({ text: content, style: textStyle });
    textObject.x = x;
    textObject.y = y;
    textObject.alpha = style?.alpha ?? this.globalAlpha;

    // Handle baseline alignment
    if (style?.baseline === 'middle') {
      textObject.anchor.y = 0.5;
    } else if (style?.baseline === 'bottom' || style?.baseline === 'alphabetic') {
      textObject.anchor.y = 1;
    }

    this.applyTransform(textObject);
    this.container.addChild(textObject);
  }

  // ============ Images ============

  image(src: string | ImageData, x: number, y: number, options?: ImageOptions): void {
    let cacheKey: string;
    let texture: Texture | undefined;

    if (typeof src === 'string') {
      cacheKey = src;
      texture = this.textureCache.get(cacheKey);

      if (!texture) {
        // Create texture from data URL or image path
        try {
          // For data URLs, we need to load into an Image first
          if (src.startsWith('data:')) {
            // Check if we have a pending image for this data URL
            let img = this.pendingImages.get(cacheKey);
            if (!img) {
              img = new Image();
              img.src = src;
              this.pendingImages.set(cacheKey, img);
            }

            // Check if image is ready
            if (img.complete && img.naturalWidth > 0) {
              texture = Texture.from(img);
              this.pendingImages.delete(cacheKey); // Clean up pending
            } else {
              // Image not ready yet - will retry next frame
              return;
            }
          } else {
            // Regular URL - use Texture.from directly
            texture = Texture.from(src);
          }
          if (texture) {
            this.textureCache.set(cacheKey, texture);
          }
        } catch (e) {
          console.warn('[BrushAPI] Failed to load texture from:', src.substring(0, 50), e);
          return;
        }
      }
    } else {
      // ImageData - create texture from canvas
      // Generate cache key from dimensions and sample of first pixels
      const samplePixels = Array.from(src.data.slice(0, 32)).join(',');
      cacheKey = `imagedata-${src.width}x${src.height}-${samplePixels}`;
      texture = this.textureCache.get(cacheKey);

      if (!texture) {
        const canvas = document.createElement('canvas');
        canvas.width = src.width;
        canvas.height = src.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.putImageData(src, 0, 0);
          texture = Texture.from(canvas);
          this.textureCache.set(cacheKey, texture);
          // Clean up canvas reference (texture has its own copy)
          canvas.width = 0;
          canvas.height = 0;
        }
      }
    }

    if (!texture) {
      return;
    }

    // Acquire sprite from pool
    const sprite = this.spritePool.acquire();
    sprite.texture = texture;
    sprite.position.set(x, y);

    // Apply options
    if (options) {
      if (options.width !== undefined || options.height !== undefined) {
        const origWidth = texture.width || 1;
        const origHeight = texture.height || 1;
        const targetWidth = options.width ?? origWidth;
        const targetHeight = options.height ?? origHeight;
        sprite.scale.set(targetWidth / origWidth, targetHeight / origHeight);
      }

      if (options.rotation !== undefined) {
        sprite.rotation = options.rotation;
      }

      if (options.anchorX !== undefined || options.anchorY !== undefined) {
        sprite.anchor.set(options.anchorX ?? 0.5, options.anchorY ?? 0.5);
      }

      if (options.alpha !== undefined) {
        sprite.alpha = options.alpha * this.globalAlpha;
      } else {
        sprite.alpha = this.globalAlpha;
      }

      if (options.blendMode) {
        sprite.blendMode = mapBlendMode(options.blendMode) as import('pixi.js').BLEND_MODES;
      }

      if (options.tint) {
        sprite.tint = parseColor(options.tint);
      }
    } else {
      sprite.alpha = this.globalAlpha;
    }

    // Apply current transform
    this.applyTransform(sprite);
  }

  // ============ Path Building ============

  beginPath(): PathBuilder {
    const g = this.graphicsPool.acquire();
    return new PathBuilderImpl(g);
  }

  // ============ Transform ============

  pushMatrix(): void {
    this.transformStack.push({ ...this.currentTransform });
  }

  popMatrix(): void {
    const transform = this.transformStack.pop();
    if (transform) {
      this.currentTransform = transform;
    }
  }

  translate(x: number, y: number): void {
    this.currentTransform.x += x;
    this.currentTransform.y += y;
  }

  rotate(angle: number): void {
    this.currentTransform.rotation += angle;
  }

  scale(sx: number, sy?: number): void {
    this.currentTransform.scaleX *= sx;
    this.currentTransform.scaleY *= (sy ?? sx);
  }

  // ============ Global State ============

  setBlendMode(mode: BlendMode): void {
    this.globalBlendMode = mode;
  }

  setAlpha(alpha: number): void {
    this.globalAlpha = Math.max(0, Math.min(1, alpha));
  }

  clear(region?: Rectangle): void {
    if (region) {
      // Clear specific region by drawing background color over it
      const g = this.graphicsPool.acquire();
      g.rect(region.x, region.y, region.width, region.height);
      g.fill({ color: 0x0a0a0f }); // Match background color
    } else {
      // Clear entire layer by releasing all pooled graphics
      this.graphicsPool.releaseAll();
    }
  }

  background(color: Color, alpha = 1): void {
    const size = this.canvasManager.getSize();
    const g = this.graphicsPool.acquire();
    g.rect(0, 0, size.width, size.height);
    g.fill({ color: parseColor(color), alpha });
  }

  // ============ Helper Methods ============

  private applyTransformAndBlend(graphics: Graphics, style?: { blendMode?: BlendMode; alpha?: number }): void {
    this.applyTransform(graphics);
    graphics.blendMode = mapBlendMode(style?.blendMode ?? this.globalBlendMode) as import('pixi.js').BLEND_MODES;
    graphics.alpha *= this.globalAlpha;
  }

  private applyTransform(obj: Container): void {
    obj.x += this.currentTransform.x;
    obj.y += this.currentTransform.y;
    obj.rotation += this.currentTransform.rotation;
    obj.scale.x *= this.currentTransform.scaleX;
    obj.scale.y *= this.currentTransform.scaleY;
  }

  /**
   * Reset all state for a new frame.
   */
  reset(): void {
    this.transformStack = [];
    this.currentTransform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    this.globalAlpha = 1;
    this.globalBlendMode = 'normal';
  }

  /**
   * Clear all graphics from the container for a new frame.
   * This should be called at the start of each frame to prevent
   * accumulation of Graphics objects.
   */
  clearFrame(): void {
    // Release all graphics and sprites back to pool (no allocation/destruction)
    this.graphicsPool.releaseAll();
    this.spritePool.releaseAll();
    // Reset state
    this.reset();
  }

  /**
   * Get the underlying container.
   */
  getContainer(): Container {
    return this.container;
  }

  /**
   * Destroy all resources.
   * Call when this BrushAPI instance is no longer needed.
   */
  destroy(): void {
    this.graphicsPool.destroy();
    this.spritePool.destroy();
    this.textureCache.destroy();
    this.pendingImages.clear();
    this.graphics.destroy();
  }
}
