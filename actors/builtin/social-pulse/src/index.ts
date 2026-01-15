/**
 * Social Pulse Actor
 *
 * Visualizes audience engagement and social media activity:
 * - Floating words from trending keywords
 * - Colors shift based on sentiment (-1 to +1)
 * - Particle density scales with viewer count
 * - Explosions on viral moments
 *
 * Falls back to simulated social data when unavailable.
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'social-pulse',
  name: 'Social Pulse',
  description: 'Visualizes social engagement with floating words',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['social', 'text', 'interactive', 'engagement', 'community'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['social'],
};

interface RGB {
  r: number;
  g: number;
  b: number;
}

// Pre-defined color palettes for variability (dark mode - high lightness)
const COLOR_PALETTES_DARK = [
  { name: 'Classic', negative: { r: 255, g: 80, b: 80 }, neutral: { r: 255, g: 255, b: 255 }, positive: { r: 80, g: 220, b: 255 } },
  { name: 'Sunset', negative: { r: 180, g: 50, b: 100 }, neutral: { r: 255, g: 200, b: 150 }, positive: { r: 255, g: 150, b: 50 } },
  { name: 'Ocean', negative: { r: 100, g: 80, b: 150 }, neutral: { r: 200, g: 230, b: 255 }, positive: { r: 50, g: 200, b: 200 } },
  { name: 'Neon', negative: { r: 255, g: 0, b: 128 }, neutral: { r: 255, g: 255, b: 255 }, positive: { r: 0, g: 255, b: 200 } },
  { name: 'Earth', negative: { r: 150, g: 80, b: 60 }, neutral: { r: 220, g: 200, b: 180 }, positive: { r: 100, g: 180, b: 80 } },
] as const;

// Light mode palettes - lower lightness for visibility on light backgrounds
const COLOR_PALETTES_LIGHT = [
  { name: 'Classic', negative: { r: 180, g: 30, b: 30 }, neutral: { r: 40, g: 40, b: 40 }, positive: { r: 20, g: 100, b: 160 } },
  { name: 'Sunset', negative: { r: 140, g: 30, b: 70 }, neutral: { r: 100, g: 60, b: 40 }, positive: { r: 180, g: 90, b: 20 } },
  { name: 'Ocean', negative: { r: 70, g: 50, b: 110 }, neutral: { r: 50, g: 80, b: 100 }, positive: { r: 20, g: 120, b: 120 } },
  { name: 'Neon', negative: { r: 180, g: 0, b: 90 }, neutral: { r: 30, g: 30, b: 30 }, positive: { r: 0, g: 140, b: 110 } },
  { name: 'Earth', negative: { r: 110, g: 50, b: 30 }, neutral: { r: 80, g: 70, b: 60 }, positive: { r: 50, g: 120, b: 40 } },
] as const;

// Color palette structure (used by both dark and light mode palettes)
interface ColorPalette {
  readonly name: string;
  readonly negative: RGB;
  readonly neutral: RGB;
  readonly positive: RGB;
}

// Movement presets for varied animation behavior
const MOVEMENT_PRESETS = [
  { name: 'Gentle', floatMin: 20, floatMax: 40, spiralMult: 1.5, waveMin: 30, waveMax: 50, waveAmp: 1.5, explodeMin: 80, explodeMax: 150, friction: 0.96 },
  { name: 'Energetic', floatMin: 40, floatMax: 70, spiralMult: 2.5, waveMin: 60, waveMax: 100, waveAmp: 3.0, explodeMin: 150, explodeMax: 250, friction: 0.99 },
  { name: 'Dreamy', floatMin: 15, floatMax: 25, spiralMult: 1.0, waveMin: 20, waveMax: 35, waveAmp: 2.5, explodeMin: 60, explodeMax: 100, friction: 0.94 },
  { name: 'Chaotic', floatMin: 30, floatMax: 80, spiralMult: 3.0, waveMin: 50, waveMax: 120, waveAmp: 4.0, explodeMin: 120, explodeMax: 300, friction: 0.985 },
] as const;

type MovementPreset = (typeof MOVEMENT_PRESETS)[number];

// Visual presets for sizing and intensity (blend modes are set dynamically based on display mode)
const VISUAL_PRESETS = [
  { name: 'Standard', wordSizeMin: 12, wordSizeMax: 48, particleSizeMin: 3, particleSizeMax: 11, glowAlpha: 0.05, glowSize: 0.6 },
  { name: 'Bold', wordSizeMin: 18, wordSizeMax: 72, particleSizeMin: 5, particleSizeMax: 15, glowAlpha: 0.08, glowSize: 0.7 },
  { name: 'Subtle', wordSizeMin: 8, wordSizeMax: 36, particleSizeMin: 2, particleSizeMax: 8, glowAlpha: 0.03, glowSize: 0.5 },
  { name: 'Intense', wordSizeMin: 24, wordSizeMax: 60, particleSizeMin: 4, particleSizeMax: 12, glowAlpha: 0.10, glowSize: 0.8 },
] as const;

type VisualPreset = (typeof VISUAL_PRESETS)[number];

// Pre-computed color cache for performance
interface ColorCache {
  sentimentColors: number[];  // 21 values: -1.0 to +1.0 in 0.1 steps
  hueCycleColors: number[];   // 36 values: hue 0-350 in 10-degree steps
}

// Trail position for circular buffer (pre-allocated)
interface TrailPosition {
  x: number;
  y: number;
  rotation: number;
}

// Trail length bounds (actual length varies per word)
const MIN_TRAIL_LENGTH = 3;
const MAX_TRAIL_LENGTH = 12;

// Floating word for pre-allocation
interface FloatingWord {
  active: boolean;
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  rotation: number;
  rotationSpeed: number;
  lifetime: number;
  maxLifetime: number;
  pattern: 'float' | 'spiral' | 'wave' | 'explode';
  patternPhase: number;
  // Trail system (circular buffer storing last N positions)
  trail: TrailPosition[];
  trailLength: number;      // Actual trail length for this word (3-12)
  trailIndex: number;       // Next slot to write (circular)
  trailFilled: number;      // How many slots have been filled (0 to trailLength)
  lastTrailTime: number;    // Time since last trail capture
  // Pre-rendered text texture (data URL)
  textureDataUrl: string;
  textureWidth: number;
  textureHeight: number;
}

// Explosion particle for viral moments
interface ExplosionParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  colorNumeric: number;  // Numeric color for performance (no per-frame conversion)
  lifetime: number;
}

// Animation patterns
type WordPattern = 'float' | 'spiral' | 'wave' | 'explode';

// Simulated keywords for fallback
const SIMULATED_KEYWORDS = [
  'art', 'creative', 'beautiful', 'amazing', 'love',
  'inspire', 'color', 'flow', 'dream', 'magic',
  'wonder', 'peace', 'joy', 'light', 'energy',
  'cosmic', 'ethereal', 'vibrant', 'serene', 'bold',
];

interface SocialState {
  words: FloatingWord[];
  explosionParticles: ExplosionParticle[];
  canvasWidth: number;
  canvasHeight: number;
  currentSentiment: number;
  targetSentiment: number;
  viewerCount: number;
  maxVisibleWords: number;
  explosionParticleCount: number;
  isViralMoment: boolean;
  viralCooldown: number;
  time: number;
  // Simulated data
  simulatedSentiment: number;
  simulatedViewers: number;
  lastKeywordTime: number;
  // Variability configuration (selected in setup)
  palette: ColorPalette;
  movementConfig: MovementPreset;
  visualConfig: VisualPreset;
  colorCache: ColorCache;
  colorBlendFactor: number;      // 0.4-0.8 range
  wordSpawnInterval: number;     // 0.3-0.8 seconds
  patternWeights: number[];      // Weighted random pattern selection
  trailInterval: number;         // Time between trail captures (0.05-0.15s)
  trailAlphaDecay: number;       // Alpha multiplier for each trail step (0.5-0.7)
  usingRealData: boolean;        // Whether using real social data (false = simulated)
  paletteIndex: number;          // Index into palette arrays (for light/dark switching)
}

const MAX_WORDS = 15;  // Reduced for performance with trails
const MAX_EXPLOSION_PARTICLES = 50;

let state: SocialState = {
  words: [],
  explosionParticles: [],
  canvasWidth: 0,
  canvasHeight: 0,
  currentSentiment: 0,
  targetSentiment: 0,
  viewerCount: 0,
  maxVisibleWords: 20,
  explosionParticleCount: 30,
  isViralMoment: false,
  viralCooldown: 0,
  time: 0,
  simulatedSentiment: 0,
  simulatedViewers: 50,
  lastKeywordTime: 0,
  // Will be set in setup()
  palette: COLOR_PALETTES_DARK[0],
  movementConfig: MOVEMENT_PRESETS[0],
  visualConfig: VISUAL_PRESETS[0],
  colorCache: { sentimentColors: [], hueCycleColors: [] },
  colorBlendFactor: 0.6,
  wordSpawnInterval: 0.5,
  patternWeights: [1, 1, 1, 1],
  trailInterval: 0.12,
  trailAlphaDecay: 0.75,
  usingRealData: false,
  paletteIndex: 0,
};

function rgbToNumeric(color: RGB): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

// Convert HSL to numeric color for color cycling
function hslToNumeric(h: number, s: number, l: number): number {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

// Convert numeric color to hex string for filter APIs
function numericToHex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

// Get color based on sentiment (-1 to +1) using current palette
function getSentimentColor(sentiment: number, palette: ColorPalette): RGB {
  if (sentiment < 0) {
    return lerpColor(palette.negative, palette.neutral, sentiment + 1);
  } else {
    return lerpColor(palette.neutral, palette.positive, sentiment);
  }
}

// Lerp between two numeric colors without object allocation (performance)
function lerpNumericColors(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (Math.round(ar + (br - ar) * t) << 16) |
         (Math.round(ag + (bg - ag) * t) << 8) |
         Math.round(ab + (bb - ab) * t);
}

// Fast sentiment color lookup using pre-computed cache (no allocation)
function getSentimentColorNumeric(sentiment: number): number {
  const index = Math.round((Math.max(-1, Math.min(1, sentiment)) + 1) * 10);
  return state.colorCache.sentimentColors[index];
}

function createTrailPosition(): TrailPosition {
  return { x: 0, y: 0, rotation: 0 };
}

// Pre-render text to canvas texture at high resolution for sharp rendering
// Returns data URL that can be used with api.brush.image()
function renderTextToTexture(text: string, fontSize: number): { dataUrl: string; width: number; height: number } {
  // Render at 2x resolution for sharpness
  const scale = 2;
  const scaledFontSize = fontSize * scale;

  // Create temporary canvas to measure text
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `bold ${scaledFontSize}px Arial`;
  const metrics = ctx.measureText(text);

  // Calculate canvas size with padding
  const padding = scaledFontSize * 0.2;
  const width = Math.ceil(metrics.width + padding * 2);
  const height = Math.ceil(scaledFontSize * 1.4 + padding * 2);

  // Resize canvas
  canvas.width = width;
  canvas.height = height;

  // Re-apply font after resize (canvas reset clears it)
  ctx.font = `bold ${scaledFontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Draw text in white (we'll tint it with the sprite)
  ctx.fillStyle = 'white';
  ctx.fillText(text, width / 2, height / 2);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: width / scale,  // Return display size (not texture size)
    height: height / scale,
  };
}

function createFloatingWord(): FloatingWord {
  // Pre-allocate trail buffer (circular buffer pattern)
  const trail: TrailPosition[] = [];
  for (let i = 0; i < MAX_TRAIL_LENGTH; i++) {
    trail.push(createTrailPosition());
  }

  return {
    active: false,
    text: '',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 20,
    alpha: 1,
    rotation: 0,
    rotationSpeed: 0,
    lifetime: 0,
    maxLifetime: 5,
    pattern: 'float',
    patternPhase: 0,
    trail,
    trailLength: MIN_TRAIL_LENGTH,  // Will be randomized on spawn
    trailIndex: 0,
    trailFilled: 0,
    lastTrailTime: 0,
    textureDataUrl: '',
    textureWidth: 0,
    textureHeight: 0,
  };
}

function createExplosionParticle(): ExplosionParticle {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 5,
    alpha: 1,
    colorNumeric: 0xffffff,  // White default
    lifetime: 0,
  };
}

function spawnWord(text: string): void {
  // Find inactive word
  let word: FloatingWord | null = null;
  for (let i = 0; i < MAX_WORDS; i++) {
    if (!state.words[i].active) {
      word = state.words[i];
      break;
    }
  }
  if (!word) return;

  // Weighted random pattern selection
  const patterns: WordPattern[] = ['float', 'spiral', 'wave', 'explode'];
  const totalWeight = state.patternWeights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  let pattern: WordPattern = 'float';
  for (let i = 0; i < patterns.length; i++) {
    r -= state.patternWeights[i];
    if (r <= 0) {
      pattern = patterns[i];
      break;
    }
  }

  const move = state.movementConfig;
  const visual = state.visualConfig;

  word.active = true;
  word.text = text;
  word.size = visual.wordSizeMin + Math.random() * (visual.wordSizeMax - visual.wordSizeMin);
  word.alpha = 0; // Fade in
  word.rotation = (Math.random() - 0.5) * 0.3;
  word.rotationSpeed = (Math.random() - 0.5) * 0.5;
  word.lifetime = 0;
  word.maxLifetime = 4 + Math.random() * 4;
  word.pattern = pattern;
  word.patternPhase = Math.random() * Math.PI * 2;

  // Pre-render text to texture (high-res for sharpness)
  const texture = renderTextToTexture(text, word.size);
  word.textureDataUrl = texture.dataUrl;
  word.textureWidth = texture.width;
  word.textureHeight = texture.height;

  // Reset trail with randomized length (3-12)
  word.trailLength = MIN_TRAIL_LENGTH + Math.floor(Math.random() * (MAX_TRAIL_LENGTH - MIN_TRAIL_LENGTH + 1));
  word.trailIndex = 0;
  word.trailFilled = 0;
  word.lastTrailTime = 0;

  // Starting position and velocity based on pattern + movement preset
  switch (pattern) {
    case 'float':
      word.x = Math.random() * state.canvasWidth;
      word.y = state.canvasHeight + 50;
      word.vx = (Math.random() - 0.5) * 20;
      word.vy = -(move.floatMin + Math.random() * (move.floatMax - move.floatMin));
      break;
    case 'spiral':
      word.x = state.canvasWidth / 2;
      word.y = state.canvasHeight / 2;
      word.vx = 0;
      word.vy = 0;
      break;
    case 'wave':
      word.x = -50;
      word.y = state.canvasHeight * (0.3 + Math.random() * 0.4);
      word.vx = move.waveMin + Math.random() * (move.waveMax - move.waveMin);
      word.vy = 0;
      break;
    case 'explode':
      word.x = state.canvasWidth / 2;
      word.y = state.canvasHeight / 2;
      const angle = Math.random() * Math.PI * 2;
      const speed = move.explodeMin + Math.random() * (move.explodeMax - move.explodeMin);
      word.vx = Math.cos(angle) * speed;
      word.vy = Math.sin(angle) * speed;
      break;
  }
}

function triggerViralExplosion(): void {
  const cx = state.canvasWidth / 2;
  const cy = state.canvasHeight / 2;
  const sentimentColorNumeric = getSentimentColorNumeric(state.currentSentiment);
  const visual = state.visualConfig;

  for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) {
    const particle = state.explosionParticles[i];
    particle.active = true;
    particle.x = cx + (Math.random() - 0.5) * 50;
    particle.y = cy + (Math.random() - 0.5) * 50;

    const angle = Math.random() * Math.PI * 2;
    const speed = 100 + Math.random() * 200;
    particle.vx = Math.cos(angle) * speed;
    particle.vy = Math.sin(angle) * speed;

    particle.size = visual.particleSizeMin + Math.random() * (visual.particleSizeMax - visual.particleSizeMin);
    particle.alpha = 1;
    particle.colorNumeric = sentimentColorNumeric;
    particle.lifetime = 0;
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    state.canvasWidth = width;
    state.canvasHeight = height;

    // Select random presets for variability (palette index stored for light/dark switching)
    state.paletteIndex = Math.floor(Math.random() * COLOR_PALETTES_DARK.length);
    state.palette = COLOR_PALETTES_DARK[state.paletteIndex];
    state.movementConfig = MOVEMENT_PRESETS[Math.floor(Math.random() * MOVEMENT_PRESETS.length)];
    state.visualConfig = VISUAL_PRESETS[Math.floor(Math.random() * VISUAL_PRESETS.length)];

    // Randomize additional parameters
    state.colorBlendFactor = 0.4 + Math.random() * 0.4;  // 0.4-0.8
    state.wordSpawnInterval = 0.6 + Math.random() * 0.6;  // 0.6-1.2s (slower spawn for trails)

    // Weighted pattern selection (randomize which patterns are favored)
    state.patternWeights = [
      0.5 + Math.random() * 0.5,   // float
      0.3 + Math.random() * 0.7,   // spiral
      0.4 + Math.random() * 0.6,   // wave
      0.2 + Math.random() * 0.5,   // explode
    ];

    // Trail parameters (controls how words leave trails)
    state.trailInterval = 0.08 + Math.random() * 0.12;  // 0.08-0.2s between captures
    state.trailAlphaDecay = 0.6 + Math.random() * 0.3;  // 0.6-0.9 overall trail opacity multiplier

    // Pre-compute color cache for performance (avoid per-frame HSL calculations)
    state.colorCache = {
      sentimentColors: new Array(21),
      hueCycleColors: new Array(36),
    };

    // Pre-compute sentiment gradient (21 steps: -1.0 to +1.0 in 0.1 increments)
    for (let i = 0; i <= 20; i++) {
      const sentiment = (i / 10) - 1;  // -1 to +1
      const color = getSentimentColor(sentiment, state.palette);
      state.colorCache.sentimentColors[i] = rgbToNumeric(color);
    }

    // Pre-compute hue cycle colors (36 steps: 0-350 degrees in 10-degree increments)
    for (let i = 0; i < 36; i++) {
      state.colorCache.hueCycleColors[i] = hslToNumeric(i / 36, 0.7, 0.6);
    }

    // Random settings (reduced for performance with trails)
    state.maxVisibleWords = 6 + Math.floor(Math.random() * 6);  // 6-12 words max
    state.explosionParticleCount = 15 + Math.floor(Math.random() * 15);  // 15-30 particles

    // Pre-allocate words
    state.words = [];
    for (let i = 0; i < MAX_WORDS; i++) {
      state.words.push(createFloatingWord());
    }

    // Pre-allocate explosion particles
    state.explosionParticles = [];
    for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) {
      state.explosionParticles.push(createExplosionParticle());
    }

    state.currentSentiment = 0;
    state.targetSentiment = 0;
    state.viewerCount = 0;
    state.isViralMoment = false;
    state.viralCooldown = 0;
    state.time = 0;
    state.simulatedSentiment = 0;
    state.simulatedViewers = 30 + Math.floor(Math.random() * 50);
    state.lastKeywordTime = 0;

    console.log(
      `[social-pulse] Setup: palette=${state.palette.name}, movement=${state.movementConfig.name}, visual=${state.visualConfig.name}, blend=${state.colorBlendFactor.toFixed(2)}`
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    state.time += dt;
    state.viralCooldown = Math.max(0, state.viralCooldown - dt);

    // Get display mode for light/dark adaptation
    const isDarkMode = api.context.display.isDarkMode();

    // Select appropriate palette based on display mode
    const currentPalette = isDarkMode
      ? COLOR_PALETTES_DARK[state.paletteIndex]
      : COLOR_PALETTES_LIGHT[state.paletteIndex];

    // Rebuild color cache if palette changed (light/dark mode switch)
    if (currentPalette !== state.palette) {
      state.palette = currentPalette;
      // Re-compute sentiment gradient with new palette
      for (let i = 0; i <= 20; i++) {
        const sentiment = (i / 10) - 1;
        const color = getSentimentColor(sentiment, state.palette);
        state.colorCache.sentimentColors[i] = rgbToNumeric(color);
      }
      // Re-compute hue cycle colors with mode-appropriate lightness
      const lightness = isDarkMode ? 0.6 : 0.3;
      for (let i = 0; i < 36; i++) {
        state.colorCache.hueCycleColors[i] = hslToNumeric(i / 36, 0.7, lightness);
      }
    }

    // Mode-aware blend mode: 'add'/'screen' for dark, 'multiply'/'darken' for light
    const blendMode = isDarkMode ? 'add' : 'multiply';

    // Mode-aware alpha adjustment (light mode needs slightly lower alpha)
    const alphaMultiplier = isDarkMode ? 1.0 : 0.8;

    // Check if real social data is available
    state.usingRealData = api.context.social.isAvailable();

    // Get social data (or simulate)
    let sentiment: number;
    let viewerCount: number;
    let keywords: string[];
    let isViral: boolean;

    if (state.usingRealData) {
      sentiment = api.context.social.sentiment();
      viewerCount = api.context.social.viewerCount();
      keywords = api.context.social.trendingKeywords();
      isViral = api.context.social.isViralMoment();
    } else {
      // Simulate social data
      state.simulatedSentiment += (Math.random() - 0.5) * 0.1;
      state.simulatedSentiment = Math.max(-1, Math.min(1, state.simulatedSentiment));
      state.simulatedViewers += Math.floor((Math.random() - 0.5) * 10);
      state.simulatedViewers = Math.max(10, Math.min(200, state.simulatedViewers));

      sentiment = state.simulatedSentiment;
      viewerCount = state.simulatedViewers;
      keywords = [];
      isViral = Math.random() < 0.001; // Rare simulated viral moment
    }

    // Smooth sentiment transition
    state.targetSentiment = sentiment;
    state.currentSentiment += (state.targetSentiment - state.currentSentiment) * dt * 2;
    state.viewerCount = viewerCount;

    // Spawn words from keywords or simulated (using randomized interval)
    if (state.time - state.lastKeywordTime > state.wordSpawnInterval) {
      const useKeywords = keywords.length > 0 ? keywords : SIMULATED_KEYWORDS;
      const word = useKeywords[Math.floor(Math.random() * useKeywords.length)];
      spawnWord(word);
      state.lastKeywordTime = state.time;
    }

    // Handle viral moment
    if (isViral && state.viralCooldown <= 0) {
      state.isViralMoment = true;
      state.viralCooldown = 5; // 5 second cooldown
      triggerViralExplosion();
    }

    // Get current sentiment color using cached lookup (no object allocation)
    const sentimentColorNumeric = getSentimentColorNumeric(state.currentSentiment);
    const visual = state.visualConfig;

    // Draw ambient glow based on sentiment (only with real data)
    if (state.usingRealData) {
      const glowRadius = Math.min(state.canvasWidth, state.canvasHeight) * visual.glowSize;
      api.brush.circle(state.canvasWidth / 2, state.canvasHeight / 2, glowRadius, {
        fill: sentimentColorNumeric,
        alpha: visual.glowAlpha * alphaMultiplier,
        blendMode: blendMode,
      });
    }

    // Update and draw floating words
    let activeWordCount = 0;
    for (let i = 0; i < MAX_WORDS; i++) {
      const word = state.words[i];
      if (!word.active) continue;
      activeWordCount++;

      word.lifetime += dt;

      // Check expiration
      if (word.lifetime >= word.maxLifetime) {
        word.active = false;
        continue;
      }

      // Fade in/out
      const lifeProgress = word.lifetime / word.maxLifetime;
      if (lifeProgress < 0.1) {
        word.alpha = lifeProgress / 0.1;
      } else if (lifeProgress > 0.8) {
        word.alpha = (1 - lifeProgress) / 0.2;
      } else {
        word.alpha = 1;
      }

      // Update position based on pattern (using movement preset)
      const move = state.movementConfig;
      switch (word.pattern) {
        case 'float':
          word.x += word.vx * dt;
          word.y += word.vy * dt;
          break;
        case 'spiral':
          const spiralRadius = word.lifetime * 30 * move.spiralMult;
          const spiralAngle = word.lifetime * 2 * move.spiralMult + word.patternPhase;
          word.x = state.canvasWidth / 2 + Math.cos(spiralAngle) * spiralRadius;
          word.y = state.canvasHeight / 2 + Math.sin(spiralAngle) * spiralRadius;
          break;
        case 'wave':
          word.x += word.vx * dt;
          word.y += Math.sin(word.x * 0.02 + word.patternPhase) * move.waveAmp;
          break;
        case 'explode':
          word.vx *= move.friction;
          word.vy *= move.friction;
          word.x += word.vx * dt;
          word.y += word.vy * dt;
          break;
      }

      word.rotation += word.rotationSpeed * dt;

      // Capture trail position periodically (circular buffer)
      word.lastTrailTime += dt;
      if (word.lastTrailTime >= state.trailInterval) {
        word.lastTrailTime = 0;
        // Store current position in circular buffer
        const slot = word.trail[word.trailIndex];
        slot.x = word.x;
        slot.y = word.y;
        slot.rotation = word.rotation;
        // Advance index (circular, using word's specific trail length)
        word.trailIndex = (word.trailIndex + 1) % word.trailLength;
        // Track how many positions we've stored (up to trailLength)
        if (word.trailFilled < word.trailLength) {
          word.trailFilled++;
        }
      }

      // Color cycling: use pre-computed hue cache (no HSL conversion per frame)
      const hueIndex = (Math.floor((frame.frameCount * 3 + i * 30) / 10)) % 36;
      const cycleColorNumeric = state.colorCache.hueCycleColors[hueIndex];

      // Blend sentiment and cycle colors using numeric lerp (no object allocation)
      const wordColorNumeric = lerpNumericColors(sentimentColorNumeric, cycleColorNumeric, state.colorBlendFactor);

      // Render trail using pre-rendered texture (sprites are properly pooled!)
      // Oldest position is at (trailIndex - trailFilled) mod trailLength
      for (let t = 0; t < word.trailFilled; t++) {
        // Calculate index: start from oldest
        const idx = (word.trailIndex - word.trailFilled + t + word.trailLength) % word.trailLength;
        const trailPos = word.trail[idx];

        // Calculate alpha based on age (t=0 is oldest, t=trailFilled-1 is newest)
        const ageRatio = (t + 1) / (word.trailFilled + 1);
        const trailAlpha = word.alpha * ageRatio * state.trailAlphaDecay;

        // Skip if too faint
        if (trailAlpha < 0.05) continue;

        // Render trail using pre-rendered texture with tinting
        const adjustedTrailAlpha = trailAlpha * alphaMultiplier;
        if (Math.abs(trailPos.rotation) > 0.05) {
          api.brush.pushMatrix();
          api.brush.translate(trailPos.x, trailPos.y);
          api.brush.rotate(trailPos.rotation);
          api.brush.image(word.textureDataUrl, -word.textureWidth / 2, -word.textureHeight / 2, {
            width: word.textureWidth,
            height: word.textureHeight,
            tint: wordColorNumeric,
            alpha: adjustedTrailAlpha,
            blendMode: blendMode,
          });
          api.brush.popMatrix();
        } else {
          api.brush.image(word.textureDataUrl, trailPos.x - word.textureWidth / 2, trailPos.y - word.textureHeight / 2, {
            width: word.textureWidth,
            height: word.textureHeight,
            tint: wordColorNumeric,
            alpha: adjustedTrailAlpha,
            blendMode: blendMode,
          });
        }
      }

      // Render main word using pre-rendered texture
      const adjustedWordAlpha = word.alpha * alphaMultiplier;
      if (Math.abs(word.rotation) > 0.05) {
        api.brush.pushMatrix();
        api.brush.translate(word.x, word.y);
        api.brush.rotate(word.rotation);
        api.brush.image(word.textureDataUrl, -word.textureWidth / 2, -word.textureHeight / 2, {
          width: word.textureWidth,
          height: word.textureHeight,
          tint: wordColorNumeric,
          alpha: adjustedWordAlpha,
          blendMode: blendMode,
        });
        api.brush.popMatrix();
      } else {
        api.brush.image(word.textureDataUrl, word.x - word.textureWidth / 2, word.y - word.textureHeight / 2, {
          width: word.textureWidth,
          height: word.textureHeight,
          tint: wordColorNumeric,
          alpha: adjustedWordAlpha,
          blendMode: blendMode,
        });
      }
    }

    // Update and draw explosion particles
    for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) {
      const particle = state.explosionParticles[i];
      if (!particle.active) continue;

      particle.lifetime += dt;

      // Expire after 2 seconds
      if (particle.lifetime >= 2) {
        particle.active = false;
        continue;
      }

      // Update
      particle.vy += 100 * dt; // Gravity
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.alpha = 1 - particle.lifetime / 2;

      // Draw using stored numeric color (no per-frame conversion)
      api.brush.circle(particle.x, particle.y, particle.size * particle.alpha, {
        fill: particle.colorNumeric,
        alpha: particle.alpha * alphaMultiplier,
        blendMode: blendMode,
      });
    }

    // Only render indicators when using real social data
    if (state.usingRealData) {
      // Draw viewer count indicator (subtle bar at bottom)
      const maxViewers = 200;
      const viewerProgress = Math.min(state.viewerCount / maxViewers, 1);
      const barHeight = 4;
      const barWidth = state.canvasWidth * viewerProgress;

      api.brush.rect(0, state.canvasHeight - barHeight, barWidth, barHeight, {
        fill: sentimentColorNumeric,
        alpha: 0.3 * alphaMultiplier,
      });

      // Sentiment indicator (subtle arc at top)
      const arcCenterX = state.canvasWidth / 2;
      const arcRadius = 30;
      const arcAngle = (state.currentSentiment + 1) / 2 * Math.PI; // 0 to PI

      api.brush.arc(arcCenterX, 20, arcRadius, Math.PI, Math.PI + arcAngle, {
        color: sentimentColorNumeric,
        alpha: 0.5 * alphaMultiplier,
        width: 3,
      });

      // Apply glow filter on viral moments (filter API requires string color)
      if (state.isViralMoment && state.viralCooldown > 4) {
        api.filter.glow(numericToHex(sentimentColorNumeric), 0.5, 30);
      }
    }

    state.isViralMoment = false;
  },

  async teardown(): Promise<void> {
    for (let i = 0; i < MAX_WORDS; i++) {
      state.words[i].active = false;
    }
    for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) {
      state.explosionParticles[i].active = false;
    }
    state.time = 0;
    console.log('[social-pulse] Teardown complete');
  },
};

registerActor(actor);

export default actor;
