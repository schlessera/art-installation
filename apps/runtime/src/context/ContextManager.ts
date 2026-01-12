/**
 * Context Manager
 *
 * Aggregates all context providers and provides a unified ContextAPI.
 */

import type {
  ContextAPI,
  ContextSnapshot,
  TimeContext,
  WeatherContext,
  AudioContext as AudioContextType,
  VideoContext,
  SocialContext,
  RGBA,
  MotionData,
  FaceData,
  SocialMention,
  Season,
  WeatherCondition,
} from '@art/types';
import { TimeProvider } from './TimeProvider';
import { WeatherProvider } from './WeatherProvider';
import { AudioProvider } from './AudioProvider';

/**
 * Mock VideoContext implementation.
 */
class MockVideoContext implements VideoContext {
  isAvailable(): boolean {
    return false;
  }

  getFrame(): ImageData | null {
    return null;
  }

  getMotion(): MotionData {
    return {
      intensity: 0,
      direction: { x: 0, y: 0 },
      regions: [],
    };
  }

  getDominantColor(): RGBA {
    return { r: 128, g: 128, b: 128, a: 1 };
  }

  getDominantColors(count: number): RGBA[] {
    return Array(count).fill({ r: 128, g: 128, b: 128, a: 1 });
  }

  getBrightness(): number {
    return 0.5;
  }

  getFaces(): FaceData[] {
    return [];
  }

  getDimensions(): { width: number; height: number } | null {
    return null;
  }

  getColorAt(_x: number, _y: number): RGBA | null {
    return null;
  }
}

/**
 * Mock SocialContext implementation.
 */
class MockSocialContext implements SocialContext {
  viewerCount(): number {
    return Math.floor(Math.random() * 50) + 10;
  }

  getMentions(_limit?: number): SocialMention[] {
    return [];
  }

  sentiment(): number {
    return (Math.random() - 0.5) * 0.4; // Slightly positive/negative
  }

  trendingKeywords(): string[] {
    return ['art', 'hackathon', 'cloudfest'];
  }

  engagementLevel(): number {
    return Math.random() * 0.6 + 0.2;
  }

  isViralMoment(): boolean {
    return false;
  }

  mentionCount(_minutes: number): number {
    return 0;
  }
}

/**
 * Configuration for ContextManager.
 */
export interface ContextManagerConfig {
  /** Enable audio input */
  enableAudio?: boolean;

  /** Enable video input */
  enableVideo?: boolean;

  /** Enable social context (requires API) */
  enableSocial?: boolean;
}

/**
 * Manages all context providers and provides unified access.
 */
export class ContextManager implements ContextAPI {
  public readonly time: TimeContext;
  public readonly weather: WeatherContext;
  public readonly audio: AudioContextType;
  public readonly video: VideoContext;
  public readonly social: SocialContext;

  private timeProvider: TimeProvider;
  private weatherProvider: WeatherProvider;
  private audioProvider: AudioProvider;

  private config: Required<ContextManagerConfig>;

  constructor(config: ContextManagerConfig = {}) {
    this.config = {
      enableAudio: config.enableAudio ?? true,
      enableVideo: config.enableVideo ?? false,
      enableSocial: config.enableSocial ?? false,
    };

    // Initialize providers
    this.timeProvider = new TimeProvider();
    this.weatherProvider = new WeatherProvider({ useMock: true });
    this.audioProvider = new AudioProvider();

    // Set up context interfaces
    this.time = this.timeProvider;
    this.weather = this.weatherProvider;
    this.audio = this.audioProvider;

    // Use mock implementations for video and social
    this.video = new MockVideoContext();
    this.social = new MockSocialContext();
  }

  /**
   * Start all context providers.
   */
  async start(): Promise<void> {
    console.log('[ContextManager] Starting context providers...');

    // Start weather updates
    this.weatherProvider.start();

    // Start audio if enabled
    if (this.config.enableAudio) {
      await this.audioProvider.start();
    }

    console.log('[ContextManager] Context providers started');
  }

  /**
   * Stop all context providers.
   */
  stop(): void {
    this.weatherProvider.stop();
    this.audioProvider.stop();
    console.log('[ContextManager] Context providers stopped');
  }

  /**
   * Update all context providers (call each frame).
   */
  update(): void {
    // Audio needs per-frame updates for analysis
    if (this.config.enableAudio && this.audioProvider.isAvailable()) {
      this.audioProvider.update();
    }
  }

  /**
   * Get a snapshot of current context state.
   */
  getSnapshot(): ContextSnapshot {
    return {
      timestamp: new Date(),
      time: {
        hour: this.time.hour(),
        dayProgress: this.time.dayProgress(),
        season: this.time.season() as Season,
      },
      weather: {
        condition: this.weather.condition() as WeatherCondition,
        temperature: this.weather.temperature(),
        humidity: this.weather.humidity(),
      },
      audio: {
        averageLevel: this.audio.isAvailable() ? this.audio.volume() : 0,
        bpm: this.audio.bpm(),
      },
      social: {
        viewerCount: this.social.viewerCount(),
        sentiment: this.social.sentiment(),
        mentionCount: this.social.mentionCount(60), // Last 60 minutes
      },
    };
  }

  /**
   * Get the time provider for configuration.
   */
  getTimeProvider(): TimeProvider {
    return this.timeProvider;
  }

  /**
   * Get the weather provider for configuration.
   */
  getWeatherProvider(): WeatherProvider {
    return this.weatherProvider;
  }

  /**
   * Get the audio provider for configuration.
   */
  getAudioProvider(): AudioProvider {
    return this.audioProvider;
  }

  /**
   * Get the ContextAPI interface.
   */
  getContextAPI(): ContextAPI {
    return this;
  }
}
