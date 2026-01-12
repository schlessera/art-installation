/**
 * Audio Reactive Actor
 *
 * Creates pulsing visualizations that react to audio frequencies.
 * Central orb pulses with bass, rings expand on beats, bars show frequencies.
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

// Actor metadata for gallery attribution
const metadata: ActorMetadata = {
  id: 'audio-reactive',
  name: 'Audio Reactive',
  description: 'Pulsing visualizations that react to audio frequencies and beats',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['audio', 'reactive', 'beats', 'visualization', 'music'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['audio'],
};

// Ring that expands from center on beats (with pooling support)
interface BeatRing {
  radius: number;
  maxRadius: number;
  opacity: number;
  color: number;  // Numeric color (0xRRGGBB)
  width: number;
  speed: number;
  active: boolean;  // For object pooling
}

// Constants for pre-allocation
const MAX_BEAT_RINGS = 20;
const FREQUENCY_HISTORY_SIZE = 100;
const WAVE_POINTS_SIZE = FREQUENCY_HISTORY_SIZE + 1;

// State
interface AudioState {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  // Pre-allocated pools
  beatRingPool: BeatRing[];
  activeRingCount: number;
  // Circular buffer for frequency history
  frequencyHistory: number[];
  frequencyHead: number;
  frequencyLength: number;
  // Pre-allocated wave points array
  wavePoints: { x: number; y: number }[];
  // Audio state
  bass: number;
  mid: number;
  treble: number;
  bassSmooth: number;
  midSmooth: number;
  trebleSmooth: number;
  beatIntensity: number;
  hue: number;
  lastBeatTime: number;
}

/**
 * Create pre-allocated beat ring pool.
 */
function createBeatRingPool(): BeatRing[] {
  const pool: BeatRing[] = new Array(MAX_BEAT_RINGS);
  for (let i = 0; i < MAX_BEAT_RINGS; i++) {
    pool[i] = {
      radius: 0, maxRadius: 0, opacity: 0,
      color: 0, width: 0, speed: 0, active: false,
    };
  }
  return pool;
}

/**
 * Create pre-allocated frequency history circular buffer.
 */
function createFrequencyHistory(): number[] {
  const arr = new Array(FREQUENCY_HISTORY_SIZE);
  for (let i = 0; i < FREQUENCY_HISTORY_SIZE; i++) {
    arr[i] = 0;
  }
  return arr;
}

/**
 * Create pre-allocated wave points array.
 */
function createWavePoints(): { x: number; y: number }[] {
  const arr: { x: number; y: number }[] = new Array(WAVE_POINTS_SIZE);
  for (let i = 0; i < WAVE_POINTS_SIZE; i++) {
    arr[i] = { x: 0, y: 0 };
  }
  return arr;
}

let state: AudioState = {
  width: 1920,
  height: 1080,
  centerX: 960,
  centerY: 540,
  beatRingPool: [],
  activeRingCount: 0,
  frequencyHistory: [],
  frequencyHead: 0,
  frequencyLength: 0,
  wavePoints: [],
  bass: 0,
  mid: 0,
  treble: 0,
  bassSmooth: 0,
  midSmooth: 0,
  trebleSmooth: 0,
  beatIntensity: 0,
  hue: 0,
  lastBeatTime: 0,
};

/**
 * Convert HSL to numeric color (0xRRGGBB).
 */
function hslToNumeric(h: number, s: number, l: number): number {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0, g = 0, b = 0;
  const hMod = ((h % 360) + 360) % 360;
  if (hMod < 60) { r = c; g = x; b = 0; }
  else if (hMod < 120) { r = x; g = c; b = 0; }
  else if (hMod < 180) { r = 0; g = c; b = x; }
  else if (hMod < 240) { r = 0; g = x; b = c; }
  else if (hMod < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
}

/**
 * The Audio Reactive actor.
 */
const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;
    state.centerX = width / 2;
    state.centerY = height / 2;
    // Pre-allocate pools (no runtime allocations)
    state.beatRingPool = createBeatRingPool();
    state.activeRingCount = 0;
    state.frequencyHistory = createFrequencyHistory();
    state.frequencyHead = 0;
    state.frequencyLength = 0;
    state.wavePoints = createWavePoints();
    // Reset audio state
    state.bass = 0;
    state.mid = 0;
    state.treble = 0;
    state.bassSmooth = 0;
    state.midSmooth = 0;
    state.trebleSmooth = 0;
    state.beatIntensity = 0;
    state.hue = Math.random() * 360;
    state.lastBeatTime = 0;

    console.log('[audio-reactive] Setup complete');
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;
    state.centerX = width / 2;
    state.centerY = height / 2;

    const dt = frame.deltaTime / 16.67;
    const audioAvailable = api.context.audio.isAvailable();

    // Get audio data
    if (audioAvailable) {
      state.bass = api.context.audio.bass();
      state.mid = api.context.audio.mid();
      state.treble = api.context.audio.treble();
    } else {
      // Generate fake audio data for visual interest when no audio
      const t = frame.time * 0.001;
      state.bass = 0.3 + Math.sin(t * 2) * 0.2 + Math.sin(t * 3.7) * 0.1;
      state.mid = 0.4 + Math.sin(t * 4) * 0.15;
      state.treble = 0.3 + Math.sin(t * 6) * 0.2;
    }

    // Smooth audio values
    const smoothing = 0.15;
    state.bassSmooth += (state.bass - state.bassSmooth) * smoothing;
    state.midSmooth += (state.mid - state.midSmooth) * smoothing;
    state.trebleSmooth += (state.treble - state.trebleSmooth) * smoothing;

    // Check for beats
    const isBeat = audioAvailable ? api.context.audio.isBeat() : state.bass > 0.6;
    if (isBeat && frame.time - state.lastBeatTime > 200) {
      state.lastBeatTime = frame.time;
      state.beatIntensity = 1;

      // Spawn beat ring from pool (no allocation)
      const ring = state.beatRingPool.find(r => !r.active);
      if (ring) {
        ring.radius = 50;
        ring.maxRadius = Math.min(width, height) * 0.4;
        ring.opacity = 0.8;
        ring.color = hslToNumeric(state.hue, 80, 60);
        ring.width = 3 + state.bassSmooth * 5;
        ring.speed = 8 + state.bassSmooth * 4;
        ring.active = true;
        state.activeRingCount++;
      }
    }

    // Decay beat intensity
    state.beatIntensity *= 0.92;

    // Slowly shift hue
    state.hue += 0.2 * dt;

    // Store frequency in circular buffer (no allocation)
    state.frequencyHistory[state.frequencyHead] = state.bassSmooth;
    state.frequencyHead = (state.frequencyHead + 1) % FREQUENCY_HISTORY_SIZE;
    if (state.frequencyLength < FREQUENCY_HISTORY_SIZE) {
      state.frequencyLength++;
    }

    // Draw central orb
    const orbBaseRadius = 60;
    const orbRadius = orbBaseRadius + state.bassSmooth * 80 + state.beatIntensity * 40;

    // Orb glow layers
    for (let i = 5; i >= 0; i--) {
      const glowRadius = orbRadius + i * 15;
      const glowAlpha = 0.1 * (1 - i / 5);
      api.brush.circle(state.centerX, state.centerY, glowRadius, {
        fill: hslToNumeric(state.hue, 80, 50),
        alpha: glowAlpha,
        blendMode: 'add',
      });
    }

    // Main orb
    api.brush.circle(state.centerX, state.centerY, orbRadius, {
      fill: hslToNumeric(state.hue, 70, 40 + state.beatIntensity * 20),
      alpha: 0.9,
    });

    // Inner highlight
    api.brush.circle(
      state.centerX - orbRadius * 0.2,
      state.centerY - orbRadius * 0.2,
      orbRadius * 0.3,
      {
        fill: hslToNumeric(state.hue, 60, 70),
        alpha: 0.4,
      }
    );

    // Update and draw beat rings from pool
    for (const ring of state.beatRingPool) {
      if (!ring.active) continue;

      ring.radius += ring.speed * dt;
      ring.opacity -= 0.015 * dt;

      if (ring.radius > ring.maxRadius || ring.opacity <= 0) {
        ring.active = false;
        state.activeRingCount--;
        continue;
      }

      // Draw ring
      api.brush.circle(state.centerX, state.centerY, ring.radius, {
        stroke: ring.color,
        strokeWidth: ring.width,
        alpha: ring.opacity,
      });
    }

    // Draw frequency bars around the edge
    const barCount = 64;
    const barMaxHeight = 100;
    const barWidth = 4;
    const barRadius = Math.min(width, height) * 0.35;

    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;

      // Mix frequencies for visual interest
      const freqIndex = i / barCount;
      let level;
      if (freqIndex < 0.33) {
        level = state.bassSmooth * (1 - freqIndex * 3) + state.midSmooth * (freqIndex * 3);
      } else if (freqIndex < 0.66) {
        level = state.midSmooth * (1 - (freqIndex - 0.33) * 3) + state.trebleSmooth * ((freqIndex - 0.33) * 3);
      } else {
        level = state.trebleSmooth;
      }

      // Add some variation
      level *= 0.5 + Math.sin(i * 0.5 + frame.time * 0.002) * 0.3;
      level = Math.min(1, level + state.beatIntensity * 0.3);

      const barHeight = barMaxHeight * level;

      const x1 = state.centerX + Math.cos(angle) * barRadius;
      const y1 = state.centerY + Math.sin(angle) * barRadius;
      const x2 = state.centerX + Math.cos(angle) * (barRadius + barHeight);
      const y2 = state.centerY + Math.sin(angle) * (barRadius + barHeight);

      // Color based on frequency range
      const barHue = (state.hue + i * (180 / barCount)) % 360;

      api.brush.line(x1, y1, x2, y2, {
        color: hslToNumeric(barHue, 80, 50 + level * 20),
        alpha: 0.7,
        width: barWidth,
        cap: 'round',
      });
    }

    // Draw waveform ring using pre-allocated points and circular buffer
    const waveRadius = Math.min(width, height) * 0.25;

    if (state.frequencyLength > 2) {
      // Build wave points from circular buffer (reusing pre-allocated array)
      const startIdx = (state.frequencyHead - state.frequencyLength + FREQUENCY_HISTORY_SIZE) % FREQUENCY_HISTORY_SIZE;

      for (let i = 0; i < state.frequencyLength; i++) {
        const bufferIdx = (startIdx + i) % FREQUENCY_HISTORY_SIZE;
        const angle = (i / state.frequencyLength) * Math.PI * 2 - Math.PI / 2;
        const amplitude = state.frequencyHistory[bufferIdx] * 30;
        const r = waveRadius + amplitude;
        state.wavePoints[i].x = state.centerX + Math.cos(angle) * r;
        state.wavePoints[i].y = state.centerY + Math.sin(angle) * r;
      }

      // Close the loop
      state.wavePoints[state.frequencyLength].x = state.wavePoints[0].x;
      state.wavePoints[state.frequencyLength].y = state.wavePoints[0].y;

      // Draw using slice of pre-allocated array (no allocation - slice creates view)
      api.brush.stroke(state.wavePoints.slice(0, state.frequencyLength + 1), {
        color: hslToNumeric(state.hue + 180, 70, 60),
        alpha: 0.5,
        width: 2,
        smooth: true,
      });
    }

    // Draw corner decorations that react to treble
    const cornerSize = 80 + state.trebleSmooth * 40;
    const corners = [
      { x: 0, y: 0, angle: 0 },
      { x: width, y: 0, angle: Math.PI / 2 },
      { x: width, y: height, angle: Math.PI },
      { x: 0, y: height, angle: (Math.PI * 3) / 2 },
    ];

    for (const corner of corners) {
      const dx = Math.cos(corner.angle + Math.PI / 4);
      const dy = Math.sin(corner.angle + Math.PI / 4);

      api.brush.line(
        corner.x,
        corner.y,
        corner.x + dx * cornerSize,
        corner.y + dy * cornerSize,
        {
          color: hslToNumeric(state.hue + 90, 60, 50),
          alpha: 0.3 + state.trebleSmooth * 0.3,
          width: 3,
          cap: 'round',
        }
      );
    }
  },

  async teardown(): Promise<void> {
    // Deactivate all pooled objects but keep arrays for reuse
    for (const ring of state.beatRingPool) {
      ring.active = false;
    }
    state.activeRingCount = 0;
    state.frequencyHead = 0;
    state.frequencyLength = 0;
    // Reset audio state
    state.bass = 0;
    state.mid = 0;
    state.treble = 0;
    state.bassSmooth = 0;
    state.midSmooth = 0;
    state.trebleSmooth = 0;
    state.beatIntensity = 0;
    state.hue = 0;
    state.lastBeatTime = 0;
    console.log('[audio-reactive] Teardown complete');
  },
};

// Self-register with the runtime
registerActor(actor);

export default actor;
