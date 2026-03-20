/**
 * Memory Pressure Monitor
 *
 * Polls performance.memory (Chrome-only) to detect memory pressure.
 * Warning at 70% heap: triggers cycle end callback.
 * Critical at 85% heap: schedules page reload.
 * Silently degrades if performance.memory is unavailable.
 */

import type { GlobalErrorHandler } from './GlobalErrorHandler';

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

const POLL_INTERVAL_MS = 5000;
const WARNING_THRESHOLD = 0.5;
const CRITICAL_THRESHOLD = 0.7;
const CRITICAL_RELOAD_DELAY_MS = 2000;

export class MemoryMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private errorHandler: GlobalErrorHandler;
  private onWarning: (() => void) | null = null;
  private available = false;

  constructor(errorHandler: GlobalErrorHandler) {
    this.errorHandler = errorHandler;
    this.available = this.checkAvailability();
  }

  private checkAvailability(): boolean {
    try {
      const perf = performance as Performance & { memory?: PerformanceMemory };
      return typeof perf.memory?.usedJSHeapSize === 'number';
    } catch {
      return false;
    }
  }

  /**
   * Set callback for memory warning (70% threshold).
   */
  setOnWarning(cb: () => void): void {
    this.onWarning = cb;
  }

  /**
   * Start periodic memory monitoring.
   */
  start(): void {
    if (!this.available) {
      console.log('[MemoryMonitor] performance.memory unavailable — monitoring disabled');
      return;
    }

    this.timer = setInterval(() => this.check(), POLL_INTERVAL_MS);
    console.log('[MemoryMonitor] Started');
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private check(): void {
    const perf = performance as Performance & { memory?: PerformanceMemory };
    const mem = perf.memory;
    if (!mem) return;

    const usage = mem.usedJSHeapSize / mem.jsHeapSizeLimit;

    if (usage >= CRITICAL_THRESHOLD) {
      console.error(
        `[MemoryMonitor] CRITICAL: ${(usage * 100).toFixed(1)}% heap used ` +
        `(${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB / ${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB) — ` +
        `scheduling reload in ${CRITICAL_RELOAD_DELAY_MS / 1000}s`
      );
      this.stop();
      setTimeout(() => this.errorHandler.requestReload(), CRITICAL_RELOAD_DELAY_MS);
    } else if (usage >= WARNING_THRESHOLD) {
      console.warn(
        `[MemoryMonitor] WARNING: ${(usage * 100).toFixed(1)}% heap used ` +
        `(${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB / ${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB)`
      );
      this.onWarning?.();
    }
  }
}
