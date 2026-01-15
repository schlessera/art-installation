/**
 * Context Types
 *
 * Defines the context APIs that provide environmental data to actors.
 */

import type { RGBA, Rectangle, Point } from './canvas';

// ============ Time Context ============

/**
 * Time-related context API.
 */
export interface TimeContext {
  /**
   * Get current timestamp.
   */
  now(): Date;

  /**
   * Get milliseconds since installation started.
   */
  elapsed(): number;

  /**
   * Get time of day as progress (0-1, where 0=midnight, 0.5=noon).
   */
  dayProgress(): number;

  /**
   * Check if it's daytime at installation location.
   */
  isDaytime(): boolean;

  /**
   * Get current phase of moon (0-1).
   * 0 = new moon, 0.5 = full moon
   */
  moonPhase(): number;

  /**
   * Get current season.
   */
  season(): Season;

  /**
   * Get current hour (0-23).
   */
  hour(): number;

  /**
   * Get current minute (0-59).
   */
  minute(): number;

  /**
   * Get day of week (0-6, 0 = Sunday).
   */
  dayOfWeek(): number;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// ============ Weather Context ============

/**
 * Weather condition types.
 */
export type WeatherCondition =
  | 'clear'
  | 'clouds'
  | 'rain'
  | 'drizzle'
  | 'thunderstorm'
  | 'snow'
  | 'mist'
  | 'fog';

/**
 * Weather-related context API.
 */
export interface WeatherContext {
  /**
   * Get current temperature in Celsius.
   */
  temperature(): number;

  /**
   * Get current humidity (0-100).
   */
  humidity(): number;

  /**
   * Get current weather condition.
   */
  condition(): WeatherCondition;

  /**
   * Get wind speed in m/s.
   */
  windSpeed(): number;

  /**
   * Get wind direction in degrees (0-360, 0 = North).
   */
  windDirection(): number;

  /**
   * Get cloud coverage (0-100).
   */
  cloudCoverage(): number;

  /**
   * Get UV index.
   */
  uvIndex(): number;

  /**
   * Check if it's currently precipitating.
   */
  isPrecipitating(): boolean;

  /**
   * Get precipitation amount in mm/h.
   */
  precipitationRate(): number;

  /**
   * Get atmospheric pressure in hPa.
   */
  pressure(): number;

  /**
   * Get visibility in meters.
   */
  visibility(): number;
}

// ============ Audio Context ============

/**
 * Audio level data.
 */
export interface AudioLevels {
  /** Bass level (0-1) */
  bass: number;

  /** Mid level (0-1) */
  mid: number;

  /** Treble level (0-1) */
  treble: number;

  /** Overall level (0-1) */
  overall: number;
}

/**
 * Audio-related context API.
 */
export interface AudioContext {
  /**
   * Check if audio input is available.
   */
  isAvailable(): boolean;

  /**
   * Get current volume level (0-1).
   */
  volume(): number;

  /**
   * Get frequency spectrum (FFT data).
   * Returns array of 128 frequency bins (0-1 each).
   */
  spectrum(): Float32Array;

  /**
   * Get bass level (0-1).
   */
  bass(): number;

  /**
   * Get mid level (0-1).
   */
  mid(): number;

  /**
   * Get treble level (0-1).
   */
  treble(): number;

  /**
   * Get all audio levels.
   */
  levels(): AudioLevels;

  /**
   * Check if a beat was detected this frame.
   */
  isBeat(): boolean;

  /**
   * Get detected BPM (null if not detectable).
   */
  bpm(): number | null;

  /**
   * Get time since last beat in ms.
   */
  timeSinceBeat(): number;

  /**
   * Get energy in a specific frequency range.
   * @param minHz - Minimum frequency
   * @param maxHz - Maximum frequency
   */
  energyInRange(minHz: number, maxHz: number): number;
}

// ============ Video Context ============

/**
 * Motion detection data.
 */
export interface MotionData {
  /** Overall motion intensity (0-1) */
  intensity: number;

  /** Primary motion direction (normalized vector) */
  direction: { x: number; y: number };

  /** Regions with detected motion */
  regions: Rectangle[];
}

/**
 * Facial landmarks from MediaPipe (6 keypoints).
 */
export interface FaceLandmarks {
  leftEye: Point;
  rightEye: Point;
  noseTip: Point;
  mouth: Point;
  leftEarTragion: Point;
  rightEarTragion: Point;
}

/**
 * Face detection data.
 */
export interface FaceData {
  /** Bounding box of detected face */
  bounds: Rectangle;

  /** Detection confidence (0-1) */
  confidence: number;

  /** Estimated emotion (if available) */
  emotion?: 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry';

  /** Facial landmarks (6 keypoints from MediaPipe) */
  landmarks?: FaceLandmarks;
}

/**
 * Video/camera context API.
 */
export interface VideoContext {
  /**
   * Check if video input is available.
   */
  isAvailable(): boolean;

  /**
   * Get current frame as ImageData.
   * Returns null if not available.
   */
  getFrame(): ImageData | null;

  /**
   * Get motion detection data.
   */
  getMotion(): MotionData;

  /**
   * Get dominant color in current frame.
   */
  getDominantColor(): RGBA;

  /**
   * Get dominant colors in current frame.
   * @param count - Number of colors to return
   */
  getDominantColors(count: number): RGBA[];

  /**
   * Get average brightness of video feed (0-1).
   */
  getBrightness(): number;

  /**
   * Get detected faces (if face detection enabled).
   */
  getFaces(): FaceData[];

  /**
   * Get video frame dimensions.
   */
  getDimensions(): { width: number; height: number } | null;

  /**
   * Get color at a specific point in the video feed.
   */
  getColorAt(x: number, y: number): RGBA | null;
}

// ============ Social Context ============

/**
 * Social media mention.
 */
export interface SocialMention {
  /** Mention ID */
  id: string;

  /** Message text */
  text: string;

  /** Source platform */
  platform: 'twitter' | 'mastodon' | 'instagram' | 'discord' | 'other';

  /** Timestamp */
  timestamp: Date;

  /** Sentiment score (-1 to 1) */
  sentiment: number;

  /** Author name (if available) */
  author?: string;
}

/**
 * Social signals context API.
 */
export interface SocialContext {
  /**
   * Check if real social data is available.
   * Returns false when using simulated/mock data.
   */
  isAvailable(): boolean;

  /**
   * Get estimated number of people currently viewing.
   */
  viewerCount(): number;

  /**
   * Get recent social media mentions.
   * @param limit - Maximum number of mentions to return
   */
  getMentions(limit?: number): SocialMention[];

  /**
   * Get overall sentiment from social signals (-1 to 1).
   */
  sentiment(): number;

  /**
   * Get trending keywords from mentions.
   */
  trendingKeywords(): string[];

  /**
   * Get engagement level (0-1).
   * Based on mentions, reactions, viewer count.
   */
  engagementLevel(): number;

  /**
   * Check if there's a recent spike in activity.
   */
  isViralMoment(): boolean;

  /**
   * Get mention count in the last N minutes.
   * @param minutes - Time window
   */
  mentionCount(minutes: number): number;
}

// ============ Display Context ============

/**
 * Display mode type.
 */
export type DisplayMode = 'light' | 'dark';

/**
 * Display-related context API.
 * Provides information about the current rendering mode (light/dark).
 */
export interface DisplayContext {
  /**
   * Check if the current cycle is rendering in dark mode.
   */
  isDarkMode(): boolean;

  /**
   * Get the current display mode.
   */
  mode(): DisplayMode;

  /**
   * Get the base color for the current mode.
   * Returns 0x000000 for dark mode, 0xffffff for light mode.
   */
  baseColor(): number;

  /**
   * Get the accent color that contrasts with the current mode.
   * Returns 0xffffff for dark mode, 0x000000 for light mode.
   */
  accentColor(): number;
}

// ============ Combined Context API ============

/**
 * Combined context API providing all context sources.
 */
export interface ContextAPI {
  /** Time context */
  time: TimeContext;

  /** Weather context */
  weather: WeatherContext;

  /** Audio context */
  audio: AudioContext;

  /** Video context */
  video: VideoContext;

  /** Social context */
  social: SocialContext;

  /** Display context */
  display: DisplayContext;
}

/**
 * Context snapshot for artwork metadata.
 */
export interface ContextSnapshot {
  timestamp: Date;
  time: {
    hour: number;
    dayProgress: number;
    season: Season;
  };
  weather?: {
    condition: WeatherCondition;
    temperature: number;
    humidity: number;
  };
  audio?: {
    averageLevel: number;
    bpm: number | null;
  };
  social?: {
    viewerCount: number;
    sentiment: number;
    mentionCount: number;
  };
  display: {
    mode: DisplayMode;
  };
}
