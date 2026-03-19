/**
 * Global Error Handler
 *
 * Catches uncaught errors and unhandled promise rejections.
 * Triggers page reload if error frequency exceeds threshold.
 * Includes reload loop protection via sessionStorage.
 */

const ERROR_WINDOW_MS = 30000;
const MAX_ERRORS_IN_WINDOW = 5;
const RELOAD_WINDOW_MS = 300000; // 5 minutes
const MAX_RELOADS_IN_WINDOW = 3;

const STORAGE_KEY_RELOAD_COUNT = 'art-install-reload-count';
const STORAGE_KEY_RELOAD_TIMESTAMP = 'art-install-reload-ts';

export class GlobalErrorHandler {
  private errorTimestamps: number[] = [];
  private onReloadRequest: (() => void) | null = null;

  constructor() {
    this.handleError = this.handleError.bind(this);
    this.handleRejection = this.handleRejection.bind(this);
  }

  /**
   * Attach global error listeners. Call before main() runs.
   */
  install(): void {
    window.addEventListener('error', this.handleError);
    window.addEventListener('unhandledrejection', this.handleRejection);
    console.log('[GlobalErrorHandler] Installed');
  }

  /**
   * Remove global error listeners.
   */
  uninstall(): void {
    window.removeEventListener('error', this.handleError);
    window.removeEventListener('unhandledrejection', this.handleRejection);
  }

  /**
   * Set a callback invoked before reload (e.g., to log or cleanup).
   */
  setOnReloadRequest(cb: () => void): void {
    this.onReloadRequest = cb;
  }

  /**
   * Request a page reload with loop protection.
   */
  requestReload(): void {
    if (this.isReloadLoopDetected()) {
      console.error('[GlobalErrorHandler] Reload loop detected — refusing auto-reload');
      return;
    }
    this.recordReload();
    this.onReloadRequest?.();
    console.warn('[GlobalErrorHandler] Triggering page reload');
    window.location.reload();
  }

  private handleError(event: ErrorEvent): void {
    console.error('[GlobalErrorHandler] Uncaught error:', event.error ?? event.message);
    this.trackError();
  }

  private handleRejection(event: PromiseRejectionEvent): void {
    console.error('[GlobalErrorHandler] Unhandled rejection:', event.reason);
    this.trackError();
  }

  private trackError(): void {
    const now = Date.now();
    this.errorTimestamps.push(now);

    // Trim old entries
    const cutoff = now - ERROR_WINDOW_MS;
    while (this.errorTimestamps.length > 0 && this.errorTimestamps[0] < cutoff) {
      this.errorTimestamps.shift();
    }

    if (this.errorTimestamps.length >= MAX_ERRORS_IN_WINDOW) {
      console.error(
        `[GlobalErrorHandler] ${this.errorTimestamps.length} errors in ${ERROR_WINDOW_MS / 1000}s — requesting reload`
      );
      this.requestReload();
    }
  }

  private isReloadLoopDetected(): boolean {
    try {
      const countStr = sessionStorage.getItem(STORAGE_KEY_RELOAD_COUNT);
      const tsStr = sessionStorage.getItem(STORAGE_KEY_RELOAD_TIMESTAMP);
      if (!countStr || !tsStr) return false;

      const count = parseInt(countStr, 10);
      const ts = parseInt(tsStr, 10);
      if (isNaN(count) || isNaN(ts)) return false;

      // If we've reloaded MAX times within the window, it's a loop
      if (Date.now() - ts < RELOAD_WINDOW_MS && count >= MAX_RELOADS_IN_WINDOW) {
        return true;
      }

      // Window expired — reset
      if (Date.now() - ts >= RELOAD_WINDOW_MS) {
        sessionStorage.removeItem(STORAGE_KEY_RELOAD_COUNT);
        sessionStorage.removeItem(STORAGE_KEY_RELOAD_TIMESTAMP);
      }
      return false;
    } catch {
      return false;
    }
  }

  private recordReload(): void {
    try {
      const tsStr = sessionStorage.getItem(STORAGE_KEY_RELOAD_TIMESTAMP);
      const ts = tsStr ? parseInt(tsStr, 10) : 0;

      if (Date.now() - ts >= RELOAD_WINDOW_MS || isNaN(ts)) {
        // Start a new window
        sessionStorage.setItem(STORAGE_KEY_RELOAD_COUNT, '1');
        sessionStorage.setItem(STORAGE_KEY_RELOAD_TIMESTAMP, String(Date.now()));
      } else {
        const count = parseInt(sessionStorage.getItem(STORAGE_KEY_RELOAD_COUNT) || '0', 10);
        sessionStorage.setItem(STORAGE_KEY_RELOAD_COUNT, String(count + 1));
      }
    } catch {
      // sessionStorage may be unavailable
    }
  }
}
