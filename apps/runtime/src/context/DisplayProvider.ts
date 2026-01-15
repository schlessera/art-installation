/**
 * Display Context Provider
 *
 * Provides display mode context (light/dark) to actors.
 * The mode is randomized at the start of each cycle unless forced via configuration.
 */

import type { DisplayContext, DisplayMode } from '@art/types';

/**
 * Configuration for DisplayProvider.
 */
export interface DisplayProviderConfig {
  /** Force a specific mode (bypasses random selection) */
  forcedMode?: DisplayMode;
}

/**
 * Provides display context data.
 */
export class DisplayProvider implements DisplayContext {
  private darkMode: boolean;
  private forcedMode: DisplayMode | null;

  constructor(config: DisplayProviderConfig = {}) {
    this.forcedMode = config.forcedMode ?? null;

    // Initial mode: forced or random 50/50
    if (this.forcedMode === 'dark') {
      this.darkMode = true;
    } else if (this.forcedMode === 'light') {
      this.darkMode = false;
    } else {
      this.darkMode = Math.random() < 0.5;
    }
  }

  /**
   * Check if the current cycle is rendering in dark mode.
   */
  isDarkMode(): boolean {
    return this.darkMode;
  }

  /**
   * Get the current display mode.
   */
  mode(): DisplayMode {
    return this.darkMode ? 'dark' : 'light';
  }

  /**
   * Get the base color for the current mode.
   * Returns 0x000000 for dark mode, 0xffffff for light mode.
   */
  baseColor(): number {
    return this.darkMode ? 0x000000 : 0xffffff;
  }

  /**
   * Get the accent color that contrasts with the current mode.
   * Returns 0xffffff for dark mode, 0x000000 for light mode.
   */
  accentColor(): number {
    return this.darkMode ? 0xffffff : 0x000000;
  }

  /**
   * Called at the start of each cycle to randomize the display mode.
   * If a mode is forced, this method has no effect.
   */
  newCycle(): void {
    if (this.forcedMode === null) {
      this.darkMode = Math.random() < 0.5;
    }
  }

  /**
   * Force a specific mode (useful for URL parameter overrides).
   */
  setForcedMode(mode: DisplayMode | null): void {
    this.forcedMode = mode;
    if (mode === 'dark') {
      this.darkMode = true;
    } else if (mode === 'light') {
      this.darkMode = false;
    }
  }

  /**
   * Get the currently forced mode (null if random).
   */
  getForcedMode(): DisplayMode | null {
    return this.forcedMode;
  }
}
