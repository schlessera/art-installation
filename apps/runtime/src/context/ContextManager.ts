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
  DisplayContext,
  DisplayMode,
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
import { VideoProvider } from './VideoProvider';
import { DisplayProvider } from './DisplayProvider';
import { SocialProvider } from './SocialProvider';

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
  isAvailable(): boolean {
    return false;
  }

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

  /** Enable social context (fetches from gallery /api/buzz) */
  enableSocial?: boolean;

  /** Gallery API URL for social buzz data */
  galleryApiUrl?: string;

  /** Force display mode (bypasses random selection per cycle) */
  forcedDisplayMode?: DisplayMode;
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
  public readonly display: DisplayContext;

  private timeProvider: TimeProvider;
  private weatherProvider: WeatherProvider;
  private audioProvider: AudioProvider;
  private videoProvider: VideoProvider | null = null;
  private socialProvider: SocialProvider | null = null;
  private displayProvider: DisplayProvider;

  private config: Required<Omit<ContextManagerConfig, 'forcedDisplayMode' | 'galleryApiUrl'>> & {
    forcedDisplayMode?: DisplayMode;
    galleryApiUrl?: string;
  };

  constructor(config: ContextManagerConfig = {}) {
    this.config = {
      enableAudio: config.enableAudio ?? true,
      enableVideo: config.enableVideo ?? false,
      enableSocial: config.enableSocial ?? false,
      forcedDisplayMode: config.forcedDisplayMode,
      galleryApiUrl: config.galleryApiUrl,
    };

    // Initialize providers
    this.timeProvider = new TimeProvider();
    this.weatherProvider = new WeatherProvider({ useMock: true });
    this.audioProvider = new AudioProvider();
    this.displayProvider = new DisplayProvider({
      forcedMode: config.forcedDisplayMode,
    });

    // Set up context interfaces
    this.time = this.timeProvider;
    this.weather = this.weatherProvider;
    this.audio = this.audioProvider;
    this.display = this.displayProvider;

    // Initialize video provider or use mock
    if (this.config.enableVideo) {
      this.videoProvider = new VideoProvider({
        analysisWidth: 160,
        analysisHeight: 120,
        analysisInterval: 50,
      });
      this.video = this.videoProvider;
    } else {
      this.video = new MockVideoContext();
    }

    // Initialize social provider or use mock
    if (this.config.enableSocial && config.galleryApiUrl) {
      this.socialProvider = new SocialProvider({
        galleryApiUrl: config.galleryApiUrl,
      });
      this.social = this.socialProvider;
    } else {
      this.social = new MockSocialContext();
    }
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

    // Start video if enabled
    if (this.config.enableVideo && this.videoProvider) {
      await this.videoProvider.start();
    }

    // Start social if enabled
    if (this.socialProvider) {
      this.socialProvider.start();
    }

    console.log('[ContextManager] Context providers started');
  }

  /**
   * Stop all context providers.
   */
  stop(): void {
    this.weatherProvider.stop();
    this.audioProvider.stop();
    if (this.videoProvider) {
      this.videoProvider.stop();
    }
    if (this.socialProvider) {
      this.socialProvider.stop();
    }
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

    // Video needs per-frame updates for motion detection
    if (this.config.enableVideo && this.videoProvider?.isAvailable()) {
      this.videoProvider.update();
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
      display: {
        mode: this.display.mode(),
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
   * Get the video provider for configuration.
   */
  getVideoProvider(): VideoProvider | null {
    return this.videoProvider;
  }

  /**
   * Set the target canvas dimensions for video coordinate mapping.
   * Call this after canvas initialization to ensure motion regions
   * are correctly mapped from video space to canvas space.
   */
  setVideoTargetDimensions(width: number, height: number): void {
    if (this.videoProvider) {
      this.videoProvider.setTargetDimensions(width, height);
    }
  }

  /**
   * Get the ContextAPI interface.
   */
  getContextAPI(): ContextAPI {
    return this;
  }

  /**
   * Get the display provider for configuration.
   */
  getDisplayProvider(): DisplayProvider {
    return this.displayProvider;
  }

  /**
   * Called at the start of each cycle to randomize cycle-specific context.
   * This randomizes the display mode (unless forced via config).
   */
  prepareNewCycle(): void {
    this.displayProvider.newCycle();
    console.log(`[ContextManager] New cycle: display mode = ${this.displayProvider.mode()}`);
  }
}
