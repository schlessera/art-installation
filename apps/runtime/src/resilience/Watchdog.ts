/**
 * Watchdog Timer
 *
 * Reloads the page if no frame completes within the timeout period.
 * Each successful frame calls feed() to reset the timer.
 * Uses sessionStorage reload-loop protection (shared with GlobalErrorHandler).
 */

import type { GlobalErrorHandler } from './GlobalErrorHandler';

const DEFAULT_TIMEOUT_MS = 60000;

export class Watchdog {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timeoutMs: number;
  private errorHandler: GlobalErrorHandler;

  constructor(errorHandler: GlobalErrorHandler, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.errorHandler = errorHandler;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Start the watchdog. Must call feed() regularly to prevent reload.
   */
  start(): void {
    this.resetTimer();
    console.log(`[Watchdog] Started (timeout: ${this.timeoutMs}ms)`);
  }

  /**
   * Stop the watchdog.
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Feed the watchdog — call on each successful frame.
   */
  feed(): void {
    this.resetTimer();
  }

  private resetTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      console.error('[Watchdog] No frame completed within timeout — requesting reload');
      this.errorHandler.requestReload();
    }, this.timeoutMs);
  }
}
