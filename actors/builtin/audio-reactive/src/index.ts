/**
 * Audio Reactive Actor
 *
 * Creates pulsing visualizations that react to audio frequencies.
 * Features session-level variability in shapes, colors, and animations:
 * - Central orb: glow, polygon, star, or bokeh styles
 * - Beat rings: stroke, bokeh, spark, or polygon styles
 * - Frequency bars: line, rounded, bokeh, or gradient styles
 * - Animation modes: pulse, breathe, wave, spiral
 * - Color modes: shifting, palette, gradient, complementary
 * - 7 pre-defined color palettes
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
  version: '2.0.0',
  tags: ['audio', 'reactive', 'beats', 'visualization', 'music'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['audio'],
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type OrbStyle = 'glow' | 'polygon' | 'star' | 'bokeh';
type RingStyle = 'stroke' | 'bokeh' | 'spark' | 'polygon';
type BarStyle = 'line' | 'rounded' | 'bokeh' | 'gradient';
type AnimMode = 'pulse' | 'breathe' | 'wave' | 'spiral';
type ColorMode = 'shifting' | 'palette' | 'gradient' | 'complementary';

interface VisualConfig {
  orbStyle: OrbStyle;
  ringStyle: RingStyle;
  barStyle: BarStyle;
  animMode: AnimMode;
  colorMode: ColorMode;
  paletteName: string;
  palette: number[];
  paletteDark: number[];   // Light mode variant (darker)
  symmetry: number;
  barCount: number;
}

interface BeatRing {
  radius: number;
  maxRadius: number;
  opacity: number;
  color: number;
  width: number;
  speed: number;
  rotation: number;
  rotationSpeed: number;
  active: boolean;
}

interface Textures {
  glow: string;
  bokeh: string;
  spark: string;
  soft: string;
}

// ============================================================================
// COLOR PALETTES
// ============================================================================

const PALETTES: Record<string, { dark: number[]; light: number[] }> = {
  neon: {
    dark: [0xff00ff, 0x00ffff, 0xff0088, 0x00ff88, 0xffff00],
    light: [0xaa0088, 0x008888, 0xaa0055, 0x008855, 0x888800],
  },
  sunset: {
    dark: [0xff6b35, 0xf7c59f, 0xef476f, 0xffd166, 0x06d6a0],
    light: [0xcc4422, 0xbb8855, 0xbb3355, 0xcc9933, 0x048866],
  },
  ocean: {
    dark: [0x0077b6, 0x00b4d8, 0x90e0ef, 0x48cae4, 0x023e8a],
    light: [0x004477, 0x007799, 0x5599aa, 0x338899, 0x012255],
  },
  fire: {
    dark: [0xff4400, 0xff6600, 0xff8800, 0xffaa00, 0xffcc00],
    light: [0xcc2200, 0xcc4400, 0xcc6600, 0xcc8800, 0xccaa00],
  },
  cyber: {
    dark: [0x00ff41, 0x00d4ff, 0xff00ff, 0xffff00, 0xff0080],
    light: [0x00aa28, 0x0088aa, 0xaa00aa, 0xaaaa00, 0xaa0055],
  },
  aurora: {
    dark: [0x00ff88, 0x00ffcc, 0x00ccff, 0x8800ff, 0xff00ff],
    light: [0x00aa55, 0x00aa88, 0x0088aa, 0x5500aa, 0xaa00aa],
  },
  mono: {
    dark: [0xffffff, 0xdddddd, 0xbbbbbb, 0x999999, 0x777777],
    light: [0x222222, 0x444444, 0x666666, 0x888888, 0xaaaaaa],
  },
};

const PALETTE_NAMES = Object.keys(PALETTES);

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_BEAT_RINGS = 20;
const FREQUENCY_HISTORY_SIZE = 100;
const WAVE_POINTS_SIZE = FREQUENCY_HISTORY_SIZE + 1;
const ORB_STYLES: OrbStyle[] = ['glow', 'polygon', 'star', 'bokeh'];
const RING_STYLES: RingStyle[] = ['stroke', 'bokeh', 'spark', 'polygon'];
const BAR_STYLES: BarStyle[] = ['line', 'rounded', 'bokeh', 'gradient'];
const ANIM_MODES: AnimMode[] = ['pulse', 'breathe', 'wave', 'spiral'];
const COLOR_MODES: ColorMode[] = ['shifting', 'palette', 'gradient', 'complementary'];
const SYMMETRIES = [6, 8, 10, 12];
const BAR_COUNTS = [32, 48, 64, 96];

// ============================================================================
// STATE
// ============================================================================

interface AudioState {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  config: VisualConfig;
  textures: Textures;
  beatRingPool: BeatRing[];
  activeRingCount: number;
  frequencyHistory: number[];
  frequencyHead: number;
  frequencyLength: number;
  wavePoints: { x: number; y: number }[];
  bass: number;
  mid: number;
  treble: number;
  bassSmooth: number;
  midSmooth: number;
  trebleSmooth: number;
  beatIntensity: number;
  hue: number;
  lastBeatTime: number;
  orbRotation: number;
  globalPhase: number;
  colorIndex: number;
}

let state: AudioState = {
  width: 1920,
  height: 1080,
  centerX: 960,
  centerY: 540,
  config: {
    orbStyle: 'glow',
    ringStyle: 'stroke',
    barStyle: 'line',
    animMode: 'pulse',
    colorMode: 'shifting',
    paletteName: 'neon',
    palette: PALETTES.neon.dark,
    paletteDark: PALETTES.neon.light,
    symmetry: 8,
    barCount: 64,
  },
  textures: { glow: '', bokeh: '', spark: '', soft: '' },
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
  orbRotation: 0,
  globalPhase: 0,
  colorIndex: 0,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

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

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const rr = Math.round(ar + (br - ar) * t);
  const rg = Math.round(ag + (bg - ag) * t);
  const rb = Math.round(ab + (bb - ab) * t);
  return (rr << 16) | (rg << 8) | rb;
}

function getColor(index: number, isDark: boolean, time: number): number {
  const palette = isDark ? state.config.palette : state.config.paletteDark;
  const { colorMode } = state.config;

  switch (colorMode) {
    case 'shifting':
      return hslToNumeric(state.hue + index * 30, 80, isDark ? 55 : 35);
    case 'palette':
      return palette[(index + state.colorIndex) % palette.length];
    case 'gradient': {
      const t = (Math.sin(time * 0.001 + index * 0.5) + 1) * 0.5;
      const i1 = index % palette.length;
      const i2 = (index + 1) % palette.length;
      return lerpColor(palette[i1], palette[i2], t);
    }
    case 'complementary': {
      const isOdd = index % 2 === 1;
      const baseHue = state.hue + (isOdd ? 180 : 0);
      return hslToNumeric(baseHue, 80, isDark ? 55 : 35);
    }
    default:
      return palette[index % palette.length];
  }
}

// ============================================================================
// TEXTURE GENERATION
// ============================================================================

function createGlowTexture(): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return canvas.toDataURL();
}

function createBokehTexture(): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.1)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(0.8, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.9, 'rgba(255,255,255,0.4)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return canvas.toDataURL();
}

function createSparkTexture(): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const center = 32;

  // Draw 4-pointed star
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
    const x = center + Math.cos(angle) * 30;
    const y = center + Math.sin(angle) * 30;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    const midAngle = angle + Math.PI / 4;
    const mx = center + Math.cos(midAngle) * 8;
    const my = center + Math.sin(midAngle) * 8;
    ctx.lineTo(mx, my);
  }
  ctx.closePath();

  const gradient = ctx.createRadialGradient(center, center, 0, center, center, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fill();
  return canvas.toDataURL();
}

function createSoftTexture(): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return canvas.toDataURL();
}

// ============================================================================
// POOL CREATION
// ============================================================================

function createBeatRingPool(): BeatRing[] {
  const pool: BeatRing[] = new Array(MAX_BEAT_RINGS);
  for (let i = 0; i < MAX_BEAT_RINGS; i++) {
    pool[i] = {
      radius: 0, maxRadius: 0, opacity: 0,
      color: 0, width: 0, speed: 0,
      rotation: 0, rotationSpeed: 0, active: false,
    };
  }
  return pool;
}

function createFrequencyHistory(): number[] {
  const arr = new Array(FREQUENCY_HISTORY_SIZE);
  for (let i = 0; i < FREQUENCY_HISTORY_SIZE; i++) arr[i] = 0;
  return arr;
}

function createWavePoints(): { x: number; y: number }[] {
  const arr: { x: number; y: number }[] = new Array(WAVE_POINTS_SIZE);
  for (let i = 0; i < WAVE_POINTS_SIZE; i++) arr[i] = { x: 0, y: 0 };
  return arr;
}

// ============================================================================
// DRAWING FUNCTIONS - ORB
// ============================================================================

function drawOrbGlow(api: ActorUpdateAPI, radius: number, isDark: boolean): void {
  const blend = isDark ? 'add' : 'screen';
  const color = getColor(0, isDark, state.globalPhase * 1000);

  for (let i = 5; i >= 0; i--) {
    const glowRadius = radius + i * 15;
    const glowAlpha = (isDark ? 0.12 : 0.08) * (1 - i / 5);
    api.brush.circle(state.centerX, state.centerY, glowRadius, {
      fill: color,
      alpha: glowAlpha,
      blendMode: blend,
    });
  }

  api.brush.circle(state.centerX, state.centerY, radius, {
    fill: color,
    alpha: isDark ? 0.85 : 0.75,
  });
}

function drawOrbPolygon(api: ActorUpdateAPI, radius: number, isDark: boolean): void {
  const color = getColor(0, isDark, state.globalPhase * 1000);
  const sides = state.config.symmetry;

  api.brush.pushMatrix();
  api.brush.translate(state.centerX, state.centerY);
  api.brush.rotate(state.orbRotation);

  // Glow layer
  api.brush.regularPolygon(0, 0, radius * 1.2, sides, {
    fill: color,
    alpha: isDark ? 0.15 : 0.1,
    blendMode: isDark ? 'add' : 'screen',
  });

  // Main polygon
  api.brush.regularPolygon(0, 0, radius, sides, {
    fill: color,
    alpha: isDark ? 0.8 : 0.7,
  });

  // Inner polygon
  api.brush.regularPolygon(0, 0, radius * 0.6, sides, {
    fill: getColor(1, isDark, state.globalPhase * 1000),
    alpha: isDark ? 0.5 : 0.4,
  });

  api.brush.popMatrix();
}

function drawOrbStar(api: ActorUpdateAPI, radius: number, isDark: boolean): void {
  const color = getColor(0, isDark, state.globalPhase * 1000);
  const points = Math.floor(state.config.symmetry / 2) + 2;

  api.brush.pushMatrix();
  api.brush.translate(state.centerX, state.centerY);
  api.brush.rotate(state.orbRotation);

  // Glow
  api.brush.star(0, 0, radius * 1.3, points, 0.4, {
    fill: color,
    alpha: isDark ? 0.15 : 0.1,
    blendMode: isDark ? 'add' : 'screen',
  });

  // Main star
  api.brush.star(0, 0, radius, points, 0.5, {
    fill: color,
    alpha: isDark ? 0.85 : 0.75,
  });

  // Inner star
  api.brush.star(0, 0, radius * 0.5, points, 0.5, {
    fill: getColor(1, isDark, state.globalPhase * 1000),
    alpha: isDark ? 0.5 : 0.4,
  });

  api.brush.popMatrix();
}

function drawOrbBokeh(api: ActorUpdateAPI, radius: number, isDark: boolean): void {
  const color = getColor(0, isDark, state.globalPhase * 1000);
  const size = radius * 2.5;

  api.brush.image(state.textures.bokeh, state.centerX, state.centerY, {
    width: size,
    height: size,
    tint: color,
    alpha: isDark ? 0.9 : 0.8,
    blendMode: isDark ? 'add' : 'screen',
  });

  // Inner glow
  api.brush.image(state.textures.glow, state.centerX, state.centerY, {
    width: size * 0.6,
    height: size * 0.6,
    tint: getColor(1, isDark, state.globalPhase * 1000),
    alpha: isDark ? 0.7 : 0.6,
    blendMode: isDark ? 'add' : 'screen',
  });
}

// ============================================================================
// DRAWING FUNCTIONS - RINGS
// ============================================================================

function drawRingStroke(api: ActorUpdateAPI, ring: BeatRing, isDark: boolean): void {
  const alpha = isDark ? ring.opacity : ring.opacity * 0.8;
  api.brush.circle(state.centerX, state.centerY, ring.radius, {
    stroke: ring.color,
    strokeWidth: ring.width,
    alpha: alpha,
  });
}

function drawRingBokeh(api: ActorUpdateAPI, ring: BeatRing, isDark: boolean): void {
  const size = ring.radius * 2;
  api.brush.image(state.textures.bokeh, state.centerX, state.centerY, {
    width: size,
    height: size,
    tint: ring.color,
    alpha: ring.opacity * (isDark ? 0.7 : 0.5),
    blendMode: isDark ? 'add' : 'screen',
  });
}

function drawRingSpark(api: ActorUpdateAPI, ring: BeatRing, isDark: boolean): void {
  const size = ring.radius * 0.5;
  api.brush.pushMatrix();
  api.brush.translate(state.centerX, state.centerY);
  api.brush.rotate(ring.rotation);

  api.brush.image(state.textures.spark, 0, 0, {
    width: size,
    height: size,
    tint: ring.color,
    alpha: ring.opacity * (isDark ? 0.8 : 0.6),
    blendMode: isDark ? 'add' : 'screen',
  });

  api.brush.popMatrix();
}

function drawRingPolygon(api: ActorUpdateAPI, ring: BeatRing, isDark: boolean): void {
  const sides = state.config.symmetry;
  api.brush.pushMatrix();
  api.brush.translate(state.centerX, state.centerY);
  api.brush.rotate(ring.rotation);

  api.brush.regularPolygon(0, 0, ring.radius, sides, {
    stroke: ring.color,
    strokeWidth: ring.width,
    alpha: ring.opacity * (isDark ? 0.8 : 0.6),
  });

  api.brush.popMatrix();
}

// ============================================================================
// DRAWING FUNCTIONS - BARS
// ============================================================================

function drawBarsLine(api: ActorUpdateAPI, isDark: boolean, time: number): void {
  const { barCount, symmetry } = state.config;
  const barMaxHeight = 100;
  const barWidth = 4;
  const barRadius = Math.min(state.width, state.height) * 0.35;

  for (let i = 0; i < barCount; i++) {
    const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
    const level = getBarLevel(i, barCount, time);
    const barHeight = barMaxHeight * level;

    const x1 = state.centerX + Math.cos(angle) * barRadius;
    const y1 = state.centerY + Math.sin(angle) * barRadius;
    const x2 = state.centerX + Math.cos(angle) * (barRadius + barHeight);
    const y2 = state.centerY + Math.sin(angle) * (barRadius + barHeight);

    const color = getColor(i % symmetry, isDark, time);

    api.brush.line(x1, y1, x2, y2, {
      color: color,
      alpha: isDark ? 0.7 : 0.6,
      width: barWidth,
      cap: 'round',
    });
  }
}

function drawBarsRounded(api: ActorUpdateAPI, isDark: boolean, time: number): void {
  const { barCount, symmetry } = state.config;
  const barMaxHeight = 80;
  const barWidth = 8;
  const barRadius = Math.min(state.width, state.height) * 0.35;

  for (let i = 0; i < barCount; i++) {
    const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
    const level = getBarLevel(i, barCount, time);
    const barHeight = Math.max(4, barMaxHeight * level);

    const x = state.centerX + Math.cos(angle) * (barRadius + barHeight / 2);
    const y = state.centerY + Math.sin(angle) * (barRadius + barHeight / 2);

    const color = getColor(i % symmetry, isDark, time);

    api.brush.pushMatrix();
    api.brush.translate(x, y);
    api.brush.rotate(angle + Math.PI / 2);

    api.brush.rect(-barWidth / 2, -barHeight / 2, barWidth, barHeight, {
      fill: color,
      alpha: isDark ? 0.7 : 0.6,
    });

    api.brush.popMatrix();
  }
}

function drawBarsBokeh(api: ActorUpdateAPI, isDark: boolean, time: number): void {
  const { barCount, symmetry } = state.config;
  const barRadius = Math.min(state.width, state.height) * 0.35;

  for (let i = 0; i < barCount; i++) {
    const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
    const level = getBarLevel(i, barCount, time);
    const size = 10 + level * 30;

    const x = state.centerX + Math.cos(angle) * (barRadius + size / 2);
    const y = state.centerY + Math.sin(angle) * (barRadius + size / 2);

    const color = getColor(i % symmetry, isDark, time);

    api.brush.image(state.textures.soft, x, y, {
      width: size,
      height: size,
      tint: color,
      alpha: (isDark ? 0.6 : 0.5) * level + 0.2,
      blendMode: isDark ? 'add' : 'screen',
    });
  }
}

function drawBarsGradient(api: ActorUpdateAPI, isDark: boolean, time: number): void {
  const { barCount, symmetry } = state.config;
  const barMaxHeight = 100;
  const barWidth = 5;
  const barRadius = Math.min(state.width, state.height) * 0.35;

  for (let i = 0; i < barCount; i++) {
    const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
    const level = getBarLevel(i, barCount, time);
    const barHeight = barMaxHeight * level;

    const x1 = state.centerX + Math.cos(angle) * barRadius;
    const y1 = state.centerY + Math.sin(angle) * barRadius;
    const x2 = state.centerX + Math.cos(angle) * (barRadius + barHeight);
    const y2 = state.centerY + Math.sin(angle) * (barRadius + barHeight);

    // Color transition along the bar
    const color1 = getColor(i % symmetry, isDark, time);
    const color2 = getColor((i + 2) % symmetry, isDark, time);
    const mixedColor = lerpColor(color1, color2, level);

    api.brush.line(x1, y1, x2, y2, {
      color: mixedColor,
      alpha: isDark ? 0.75 : 0.65,
      width: barWidth + level * 3,
      cap: 'round',
    });
  }
}

function getBarLevel(i: number, barCount: number, time: number): number {
  const freqIndex = i / barCount;
  let level: number;

  if (freqIndex < 0.33) {
    level = state.bassSmooth * (1 - freqIndex * 3) + state.midSmooth * (freqIndex * 3);
  } else if (freqIndex < 0.66) {
    level = state.midSmooth * (1 - (freqIndex - 0.33) * 3) + state.trebleSmooth * ((freqIndex - 0.33) * 3);
  } else {
    level = state.trebleSmooth;
  }

  // Add variation
  level *= 0.5 + Math.sin(i * 0.5 + time * 0.002) * 0.3;
  level = Math.min(1, level + state.beatIntensity * 0.3);

  return level;
}

// ============================================================================
// ANIMATION HELPERS
// ============================================================================

function getAnimationScale(time: number): number {
  const { animMode } = state.config;
  const phase = time * 0.001;

  switch (animMode) {
    case 'pulse':
      return 1 + state.bassSmooth * 0.8 + state.beatIntensity * 0.4;
    case 'breathe':
      return 1 + Math.sin(phase * 0.5) * 0.2 + state.bassSmooth * 0.5;
    case 'wave':
      return 1 + Math.sin(phase * 0.8 + state.midSmooth * 3) * 0.25 + state.bassSmooth * 0.4;
    case 'spiral':
      return 1 + state.bassSmooth * 0.6 + state.trebleSmooth * 0.3;
    default:
      return 1;
  }
}

function getAnimationRotationSpeed(time: number): number {
  const { animMode } = state.config;

  switch (animMode) {
    case 'pulse':
      return 0.005 + state.beatIntensity * 0.02;
    case 'breathe':
      return 0.003 + Math.sin(time * 0.0005) * 0.002;
    case 'wave':
      return 0.01 * (0.5 + Math.sin(time * 0.001) * 0.5);
    case 'spiral':
      return 0.02 + state.trebleSmooth * 0.03;
    default:
      return 0.005;
  }
}

// ============================================================================
// ACTOR IMPLEMENTATION
// ============================================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;
    state.centerX = width / 2;
    state.centerY = height / 2;

    // Randomly select configuration
    const paletteName = pickRandom(PALETTE_NAMES);
    state.config = {
      orbStyle: pickRandom(ORB_STYLES),
      ringStyle: pickRandom(RING_STYLES),
      barStyle: pickRandom(BAR_STYLES),
      animMode: pickRandom(ANIM_MODES),
      colorMode: pickRandom(COLOR_MODES),
      paletteName,
      palette: PALETTES[paletteName].dark,
      paletteDark: PALETTES[paletteName].light,
      symmetry: pickRandom(SYMMETRIES),
      barCount: pickRandom(BAR_COUNTS),
    };

    // Generate textures
    state.textures = {
      glow: createGlowTexture(),
      bokeh: createBokehTexture(),
      spark: createSparkTexture(),
      soft: createSoftTexture(),
    };

    // Pre-allocate pools
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
    state.orbRotation = 0;
    state.globalPhase = 0;
    state.colorIndex = 0;

    console.log(
      `[audio-reactive] Setup: orb=${state.config.orbStyle}, rings=${state.config.ringStyle}, ` +
      `bars=${state.config.barStyle}, anim=${state.config.animMode}, ` +
      `colors=${state.config.colorMode}(${state.config.paletteName}), ` +
      `symmetry=${state.config.symmetry}, barCount=${state.config.barCount}`
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;
    state.centerX = width / 2;
    state.centerY = height / 2;

    const dt = frame.deltaTime / 16.67;
    const time = frame.time;
    const audioAvailable = api.context.audio.isAvailable();
    const isDark = api.context.display.isDarkMode();

    // Update global phase
    state.globalPhase += dt * 0.02;

    // Get audio data
    if (audioAvailable) {
      state.bass = api.context.audio.bass();
      state.mid = api.context.audio.mid();
      state.treble = api.context.audio.treble();
    } else {
      const t = time * 0.001;
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
    if (isBeat && time - state.lastBeatTime > 200) {
      state.lastBeatTime = time;
      state.beatIntensity = 1;
      state.colorIndex = (state.colorIndex + 1) % state.config.palette.length;

      // Spawn beat ring from pool
      const ring = state.beatRingPool.find(r => !r.active);
      if (ring) {
        ring.radius = 50;
        ring.maxRadius = Math.min(width, height) * 0.4;
        ring.opacity = isDark ? 0.8 : 0.65;
        ring.color = getColor(state.colorIndex, isDark, time);
        ring.width = 3 + state.bassSmooth * 5;
        ring.speed = 8 + state.bassSmooth * 4;
        ring.rotation = 0;
        ring.rotationSpeed = (Math.random() - 0.5) * 0.1;
        ring.active = true;
        state.activeRingCount++;
      }
    }

    // Decay beat intensity
    state.beatIntensity *= 0.92;

    // Update hue and rotation
    state.hue += 0.2 * dt;
    state.orbRotation += getAnimationRotationSpeed(time) * dt;

    // Store frequency in circular buffer
    state.frequencyHistory[state.frequencyHead] = state.bassSmooth;
    state.frequencyHead = (state.frequencyHead + 1) % FREQUENCY_HISTORY_SIZE;
    if (state.frequencyLength < FREQUENCY_HISTORY_SIZE) state.frequencyLength++;

    // Calculate orb size with animation
    const orbBaseRadius = 60;
    const animScale = getAnimationScale(time);
    const orbRadius = orbBaseRadius * animScale;

    // Draw central orb based on style
    switch (state.config.orbStyle) {
      case 'glow': drawOrbGlow(api, orbRadius, isDark); break;
      case 'polygon': drawOrbPolygon(api, orbRadius, isDark); break;
      case 'star': drawOrbStar(api, orbRadius, isDark); break;
      case 'bokeh': drawOrbBokeh(api, orbRadius, isDark); break;
    }

    // Update and draw beat rings
    for (const ring of state.beatRingPool) {
      if (!ring.active) continue;

      ring.radius += ring.speed * dt;
      ring.opacity -= 0.015 * dt;
      ring.rotation += ring.rotationSpeed * dt;

      if (ring.radius > ring.maxRadius || ring.opacity <= 0) {
        ring.active = false;
        state.activeRingCount--;
        continue;
      }

      switch (state.config.ringStyle) {
        case 'stroke': drawRingStroke(api, ring, isDark); break;
        case 'bokeh': drawRingBokeh(api, ring, isDark); break;
        case 'spark': drawRingSpark(api, ring, isDark); break;
        case 'polygon': drawRingPolygon(api, ring, isDark); break;
      }
    }

    // Draw frequency bars based on style
    switch (state.config.barStyle) {
      case 'line': drawBarsLine(api, isDark, time); break;
      case 'rounded': drawBarsRounded(api, isDark, time); break;
      case 'bokeh': drawBarsBokeh(api, isDark, time); break;
      case 'gradient': drawBarsGradient(api, isDark, time); break;
    }

    // Draw waveform ring with twinkling
    const waveRadius = Math.min(width, height) * 0.25;

    if (state.frequencyLength > 2) {
      const startIdx = (state.frequencyHead - state.frequencyLength + FREQUENCY_HISTORY_SIZE) % FREQUENCY_HISTORY_SIZE;

      for (let i = 0; i < state.frequencyLength; i++) {
        const bufferIdx = (startIdx + i) % FREQUENCY_HISTORY_SIZE;
        const angle = (i / state.frequencyLength) * Math.PI * 2 - Math.PI / 2;
        const amplitude = state.frequencyHistory[bufferIdx] * 30;
        const r = waveRadius + amplitude;
        state.wavePoints[i].x = state.centerX + Math.cos(angle) * r;
        state.wavePoints[i].y = state.centerY + Math.sin(angle) * r;
      }

      state.wavePoints[state.frequencyLength].x = state.wavePoints[0].x;
      state.wavePoints[state.frequencyLength].y = state.wavePoints[0].y;

      // Twinkling alpha
      const twinkle = 0.6 + 0.4 * Math.sin(state.globalPhase * 3);

      api.brush.stroke(state.wavePoints.slice(0, state.frequencyLength + 1), {
        color: getColor(2, isDark, time),
        alpha: (isDark ? 0.5 : 0.4) * twinkle,
        width: 2,
        smooth: true,
      });
    }

    // Draw corner decorations
    const cornerSize = 80 + state.trebleSmooth * 40;
    const breatheScale = 1 + Math.sin(state.globalPhase * 2) * 0.15;
    const corners = [
      { x: 0, y: 0, angle: 0 },
      { x: width, y: 0, angle: Math.PI / 2 },
      { x: width, y: height, angle: Math.PI },
      { x: 0, y: height, angle: (Math.PI * 3) / 2 },
    ];

    for (let ci = 0; ci < corners.length; ci++) {
      const corner = corners[ci];
      const dx = Math.cos(corner.angle + Math.PI / 4);
      const dy = Math.sin(corner.angle + Math.PI / 4);
      const size = cornerSize * breatheScale;

      api.brush.line(
        corner.x,
        corner.y,
        corner.x + dx * size,
        corner.y + dy * size,
        {
          color: getColor(ci + 3, isDark, time),
          alpha: (isDark ? 0.3 : 0.25) + state.trebleSmooth * 0.3,
          width: 3,
          cap: 'round',
        }
      );
    }
  },

  async teardown(): Promise<void> {
    for (const ring of state.beatRingPool) ring.active = false;
    state.activeRingCount = 0;
    state.frequencyHead = 0;
    state.frequencyLength = 0;
    state.bass = 0;
    state.mid = 0;
    state.treble = 0;
    state.bassSmooth = 0;
    state.midSmooth = 0;
    state.trebleSmooth = 0;
    state.beatIntensity = 0;
    state.hue = 0;
    state.lastBeatTime = 0;
    state.orbRotation = 0;
    state.globalPhase = 0;
    state.colorIndex = 0;
    console.log('[audio-reactive] Teardown complete');
  },
};

registerActor(actor);

export default actor;
