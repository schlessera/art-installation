/**
 * Snapshot Capture
 *
 * Captures canvas snapshots and converts them to various formats
 * for AI review and gallery storage.
 */

import type { CanvasManager } from '../engine/CanvasManager';
import type { ContextSnapshot } from '@art/types';

export interface CapturedSnapshot {
  /** Unique snapshot ID */
  id: string;

  /** Timestamp of capture */
  timestamp: Date;

  /** Canvas dimensions */
  width: number;
  height: number;

  /** PNG data URL (data:image/png;base64,...) */
  dataUrl: string;

  /** Raw base64 data (without data URL prefix) */
  base64: string;

  /** Contributing actor IDs */
  actorIds: string[];

  /** Cycle number when captured */
  cycleNumber: number;

  /** Frame count at capture */
  frameCount: number;

  /** Context snapshot at capture time */
  context: ContextSnapshot;
}

export interface ThumbnailOptions {
  width: number;
  height: number;
  quality?: number;
}

/**
 * Captures and processes canvas snapshots.
 */
export class SnapshotCapture {
  private canvasManager: CanvasManager;
  private snapshotCounter = 0;

  constructor(canvasManager: CanvasManager) {
    this.canvasManager = canvasManager;
  }

  /**
   * Generate a unique snapshot ID.
   */
  private generateId(): string {
    const timestamp = Date.now();
    const counter = ++this.snapshotCounter;
    return `snapshot-${timestamp}-${counter.toString().padStart(4, '0')}`;
  }

  /**
   * Capture a full-resolution snapshot of the current canvas.
   */
  capture(
    actorIds: string[],
    cycleNumber: number,
    frameCount: number,
    context: ContextSnapshot
  ): CapturedSnapshot {
    const dataUrl = this.canvasManager.toDataURL();
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const size = this.canvasManager.getSize();

    return {
      id: this.generateId(),
      timestamp: new Date(),
      width: size.width,
      height: size.height,
      dataUrl,
      base64,
      actorIds,
      cycleNumber,
      frameCount,
      context,
    };
  }

  /**
   * Create a thumbnail from a captured snapshot.
   * Maintains aspect ratio of the source image.
   */
  async createThumbnail(
    snapshot: CapturedSnapshot,
    options: Partial<ThumbnailOptions> = {}
  ): Promise<string> {
    // Calculate thumbnail dimensions maintaining aspect ratio
    const maxDimension = 320;
    const sourceAspect = snapshot.width / snapshot.height;

    let thumbWidth: number;
    let thumbHeight: number;

    if (options.width && options.height) {
      // Use explicit dimensions if provided
      thumbWidth = options.width;
      thumbHeight = options.height;
    } else if (sourceAspect > 1) {
      // Landscape: constrain by width
      thumbWidth = maxDimension;
      thumbHeight = Math.round(maxDimension / sourceAspect);
    } else {
      // Portrait or square: constrain by height
      thumbHeight = maxDimension;
      thumbWidth = Math.round(maxDimension * sourceAspect);
    }

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = thumbWidth;
        canvas.height = thumbHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Clean up image
          img.src = '';
          reject(new Error('Failed to get 2D context for thumbnail'));
          return;
        }

        // Draw scaled image
        ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);

        // Convert to JPEG for smaller file size
        const quality = options.quality ?? 0.8;
        const thumbnailDataUrl = canvas.toDataURL('image/jpeg', quality);

        // Clean up to prevent memory leak
        img.src = '';
        canvas.width = 0;
        canvas.height = 0;

        resolve(thumbnailDataUrl);
      };

      img.onerror = () => {
        img.src = '';
        reject(new Error('Failed to load image for thumbnail'));
      };

      img.src = snapshot.dataUrl;
    });
  }

  /**
   * Convert a snapshot to a PNG Blob.
   */
  async toBlob(snapshot: CapturedSnapshot): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let canvas: HTMLCanvasElement | null = null;

      img.onload = () => {
        canvas = document.createElement('canvas');
        canvas.width = snapshot.width;
        canvas.height = snapshot.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          img.src = '';
          reject(new Error('Failed to get 2D context'));
          return;
        }

        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            // Clean up to prevent memory leak
            img.src = '';
            if (canvas) {
              canvas.width = 0;
              canvas.height = 0;
            }

            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob'));
            }
          },
          'image/png',
          1.0
        );
      };

      img.onerror = () => {
        img.src = '';
        reject(new Error('Failed to load image'));
      };

      img.src = snapshot.dataUrl;
    });
  }

  /**
   * Get image dimensions from a data URL.
   */
  async getImageDimensions(
    dataUrl: string
  ): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const dimensions = { width: img.naturalWidth, height: img.naturalHeight };
        // Clean up to prevent memory leak
        img.src = '';
        resolve(dimensions);
      };

      img.onerror = () => {
        img.src = '';
        reject(new Error('Failed to load image'));
      };

      img.src = dataUrl;
    });
  }

  /**
   * Resize a snapshot to specific dimensions.
   */
  async resize(
    snapshot: CapturedSnapshot,
    width: number,
    height: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          img.src = '';
          reject(new Error('Failed to get 2D context'));
          return;
        }

        // Use high-quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const result = canvas.toDataURL('image/png');

        // Clean up to prevent memory leak
        img.src = '';
        canvas.width = 0;
        canvas.height = 0;

        resolve(result);
      };

      img.onerror = () => {
        img.src = '';
        reject(new Error('Failed to load image'));
      };

      img.src = snapshot.dataUrl;
    });
  }

  /**
   * Calculate file size estimate from base64 data.
   */
  estimateFileSize(base64: string): number {
    // Base64 increases size by ~33%
    const base64Length = base64.length;
    const padding = (base64.match(/=/g) || []).length;
    return Math.floor((base64Length * 3) / 4 - padding);
  }
}
