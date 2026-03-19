/**
 * Connectivity Monitor
 *
 * Wraps navigator.onLine and online/offline window events.
 * Provides reactive callbacks for connectivity changes.
 */

export class ConnectivityMonitor {
  private onlineCallbacks: (() => void)[] = [];
  private offlineCallbacks: (() => void)[] = [];
  private handleOnline: () => void;
  private handleOffline: () => void;

  constructor() {
    this.handleOnline = () => {
      console.log('[ConnectivityMonitor] Online');
      for (const cb of this.onlineCallbacks) {
        try { cb(); } catch (e) { console.error('[ConnectivityMonitor] Online callback error:', e); }
      }
    };
    this.handleOffline = () => {
      console.log('[ConnectivityMonitor] Offline');
      for (const cb of this.offlineCallbacks) {
        try { cb(); } catch (e) { console.error('[ConnectivityMonitor] Offline callback error:', e); }
      }
    };
  }

  /**
   * Start listening for connectivity changes.
   */
  install(): void {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    console.log(`[ConnectivityMonitor] Installed (currently ${this.isOnline() ? 'online' : 'offline'})`);
  }

  /**
   * Stop listening.
   */
  uninstall(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  /**
   * Check current connectivity state.
   */
  isOnline(): boolean {
    return navigator.onLine;
  }

  /**
   * Register callback for when connectivity is restored.
   */
  onOnline(cb: () => void): () => void {
    this.onlineCallbacks.push(cb);
    return () => {
      const idx = this.onlineCallbacks.indexOf(cb);
      if (idx > -1) this.onlineCallbacks.splice(idx, 1);
    };
  }

  /**
   * Register callback for when connectivity is lost.
   */
  onOffline(cb: () => void): () => void {
    this.offlineCallbacks.push(cb);
    return () => {
      const idx = this.offlineCallbacks.indexOf(cb);
      if (idx > -1) this.offlineCallbacks.splice(idx, 1);
    };
  }
}
