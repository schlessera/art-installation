/**
 * Audio Context Provider
 *
 * Provides audio-reactive context data using Web Audio API.
 */

import type { AudioContext as AudioContextType, AudioLevels } from '@art/types';

/**
 * Configuration for AudioProvider.
 */
export interface AudioProviderConfig {
  /** FFT size for frequency analysis (default: 256) */
  fftSize?: number;

  /** Smoothing factor for frequency data (0-1, default: 0.8) */
  smoothingTimeConstant?: number;

  /** Beat detection threshold (0-1, default: 0.6) */
  beatThreshold?: number;

  /** Beat detection cooldown in ms (default: 100) */
  beatCooldown?: number;
}

/**
 * Provides audio context data from microphone or audio input.
 */
export class AudioProvider implements AudioContextType {
  private config: Required<AudioProviderConfig>;
  private audioContext: globalThis.AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  // Audio data buffers
  private frequencyData: Uint8Array = new Uint8Array(0);
  private timeDomainData: Uint8Array = new Uint8Array(0);

  // State
  private available = false;
  private lastBeatTime = 0;
  private beatDetected = false;
  private lastBassLevel = 0;

  // BPM detection
  private beatHistory: number[] = [];
  private estimatedBpm: number | null = null;

  constructor(config: AudioProviderConfig = {}) {
    this.config = {
      fftSize: config.fftSize ?? 256,
      smoothingTimeConstant: config.smoothingTimeConstant ?? 0.8,
      beatThreshold: config.beatThreshold ?? 0.6,
      beatCooldown: config.beatCooldown ?? 100,
    };
  }

  /**
   * Initialize audio input.
   */
  async start(): Promise<boolean> {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create audio context and analyser
      this.audioContext = new globalThis.AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.config.fftSize;
      this.analyser.smoothingTimeConstant = this.config.smoothingTimeConstant;

      // Connect source to analyser
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);

      // Initialize data buffers
      const bufferLength = this.analyser.frequencyBinCount;
      this.frequencyData = new Uint8Array(bufferLength);
      this.timeDomainData = new Uint8Array(bufferLength);

      this.available = true;
      console.log('[AudioProvider] Audio input initialized');
      return true;
    } catch (error) {
      console.warn('[AudioProvider] Failed to initialize audio:', error);
      this.available = false;
      return false;
    }
  }

  /**
   * Stop audio input.
   */
  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
    this.available = false;
    console.log('[AudioProvider] Audio input stopped');
  }

  /**
   * Update audio analysis (call each frame).
   */
  update(): void {
    if (!this.analyser) return;

    // Get frequency and time domain data
    this.analyser.getByteFrequencyData(this.frequencyData as Uint8Array<ArrayBuffer>);
    this.analyser.getByteTimeDomainData(this.timeDomainData as Uint8Array<ArrayBuffer>);

    // Beat detection
    this.detectBeat();
  }

  /**
   * Detect beats based on bass energy.
   */
  private detectBeat(): void {
    const currentBass = this.bass();
    const now = performance.now();

    // Check for beat: rapid increase in bass above threshold
    const bassIncrease = currentBass - this.lastBassLevel;
    const cooldownPassed = now - this.lastBeatTime > this.config.beatCooldown;

    if (
      bassIncrease > 0.2 &&
      currentBass > this.config.beatThreshold &&
      cooldownPassed
    ) {
      this.beatDetected = true;
      this.lastBeatTime = now;

      // Track beat times for BPM estimation (use slice instead of shift)
      this.beatHistory.push(now);
      if (this.beatHistory.length > 16) {
        this.beatHistory = this.beatHistory.slice(-16);
      }
      this.estimateBpm();
    } else {
      this.beatDetected = false;
    }

    this.lastBassLevel = currentBass;
  }

  /**
   * Estimate BPM from beat history.
   */
  private estimateBpm(): void {
    if (this.beatHistory.length < 4) {
      this.estimatedBpm = null;
      return;
    }

    // Calculate intervals between beats
    const intervals: number[] = [];
    for (let i = 1; i < this.beatHistory.length; i++) {
      intervals.push(this.beatHistory[i] - this.beatHistory[i - 1]);
    }

    // Average interval
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // Convert to BPM
    this.estimatedBpm = Math.round(60000 / avgInterval);

    // Clamp to reasonable range
    if (this.estimatedBpm < 40 || this.estimatedBpm > 220) {
      this.estimatedBpm = null;
    }
  }

  // ============ AudioContext Implementation ============

  isAvailable(): boolean {
    return this.available;
  }

  volume(): number {
    if (!this.available || this.frequencyData.length === 0) return 0;

    // Calculate RMS volume from time domain data
    let sum = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      const value = (this.timeDomainData[i] - 128) / 128;
      sum += value * value;
    }
    return Math.sqrt(sum / this.timeDomainData.length);
  }

  spectrum(): Float32Array {
    if (!this.available) return new Float32Array(128);

    // Normalize frequency data to 0-1 range
    const normalized = new Float32Array(this.frequencyData.length);
    for (let i = 0; i < this.frequencyData.length; i++) {
      normalized[i] = this.frequencyData[i] / 255;
    }
    return normalized;
  }

  bass(): number {
    if (!this.available || this.frequencyData.length === 0) return 0;

    // Bass is roughly 20-250 Hz, which maps to first ~10% of bins
    const bassEnd = Math.floor(this.frequencyData.length * 0.1);
    let sum = 0;
    for (let i = 0; i < bassEnd; i++) {
      sum += this.frequencyData[i];
    }
    return sum / (bassEnd * 255);
  }

  mid(): number {
    if (!this.available || this.frequencyData.length === 0) return 0;

    // Mid is roughly 250-4000 Hz, which maps to ~10-50% of bins
    const midStart = Math.floor(this.frequencyData.length * 0.1);
    const midEnd = Math.floor(this.frequencyData.length * 0.5);
    let sum = 0;
    for (let i = midStart; i < midEnd; i++) {
      sum += this.frequencyData[i];
    }
    return sum / ((midEnd - midStart) * 255);
  }

  treble(): number {
    if (!this.available || this.frequencyData.length === 0) return 0;

    // Treble is roughly 4000-20000 Hz, which maps to ~50-100% of bins
    const trebleStart = Math.floor(this.frequencyData.length * 0.5);
    let sum = 0;
    for (let i = trebleStart; i < this.frequencyData.length; i++) {
      sum += this.frequencyData[i];
    }
    return sum / ((this.frequencyData.length - trebleStart) * 255);
  }

  levels(): AudioLevels {
    return {
      bass: this.bass(),
      mid: this.mid(),
      treble: this.treble(),
      overall: this.volume(),
    };
  }

  isBeat(): boolean {
    return this.beatDetected;
  }

  bpm(): number | null {
    return this.estimatedBpm;
  }

  timeSinceBeat(): number {
    return performance.now() - this.lastBeatTime;
  }

  energyInRange(minHz: number, maxHz: number): number {
    if (!this.available || !this.audioContext || this.frequencyData.length === 0) {
      return 0;
    }

    // Calculate which bins correspond to the frequency range
    const nyquist = this.audioContext.sampleRate / 2;
    const binWidth = nyquist / this.frequencyData.length;

    const startBin = Math.floor(minHz / binWidth);
    const endBin = Math.min(
      Math.ceil(maxHz / binWidth),
      this.frequencyData.length - 1
    );

    let sum = 0;
    for (let i = startBin; i <= endBin; i++) {
      sum += this.frequencyData[i];
    }

    return sum / ((endBin - startBin + 1) * 255);
  }

  /**
   * Set beat detection threshold.
   */
  setBeatThreshold(threshold: number): void {
    this.config.beatThreshold = Math.max(0, Math.min(1, threshold));
  }

  /**
   * Get raw frequency data.
   */
  getRawFrequencyData(): Uint8Array {
    return this.frequencyData;
  }

  /**
   * Get raw time domain data.
   */
  getRawTimeDomainData(): Uint8Array {
    return this.timeDomainData;
  }
}
