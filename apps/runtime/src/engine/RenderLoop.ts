/**
 * Render Loop
 *
 * Manages the animation loop, frame timing, and actor updates.
 */

import type { FrameContext } from '@art/types';
import type { CanvasManager } from './CanvasManager';

/**
 * Stats for debugging and monitoring.
 */
export interface RenderStats {
  fps: number;
  frameCount: number;
  deltaTime: number;
  activeActors: number;
  drawCalls: number;
  averageFrameTime: number;
}

/**
 * Callback for each frame update.
 */
export type FrameCallback = (frame: FrameContext) => void;

/**
 * Callback for stats updates.
 */
export type StatsCallback = (stats: RenderStats) => void;

/**
 * Manages the render loop and frame timing.
 */
export class RenderLoop {
  private canvasManager: CanvasManager;
  private running = false;
  private animationFrameId: number | null = null;

  // Timing
  private lastTime = 0;
  private frameCount = 0;
  private startTime = 0;

  // FPS calculation
  private fpsFrameCount = 0;
  private fpsLastTime = 0;
  private currentFps = 0;

  // Frame time tracking (circular buffer to avoid allocations)
  private frameTimes: Float32Array;
  private frameTimeHead = 0;
  private frameTimeCount = 0;
  private maxFrameTimeSamples = 60;

  // Callbacks
  private frameCallbacks: FrameCallback[] = [];
  private statsCallbacks: StatsCallback[] = [];

  // Stats
  private activeActorCount = 0;
  private drawCallCount = 0;

  // Target frame rate
  private _targetFps = 60;
  private frameInterval = 1000 / 60;

  constructor(canvasManager: CanvasManager) {
    this.canvasManager = canvasManager;
    // Pre-allocate frame time buffer
    this.frameTimes = new Float32Array(this.maxFrameTimeSamples);
  }

  /**
   * Register a callback to be called each frame.
   */
  onFrame(callback: FrameCallback): () => void {
    this.frameCallbacks.push(callback);
    return () => {
      const index = this.frameCallbacks.indexOf(callback);
      if (index > -1) {
        this.frameCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Register a callback for stats updates.
   */
  onStats(callback: StatsCallback): () => void {
    this.statsCallbacks.push(callback);
    return () => {
      const index = this.statsCallbacks.indexOf(callback);
      if (index > -1) {
        this.statsCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Start the render loop.
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    this.fpsLastTime = this.startTime;
    this.frameCount = 0;
    this.fpsFrameCount = 0;

    this.loop(this.startTime);
    console.log('[RenderLoop] Started');
  }

  /**
   * Stop the render loop.
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    console.log('[RenderLoop] Stopped');
  }

  /**
   * Main animation loop.
   */
  private loop = (currentTime: number): void => {
    if (!this.running) return;

    // Request next frame immediately
    this.animationFrameId = requestAnimationFrame(this.loop);

    // Calculate delta time
    const deltaTime = currentTime - this.lastTime;

    // Skip frame if running faster than target
    if (deltaTime < this.frameInterval * 0.9) {
      return;
    }

    this.lastTime = currentTime;

    // Track frame time using circular buffer (no allocations)
    this.frameTimes[this.frameTimeHead] = deltaTime;
    this.frameTimeHead = (this.frameTimeHead + 1) % this.maxFrameTimeSamples;
    if (this.frameTimeCount < this.maxFrameTimeSamples) {
      this.frameTimeCount++;
    }

    // Create frame context
    const frame: FrameContext = {
      deltaTime,
      frameCount: this.frameCount,
      time: currentTime - this.startTime,
    };

    // Reset per-frame counters
    this.drawCallCount = 0;

    // Call frame callbacks
    for (const callback of this.frameCallbacks) {
      try {
        callback(frame);
      } catch (error) {
        console.error('[RenderLoop] Frame callback error:', error);
      }
    }

    this.frameCount++;
    this.fpsFrameCount++;

    // Update FPS every second
    const fpsElapsed = currentTime - this.fpsLastTime;
    if (fpsElapsed >= 1000) {
      this.currentFps = (this.fpsFrameCount * 1000) / fpsElapsed;
      this.fpsFrameCount = 0;
      this.fpsLastTime = currentTime;

      // Notify stats callbacks
      this.notifyStats();
    }
  };

  /**
   * Notify stats callbacks.
   */
  private notifyStats(): void {
    // Get most recent delta time from circular buffer
    const lastIdx = (this.frameTimeHead - 1 + this.maxFrameTimeSamples) % this.maxFrameTimeSamples;
    const stats: RenderStats = {
      fps: this.currentFps,
      frameCount: this.frameCount,
      deltaTime: this.frameTimeCount > 0 ? this.frameTimes[lastIdx] : 0,
      activeActors: this.activeActorCount,
      drawCalls: this.drawCallCount,
      averageFrameTime: this.getAverageFrameTime(),
    };

    for (const callback of this.statsCallbacks) {
      try {
        callback(stats);
      } catch (error) {
        console.error('[RenderLoop] Stats callback error:', error);
      }
    }
  }

  /**
   * Get current FPS.
   */
  getFps(): number {
    return this.currentFps;
  }

  /**
   * Get current frame count.
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Get elapsed time since start.
   */
  getElapsedTime(): number {
    return performance.now() - this.startTime;
  }

  /**
   * Get average frame time.
   */
  getAverageFrameTime(): number {
    if (this.frameTimeCount === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.frameTimeCount; i++) {
      sum += this.frameTimes[i];
    }
    return sum / this.frameTimeCount;
  }

  /**
   * Check if running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Set target FPS.
   */
  setTargetFps(fps: number): void {
    this._targetFps = fps;
    this.frameInterval = 1000 / fps;
  }

  /**
   * Update active actor count (for stats).
   */
  setActiveActorCount(count: number): void {
    this.activeActorCount = count;
  }

  /**
   * Increment draw call count (for stats).
   */
  incrementDrawCalls(count = 1): void {
    this.drawCallCount += count;
  }

  /**
   * Get canvas manager.
   */
  getCanvasManager(): CanvasManager {
    return this.canvasManager;
  }
}
