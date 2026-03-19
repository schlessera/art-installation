/**
 * WebGL Context Loss Recovery
 *
 * Handles WebGL context lost/restored events on the Pixi.js canvas.
 * On context loss: pauses render loop.
 * On context restore: reinitializes CanvasManager, restarts render loop.
 * If not restored within 15s: triggers page reload.
 */

import type { CanvasManager } from '../engine/CanvasManager';
import type { GlobalErrorHandler } from './GlobalErrorHandler';

const CONTEXT_RESTORE_TIMEOUT_MS = 15000;

export class WebGLRecovery {
  private canvas: HTMLCanvasElement | null = null;
  private restoreTimeout: ReturnType<typeof setTimeout> | null = null;
  private onContextLost: (() => void) | null = null;
  private onContextRestored: (() => void) | null = null;

  // Bound listeners for cleanup
  private handleLost: ((e: Event) => void) | null = null;
  private handleRestored: ((e: Event) => void) | null = null;

  constructor(
    private canvasManager: CanvasManager,
    private errorHandler: GlobalErrorHandler,
    callbacks?: {
      onContextLost?: () => void;
      onContextRestored?: () => void;
    }
  ) {
    this.onContextLost = callbacks?.onContextLost ?? null;
    this.onContextRestored = callbacks?.onContextRestored ?? null;
  }

  /**
   * Attach context loss/restore listeners.
   */
  install(): void {
    this.canvas = this.canvasManager.getCanvas();
    if (!this.canvas) {
      console.warn('[WebGLRecovery] No canvas available — skipping install');
      return;
    }

    this.handleLost = (e: Event) => {
      e.preventDefault(); // Required to allow context restore
      console.warn('[WebGLRecovery] WebGL context lost');
      this.onContextLost?.();

      // Set a timeout — if not restored, reload
      this.restoreTimeout = setTimeout(() => {
        console.error('[WebGLRecovery] Context not restored within timeout — requesting reload');
        this.errorHandler.requestReload();
      }, CONTEXT_RESTORE_TIMEOUT_MS);
    };

    this.handleRestored = () => {
      console.log('[WebGLRecovery] WebGL context restored');

      if (this.restoreTimeout) {
        clearTimeout(this.restoreTimeout);
        this.restoreTimeout = null;
      }

      this.onContextRestored?.();
    };

    this.canvas.addEventListener('webglcontextlost', this.handleLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleRestored);
    console.log('[WebGLRecovery] Installed');
  }

  /**
   * Remove listeners and cleanup.
   */
  uninstall(): void {
    if (this.canvas && this.handleLost) {
      this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    }
    if (this.canvas && this.handleRestored) {
      this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    }
    if (this.restoreTimeout) {
      clearTimeout(this.restoreTimeout);
      this.restoreTimeout = null;
    }
  }
}
