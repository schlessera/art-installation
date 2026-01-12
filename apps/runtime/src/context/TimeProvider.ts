/**
 * Time Context Provider
 *
 * Provides time-related context data to actors.
 */

import type { TimeContext, Season } from '@art/types';

/**
 * Calculate moon phase (0-1 where 0 = new moon, 0.5 = full moon).
 */
function calculateMoonPhase(date: Date): number {
  // Synodic month is approximately 29.53 days
  const synodicMonth = 29.53058867;

  // Known new moon: January 6, 2000 at 18:14 UTC
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');

  const daysSinceKnown = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
  const lunations = daysSinceKnown / synodicMonth;
  const phase = lunations - Math.floor(lunations);

  return phase;
}

/**
 * Determine season based on date and hemisphere.
 */
function getSeason(date: Date, isNorthernHemisphere = true): Season {
  const month = date.getMonth();

  // Meteorological seasons
  if (month >= 2 && month <= 4) {
    return isNorthernHemisphere ? 'spring' : 'autumn';
  } else if (month >= 5 && month <= 7) {
    return isNorthernHemisphere ? 'summer' : 'winter';
  } else if (month >= 8 && month <= 10) {
    return isNorthernHemisphere ? 'autumn' : 'spring';
  } else {
    return isNorthernHemisphere ? 'winter' : 'summer';
  }
}

/**
 * Configuration for TimeProvider.
 */
export interface TimeProviderConfig {
  /** Installation latitude (for daylight calculation) */
  latitude?: number;

  /** Installation longitude (for daylight calculation) */
  longitude?: number;

  /** Is installation in northern hemisphere */
  isNorthernHemisphere?: boolean;

  /** Time scale factor (1 = real time, 2 = 2x speed, etc.) */
  timeScale?: number;
}

/**
 * Provides time context data.
 */
export class TimeProvider implements TimeContext {
  private startTime: number;
  private config: Required<TimeProviderConfig>;

  constructor(config: TimeProviderConfig = {}) {
    this.startTime = Date.now();
    this.config = {
      latitude: config.latitude ?? 52.52, // Berlin default
      longitude: config.longitude ?? 13.405,
      isNorthernHemisphere: config.isNorthernHemisphere ?? true,
      timeScale: config.timeScale ?? 1,
    };
  }

  /**
   * Get current date/time (respecting time scale).
   */
  now(): Date {
    if (this.config.timeScale === 1) {
      return new Date();
    }

    // Apply time scale
    const elapsed = Date.now() - this.startTime;
    const scaledElapsed = elapsed * this.config.timeScale;
    return new Date(this.startTime + scaledElapsed);
  }

  /**
   * Get milliseconds since installation started.
   */
  elapsed(): number {
    const elapsed = Date.now() - this.startTime;
    return elapsed * this.config.timeScale;
  }

  /**
   * Get time of day as progress (0-1, 0=midnight, 0.5=noon).
   */
  dayProgress(): number {
    const now = this.now();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    return totalSeconds / 86400; // 24 * 60 * 60
  }

  /**
   * Check if it's daytime.
   * Uses simple approximation based on hour.
   */
  isDaytime(): boolean {
    const hour = this.hour();
    // Simple approximation: daytime is 6 AM to 8 PM
    return hour >= 6 && hour < 20;
  }

  /**
   * Get current moon phase (0-1, 0 = new moon, 0.5 = full moon).
   */
  moonPhase(): number {
    return calculateMoonPhase(this.now());
  }

  /**
   * Get current season.
   */
  season(): Season {
    return getSeason(this.now(), this.config.isNorthernHemisphere);
  }

  /**
   * Get current hour (0-23).
   */
  hour(): number {
    return this.now().getHours();
  }

  /**
   * Get current minute (0-59).
   */
  minute(): number {
    return this.now().getMinutes();
  }

  /**
   * Get day of week (0-6, 0 = Sunday).
   */
  dayOfWeek(): number {
    return this.now().getDay();
  }

  /**
   * Set time scale for accelerated time.
   */
  setTimeScale(scale: number): void {
    this.config.timeScale = scale;
  }

  /**
   * Reset start time.
   */
  reset(): void {
    this.startTime = Date.now();
  }
}
