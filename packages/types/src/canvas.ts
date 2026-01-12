/**
 * Canvas Types
 *
 * Defines the read-only canvas API for actors.
 * Actors can read canvas state but write through BrushAPI.
 */

/**
 * RGBA color value.
 */
export interface RGBA {
  /** Red component (0-255) */
  r: number;

  /** Green component (0-255) */
  g: number;

  /** Blue component (0-255) */
  b: number;

  /** Alpha component (0-1) */
  a: number;
}

/**
 * Rectangle definition.
 */
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Point/coordinate.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Color histogram data.
 */
export interface ColorHistogram {
  /** Red channel histogram (256 buckets) */
  red: number[];

  /** Green channel histogram (256 buckets) */
  green: number[];

  /** Blue channel histogram (256 buckets) */
  blue: number[];

  /** Luminance histogram (256 buckets) */
  luminance: number[];
}

/**
 * Canvas dimensions.
 */
export interface CanvasSize {
  width: number;
  height: number;
}

/**
 * Read-only Canvas API for actors.
 */
export interface CanvasReadAPI {
  /**
   * Get canvas dimensions.
   */
  getSize(): CanvasSize;

  /**
   * Get pixel color at specific coordinates.
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  getPixel(x: number, y: number): RGBA;

  /**
   * Get average color of a region.
   * @param rect - Region to sample
   */
  getRegionAverage(rect: Rectangle): RGBA;

  /**
   * Get histogram of current canvas.
   */
  getHistogram(): ColorHistogram;

  /**
   * Get the current canvas as ImageData.
   * @param region - Optional region to extract
   */
  getImageData(region?: Rectangle): ImageData;

  /**
   * Analyze visual complexity (0-1 scale).
   * Higher values indicate more visual detail.
   */
  getComplexity(): number;

  /**
   * Get dominant colors in the canvas.
   * @param count - Number of colors to return
   */
  getDominantColors(count: number): RGBA[];

  /**
   * Check if a point is "empty" (close to background).
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param threshold - Similarity threshold (default: 0.1)
   */
  isEmpty(x: number, y: number, threshold?: number): boolean;

  /**
   * Find empty regions suitable for painting.
   * @param minSize - Minimum region size
   */
  findEmptyRegions(minSize: number): Rectangle[];

  /**
   * Get brightness at a point (0-1).
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  getBrightness(x: number, y: number): number;

  /**
   * Get average brightness of the entire canvas (0-1).
   */
  getAverageBrightness(): number;

  /**
   * Asynchronously capture the entire canvas to a CPU buffer.
   * Use for bulk pixel analysis without blocking the render loop.
   * @param scale - Optional downscale factor (0.5 = half resolution). Default: 1
   * @param options - Optional snapshot options
   * @returns Promise with pixel data (RGBA), width, and height
   */
  getCanvasSnapshotAsync(
    scale?: number,
    options?: CanvasSnapshotOptions
  ): Promise<{
    data: Uint8Array;
    width: number;
    height: number;
  }>;
}

/**
 * Options for canvas snapshot capture.
 */
export interface CanvasSnapshotOptions {
  /**
   * Only include layers below this actor (excludes self and actors above).
   * When set, the snapshot will hide the specified actor and all actors
   * with higher z-index before capturing.
   */
  belowActorId?: string;
}

/**
 * Canvas snapshot for storage/review.
 */
export interface CanvasSnapshot {
  /** Snapshot timestamp */
  timestamp: number;

  /** Canvas width */
  width: number;

  /** Canvas height */
  height: number;

  /** Base64 encoded PNG image */
  imageData: string;

  /** Active actors at time of snapshot */
  activeActorIds: string[];
}
