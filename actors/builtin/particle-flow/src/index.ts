/**
 * Particle Flow Actor
 *
 * Creates flowing particle systems with physics-based movement.
 * Particles follow force fields, leave trails, and interact with each other.
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
  id: 'particle-flow',
  name: 'Particle Flow',
  description: 'Flowing particle systems with physics-based movement and trails',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['particles', 'physics', 'flow', 'trails', 'generative'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['time'],
};

// Shape types for visual variety
type ParticleShape = 'solid' | 'glow' | 'bokeh' | 'spark' | 'soft';

// Particle type - uses circular buffer for trail to avoid allocations
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  size: number;
  baseSize: number;  // For sizing behaviors
  trail: { x: number; y: number }[];  // Pre-allocated circular buffer
  trailHead: number;                   // Next write index
  trailLength: number;                 // Current number of valid points
  maxTrailLength: number;
  active: boolean;                     // Pool flag - reuse instead of create/destroy
  colorIndex: number;                  // Index into color palette
  shapeType: ParticleShape;            // Visual shape type
  hasHalo: boolean;                    // Whether to render halo effect
}

// Force field attractor/repeller
interface ForceField {
  x: number;
  y: number;
  strength: number; // Positive = attractor, negative = repeller
  radius: number;
  vx: number;
  vy: number;
}

// Color palettes - pre-defined for performance (no HSL parsing at runtime)
const COLOR_PALETTES = [
  // Sunset
  ['#ff6b6b', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'],
  // Ocean
  ['#0abde3', '#10ac84', '#00d2d3', '#01a3a4', '#48dbfb'],
  // Forest
  ['#26de81', '#20bf6b', '#0fb9b1', '#2bcbba', '#45aaf2'],
  // Neon
  ['#ff00ff', '#00ffff', '#ff0099', '#00ff99', '#9900ff'],
  // Fire
  ['#ff4500', '#ff6600', '#ff9900', '#ffcc00', '#ff3300'],
  // Pastel
  ['#a8d8ea', '#aa96da', '#fcbad3', '#ffffd2', '#b8e994'],
  // Cyberpunk
  ['#f706cf', '#00fff0', '#7700ff', '#ff003c', '#00ff6a'],
  // Monochrome Blue
  ['#001f3f', '#003366', '#0066cc', '#3399ff', '#99ccff'],
  // Monochrome Red
  ['#330000', '#660000', '#cc0000', '#ff3333', '#ff9999'],
  // Earth
  ['#8B4513', '#A0522D', '#CD853F', '#DEB887', '#F5DEB3'],
  // Aurora
  ['#00ff87', '#60efff', '#ff00ff', '#7b2cbf', '#001f54'],
  // Candy
  ['#ff6f91', '#ff9671', '#ffc75f', '#f9f871', '#d65db1'],
  // Ice
  ['#a8edea', '#fed6e3', '#d299c2', '#a8c0ff', '#cfecd0'],
  // Toxic
  ['#39ff14', '#ccff00', '#ffff00', '#00ff00', '#7fff00'],
];

// Blend modes for variety
const BLEND_MODES: Array<'normal' | 'add' | 'screen' | 'multiply' | 'overlay'> = [
  'screen', 'screen', 'add', 'normal', 'overlay'
];

// State
interface FlowState {
  width: number;
  height: number;
  particles: Particle[];
  forceFields: ForceField[];
  time: number;
  noiseOffset: number;
  colorMode: 'rainbow' | 'monochrome' | 'gradient' | 'palette' | 'shifting';
  baseHue: number;
  activeCount: number;  // Track active particles for faster iteration
  trailPoints: { x: number; y: number }[];  // Pre-allocated array for batched trail rendering
  palette: string[];  // Current color palette
  paletteIndex: number;  // Current palette index
  blendMode: 'normal' | 'add' | 'screen' | 'multiply' | 'overlay';
  trailLengthMin: number;  // Randomized trail length range
  trailLengthMax: number;
  colorShiftSpeed: number;  // For shifting color mode
  // Pre-rendered textures for visual variety (light and dark versions)
  glowTexture: string;
  bokehTexture: string;
  sparkTexture: string;
  softTexture: string;
  glowTextureDark: string;  // Dark versions for light mode
  bokehTextureDark: string;
  sparkTextureDark: string;
  softTextureDark: string;
  // Shape distribution for this instance
  availableShapes: ParticleShape[];
  haloChance: number;  // 0-0.5 range for solid particles
  // Display mode cache (set during update from context)
  isDarkMode: boolean;
}

let state: FlowState = {
  width: 1920,
  height: 1080,
  particles: [],
  forceFields: [],
  time: 0,
  noiseOffset: 0,
  colorMode: 'rainbow',
  baseHue: 0,
  activeCount: 0,
  trailPoints: [],
  palette: COLOR_PALETTES[0],
  paletteIndex: 0,
  blendMode: 'screen',
  trailLengthMin: 10,
  trailLengthMax: 25,
  colorShiftSpeed: 1,
  // Textures initialized in setup()
  glowTexture: '',
  bokehTexture: '',
  sparkTexture: '',
  softTexture: '',
  glowTextureDark: '',
  bokehTextureDark: '',
  sparkTextureDark: '',
  softTextureDark: '',
  availableShapes: ['solid', 'glow'],
  haloChance: 0.3,
  isDarkMode: true,
};

// Reduced from 500 to improve performance
const MAX_PARTICLES = 200;
const SPAWN_RATE = 3;
const MAX_TRAIL_POINTS = 50;  // Pre-allocated trail points for batched rendering

// Sizing behavior types - expanded options
type SizingBehavior = 'uniform' | 'varied' | 'pulsing' | 'growing' | 'shrinking' | 'oscillating' | 'random' | 'velocity';
let sizingBehavior: SizingBehavior = 'varied';
let baseSize = 2;
let sizeVariation = 2;
let sizeOscillationSpeed = 0.1;

// ============================================================
// Texture Creation Functions
// ============================================================

/**
 * Create soft radial glow texture (64x64).
 * Used for glow shape type and halos.
 * @param dark - If true, creates dark texture for light mode
 */
function createGlowTexture(dark: boolean = false): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2, cy = size / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);

  if (dark) {
    // Dark texture for light mode - uses black with higher opacity for visibility
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(0.25, 'rgba(0, 0, 0, 0.75)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.4)');
    gradient.addColorStop(0.75, 'rgba(0, 0, 0, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    // White texture for dark mode (original)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.7)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
    gradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return canvas.toDataURL();
}

/**
 * Create bokeh ring texture (64x64).
 * Ring-like out-of-focus effect: dim center, bright edge, soft outer fade.
 * @param dark - If true, creates dark texture for light mode
 */
function createBokehTexture(dark: boolean = false): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  const cx = size / 2, cy = size / 2;
  const maxRadius = size / 2;

  const colorValue = dark ? 0 : 255;  // Black for light mode, white for dark mode

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normalizedDist = dist / maxRadius;

      // Bokeh ring profile: dim center, bright ring at ~70-85%, soft outer fade
      let intensity = 0;
      if (normalizedDist < 0.55) {
        // Transparent center with slight fill
        intensity = 0.1 + normalizedDist * 0.25;
      } else if (normalizedDist < 0.85) {
        // Bright ring
        const ringPos = (normalizedDist - 0.55) / 0.30;
        intensity = 0.35 + ringPos * 0.65;
      } else if (normalizedDist < 1.0) {
        // Soft outer fade
        const fadePos = (normalizedDist - 0.85) / 0.15;
        intensity = 1.0 - fadePos * fadePos;
      }

      // Higher alpha for dark textures to maintain visibility
      const alphaMultiplier = dark ? 1.2 : 1.0;
      const alpha = Math.min(255, intensity * 255 * alphaMultiplier);
      const idx = (y * size + x) * 4;
      data[idx] = colorValue;     // R
      data[idx + 1] = colorValue; // G
      data[idx + 2] = colorValue; // B
      data[idx + 3] = alpha;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

/**
 * Create sparkle/star texture (64x64).
 * 4-pointed star with gradient spikes.
 * @param dark - If true, creates dark texture for light mode
 */
function createSparkTexture(dark: boolean = false): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2, cy = size / 2;
  const colorStr = dark ? '0, 0, 0' : '255, 255, 255';

  // Draw 4 spikes
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Spike gradient
    const spike = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    spike.addColorStop(0, `rgba(${colorStr}, 0)`);
    spike.addColorStop(0.4, `rgba(${colorStr}, 0.6)`);
    spike.addColorStop(0.5, `rgba(${colorStr}, 1)`);
    spike.addColorStop(0.6, `rgba(${colorStr}, 0.6)`);
    spike.addColorStop(1, `rgba(${colorStr}, 0)`);

    ctx.fillStyle = spike;
    ctx.fillRect(-3, -size / 2, 6, size);
    ctx.restore();
  }

  // Bright center
  const center = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.15);
  center.addColorStop(0, `rgba(${colorStr}, 1)`);
  center.addColorStop(0.5, `rgba(${colorStr}, 0.8)`);
  center.addColorStop(1, `rgba(${colorStr}, 0)`);
  ctx.globalCompositeOperation = dark ? 'darken' : 'lighter';
  ctx.fillStyle = center;
  ctx.fillRect(0, 0, size, size);

  return canvas.toDataURL();
}

/**
 * Create ultra-soft blur texture (64x64).
 * Very gradual Gaussian-like falloff for soft particles.
 * @param dark - If true, creates dark texture for light mode
 */
function createSoftTexture(dark: boolean = false): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2, cy = size / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  const colorStr = dark ? '0, 0, 0' : '255, 255, 255';

  // Very gradual falloff for ultra-soft appearance
  // Higher alpha values for dark texture to maintain visibility
  if (dark) {
    gradient.addColorStop(0, `rgba(${colorStr}, 0.95)`);
    gradient.addColorStop(0.15, `rgba(${colorStr}, 0.75)`);
    gradient.addColorStop(0.35, `rgba(${colorStr}, 0.5)`);
    gradient.addColorStop(0.55, `rgba(${colorStr}, 0.25)`);
    gradient.addColorStop(0.75, `rgba(${colorStr}, 0.1)`);
    gradient.addColorStop(0.9, `rgba(${colorStr}, 0.03)`);
    gradient.addColorStop(1, `rgba(${colorStr}, 0)`);
  } else {
    gradient.addColorStop(0, `rgba(${colorStr}, 0.9)`);
    gradient.addColorStop(0.15, `rgba(${colorStr}, 0.7)`);
    gradient.addColorStop(0.35, `rgba(${colorStr}, 0.45)`);
    gradient.addColorStop(0.55, `rgba(${colorStr}, 0.2)`);
    gradient.addColorStop(0.75, `rgba(${colorStr}, 0.08)`);
    gradient.addColorStop(0.9, `rgba(${colorStr}, 0.02)`);
    gradient.addColorStop(1, `rgba(${colorStr}, 0)`);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return canvas.toDataURL();
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Simple 2D noise function for flow fields.
 */
function noise2D(x: number, y: number, seed: number = 0): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Convert HSL to numeric color (0xRRGGBB format).
 * Use with separate alpha parameter for better performance.
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

  const rInt = Math.round((r + m) * 255);
  const gInt = Math.round((g + m) * 255);
  const bInt = Math.round((b + m) * 255);
  return (rInt << 16) | (gInt << 8) | bInt;
}

/**
 * Convert hex color string to numeric (e.g., '#ff6b6b' -> 0xff6b6b).
 */
function hexToNumeric(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/**
 * Get mode-aware blend mode.
 * For dark mode: add, screen work well (additive blending on dark)
 * For light mode: multiply, normal work better (subtractive/neutral on light)
 */
function getModeBlendMode(
  preferredDark: 'normal' | 'add' | 'screen' | 'multiply' | 'overlay'
): 'normal' | 'add' | 'screen' | 'multiply' | 'overlay' {
  if (state.isDarkMode) {
    return preferredDark;
  }
  // Map dark-mode blend modes to light-mode equivalents
  switch (preferredDark) {
    case 'add':
    case 'screen':
      return 'multiply';  // Additive -> Subtractive
    case 'overlay':
      return 'normal';    // Overlay can be harsh on light
    default:
      return preferredDark;
  }
}

/**
 * Get mode-aware HSL lightness.
 * Dark mode: bright colors (60-80% lightness)
 * Light mode: darker colors (25-45% lightness)
 */
function getModeAwareLightness(darkModeLightness: number): number {
  if (state.isDarkMode) {
    return darkModeLightness;
  }
  // Convert light mode: invert around 50% and reduce
  // e.g., 70% -> 30%, 60% -> 40%
  return Math.max(20, Math.min(45, 100 - darkModeLightness));
}

/**
 * Get mode-aware alpha for trails.
 * Light mode needs higher alpha for visibility.
 */
function getModeTrailAlpha(baseAlpha: number): number {
  if (state.isDarkMode) {
    return baseAlpha;
  }
  // Boost alpha for light mode trails (they're less visible)
  return Math.min(1, baseAlpha * 1.4);
}

/**
 * Get the appropriate texture for current display mode.
 */
function getTextureForMode(lightTexture: string, darkTexture: string): string {
  return state.isDarkMode ? lightTexture : darkTexture;
}

/**
 * Get flow field angle at a position using noise.
 */
function getFlowAngle(x: number, y: number, time: number, scale: number = 0.003): number {
  // Multi-octave noise for more organic flow
  const n1 = noise2D(x * scale, y * scale, time * 0.1);
  const n2 = noise2D(x * scale * 2, y * scale * 2, time * 0.15) * 0.5;
  const n3 = noise2D(x * scale * 4, y * scale * 4, time * 0.2) * 0.25;

  return (n1 + n2 + n3) * Math.PI * 4;
}

/**
 * Create a new particle (for initial pool allocation).
 */
function createParticle(): Particle {
  const maxTrailLength = 20;  // Fixed trail length for pooled particles

  // Pre-allocate trail array as circular buffer to avoid runtime allocations
  const trail: { x: number; y: number }[] = new Array(maxTrailLength);
  for (let i = 0; i < maxTrailLength; i++) {
    trail[i] = { x: 0, y: 0 };
  }

  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 300,
    hue: 0,
    size: 2,
    baseSize: 2,
    trail,
    trailHead: 0,
    trailLength: 0,
    maxTrailLength,
    active: false,
    colorIndex: 0,
    shapeType: 'solid',
    hasHalo: false,
  };
}

/**
 * Get particle size based on sizing behavior.
 */
function getParticleSize(p: Particle, time: number): number {
  switch (sizingBehavior) {
    case 'uniform':
      return baseSize;
    case 'varied':
      return p.baseSize;
    case 'pulsing':
      return p.baseSize * (0.7 + 0.6 * Math.sin(p.life * 0.1 + p.x * 0.01));
    case 'growing':
      return p.baseSize * (0.5 + (p.life / p.maxLife) * 1.5);
    case 'shrinking':
      return p.baseSize * (1.5 - (p.life / p.maxLife));
    case 'oscillating':
      // Smooth oscillation based on time and particle position
      return p.baseSize * (0.5 + 0.8 * Math.abs(Math.sin(time * sizeOscillationSpeed + p.hue * 0.01)));
    case 'random':
      // Pseudo-random size that changes smoothly over time
      return p.baseSize * (0.6 + 0.8 * Math.abs(Math.sin(p.life * 0.05 + p.x * 0.02 + p.y * 0.02)));
    case 'velocity': {
      // Size based on velocity - faster = larger
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      return p.baseSize * (0.5 + speed * 0.5);
    }
    default:
      return p.baseSize;
  }
}

/**
 * Initialize/respawn a particle at a position.
 */
function initParticle(p: Particle, sourceX: number, sourceY: number): void {
  p.x = sourceX;
  p.y = sourceY;

  // Initial velocity from flow field
  const angle = getFlowAngle(sourceX, sourceY, state.time);
  const speed = 0.5 + Math.random() * 1;
  p.vx = Math.cos(angle) * speed;
  p.vy = Math.sin(angle) * speed;

  p.life = 0;
  p.maxLife = 200 + Math.random() * 300;
  p.hue = state.colorMode === 'rainbow' ? Math.random() * 360 : state.baseHue;
  p.trailHead = 0;
  p.trailLength = 0;
  p.active = true;
  p.colorIndex = Math.floor(Math.random() * state.palette.length);

  // Assign random shape type from available shapes
  p.shapeType = state.availableShapes[
    Math.floor(Math.random() * state.availableShapes.length)
  ];

  // Assign halo (only for solid particles)
  p.hasHalo = p.shapeType === 'solid' && Math.random() < state.haloChance;

  // Adjust base size based on shape type (some shapes look better larger)
  let sizeMultiplier = 1;
  switch (p.shapeType) {
    case 'solid': sizeMultiplier = 1; break;
    case 'glow': sizeMultiplier = 1.5; break;
    case 'bokeh': sizeMultiplier = 2; break;  // Rings look better larger
    case 'spark': sizeMultiplier = 1.2; break;
    case 'soft': sizeMultiplier = 1.8; break;
  }
  p.baseSize = (baseSize + Math.random() * sizeVariation) * sizeMultiplier;
  p.size = p.baseSize;

  // Initialize first trail point
  p.trail[0].x = sourceX;
  p.trail[0].y = sourceY;
  p.trailHead = 1;
  p.trailLength = 1;
}

/**
 * Create a force field at random position.
 */
function createForceField(): ForceField {
  return {
    x: Math.random() * state.width,
    y: Math.random() * state.height,
    strength: (Math.random() - 0.5) * 200, // -100 to 100
    radius: 100 + Math.random() * 200,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
  };
}

/**
 * The Particle Flow actor.
 */
const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;
    state.time = 0;
    state.noiseOffset = Math.random() * 1000;
    state.baseHue = Math.random() * 360;
    state.activeCount = 0;

    // Pick random color mode with more variety
    const modes: FlowState['colorMode'][] = [
      'palette', 'palette', 'rainbow', 'gradient', 'shifting', 'monochrome'
    ];
    state.colorMode = modes[Math.floor(Math.random() * modes.length)];

    // Pick random palette from expanded list
    state.paletteIndex = Math.floor(Math.random() * COLOR_PALETTES.length);
    state.palette = COLOR_PALETTES[state.paletteIndex];

    // Random blend mode
    state.blendMode = BLEND_MODES[Math.floor(Math.random() * BLEND_MODES.length)];

    // Random trail length range
    state.trailLengthMin = 5 + Math.floor(Math.random() * 10);
    state.trailLengthMax = state.trailLengthMin + 10 + Math.floor(Math.random() * 20);

    // Random color shift speed for 'shifting' mode
    state.colorShiftSpeed = 0.5 + Math.random() * 2;

    // Pick random sizing behavior from expanded list
    const sizingBehaviors: SizingBehavior[] = [
      'uniform', 'varied', 'pulsing', 'growing', 'shrinking', 'oscillating', 'random', 'velocity'
    ];
    sizingBehavior = sizingBehaviors[Math.floor(Math.random() * sizingBehaviors.length)];

    // More varied base sizes
    baseSize = 1 + Math.random() * 4;  // 1-5 range
    sizeVariation = 0.5 + Math.random() * 5;  // 0.5-5.5 range
    sizeOscillationSpeed = 0.05 + Math.random() * 0.2;

    // Pre-render textures for visual variety (once at setup)
    // Create both light and dark versions for mode switching
    state.glowTexture = createGlowTexture(false);      // White for dark mode
    state.bokehTexture = createBokehTexture(false);
    state.sparkTexture = createSparkTexture(false);
    state.softTexture = createSoftTexture(false);
    state.glowTextureDark = createGlowTexture(true);   // Black for light mode
    state.bokehTextureDark = createBokehTexture(true);
    state.sparkTextureDark = createSparkTexture(true);
    state.softTextureDark = createSoftTexture(true);

    // Pick 1-2 random shapes for cohesive look per cycle
    const allShapes: ParticleShape[] = ['solid', 'glow', 'bokeh', 'spark', 'soft'];
    const shapeCount = 1 + Math.floor(Math.random() * 2);  // 1-2 shapes
    // Fisher-Yates shuffle for random selection
    for (let i = allShapes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allShapes[i], allShapes[j]] = [allShapes[j], allShapes[i]];
    }
    state.availableShapes = allShapes.slice(0, shapeCount);
    state.haloChance = Math.random() * 0.4;  // 0-40% halo chance for solid particles

    // Pre-allocate entire particle pool (no allocations during update)
    state.particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      state.particles[i] = createParticle();
    }

    // Pre-allocate trail points array for batched stroke rendering
    state.trailPoints = new Array(MAX_TRAIL_POINTS);
    for (let i = 0; i < MAX_TRAIL_POINTS; i++) {
      state.trailPoints[i] = { x: 0, y: 0 };
    }

    // Create initial force fields
    state.forceFields = [];
    const fieldCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < fieldCount; i++) {
      state.forceFields.push(createForceField());
    }

    // Activate initial particles
    for (let i = 0; i < 50; i++) {
      const p = state.particles[i];
      initParticle(p, Math.random() * width, Math.random() * height);
      state.activeCount++;
    }

    console.log(`[particle-flow] Setup: mode=${state.colorMode}, sizing=${sizingBehavior}, palette=${state.paletteIndex}, blend=${state.blendMode}, baseSize=${baseSize.toFixed(1)}, shapes=[${state.availableShapes.join(',')}], haloChance=${(state.haloChance * 100).toFixed(0)}%, pool=${MAX_PARTICLES}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;

    // Cache display mode for this frame
    state.isDarkMode = api.context.display.isDarkMode();

    const dt = frame.deltaTime / 16.67;
    state.time += dt * 0.5;

    // Slowly drift base hue
    state.baseHue = (state.baseHue + 0.1 * dt) % 360;

    // Update force fields
    for (const field of state.forceFields) {
      field.x += field.vx * dt;
      field.y += field.vy * dt;

      // Bounce off edges
      if (field.x < 0 || field.x > width) field.vx *= -1;
      if (field.y < 0 || field.y > height) field.vy *= -1;

      // Keep in bounds
      field.x = Math.max(0, Math.min(width, field.x));
      field.y = Math.max(0, Math.min(height, field.y));
    }

    // Spawn new particles from pool (find inactive particles)
    let spawned = 0;
    for (let i = 0; i < state.particles.length && spawned < SPAWN_RATE; i++) {
      const p = state.particles[i];
      if (!p.active) {
        // Spawn from random edge
        const edge = Math.floor(Math.random() * 4);
        let x: number, y: number;
        switch (edge) {
          case 0: x = Math.random() * width; y = 0; break;
          case 1: x = width; y = Math.random() * height; break;
          case 2: x = Math.random() * width; y = height; break;
          default: x = 0; y = Math.random() * height;
        }
        initParticle(p, x, y);
        state.activeCount++;
        spawned++;
      }
    }

    // Update and draw particles (in-place, no filter allocation)
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      if (!p.active) continue;

      p.life += dt;

      // Get flow field influence
      const flowAngle = getFlowAngle(p.x, p.y, state.time + state.noiseOffset);
      const flowStrength = 0.1;
      p.vx += Math.cos(flowAngle) * flowStrength * dt;
      p.vy += Math.sin(flowAngle) * flowStrength * dt;

      // Apply force fields
      for (const field of state.forceFields) {
        const dx = field.x - p.x;
        const dy = field.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < field.radius && dist > 10) {
          const force = (field.strength / (dist * dist)) * dt;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }

      // Apply friction
      p.vx *= 0.98;
      p.vy *= 0.98;

      // Limit velocity
      const maxSpeed = 5;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }

      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Add to trail using circular buffer (no allocations)
      p.trail[p.trailHead].x = p.x;
      p.trail[p.trailHead].y = p.y;
      p.trailHead = (p.trailHead + 1) % p.maxTrailLength;
      if (p.trailLength < p.maxTrailLength) {
        p.trailLength++;
      }

      // Check if particle should die
      if (p.life > p.maxLife || p.x < -50 || p.x > width + 50 || p.y < -50 || p.y > height + 50) {
        p.active = false;
        state.activeCount--;
        continue;
      }

      // Calculate life factor for fading
      const lifeFactor = 1 - p.life / p.maxLife;
      const fadeIn = Math.min(1, p.life / 20);
      const alpha = lifeFactor * fadeIn;

      // Get dynamic size
      p.size = getParticleSize(p, state.time);

      // Determine numeric color based on mode (no string allocations)
      // Use mode-aware lightness for visibility on both backgrounds
      let numericColor: number;
      if (state.colorMode === 'palette') {
        // Palette colors are pre-defined - adjust lightness for light mode
        const paletteColor = hexToNumeric(state.palette[p.colorIndex]);
        if (!state.isDarkMode) {
          // Darken palette colors for light mode by reducing RGB values
          const r = ((paletteColor >> 16) & 0xff) * 0.5;
          const g = ((paletteColor >> 8) & 0xff) * 0.5;
          const b = (paletteColor & 0xff) * 0.5;
          numericColor = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
        } else {
          numericColor = paletteColor;
        }
      } else if (state.colorMode === 'rainbow') {
        numericColor = hslToNumeric(p.hue, 80, getModeAwareLightness(70));
      } else if (state.colorMode === 'gradient') {
        const hue = (state.baseHue + (p.x / width) * 60 + (p.y / height) * 30) % 360;
        numericColor = hslToNumeric(hue, 80, getModeAwareLightness(70));
      } else if (state.colorMode === 'shifting') {
        const shiftedHue = (p.hue + state.time * state.colorShiftSpeed * 10) % 360;
        numericColor = hslToNumeric(shiftedHue, 85, getModeAwareLightness(65));
      } else {
        // monochrome
        numericColor = hslToNumeric(state.baseHue, 80, getModeAwareLightness(70));
      }

      // Draw trail using batched stroke (1 call instead of 15-35 line calls)
      if (p.trailLength > 2) {
        const startIdx = (p.trailHead - p.trailLength + p.maxTrailLength) % p.maxTrailLength;

        // Copy trail points to pre-allocated array
        const pointCount = Math.min(p.trailLength, MAX_TRAIL_POINTS);
        for (let j = 0; j < pointCount; j++) {
          const idx = (startIdx + j) % p.maxTrailLength;
          state.trailPoints[j].x = p.trail[idx].x;
          state.trailPoints[j].y = p.trail[idx].y;
        }

        // Get trail color (slightly dimmer, numeric) with mode-aware lightness
        let trailNumericColor: number;
        if (state.colorMode === 'palette') {
          const paletteColor = hexToNumeric(state.palette[p.colorIndex]);
          if (!state.isDarkMode) {
            // Darken palette colors for light mode trails
            const r = ((paletteColor >> 16) & 0xff) * 0.4;
            const g = ((paletteColor >> 8) & 0xff) * 0.4;
            const b = (paletteColor & 0xff) * 0.4;
            trailNumericColor = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
          } else {
            trailNumericColor = paletteColor;
          }
        } else if (state.colorMode === 'shifting') {
          const shiftedHue = (p.hue + state.time * state.colorShiftSpeed * 10) % 360;
          trailNumericColor = hslToNumeric(shiftedHue, 70, getModeAwareLightness(55));
        } else {
          const hue = state.colorMode === 'rainbow' ? p.hue : state.baseHue;
          trailNumericColor = hslToNumeric(hue, 70, getModeAwareLightness(60));
        }

        // Single stroke call for entire trail with mode-aware alpha
        api.brush.stroke(state.trailPoints.slice(0, pointCount), {
          color: trailNumericColor,
          alpha: getModeTrailAlpha(alpha * 0.5),
          width: p.size * 0.8,
          cap: 'round',
          join: 'round',
        });
      }

      // Draw particle based on shape type with mode-aware textures and blend modes
      // Select appropriate texture for current display mode
      const glowTex = getTextureForMode(state.glowTexture, state.glowTextureDark);
      const bokehTex = getTextureForMode(state.bokehTexture, state.bokehTextureDark);
      const sparkTex = getTextureForMode(state.sparkTexture, state.sparkTextureDark);
      const softTex = getTextureForMode(state.softTexture, state.softTextureDark);

      // Get mode-aware blend modes
      const mainBlend = getModeBlendMode(state.blendMode);
      const additiveBlend = getModeBlendMode('add');

      switch (p.shapeType) {
        case 'solid':
          // Classic solid circle
          api.brush.circle(p.x, p.y, p.size, {
            fill: numericColor,
            alpha,
            blendMode: mainBlend,
          });
          // Optional halo for solid particles
          if (p.hasHalo && p.size > 1.5) {
            api.brush.image(glowTex, p.x, p.y, {
              width: p.size * 5,
              height: p.size * 5,
              tint: numericColor,
              alpha: alpha * (state.isDarkMode ? 0.25 : 0.35),  // Slightly higher for light mode
              blendMode: additiveBlend,
            });
          }
          break;

        case 'glow':
          // Soft glow texture
          api.brush.image(glowTex, p.x, p.y, {
            width: p.size * 2.5,
            height: p.size * 2.5,
            tint: numericColor,
            alpha,
            blendMode: mainBlend,
          });
          break;

        case 'bokeh':
          // Ring-like out-of-focus effect
          api.brush.image(bokehTex, p.x, p.y, {
            width: p.size * 2.5,
            height: p.size * 2.5,
            tint: numericColor,
            alpha: alpha * (state.isDarkMode ? 0.75 : 0.85),  // Higher alpha for light mode
            blendMode: additiveBlend,
          });
          break;

        case 'spark':
          // Star/sparkle with slow rotation
          api.brush.image(sparkTex, p.x, p.y, {
            width: p.size * 2.5,
            height: p.size * 2.5,
            tint: numericColor,
            alpha,
            blendMode: additiveBlend,
            rotation: p.life * 0.02,  // Slow spin
          });
          break;

        case 'soft':
          // Ultra-soft blur particle
          api.brush.image(softTex, p.x, p.y, {
            width: p.size * 3,
            height: p.size * 3,
            tint: numericColor,
            alpha: alpha * (state.isDarkMode ? 0.7 : 0.8),  // Higher alpha for light mode
            blendMode: mainBlend,
          });
          break;
      }
    }

    // Visualize force fields (very subtle, mode-aware colors)
    for (const field of state.forceFields) {
      const isAttractor = field.strength > 0;
      const intensity = Math.abs(field.strength) / 100;
      // Darker colors for light mode, brighter for dark mode
      const attractorColor = state.isDarkMode ? 0x64c8ff : 0x003366;  // Bright blue / dark blue
      const repellerColor = state.isDarkMode ? 0xff6464 : 0x660000;   // Bright red / dark red
      api.brush.circle(field.x, field.y, 10 + intensity * 20, {
        fill: isAttractor ? attractorColor : repellerColor,
        alpha: intensity * (state.isDarkMode ? 0.03 : 0.06),  // Higher alpha for light mode
      });
    }
  },

  async teardown(): Promise<void> {
    state = {
      width: 1920,
      height: 1080,
      particles: [],
      forceFields: [],
      time: 0,
      noiseOffset: 0,
      colorMode: 'rainbow',
      baseHue: 0,
      activeCount: 0,
      trailPoints: [],
      palette: COLOR_PALETTES[0],
      paletteIndex: 0,
      blendMode: 'screen',
      trailLengthMin: 10,
      trailLengthMax: 25,
      colorShiftSpeed: 1,
      // Clear textures to free memory
      glowTexture: '',
      bokehTexture: '',
      sparkTexture: '',
      softTexture: '',
      glowTextureDark: '',
      bokehTextureDark: '',
      sparkTextureDark: '',
      softTextureDark: '',
      availableShapes: ['solid', 'glow'],
      haloChance: 0.3,
      isDarkMode: true,
    };
    console.log('[particle-flow] Teardown complete');
  },
};

// Self-register with the runtime
registerActor(actor);

export default actor;
