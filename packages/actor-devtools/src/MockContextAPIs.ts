/**
 * Mock Context APIs for Actor Development
 *
 * Provides controllable mock implementations of the context APIs
 * for testing and previewing actors.
 */

import type {
  ContextAPI,
  TimeContext,
  WeatherContext,
  AudioContext,
  VideoContext,
  SocialContext,
  WeatherCondition,
  Season,
  AudioLevels,
  MotionData,
  FaceData,
  SocialMention,
  RGBA,
} from '@art/types';

// ============================================================
// TIME CONTEXT MOCK
// ============================================================

export class MockTimeContext implements TimeContext {
  private _now: Date;
  private _elapsed: number = 0;
  private _speed: number = 1;
  private _startTime: number;

  constructor(initialTime: Date = new Date()) {
    this._now = initialTime;
    this._startTime = Date.now();
  }

  now(): Date {
    return this._now;
  }

  elapsed(): number {
    return (Date.now() - this._startTime) * this._speed;
  }

  dayProgress(): number {
    return (this._now.getHours() + this._now.getMinutes() / 60) / 24;
  }

  isDaytime(): boolean {
    const hour = this._now.getHours();
    return hour >= 6 && hour < 18;
  }

  moonPhase(): number {
    // Simplified moon phase calculation
    const lunarCycle = 29.53; // days
    const knownNewMoon = new Date('2024-01-11').getTime();
    const daysSinceNewMoon = (this._now.getTime() - knownNewMoon) / (1000 * 60 * 60 * 24);
    return (daysSinceNewMoon % lunarCycle) / lunarCycle;
  }

  season(): Season {
    const month = this._now.getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'autumn';
    return 'winter';
  }

  hour(): number {
    return this._now.getHours();
  }

  minute(): number {
    return this._now.getMinutes();
  }

  dayOfWeek(): number {
    return this._now.getDay();
  }

  // ============ Control Methods ============

  /**
   * Set the current time.
   */
  setTime(date: Date): void {
    this._now = date;
  }

  /**
   * Set the time speed multiplier.
   */
  setSpeed(multiplier: number): void {
    this._speed = multiplier;
  }

  /**
   * Advance time by milliseconds.
   */
  tick(ms: number): void {
    this._now = new Date(this._now.getTime() + ms * this._speed);
    this._elapsed += ms * this._speed;
  }

  /**
   * Set time to a specific hour (0-23).
   */
  setHour(hour: number): void {
    this._now.setHours(hour);
  }
}

// ============================================================
// WEATHER CONTEXT MOCK
// ============================================================

export interface WeatherConditions {
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

export class MockWeatherContext implements WeatherContext {
  private _conditions: WeatherConditions = {
    temperature: 20,
    humidity: 50,
    condition: 'clear',
    windSpeed: 5,
    windDirection: 180,
    cloudCoverage: 20,
    uvIndex: 5,
    precipitationRate: 0,
    pressure: 1013,
    visibility: 10000,
  };

  temperature(): number {
    return this._conditions.temperature;
  }

  humidity(): number {
    return this._conditions.humidity;
  }

  condition(): WeatherCondition {
    return this._conditions.condition;
  }

  windSpeed(): number {
    return this._conditions.windSpeed;
  }

  windDirection(): number {
    return this._conditions.windDirection;
  }

  cloudCoverage(): number {
    return this._conditions.cloudCoverage;
  }

  uvIndex(): number {
    return this._conditions.uvIndex;
  }

  isPrecipitating(): boolean {
    return ['rain', 'drizzle', 'thunderstorm', 'snow'].includes(this._conditions.condition);
  }

  precipitationRate(): number {
    return this._conditions.precipitationRate;
  }

  pressure(): number {
    return this._conditions.pressure;
  }

  visibility(): number {
    return this._conditions.visibility;
  }

  // ============ Control Methods ============

  /**
   * Set weather conditions.
   */
  setConditions(conditions: Partial<WeatherConditions>): void {
    this._conditions = { ...this._conditions, ...conditions };
  }

  /**
   * Simulate sunny weather.
   */
  simulateSunny(): void {
    this._conditions = {
      temperature: 25,
      humidity: 40,
      condition: 'clear',
      windSpeed: 5,
      windDirection: 180,
      cloudCoverage: 10,
      uvIndex: 8,
      precipitationRate: 0,
      pressure: 1020,
      visibility: 15000,
    };
  }

  /**
   * Simulate rainy weather.
   */
  simulateRainy(): void {
    this._conditions = {
      temperature: 15,
      humidity: 85,
      condition: 'rain',
      windSpeed: 15,
      windDirection: 270,
      cloudCoverage: 90,
      uvIndex: 1,
      precipitationRate: 5,
      pressure: 1005,
      visibility: 5000,
    };
  }

  /**
   * Simulate storm weather.
   */
  simulateStorm(): void {
    this._conditions = {
      temperature: 12,
      humidity: 95,
      condition: 'thunderstorm',
      windSpeed: 40,
      windDirection: 315,
      cloudCoverage: 100,
      uvIndex: 0,
      precipitationRate: 20,
      pressure: 995,
      visibility: 1000,
    };
  }

  /**
   * Simulate snowy weather.
   */
  simulateSnowy(): void {
    this._conditions = {
      temperature: -5,
      humidity: 80,
      condition: 'snow',
      windSpeed: 10,
      windDirection: 0,
      cloudCoverage: 100,
      uvIndex: 2,
      precipitationRate: 3,
      pressure: 1010,
      visibility: 3000,
    };
  }
}

// ============================================================
// AUDIO CONTEXT MOCK
// ============================================================

export class MockAudioContext implements AudioContext {
  private _available: boolean = false;
  private _levels: AudioLevels = { bass: 0, mid: 0, treble: 0, overall: 0 };
  private _spectrum: Float32Array = new Float32Array(128);
  private _bpm: number | null = 120;
  private _beatFlag: boolean = false;
  private _lastBeatTime: number = 0;

  isAvailable(): boolean {
    return this._available;
  }

  volume(): number {
    return this._levels.overall;
  }

  spectrum(): Float32Array {
    return this._spectrum;
  }

  bass(): number {
    return this._levels.bass;
  }

  mid(): number {
    return this._levels.mid;
  }

  treble(): number {
    return this._levels.treble;
  }

  levels(): AudioLevels {
    return { ...this._levels };
  }

  isBeat(): boolean {
    return this._beatFlag;
  }

  bpm(): number | null {
    return this._bpm;
  }

  timeSinceBeat(): number {
    return Date.now() - this._lastBeatTime;
  }

  energyInRange(minHz: number, maxHz: number): number {
    // Simplified energy calculation
    const binSize = 22050 / 128; // Assuming 44100 sample rate
    const startBin = Math.floor(minHz / binSize);
    const endBin = Math.ceil(maxHz / binSize);
    let energy = 0;
    for (let i = startBin; i < endBin && i < 128; i++) {
      energy += this._spectrum[i];
    }
    return energy / (endBin - startBin);
  }

  // ============ Control Methods ============

  /**
   * Set audio availability.
   */
  setAvailable(available: boolean): void {
    this._available = available;
  }

  /**
   * Set audio levels.
   */
  setLevels(levels: Partial<AudioLevels>): void {
    this._levels = { ...this._levels, ...levels };
    if (levels.bass !== undefined || levels.mid !== undefined || levels.treble !== undefined) {
      this._levels.overall = (this._levels.bass + this._levels.mid + this._levels.treble) / 3;
    }
  }

  /**
   * Simulate a beat.
   */
  simulateBeat(): void {
    this._beatFlag = true;
    this._lastBeatTime = Date.now();
    this._levels = { bass: 1, mid: 0.8, treble: 0.6, overall: 0.8 };

    // Reset after short delay
    setTimeout(() => {
      this._beatFlag = false;
      this._levels = { bass: 0.2, mid: 0.3, treble: 0.2, overall: 0.23 };
    }, 100);
  }

  /**
   * Set BPM.
   */
  setBPM(bpm: number | null): void {
    this._bpm = bpm;
  }

  /**
   * Generate random spectrum data.
   */
  randomizeSpectrum(): void {
    for (let i = 0; i < 128; i++) {
      this._spectrum[i] = Math.random();
    }
  }

  /**
   * Reset beat flag (call at end of frame).
   */
  resetBeat(): void {
    this._beatFlag = false;
  }
}

// ============================================================
// VIDEO CONTEXT MOCK
// ============================================================

export class MockVideoContext implements VideoContext {
  private _available: boolean = false;
  private _frame: ImageData | null = null;
  private _motion: MotionData = {
    intensity: 0,
    direction: { x: 0, y: 0 },
    regions: [],
  };
  private _dominantColor: RGBA = { r: 128, g: 128, b: 128, a: 1 };
  private _brightness: number = 0.5;
  private _faces: FaceData[] = [];
  private _dimensions: { width: number; height: number } | null = null;

  isAvailable(): boolean {
    return this._available;
  }

  getFrame(): ImageData | null {
    return this._frame;
  }

  getMotion(): MotionData {
    return { ...this._motion };
  }

  getDominantColor(): RGBA {
    return { ...this._dominantColor };
  }

  getDominantColors(_count: number): RGBA[] {
    return [this._dominantColor];
  }

  getBrightness(): number {
    return this._brightness;
  }

  getFaces(): FaceData[] {
    return [...this._faces];
  }

  getDimensions(): { width: number; height: number } | null {
    return this._dimensions;
  }

  getColorAt(_x: number, _y: number): RGBA | null {
    return this._dominantColor;
  }

  // ============ Control Methods ============

  /**
   * Set video availability.
   */
  setAvailable(available: boolean): void {
    this._available = available;
  }

  /**
   * Set motion data.
   */
  setMotion(motion: Partial<MotionData>): void {
    this._motion = { ...this._motion, ...motion };
  }

  /**
   * Simulate motion detection.
   */
  simulateMotion(intensity: number, direction?: { x: number; y: number }): void {
    this._motion = {
      intensity,
      direction: direction ?? { x: Math.random() - 0.5, y: Math.random() - 0.5 },
      regions: [{ x: 100, y: 100, width: 200, height: 200 }],
    };
  }

  /**
   * Set dominant color.
   */
  setDominantColor(color: RGBA): void {
    this._dominantColor = color;
  }

  /**
   * Set brightness.
   */
  setBrightness(brightness: number): void {
    this._brightness = brightness;
  }

  /**
   * Add a detected face.
   */
  addFace(face: FaceData): void {
    this._faces.push(face);
  }

  /**
   * Clear detected faces.
   */
  clearFaces(): void {
    this._faces = [];
  }

  /**
   * Load an image as the video frame.
   */
  async loadImage(url: string): Promise<void> {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    this._frame = ctx.getImageData(0, 0, img.width, img.height);
    this._dimensions = { width: img.width, height: img.height };
    this._available = true;
  }
}

// ============================================================
// SOCIAL CONTEXT MOCK
// ============================================================

export class MockSocialContext implements SocialContext {
  private _viewerCount: number = 10;
  private _mentions: SocialMention[] = [];
  private _sentiment: number = 0.5;
  private _keywords: string[] = [];
  private _engagement: number = 0.5;
  private _viral: boolean = false;

  viewerCount(): number {
    return this._viewerCount;
  }

  getMentions(limit: number = 10): SocialMention[] {
    return this._mentions.slice(-limit);
  }

  sentiment(): number {
    return this._sentiment;
  }

  trendingKeywords(): string[] {
    return [...this._keywords];
  }

  engagementLevel(): number {
    return this._engagement;
  }

  isViralMoment(): boolean {
    return this._viral;
  }

  mentionCount(minutes: number): number {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this._mentions.filter((m) => m.timestamp.getTime() > cutoff).length;
  }

  // ============ Control Methods ============

  /**
   * Set viewer count.
   */
  setViewerCount(count: number): void {
    this._viewerCount = count;
  }

  /**
   * Add a mention.
   */
  addMention(text: string, sentiment: number = 0.5): void {
    this._mentions.push({
      id: crypto.randomUUID(),
      text,
      platform: 'twitter',
      timestamp: new Date(),
      sentiment,
    });
    this.updateSentiment();
  }

  /**
   * Simulate a positive wave of mentions.
   */
  simulatePositiveWave(): void {
    for (let i = 0; i < 10; i++) {
      this.addMention(`Amazing art! #cloudfest${i}`, 0.8 + Math.random() * 0.2);
    }
    this._viral = true;
    this._engagement = 0.9;
    setTimeout(() => {
      this._viral = false;
      this._engagement = 0.5;
    }, 5000);
  }

  /**
   * Simulate a negative wave of mentions.
   */
  simulateNegativeWave(): void {
    for (let i = 0; i < 5; i++) {
      this.addMention(`Not impressed ${i}`, -0.5 - Math.random() * 0.5);
    }
  }

  /**
   * Set trending keywords.
   */
  setKeywords(keywords: string[]): void {
    this._keywords = keywords;
  }

  /**
   * Clear mentions.
   */
  clearMentions(): void {
    this._mentions = [];
  }

  private updateSentiment(): void {
    if (this._mentions.length === 0) {
      this._sentiment = 0.5;
      return;
    }
    const sum = this._mentions.reduce((acc, m) => acc + m.sentiment, 0);
    this._sentiment = sum / this._mentions.length;
  }
}

// ============================================================
// COMBINED MOCK CONTEXT
// ============================================================

export interface MockContextOptions {
  time?: Partial<MockTimeContext>;
  weather?: Partial<WeatherConditions>;
  audio?: Partial<AudioLevels>;
  social?: { viewerCount?: number };
}

export class MockContextAPIs implements ContextAPI {
  time: MockTimeContext;
  weather: MockWeatherContext;
  audio: MockAudioContext;
  video: MockVideoContext;
  social: MockSocialContext;

  constructor(options: MockContextOptions = {}) {
    this.time = new MockTimeContext();
    this.weather = new MockWeatherContext();
    this.audio = new MockAudioContext();
    this.video = new MockVideoContext();
    this.social = new MockSocialContext();

    if (options.weather) {
      this.weather.setConditions(options.weather);
    }
    if (options.audio) {
      this.audio.setLevels(options.audio);
    }
    if (options.social?.viewerCount) {
      this.social.setViewerCount(options.social.viewerCount);
    }
  }

  /**
   * Reset all mocks to default state.
   */
  reset(): void {
    this.time = new MockTimeContext();
    this.weather = new MockWeatherContext();
    this.audio = new MockAudioContext();
    this.video = new MockVideoContext();
    this.social = new MockSocialContext();
  }
}

export default MockContextAPIs;
