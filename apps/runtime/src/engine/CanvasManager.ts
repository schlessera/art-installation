/**
 * Canvas Manager
 *
 * Manages the Pixi.js application, layers, and canvas state.
 * Provides snapshot capabilities for AI review.
 */

import { Application, Container, Graphics, RenderTexture } from 'pixi.js';
import type {
  CanvasReadAPI,
  CanvasSize,
  RGBA,
  Rectangle,
  ColorHistogram,
  CanvasSnapshot,
  CanvasSnapshotOptions,
} from '@art/types';
import type { ActorContainerManager } from '../actors/ActorContainerManager';

export interface CanvasConfig {
  width: number;
  height: number;
  backgroundColor: number;
  antialias: boolean;
  preserveDrawingBuffer: boolean;
}

export interface CanvasMetrics {
  /** Native canvas resolution */
  nativeWidth: number;
  nativeHeight: number;
  /** Display size after scaling */
  displayWidth: number;
  displayHeight: number;
  /** Scale factor applied */
  scale: number;
  /** Aspect ratio (width/height) */
  aspectRatio: number;
}

/**
 * Layer types for organizing draw operations.
 */
export enum Layer {
  Background = 0,
  Main = 1,
  Effects = 2,
  Overlay = 3,
}

/**
 * Manages the Pixi.js canvas and provides drawing layers.
 */
export class CanvasManager implements CanvasReadAPI {
  private app: Application | null = null;
  private config: CanvasConfig;
  private layers: Map<Layer, Container> = new Map();
  private initialized = false;

  // Cache for pixel reading
  private pixelBuffer: Uint8Array | null = null;
  private renderTexture: RenderTexture | null = null;

  // Display scaling metrics
  private displayMetrics: CanvasMetrics | null = null;

  // Reference to ActorContainerManager for layer-aware snapshots
  private containerManager: ActorContainerManager | null = null;

  constructor(config: CanvasConfig) {
    this.config = config;
  }

  /**
   * Initialize the Pixi.js application.
   */
  async init(container: HTMLElement): Promise<void> {
    if (this.initialized) {
      throw new Error('CanvasManager already initialized');
    }

    // Create Pixi application
    // Use resolution: 1 to render at the exact configured resolution
    // Display scaling is handled separately via CSS transforms in resize()
    this.app = new Application();
    await this.app.init({
      width: this.config.width,
      height: this.config.height,
      backgroundColor: this.config.backgroundColor,
      antialias: this.config.antialias,
      preserveDrawingBuffer: this.config.preserveDrawingBuffer,
      resolution: 1,
      autoDensity: false,
    });

    // Add canvas to DOM
    container.appendChild(this.app.canvas);

    // Create layers
    this.createLayers();

    // Create render texture for pixel reading
    this.renderTexture = RenderTexture.create({
      width: this.config.width,
      height: this.config.height,
    });
    this.pixelBuffer = new Uint8Array(4);

    this.initialized = true;
  }

  /**
   * Create the layer hierarchy.
   */
  private createLayers(): void {
    if (!this.app) return;

    const layerOrder = [Layer.Background, Layer.Main, Layer.Effects, Layer.Overlay];

    for (const layer of layerOrder) {
      const container = new Container();
      container.label = `layer-${Layer[layer]}`;
      this.layers.set(layer, container);
      this.app.stage.addChild(container);
    }
  }

  /**
   * Get a layer container for drawing.
   */
  getLayer(layer: Layer): Container {
    const container = this.layers.get(layer);
    if (!container) {
      throw new Error(`Layer ${Layer[layer]} not found`);
    }
    return container;
  }

  /**
   * Get the main drawing layer (most actors draw here).
   */
  getMainLayer(): Container {
    return this.getLayer(Layer.Main);
  }

  /**
   * Get the Pixi.js application.
   */
  getApp(): Application {
    if (!this.app) {
      throw new Error('CanvasManager not initialized');
    }
    return this.app;
  }

  /**
   * Set the ActorContainerManager for layer-aware snapshots.
   * Must be called after ActorContainerManager is created.
   */
  setContainerManager(manager: ActorContainerManager): void {
    this.containerManager = manager;
  }

  /**
   * Resize the display to fit the viewport while maintaining aspect ratio.
   * The canvas resolution stays fixed; only the display scale changes.
   * This creates letterboxing (black bars on sides) when aspect ratios don't match.
   */
  resize(viewportWidth: number, viewportHeight: number): void {
    if (!this.app) return;

    const canvas = this.app.canvas as HTMLCanvasElement;
    const nativeWidth = this.config.width;
    const nativeHeight = this.config.height;

    // Calculate scale to fit viewport while maintaining aspect ratio
    const scaleX = viewportWidth / nativeWidth;
    const scaleY = viewportHeight / nativeHeight;
    const scale = Math.min(scaleX, scaleY);

    // Calculate display dimensions
    const displayWidth = Math.floor(nativeWidth * scale);
    const displayHeight = Math.floor(nativeHeight * scale);

    // Center the canvas in the viewport
    const offsetX = Math.floor((viewportWidth - displayWidth) / 2);
    const offsetY = Math.floor((viewportHeight - displayHeight) / 2);

    // Apply CSS scaling (not renderer resize - keep native resolution)
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = `${offsetX}px`;
    canvas.style.top = `${offsetY}px`;

    // Store metrics for external access
    this.displayMetrics = {
      nativeWidth,
      nativeHeight,
      displayWidth,
      displayHeight,
      scale,
      aspectRatio: nativeWidth / nativeHeight,
    };
  }

  /**
   * Get current display metrics.
   */
  getMetrics(): CanvasMetrics {
    return this.displayMetrics || {
      nativeWidth: this.config.width,
      nativeHeight: this.config.height,
      displayWidth: this.config.width,
      displayHeight: this.config.height,
      scale: 1,
      aspectRatio: this.config.width / this.config.height,
    };
  }

  /**
   * Clear all layers.
   */
  clear(): void {
    for (const container of this.layers.values()) {
      // Must destroy children to release WebGL resources
      const children = container.removeChildren();
      for (const child of children) {
        child.destroy({ children: true });
      }
    }
  }

  /**
   * Clear a specific layer.
   */
  clearLayer(layer: Layer): void {
    const container = this.layers.get(layer);
    if (container) {
      // Must destroy children to release WebGL resources
      const children = container.removeChildren();
      for (const child of children) {
        child.destroy({ children: true });
      }
    }
  }

  /**
   * Create a Graphics object for drawing.
   */
  createGraphics(): Graphics {
    return new Graphics();
  }

  /**
   * Add a graphics object to a layer.
   */
  addToLayer(graphics: Graphics | Container, layer: Layer = Layer.Main): void {
    const container = this.getLayer(layer);
    container.addChild(graphics);
  }

  // ============ CanvasReadAPI Implementation ============

  getSize(): CanvasSize {
    if (!this.app) {
      return { width: this.config.width, height: this.config.height };
    }
    return {
      width: this.app.renderer.width,
      height: this.app.renderer.height,
    };
  }

  /**
   * Get pixel color at specific coordinates.
   * NOTE: For bulk pixel analysis, use getCanvasSnapshotAsync() instead
   * as individual pixel reads can be slow.
   */
  getPixel(x: number, y: number): RGBA {
    if (!this.app) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }

    const gl = (this.app.renderer as unknown as { gl?: WebGLRenderingContext }).gl;
    if (!gl) {
      // Fallback: return background color
      return {
        r: (this.config.backgroundColor >> 16) & 0xff,
        g: (this.config.backgroundColor >> 8) & 0xff,
        b: this.config.backgroundColor & 0xff,
        a: 1,
      };
    }

    // Reuse pixel buffer to avoid allocation
    if (!this.pixelBuffer || this.pixelBuffer.length < 4) {
      this.pixelBuffer = new Uint8Array(4);
    }

    // WebGL coordinates are bottom-left origin, flip Y
    const glY = this.app.renderer.height - Math.floor(y) - 1;

    // Synchronous read - use sparingly, prefer getCanvasSnapshotAsync for bulk reads
    gl.readPixels(
      Math.floor(x),
      glY,
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.pixelBuffer
    );

    return {
      r: this.pixelBuffer[0],
      g: this.pixelBuffer[1],
      b: this.pixelBuffer[2],
      a: this.pixelBuffer[3] / 255,
    };
  }

  getRegionAverage(rect: Rectangle): RGBA {
    if (!this.app || !this.renderTexture) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }

    // For performance, sample a subset of pixels
    const sampleSize = Math.min(rect.width * rect.height, 100);
    const step = Math.max(1, Math.floor(Math.sqrt((rect.width * rect.height) / sampleSize)));

    let r = 0,
      g = 0,
      b = 0,
      a = 0,
      count = 0;

    // This is a simplified implementation
    // In production, batch pixel reads or use GPU-based averaging
    for (let y = rect.y; y < rect.y + rect.height; y += step) {
      for (let x = rect.x; x < rect.x + rect.width; x += step) {
        const pixel = this.getPixel(x, y);
        r += pixel.r;
        g += pixel.g;
        b += pixel.b;
        a += pixel.a;
        count++;
      }
    }

    if (count === 0) return { r: 0, g: 0, b: 0, a: 0 };

    return {
      r: Math.round(r / count),
      g: Math.round(g / count),
      b: Math.round(b / count),
      a: a / count,
    };
  }

  getHistogram(): ColorHistogram {
    // Create empty histograms
    const histogram: ColorHistogram = {
      red: new Array(256).fill(0),
      green: new Array(256).fill(0),
      blue: new Array(256).fill(0),
      luminance: new Array(256).fill(0),
    };

    if (!this.app) return histogram;

    // Sample canvas at regular intervals for performance
    const size = this.getSize();
    const step = Math.max(1, Math.floor(Math.sqrt(size.width * size.height / 10000)));

    for (let y = 0; y < size.height; y += step) {
      for (let x = 0; x < size.width; x += step) {
        const pixel = this.getPixel(x, y);
        histogram.red[pixel.r]++;
        histogram.green[pixel.g]++;
        histogram.blue[pixel.b]++;
        const luminance = Math.round(0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b);
        histogram.luminance[luminance]++;
      }
    }

    return histogram;
  }

  getImageData(region?: Rectangle): ImageData {
    if (!this.app) {
      const size = region || { x: 0, y: 0, width: this.config.width, height: this.config.height };
      return new ImageData(size.width, size.height);
    }

    const canvas = this.app.canvas as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const size = region || { x: 0, y: 0, width: this.config.width, height: this.config.height };
      return new ImageData(size.width, size.height);
    }

    if (region) {
      return ctx.getImageData(region.x, region.y, region.width, region.height);
    }
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  getComplexity(): number {
    // Measure visual complexity via edge detection sampling
    // Higher values = more visual detail
    if (!this.app) return 0;

    const size = this.getSize();
    const step = 10;
    let edgeCount = 0;
    let totalSamples = 0;

    for (let y = step; y < size.height - step; y += step) {
      for (let x = step; x < size.width - step; x += step) {
        const center = this.getPixel(x, y);
        const right = this.getPixel(x + step, y);
        const down = this.getPixel(x, y + step);

        const dx = Math.abs(center.r - right.r) + Math.abs(center.g - right.g) + Math.abs(center.b - right.b);
        const dy = Math.abs(center.r - down.r) + Math.abs(center.g - down.g) + Math.abs(center.b - down.b);

        if (dx + dy > 50) edgeCount++;
        totalSamples++;
      }
    }

    return totalSamples > 0 ? edgeCount / totalSamples : 0;
  }

  getDominantColors(count: number): RGBA[] {
    // Simple k-means-like color quantization
    if (!this.app) return [];

    const size = this.getSize();
    const colors: RGBA[] = [];
    const step = Math.max(1, Math.floor(Math.sqrt(size.width * size.height / 1000)));

    // Sample colors
    const samples: RGBA[] = [];
    for (let y = 0; y < size.height; y += step) {
      for (let x = 0; x < size.width; x += step) {
        samples.push(this.getPixel(x, y));
      }
    }

    // Simple color clustering (median cut approximation)
    const buckets = new Map<string, { color: RGBA; count: number }>();

    for (const sample of samples) {
      // Quantize to reduce color space
      const key = `${Math.floor(sample.r / 32)},${Math.floor(sample.g / 32)},${Math.floor(sample.b / 32)}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.count++;
      } else {
        buckets.set(key, { color: sample, count: 1 });
      }
    }

    // Sort by frequency and take top N
    const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      colors.push(sorted[i].color);
    }

    return colors;
  }

  isEmpty(x: number, y: number, threshold = 0.1): boolean {
    const pixel = this.getPixel(x, y);
    const bgColor = {
      r: (this.config.backgroundColor >> 16) & 0xff,
      g: (this.config.backgroundColor >> 8) & 0xff,
      b: this.config.backgroundColor & 0xff,
    };

    const distance = Math.sqrt(
      Math.pow(pixel.r - bgColor.r, 2) +
      Math.pow(pixel.g - bgColor.g, 2) +
      Math.pow(pixel.b - bgColor.b, 2)
    );

    return distance / 441.67 < threshold; // 441.67 = max distance in RGB space
  }

  findEmptyRegions(minSize: number): Rectangle[] {
    // Grid-based empty region detection
    const size = this.getSize();
    const regions: Rectangle[] = [];
    const gridSize = Math.max(minSize, 50);

    for (let y = 0; y < size.height; y += gridSize) {
      for (let x = 0; x < size.width; x += gridSize) {
        const width = Math.min(gridSize, size.width - x);
        const height = Math.min(gridSize, size.height - y);

        // Check center of region
        if (this.isEmpty(x + width / 2, y + height / 2)) {
          regions.push({ x, y, width, height });
        }
      }
    }

    return regions;
  }

  getBrightness(x: number, y: number): number {
    const pixel = this.getPixel(x, y);
    return (0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b) / 255;
  }

  getAverageBrightness(): number {
    if (!this.app) return 0;

    const size = this.getSize();
    const step = 20;
    let totalBrightness = 0;
    let count = 0;

    for (let y = 0; y < size.height; y += step) {
      for (let x = 0; x < size.width; x += step) {
        totalBrightness += this.getBrightness(x, y);
        count++;
      }
    }

    return count > 0 ? totalBrightness / count : 0;
  }

  /**
   * Asynchronously capture the entire canvas to a CPU buffer.
   * Uses WebGL2 PIXEL_PACK_BUFFER for non-blocking reads.
   * @param scale - Downscale factor (0.5 = half resolution). Default: 1
   * @param options - Optional snapshot options (e.g., layer filtering)
   */
  async getCanvasSnapshotAsync(
    scale = 1,
    options?: CanvasSnapshotOptions
  ): Promise<{
    data: Uint8Array;
    width: number;
    height: number;
  }> {
    if (!this.app) {
      return { data: new Uint8Array(0), width: 0, height: 0 };
    }

    const gl = (this.app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;

    // Calculate dimensions
    const width = Math.floor(this.app.renderer.width * scale);
    const height = Math.floor(this.app.renderer.height * scale);
    const byteLength = width * height * 4;

    // Handle layer-aware snapshots: hide this actor and all above
    let hiddenActors: string[] = [];
    if (options?.belowActorId && this.containerManager) {
      const actorZIndex = this.containerManager.getActorZIndex(options.belowActorId);
      if (actorZIndex !== undefined) {
        hiddenActors = this.containerManager.hideActorsAtAndAbove(actorZIndex);
        // Re-render with hidden actors
        this.app.renderer.render(this.app.stage);
      }
    }

    // Check for WebGL2 support
    if (!gl || !gl.fenceSync) {
      // Fallback: synchronous read (blocking but works on WebGL1)
      console.warn('[CanvasManager] WebGL2 not available, using sync snapshot');
      const data = new Uint8Array(byteLength);
      gl?.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      // Restore hidden actors
      if (hiddenActors.length > 0 && this.containerManager) {
        this.containerManager.restoreActors(hiddenActors);
      }
      return { data, width, height };
    }

    // Create buffer for full canvas
    const buffer = gl.createBuffer();
    if (!buffer) {
      // Restore hidden actors
      if (hiddenActors.length > 0 && this.containerManager) {
        this.containerManager.restoreActors(hiddenActors);
      }
      return { data: new Uint8Array(0), width: 0, height: 0 };
    }

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, byteLength, gl.STREAM_READ);

    // Non-blocking read into buffer
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    // Create fence to track completion
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      gl.deleteBuffer(buffer);
      // Restore hidden actors
      if (hiddenActors.length > 0 && this.containerManager) {
        this.containerManager.restoreActors(hiddenActors);
      }
      return { data: new Uint8Array(0), width: 0, height: 0 };
    }
    gl.flush();

    // Restore hidden actors immediately after read is initiated
    // (they'll be visible again in next frame, snapshot is already queued)
    if (hiddenActors.length > 0 && this.containerManager) {
      this.containerManager.restoreActors(hiddenActors);
    }

    // Wait for completion (async polling)
    await this.waitForSync(gl, sync);

    // Read data from buffer to CPU
    const data = new Uint8Array(byteLength);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, data);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    // Cleanup
    gl.deleteSync(sync);
    gl.deleteBuffer(buffer);

    return { data, width, height };
  }

  /**
   * Wait for a WebGL sync object to complete (async polling).
   */
  private waitForSync(gl: WebGL2RenderingContext, sync: WebGLSync): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.WAIT_FAILED) {
          reject(new Error('WebGL sync failed'));
        } else if (status === gl.TIMEOUT_EXPIRED) {
          // Not ready yet, check next frame
          requestAnimationFrame(check);
        } else {
          // ALREADY_SIGNALED or CONDITION_SATISFIED
          resolve();
        }
      };
      check();
    });
  }

  // ============ Snapshot Methods ============

  /**
   * Take a snapshot of the current canvas state.
   */
  async takeSnapshot(activeActorIds: string[]): Promise<CanvasSnapshot> {
    if (!this.app) {
      throw new Error('CanvasManager not initialized');
    }

    const canvas = this.app.canvas as HTMLCanvasElement;
    const imageData = canvas.toDataURL('image/png');

    return {
      timestamp: Date.now(),
      width: canvas.width,
      height: canvas.height,
      imageData,
      activeActorIds,
    };
  }

  /**
   * Get the canvas as a PNG data URL.
   */
  toDataURL(): string {
    if (!this.app) {
      throw new Error('CanvasManager not initialized');
    }
    return (this.app.canvas as HTMLCanvasElement).toDataURL('image/png');
  }

  /**
   * Destroy the canvas manager and clean up resources.
   */
  destroy(): void {
    if (this.renderTexture) {
      this.renderTexture.destroy();
      this.renderTexture = null;
    }

    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }

    this.layers.clear();
    this.initialized = false;
  }
}
