/**
 * Weather Context Provider
 *
 * Provides weather-related context data to actors.
 * Currently uses mock data - can be connected to a weather API.
 */

import type { WeatherContext, WeatherCondition } from '@art/types';

/**
 * Weather data from external source.
 */
export interface WeatherData {
  temperature: number;
  humidity: number;
  condition: WeatherCondition;
  windSpeed: number;
  windDirection: number;
  cloudCoverage: number;
  uvIndex: number;
  precipitationRate: number;
  pressure: number;
  visibility: number;
}

/**
 * Configuration for WeatherProvider.
 */
export interface WeatherProviderConfig {
  /** Update interval in ms (default: 600000 = 10 minutes) */
  updateInterval?: number;

  /** Weather API endpoint (optional) */
  apiEndpoint?: string;

  /** API key for weather service (optional) */
  apiKey?: string;

  /** Use mock data instead of API */
  useMock?: boolean;
}

const DEFAULT_WEATHER: WeatherData = {
  temperature: 20,
  humidity: 50,
  condition: 'clear',
  windSpeed: 5,
  windDirection: 180,
  cloudCoverage: 20,
  uvIndex: 3,
  precipitationRate: 0,
  pressure: 1013,
  visibility: 10000,
};

/**
 * Provides weather context data.
 */
export class WeatherProvider implements WeatherContext {
  private config: Required<WeatherProviderConfig>;
  private currentWeather: WeatherData;
  private lastUpdate = 0;
  private updateTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WeatherProviderConfig = {}) {
    this.config = {
      updateInterval: config.updateInterval ?? 600000,
      apiEndpoint: config.apiEndpoint ?? '',
      apiKey: config.apiKey ?? '',
      useMock: config.useMock ?? true,
    };
    this.currentWeather = { ...DEFAULT_WEATHER };
  }

  /**
   * Start automatic weather updates.
   */
  start(): void {
    if (this.updateTimer) return;

    this.update();
    this.updateTimer = setInterval(() => this.update(), this.config.updateInterval);
  }

  /**
   * Stop automatic weather updates.
   */
  stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * Update weather data.
   */
  async update(): Promise<void> {
    if (this.config.useMock) {
      this.updateMockWeather();
    } else {
      await this.fetchWeatherData();
    }
    this.lastUpdate = Date.now();
  }

  /**
   * Update with mock weather data (varies slightly over time).
   */
  private updateMockWeather(): void {
    const hour = new Date().getHours();

    // Temperature varies with time of day
    const baseTemp = 15 + Math.sin((hour / 24) * Math.PI * 2 - Math.PI / 2) * 10;
    this.currentWeather.temperature = baseTemp + (Math.random() - 0.5) * 3;

    // Humidity inversely related to temperature
    this.currentWeather.humidity = Math.max(
      20,
      Math.min(90, 70 - (this.currentWeather.temperature - 15) * 2 + (Math.random() - 0.5) * 10)
    );

    // Random weather condition with weighted probabilities
    const conditions: WeatherCondition[] = [
      'clear', 'clear', 'clear', 'clouds', 'clouds', 'rain', 'mist',
    ];
    this.currentWeather.condition = conditions[Math.floor(Math.random() * conditions.length)];

    // Adjust precipitation based on condition
    this.currentWeather.precipitationRate =
      this.currentWeather.condition === 'rain' ? Math.random() * 5 :
      this.currentWeather.condition === 'drizzle' ? Math.random() * 1 : 0;

    // Wind varies randomly
    this.currentWeather.windSpeed = Math.random() * 15;
    this.currentWeather.windDirection = Math.random() * 360;

    // Cloud coverage based on condition
    this.currentWeather.cloudCoverage =
      this.currentWeather.condition === 'clear' ? Math.random() * 20 :
      this.currentWeather.condition === 'clouds' ? 50 + Math.random() * 50 :
      70 + Math.random() * 30;

    // UV index based on time and cloud coverage
    const uvBase = hour >= 10 && hour <= 16 ? 6 : hour >= 8 && hour <= 18 ? 3 : 0;
    this.currentWeather.uvIndex = Math.max(
      0,
      uvBase * (1 - this.currentWeather.cloudCoverage / 100)
    );
  }

  /**
   * Fetch weather data from API.
   */
  private async fetchWeatherData(): Promise<void> {
    if (!this.config.apiEndpoint) {
      console.warn('[WeatherProvider] No API endpoint configured, using mock data');
      this.updateMockWeather();
      return;
    }

    try {
      const response = await fetch(this.config.apiEndpoint, {
        headers: this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {},
      });

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const data = await response.json();
      // Map API response to WeatherData (implementation depends on API)
      this.mapApiResponse(data);
    } catch (error) {
      console.error('[WeatherProvider] Failed to fetch weather:', error);
      // Keep current data on error
    }
  }

  /**
   * Map API response to WeatherData (override for specific API).
   */
  protected mapApiResponse(_data: unknown): void {
    // Default implementation does nothing - override in subclass
    console.warn('[WeatherProvider] mapApiResponse not implemented');
  }

  /**
   * Set weather data manually (for testing/demo).
   */
  setWeather(data: Partial<WeatherData>): void {
    Object.assign(this.currentWeather, data);
  }

  // ============ WeatherContext Implementation ============

  temperature(): number {
    return this.currentWeather.temperature;
  }

  humidity(): number {
    return this.currentWeather.humidity;
  }

  condition(): WeatherCondition {
    return this.currentWeather.condition;
  }

  windSpeed(): number {
    return this.currentWeather.windSpeed;
  }

  windDirection(): number {
    return this.currentWeather.windDirection;
  }

  cloudCoverage(): number {
    return this.currentWeather.cloudCoverage;
  }

  uvIndex(): number {
    return this.currentWeather.uvIndex;
  }

  isPrecipitating(): boolean {
    return this.currentWeather.precipitationRate > 0;
  }

  precipitationRate(): number {
    return this.currentWeather.precipitationRate;
  }

  pressure(): number {
    return this.currentWeather.pressure;
  }

  visibility(): number {
    return this.currentWeather.visibility;
  }

  /**
   * Get time since last update.
   */
  getTimeSinceUpdate(): number {
    return Date.now() - this.lastUpdate;
  }

  /**
   * Get all current weather data.
   */
  getData(): WeatherData {
    return { ...this.currentWeather };
  }
}
