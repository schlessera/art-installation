/**
 * Synthwave Horizon Actor
 *
 * Creates retro synthwave aesthetics with:
 * - Gradient sky backgrounds
 * - Glowing sun/moon at the horizon
 * - Perspective grid floor scrolling toward viewer
 * - Multiple neon color palettes
 * - Optional mountain silhouettes and stars
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
  id: 'synthwave-horizon',
  name: 'Synthwave Horizon',
  description: 'Retro synthwave grid floor and gradient sky with neon aesthetics',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['synthwave', 'retro', '80s', 'grid', 'neon', 'background'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['time'],
};

// Color type
interface RGB {
  r: number;
  g: number;
  b: number;
}

// Synthwave color palettes
interface SynthwavePalette {
  name: string;
  skyTop: RGB;
  skyBottom: RGB;
  sun: RGB;
  sunGlow: RGB;
  gridLines: RGB;
  gridGlow: RGB;
  horizon: RGB;
}

const PALETTES: SynthwavePalette[] = [
  // Classic Synthwave (pink/cyan)
  {
    name: 'Classic',
    skyTop: { r: 10, g: 0, b: 30 },
    skyBottom: { r: 60, g: 20, b: 80 },
    sun: { r: 255, g: 100, b: 150 },
    sunGlow: { r: 255, g: 50, b: 100 },
    gridLines: { r: 0, g: 255, b: 255 },
    gridGlow: { r: 255, g: 0, b: 255 },
    horizon: { r: 255, g: 0, b: 128 },
  },
  // Sunset Drive
  {
    name: 'Sunset',
    skyTop: { r: 20, g: 0, b: 40 },
    skyBottom: { r: 255, g: 100, b: 50 },
    sun: { r: 255, g: 200, b: 50 },
    sunGlow: { r: 255, g: 150, b: 0 },
    gridLines: { r: 255, g: 150, b: 50 },
    gridGlow: { r: 255, g: 50, b: 100 },
    horizon: { r: 255, g: 80, b: 0 },
  },
  // Midnight Blue
  {
    name: 'Midnight',
    skyTop: { r: 0, g: 0, b: 20 },
    skyBottom: { r: 0, g: 30, b: 80 },
    sun: { r: 150, g: 200, b: 255 },
    sunGlow: { r: 50, g: 100, b: 200 },
    gridLines: { r: 0, g: 150, b: 255 },
    gridGlow: { r: 100, g: 50, b: 255 },
    horizon: { r: 0, g: 100, b: 200 },
  },
  // Neon Green
  {
    name: 'Matrix',
    skyTop: { r: 0, g: 10, b: 0 },
    skyBottom: { r: 0, g: 40, b: 20 },
    sun: { r: 0, g: 255, b: 100 },
    sunGlow: { r: 0, g: 200, b: 50 },
    gridLines: { r: 0, g: 255, b: 100 },
    gridGlow: { r: 0, g: 255, b: 0 },
    horizon: { r: 0, g: 150, b: 50 },
  },
  // Vapor Purple
  {
    name: 'Vapor',
    skyTop: { r: 20, g: 0, b: 50 },
    skyBottom: { r: 100, g: 0, b: 150 },
    sun: { r: 255, g: 150, b: 255 },
    sunGlow: { r: 200, g: 50, b: 255 },
    gridLines: { r: 150, g: 100, b: 255 },
    gridGlow: { r: 255, g: 100, b: 200 },
    horizon: { r: 200, g: 0, b: 255 },
  },
  // Blood Moon
  {
    name: 'Blood Moon',
    skyTop: { r: 20, g: 0, b: 0 },
    skyBottom: { r: 80, g: 0, b: 20 },
    sun: { r: 255, g: 50, b: 50 },
    sunGlow: { r: 200, g: 0, b: 0 },
    gridLines: { r: 255, g: 50, b: 50 },
    gridGlow: { r: 255, g: 0, b: 100 },
    horizon: { r: 150, g: 0, b: 50 },
  },
  // Ice Cold
  {
    name: 'Ice',
    skyTop: { r: 0, g: 20, b: 40 },
    skyBottom: { r: 100, g: 150, b: 200 },
    sun: { r: 200, g: 240, b: 255 },
    sunGlow: { r: 100, g: 200, b: 255 },
    gridLines: { r: 150, g: 220, b: 255 },
    gridGlow: { r: 100, g: 180, b: 255 },
    horizon: { r: 150, g: 200, b: 255 },
  },
];

// Pattern variations
type PatternType = 'standard' | 'double-sun' | 'no-sun' | 'low-sun';

// Sun style variations
type SunStyle = 'striped' | 'gradient' | 'eclipse' | 'ring';

// Grid style variations
type GridStyle = 'standard' | 'curved' | 'shader';

// Perspective grid shader (GLSL)
const PERSPECTIVE_GRID_SHADER = `
// Perspective grid shader for synthwave effect
// Converts filter UV to canvas-space coordinates using uOutputFrame

void main() {
  vec2 filterUV = vTextureCoord;
  vec4 originalColor = texture(uTexture, filterUV);

  // Convert filter UV to canvas-normalized coordinates (0-1 across full canvas)
  // uOutputFrame.xy = offset, uOutputFrame.zw = size of filter area
  // uResolution = canvas size
  vec2 canvasCoord = (filterUV * uOutputFrame.zw + uOutputFrame.xy) / uResolution;

  // Uniforms
  float horizonY = uHorizonY;
  float gridOffset = uGridOffset;
  vec3 gridColor = uGridColor;
  float numVertLines = uLineCount;

  // Use canvas coordinates for all calculations
  float uv_x = canvasCoord.x;
  float uv_y = canvasCoord.y;

  // Only render below horizon
  if (uv_y <= horizonY) {
    finalColor = originalColor;
    return;
  }

  // Ground progress (0 at horizon, 1 at bottom)
  float groundHeight = 1.0 - horizonY;
  float groundProgress = (uv_y - horizonY) / groundHeight;

  // === HORIZONTAL LINES ===
  float depth = sqrt(groundProgress);
  float scrolled = depth + gridOffset;

  float numHorz = 12.0;
  float horzDist = abs(fract(scrolled * numHorz) - 0.5);
  float horzThick = 0.08 + groundProgress * 0.17;
  float horzLine = 1.0 - smoothstep(0.0, horzThick, horzDist);

  // === VERTICAL LINES ===
  // Vanishing point at center (0.5, horizonY) in canvas space
  float vanishX = 0.5;
  float bottomX = vanishX + (uv_x - vanishX) / max(groundProgress, 0.001);

  // Line pattern based on where we hit the bottom
  float vertDist = abs(fract(bottomX * numVertLines) - 0.5);
  float vertThick = 0.06 + groundProgress * 0.14;
  float vertLine = 1.0 - smoothstep(0.0, vertThick, vertDist);

  // Fade vertical lines when they go off-screen
  float offScreen = smoothstep(0.4, 0.6, abs(bottomX - 0.5));
  vertLine *= 1.0 - offScreen;

  // === COMBINE ===
  float grid = max(horzLine, vertLine);

  // Fade near horizon
  grid *= smoothstep(0.0, 0.01, groundProgress);

  // Brighter toward viewer
  grid *= 0.6 + groundProgress * 0.4;

  // Apply
  vec3 finalRgb = originalColor.rgb + gridColor * grid * 0.95;
  float finalAlpha = originalColor.a * (0.2 + grid * 0.8);

  finalColor = vec4(finalRgb, finalAlpha);
}
`;

// Shooting star
interface ShootingStar {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

// Mountain point
interface MountainPoint {
  x: number;
  y: number;
}

// Pre-allocated state (no allocations during update)
interface State {
  palette: SynthwavePalette;
  pattern: PatternType;
  sunStyle: SunStyle;
  gridStyle: GridStyle;
  // Speed variability
  baseSpeed: number;
  speedWaveAmplitude: number;
  speedWaveFrequency: number;
  speedWavePhase: number;
  gridOffset: number;
  horizonY: number; // 0-1, where horizon sits
  sunSize: number;
  verticalLineCount: number;
  horizontalLineCount: number;
  showStars: boolean;
  starCount: number;
  // Pre-allocated star positions
  starX: Float32Array;
  starY: Float32Array;
  starBrightness: Float32Array;
  // Pre-allocated grid line Y positions
  gridLineY: Float32Array;
  // Animation
  pulsePhase: number;
  pulseSpeed: number;
  // Pre-rendered textures
  glowTexture: string;
  starTexture: string;
  sunHalfDiscTexture: string;
  // Variability options
  showMountains: boolean;
  mountainPoints: MountainPoint[];
  showReflection: boolean;
  showShootingStars: boolean;
  shootingStars: ShootingStar[];
  crtMode: boolean;
  vignetteIntensity: number;
  noiseIntensity: number;
  noiseSeed: number;
  // Alpha variability for transparency
  skyAlpha: number;
  groundAlphaMultiplier: number;
  // Runtime random for shooting stars
  frameRand: () => number;
}

// Seeded random for consistency within a cycle
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function rgbToNumeric(c: RGB): number {
  return (c.r << 16) | (c.g << 8) | c.b;
}

function rgbToStringAlpha(c: RGB, alpha: number): string {
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

// HSL to RGB conversion for procedural palettes
function hslToRgb(h: number, s: number, l: number): RGB {
  h = h / 360;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
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
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

// Generate procedural palette from base hue
function generatePalette(hue: number): SynthwavePalette {
  return {
    name: `Procedural-${hue}`,
    skyTop: hslToRgb(hue, 0.4, 0.03),
    skyBottom: hslToRgb(hue, 0.6, 0.2),
    sun: hslToRgb((hue + 30) % 360, 0.9, 0.7),
    sunGlow: hslToRgb((hue + 30) % 360, 1.0, 0.5),
    gridLines: hslToRgb((hue + 180) % 360, 1.0, 0.6),
    gridGlow: hslToRgb((hue + 200) % 360, 1.0, 0.5),
    horizon: hslToRgb((hue + 150) % 360, 1.0, 0.5),
  };
}

// Create pre-rendered glow texture
function createGlowTexture(size: number = 64): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const dataUrl = canvas.toDataURL();
  canvas.width = 0; // Clean up
  return dataUrl;
}

// Create half-disc texture for sun (top half only, clips at horizon)
function createSunHalfDiscTexture(size: number = 128): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2; // Only top half
  const ctx = canvas.getContext('2d')!;

  // Draw a semicircle (top half of circle centered at bottom edge)
  const centerX = size / 2;
  const centerY = size / 2; // Center is at bottom of canvas
  const radius = size / 2;

  // Create radial gradient centered at the bottom middle
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(1, 'rgba(255,255,255,0.7)');

  // Draw semicircle using arc
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, Math.PI, 0, false); // Top half arc
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  const dataUrl = canvas.toDataURL();
  canvas.width = 0;
  return dataUrl;
}

// Create star texture (smaller, sharper)
function createStarTexture(size: number = 32): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const dataUrl = canvas.toDataURL();
  canvas.width = 0;
  return dataUrl;
}

// Constants
const MAX_STARS = 100;
const MAX_HORIZONTAL_LINES = 30;
const MAX_SHOOTING_STARS = 5;
const MAX_MOUNTAIN_POINTS = 25;

let state: State;

const actor: Actor = {
  metadata,

  async setup(_api: ActorSetupAPI): Promise<void> {
    const seed = Date.now();
    const rand = seededRandom(seed);
    const frameRand = seededRandom(seed + 1000); // Separate random for runtime

    // Select palette: 50% chance of procedural, 50% chance of preset
    let palette: SynthwavePalette;
    if (rand() > 0.5) {
      palette = generatePalette(Math.floor(rand() * 360));
    } else {
      palette = PALETTES[Math.floor(rand() * PALETTES.length)];
    }

    // Select pattern
    const patterns: PatternType[] = ['standard', 'double-sun', 'no-sun', 'low-sun'];
    const pattern = patterns[Math.floor(rand() * patterns.length)];

    // Select sun style (if sun is visible)
    const sunStyles: SunStyle[] = ['striped', 'gradient', 'eclipse', 'ring'];
    const sunStyle = pattern === 'no-sun' ? 'striped' : sunStyles[Math.floor(rand() * sunStyles.length)];

    // Select grid style (50% curved, 50% standard)
    // Note: shader grid disabled due to filter coordinate mapping issues
    const gridRand = rand();
    const gridStyle: GridStyle = gridRand > 0.5 ? 'curved' : 'standard';

    // Randomize speed parameters with high variability
    // Speed can range from slow crawl to extremely fast (0.2 to 30.0)
    const baseSpeed = 0.2 + rand() * 29.8;         // 0.2 - 30.0 (very wide range, can be extremely fast)
    const speedWaveAmplitude = 0.1 + rand() * 0.4; // Speed varies by ±0.1-0.5
    const speedWaveFrequency = 0.2 + rand() * 0.6; // 0.2-0.8 oscillations per second
    const horizonY = 0.35 + rand() * 0.2; // 0.35 - 0.55 (how high the horizon is)
    const sunSize = 0.08 + rand() * 0.08; // 0.08 - 0.16 of canvas width
    const verticalLineCount = 10 + Math.floor(rand() * 15); // 10 - 25
    const horizontalLineCount = 12 + Math.floor(rand() * 10); // 12 - 22
    const showStars = rand() > 0.4;
    const starCount = showStars ? 30 + Math.floor(rand() * 50) : 0;
    const pulseSpeed = 1 + rand() * 2; // 1-3

    // Variability options
    const showMountains = rand() > 0.6; // 40% chance
    const showReflection = rand() > 0.7; // 30% chance
    const showShootingStars = rand() > 0.8; // 20% chance
    const crtMode = rand() > 0.7; // 30% chance
    const vignetteIntensity = 0.1 + rand() * 0.15;
    const noiseIntensity = 0.02 + rand() * 0.03;
    const noiseSeed = Math.floor(rand() * 10000);

    // Pre-allocate star positions
    const starX = new Float32Array(MAX_STARS);
    const starY = new Float32Array(MAX_STARS);
    const starBrightness = new Float32Array(MAX_STARS);
    for (let i = 0; i < starCount; i++) {
      starX[i] = rand();
      starY[i] = rand() * horizonY * 0.8; // Only in sky area
      starBrightness[i] = 0.3 + rand() * 0.7;
    }

    // Pre-allocate grid line Y positions
    const gridLineY = new Float32Array(MAX_HORIZONTAL_LINES);

    // Pre-generate mountain profile
    const mountainPoints: MountainPoint[] = [];
    if (showMountains) {
      const mountainSeed = rand() * 100;
      let lastHeight = 0.1;
      for (let i = 0; i <= MAX_MOUNTAIN_POINTS; i++) {
        const x = i / MAX_MOUNTAIN_POINTS;
        // Multiple sine waves for varied peaks
        const peak1 = Math.sin(x * Math.PI * 3 + mountainSeed) * 0.5 + 0.5;
        const peak2 = Math.sin(x * Math.PI * 7 + mountainSeed * 2) * 0.3 + 0.5;
        const combined = peak1 * 0.6 + peak2 * 0.4;
        lastHeight = lastHeight * 0.6 + combined * 0.4; // Smooth
        mountainPoints.push({ x, y: lastHeight * 0.18 }); // 0-18% of horizon height
      }
    }

    // Pre-allocate shooting stars
    const shootingStars: ShootingStar[] = [];
    for (let i = 0; i < MAX_SHOOTING_STARS; i++) {
      shootingStars.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 });
    }

    // Create pre-rendered textures
    const glowTexture = createGlowTexture(64);
    const starTexture = createStarTexture(32);
    const sunHalfDiscTexture = createSunHalfDiscTexture(128);

    // Alpha variability for background transparency (0.1 to max)
    const skyAlpha = 0.1 + rand() * 0.55; // 0.1 to 0.65
    const groundAlphaMultiplier = 0.1 + rand() * 0.9; // 0.1 to 1.0

    state = {
      palette,
      pattern,
      sunStyle,
      gridStyle,
      baseSpeed,
      speedWaveAmplitude,
      speedWaveFrequency,
      speedWavePhase: 0,
      gridOffset: 0,
      horizonY,
      sunSize,
      verticalLineCount,
      horizontalLineCount,
      showStars,
      starCount,
      starX,
      starY,
      starBrightness,
      gridLineY,
      pulsePhase: 0,
      pulseSpeed,
      glowTexture,
      starTexture,
      sunHalfDiscTexture,
      showMountains,
      mountainPoints,
      showReflection,
      showShootingStars,
      shootingStars,
      crtMode,
      vignetteIntensity,
      noiseIntensity,
      noiseSeed,
      skyAlpha,
      groundAlphaMultiplier,
      frameRand,
    };

    console.log(
      `[SynthwaveHorizon] Setup: palette=${palette.name}, pattern=${pattern}, ` +
        `sunStyle=${sunStyle}, gridStyle=${gridStyle}, ` +
        `speed=${baseSpeed.toFixed(2)}±${speedWaveAmplitude.toFixed(2)}@${speedWaveFrequency.toFixed(2)}Hz, ` +
        `mountains=${showMountains}, reflection=${showReflection}, crt=${crtMode}, ` +
        `skyAlpha=${skyAlpha.toFixed(2)}, groundAlpha=${groundAlphaMultiplier.toFixed(2)}`
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { brush, canvas, filter, context } = api;
    const { width, height } = canvas.getSize();
    const { deltaTime } = frame;

    // Get display mode for light/dark adaptation
    const isDark = context.display.isDarkMode();
    // For neon/glowing elements (sun, grid, stars), use 'add' in dark mode, 'normal' in light mode
    // This keeps them bright in both modes - they're light sources!
    const glowBlend = isDark ? 'add' : 'normal';
    const lineBlend = isDark ? 'add' : 'normal';

    // Update speed wave phase
    state.speedWavePhase += state.speedWaveFrequency * deltaTime * 0.001;

    // Calculate current speed with smooth oscillation
    const speedMultiplier = 1 + Math.sin(state.speedWavePhase * Math.PI * 2) * state.speedWaveAmplitude;
    const currentSpeed = state.baseSpeed * speedMultiplier;

    // Update animation state with variable speed
    state.gridOffset += currentSpeed * deltaTime * 0.001;
    if (state.gridOffset > 1) state.gridOffset -= 1;
    state.pulsePhase += state.pulseSpeed * deltaTime * 0.001;

    const p = state.palette;
    const horizonPixelY = height * state.horizonY;

    // === SKY GRADIENT (single draw call with linear gradient) ===
    // Variable alpha in gradient stops to allow background to show through
    const skyA = state.skyAlpha;
    // In light mode, invert sky colors to be light/pastel versions
    const skyTopColor = isDark
      ? p.skyTop
      : { r: 255 - p.skyTop.r * 0.3, g: 255 - p.skyTop.g * 0.3, b: 255 - p.skyTop.b * 0.3 };
    const skyBottomColor = isDark
      ? p.skyBottom
      : { r: 255 - p.skyBottom.r * 0.4, g: 255 - p.skyBottom.g * 0.4, b: 255 - p.skyBottom.b * 0.4 };
    brush.rect(0, 0, width, horizonPixelY + 2, {
      fill: {
        type: 'linear',
        x0: 0.5,
        y0: 0,
        x1: 0.5,
        y1: 1,
        stops: [
          { offset: 0, color: rgbToStringAlpha(skyTopColor as RGB, skyA) },
          { offset: 0.6, color: rgbToStringAlpha(lerpRGB(skyTopColor as RGB, skyBottomColor as RGB, 0.6), skyA) },
          { offset: 1, color: rgbToStringAlpha(skyBottomColor as RGB, skyA) },
        ],
      },
    });

    // === STARS (using pre-rendered texture) ===
    if (state.showStars) {
      const twinkle = Math.sin(state.pulsePhase * 3);
      for (let i = 0; i < state.starCount; i++) {
        const x = state.starX[i] * width;
        const y = state.starY[i] * height;
        const baseBrightness = state.starBrightness[i];
        const brightness = baseBrightness * (0.7 + 0.3 * twinkle);
        const size = 8 + baseBrightness * 16; // Glow size

        // Stars are light sources - keep them bright in both modes!
        // Use white/bright tint with normal blend in light mode for visibility
        const starTint = 0xffffee; // Warm white in both modes
        brush.image(state.starTexture, x, y, {
          width: size,
          height: size,
          tint: starTint,
          alpha: brightness * (isDark ? 0.9 : 0.7),
          blendMode: glowBlend,
          anchorX: 0.5,
          anchorY: 0.5,
        });
      }
    }

    // === SHOOTING STARS ===
    if (state.showShootingStars) {
      // Occasionally spawn a shooting star
      if (state.frameRand() < 0.003) {
        const star = state.shootingStars.find((s) => !s.active);
        if (star) {
          star.active = true;
          star.x = state.frameRand() * width;
          star.y = state.frameRand() * horizonPixelY * 0.5;
          star.vx = 150 + state.frameRand() * 200;
          star.vy = 80 + state.frameRand() * 120;
          star.life = 1;
        }
      }

      // Update and render shooting stars
      for (const star of state.shootingStars) {
        if (!star.active) continue;

        star.x += star.vx * deltaTime * 0.001;
        star.y += star.vy * deltaTime * 0.001;
        star.life -= deltaTime * 0.0015;

        if (star.life <= 0 || star.x > width || star.y > horizonPixelY) {
          star.active = false;
          continue;
        }

        // Draw shooting star trail
        const trailLength = 30 + star.life * 20;
        const trailX = star.x - (star.vx / Math.sqrt(star.vx * star.vx + star.vy * star.vy)) * trailLength;
        const trailY = star.y - (star.vy / Math.sqrt(star.vx * star.vx + star.vy * star.vy)) * trailLength;

        // Shooting stars are bright meteors - keep them bright in both modes!
        const shootingStarColor = 0xffffff;
        brush.line(star.x, star.y, trailX, trailY, {
          color: shootingStarColor,
          alpha: star.life * (isDark ? 0.8 : 0.6),
          width: 2,
          blendMode: glowBlend,
        });

        // Bright head
        brush.image(state.starTexture, star.x, star.y, {
          width: 12,
          height: 12,
          tint: shootingStarColor,
          alpha: star.life * (isDark ? 1.0 : 0.8),
          blendMode: glowBlend,
          anchorX: 0.5,
          anchorY: 0.5,
        });
      }
    }

    // === SUN ===
    const sunRadius = width * state.sunSize;
    const sunX = width / 2;
    let sunY = horizonPixelY;

    if (state.pattern === 'low-sun') {
      sunY = horizonPixelY + sunRadius * 0.3;
    }

    if (state.pattern !== 'no-sun') {
      const glowPulse = 1 + 0.1 * Math.sin(state.pulsePhase * 2);
      // Sun is a light source - keep it bright in both modes!
      // The synthwave sun should always glow vibrantly
      const sunGlowColor = p.sunGlow;
      const sunColor = p.sun;
      const sunGlowNumeric = rgbToNumeric(sunGlowColor);
      const sunNumeric = rgbToNumeric(sunColor);

      // Sun glow using pre-rendered texture (single sprite)
      // Position glow slightly above horizon to avoid bleeding into grid
      const glowY = Math.min(sunY, horizonPixelY - sunRadius * 0.3);
      const glowSize = sunRadius * 3.5 * glowPulse;
      brush.image(state.glowTexture, sunX, glowY, {
        width: glowSize,
        height: glowSize * 0.8, // Slightly squished to stay above horizon
        tint: sunGlowNumeric,
        alpha: isDark ? 0.5 : 0.4,
        blendMode: glowBlend,
        anchorX: 0.5,
        anchorY: 0.5,
      });

      // Render sun using half-disc texture (clipped at horizon)
      // The texture is anchored at bottom, positioned at horizon line
      // Eclipse center and stripe colors adapt to mode
      const eclipseCenterColor = isDark ? 0x000000 : 0xffffff;
      const stripeColor = isDark ? 0x000000 : 0xffffff;

      if (state.sunStyle === 'gradient') {
        // Smooth gradient sun - use half-disc texture
        brush.image(state.sunHalfDiscTexture, sunX, horizonPixelY, {
          width: sunRadius * 2,
          height: sunRadius,
          tint: sunNumeric,
          alpha: isDark ? 0.95 : 0.85,
          blendMode: glowBlend,
          anchorX: 0.5,
          anchorY: 1.0, // Bottom edge at horizon
        });
      } else if (state.sunStyle === 'eclipse') {
        // Eclipse: bright ring with dark center - use half-disc for outer glow
        brush.image(state.sunHalfDiscTexture, sunX, horizonPixelY, {
          width: sunRadius * 2.3,
          height: sunRadius * 1.15,
          tint: sunGlowNumeric,
          alpha: isDark ? 0.9 : 0.8,
          blendMode: glowBlend,
          anchorX: 0.5,
          anchorY: 1.0,
        });
        // Dark center (also clipped as half-disc shape) - inverted in light mode
        brush.image(state.sunHalfDiscTexture, sunX, horizonPixelY, {
          width: sunRadius * 1.84,
          height: sunRadius * 0.92,
          tint: eclipseCenterColor,
          alpha: 1.0,
          anchorX: 0.5,
          anchorY: 1.0,
        });
        // Corona glow above horizon
        brush.image(state.glowTexture, sunX, horizonPixelY - sunRadius * 0.5, {
          width: sunRadius * 3.5,
          height: sunRadius * 2,
          tint: sunGlowNumeric,
          alpha: isDark ? 0.4 : 0.35,
          blendMode: glowBlend,
          anchorX: 0.5,
          anchorY: 0.5,
        });
      } else if (state.sunStyle === 'ring') {
        // Saturn-like ring sun - use half-disc
        brush.image(state.sunHalfDiscTexture, sunX, horizonPixelY, {
          width: sunRadius * 2,
          height: sunRadius,
          tint: sunNumeric,
          alpha: isDark ? 0.9 : 0.8,
          anchorX: 0.5,
          anchorY: 1.0,
        });
        // Horizontal ring (only draw top half by positioning above horizon)
        brush.ellipse(sunX, horizonPixelY - sunRadius * 0.1, sunRadius * 1.8, sunRadius * 0.2, {
          stroke: sunGlowNumeric,
          strokeWidth: 4,
          alpha: isDark ? 0.7 : 0.6,
          blendMode: glowBlend,
        });
      } else {
        // Striped sun (classic synthwave) - use half-disc texture
        // Draw base sun as half-disc
        brush.image(state.sunHalfDiscTexture, sunX, horizonPixelY, {
          width: sunRadius * 2,
          height: sunRadius,
          tint: sunNumeric,
          alpha: isDark ? 0.95 : 0.85,
          anchorX: 0.5,
          anchorY: 1.0,
        });

        // Draw stripes over it (odd stripes are contrasting color)
        const stripeCount = 10;
        const stripeHeight = sunRadius / stripeCount; // Only for top half
        for (let i = 0; i < stripeCount; i++) {
          if (i % 2 === 1) {
            const stripeTop = horizonPixelY - sunRadius + i * stripeHeight;
            const stripeBottom = stripeTop + stripeHeight;

            // Calculate width at stripe center using circle equation
            const stripeCenterY = (stripeTop + stripeBottom) / 2;
            const dy = horizonPixelY - stripeCenterY; // Distance from horizon
            if (dy > 0 && dy < sunRadius) {
              const halfWidth = Math.sqrt(sunRadius * sunRadius - dy * dy);
              brush.rect(sunX - halfWidth, stripeTop, halfWidth * 2, stripeHeight, {
                fill: stripeColor,
                alpha: isDark ? 0.85 : 0.7,
              });
            }
          }
        }
      }

      // Second sun/moon for double-sun pattern - also use half-disc texture
      if (state.pattern === 'double-sun') {
        const sun2X = width * 0.25;
        const sun2Radius = sunRadius * 0.5;

        // Glow (positioned above horizon)
        brush.image(state.glowTexture, sun2X, horizonPixelY - sun2Radius * 0.5, {
          width: sun2Radius * 3,
          height: sun2Radius * 2,
          tint: sunGlowNumeric,
          alpha: isDark ? 0.4 : 0.35,
          blendMode: glowBlend,
          anchorX: 0.5,
          anchorY: 0.5,
        });

        // Second sun body - use half-disc texture clipped at horizon
        // Also a light source - keep it bright!
        const sun2Color = lerpRGB(p.sun, p.sunGlow, 0.3);
        brush.image(state.sunHalfDiscTexture, sun2X, horizonPixelY, {
          width: sun2Radius * 2,
          height: sun2Radius,
          tint: rgbToNumeric(sun2Color),
          alpha: isDark ? 0.9 : 0.8,
          anchorX: 0.5,
          anchorY: 1.0,
        });
      }
    }

    // === MOUNTAINS (silhouette) ===
    if (state.showMountains && state.mountainPoints.length > 0) {
      const points: Array<{ x: number; y: number }> = [];

      // Start at bottom left
      points.push({ x: 0, y: horizonPixelY });

      // Add mountain profile
      for (const mp of state.mountainPoints) {
        points.push({
          x: mp.x * width,
          y: horizonPixelY - mp.y * horizonPixelY,
        });
      }

      // Close at bottom right
      points.push({ x: width, y: horizonPixelY });

      // Mountain silhouette color: dark on dark mode, light on light mode
      const mountainFill = isDark ? 0x000000 : 0xf0f0f0;
      brush.polygon(points, {
        fill: mountainFill,
        alpha: 1.0, // Fully opaque to properly occlude sun behind mountains
      });

      // Subtle highlight on peaks - neon glow, keep vibrant
      const horizonColor = p.horizon;
      for (let i = 1; i < state.mountainPoints.length - 1; i++) {
        const prev = state.mountainPoints[i - 1];
        const curr = state.mountainPoints[i];
        const next = state.mountainPoints[i + 1];
        if (curr.y > prev.y && curr.y > next.y) {
          // This is a peak
          const peakX = curr.x * width;
          const peakY = horizonPixelY - curr.y * horizonPixelY;
          brush.circle(peakX, peakY, 3, {
            fill: rgbToNumeric(horizonColor),
            alpha: isDark ? 0.3 : 0.5,
            blendMode: glowBlend,
          });
        }
      }
    }

    // === HORIZON LINE ===
    const horizonGlow = 0.5 + 0.3 * Math.sin(state.pulsePhase);
    // Horizon is a neon glow line - keep it vibrant in both modes!
    const horizonNumeric = rgbToNumeric(p.horizon);

    // Wide glow line first
    brush.line(-10, horizonPixelY, width + 10, horizonPixelY, {
      color: horizonNumeric,
      alpha: horizonGlow * (isDark ? 0.3 : 0.25),
      width: 10,
      blendMode: lineBlend,
    });

    // Main horizon line
    brush.line(-10, horizonPixelY, width + 10, horizonPixelY, {
      color: horizonNumeric,
      alpha: horizonGlow * (isDark ? 0.9 : 0.8),
      width: 3,
      blendMode: lineBlend,
    });

    // === GROUND (below horizon) ===
    // Gradient ground that fades to transparent at bottom, allowing background to show through
    // For shader mode, use much lower alpha since shader will add its own transparency
    const gam = state.groundAlphaMultiplier;
    const groundAlphaScale = state.gridStyle === 'shader' ? 0.3 : 1.0; // Shader mode: more transparent base
    // Ground color: dark in dark mode, light in light mode
    const groundColor = isDark ? '5, 5, 16' : '250, 250, 245';
    brush.rect(-10, horizonPixelY, width + 20, height - horizonPixelY + 10, {
      fill: {
        type: 'linear',
        x0: 0.5,
        y0: 0,
        x1: 0.5,
        y1: 1,
        stops: [
          { offset: 0, color: `rgba(${groundColor}, ${0.9 * gam * groundAlphaScale})` },     // Near horizon
          { offset: 0.5, color: `rgba(${groundColor}, ${0.6 * gam * groundAlphaScale})` },   // Middle
          { offset: 1, color: `rgba(${groundColor}, ${Math.max(0.05, 0.25 * gam * groundAlphaScale)})` },  // Bottom
        ],
      },
    });

    // === SUN REFLECTION ===
    if (state.showReflection && state.pattern !== 'no-sun') {
      const reflectionY = horizonPixelY + sunRadius * 0.5;
      // Sun reflection should also glow - it's reflecting a light source
      const reflectionColor = p.sunGlow;
      brush.image(state.glowTexture, sunX, reflectionY, {
        width: sunRadius * 1.8,
        height: sunRadius * 0.8, // Squished vertically
        tint: rgbToNumeric(reflectionColor),
        alpha: isDark ? 0.12 : 0.1, // Reduced intensity
        blendMode: glowBlend,
        anchorX: 0.5,
        anchorY: 0.5,
      });
    }

    // === PERSPECTIVE GRID ===
    const groundHeight = height - horizonPixelY;
    const vanishX = width / 2;
    const vanishY = horizonPixelY;
    // Grid lines are neon - keep them vibrant in both modes!
    // The synthwave grid is a defining visual element
    const gridLinesNumeric = rgbToNumeric(p.gridLines);

    if (state.gridStyle === 'shader') {
      // Use custom shader for grid rendering
      // Convert grid color to normalized RGB
      const gridR = ((gridLinesNumeric >> 16) & 0xff) / 255;
      const gridG = ((gridLinesNumeric >> 8) & 0xff) / 255;
      const gridB = (gridLinesNumeric & 0xff) / 255;

      filter.customShader(PERSPECTIVE_GRID_SHADER, {
        uHorizonY: state.horizonY,
        uGridOffset: state.gridOffset,
        uGridColor: [gridR, gridG, gridB],
        uLineCount: state.verticalLineCount,
      });
    } else {
      // Vertical lines
      const vertCount = state.verticalLineCount;

      // Alpha multiplier for visibility (slightly lower in light mode for similar visual weight)
      const gridAlphaMultiplier = isDark ? 1.0 : 0.9;

      if (state.gridStyle === 'curved') {
        // Curved grid (vaporwave style) - lines bow outward from center
        for (let i = 0; i <= vertCount; i++) {
          const t = i / vertCount;
          const bottomX = t * width;
          const distFromCenter = Math.abs(t - 0.5) * 2;
          const lineAlpha = 0.3 + 0.35 * (1 - distFromCenter);

          // Curve direction: negative for left side, positive for right side
          // Lines should bow OUTWARD from center symmetrically
          const offsetFromCenter = (t - 0.5) * 2; // -1 at left, 0 at center, 1 at right
          const curveStrength = Math.abs(offsetFromCenter) * 60; // Max curve at edges
          const curveAmount = offsetFromCenter > 0 ? curveStrength : -curveStrength;

          // Draw curved line using quadratic bezier
          brush.quadratic(
            { x: vanishX, y: vanishY },
            { x: (vanishX + bottomX) / 2 + curveAmount, y: (vanishY + height) / 2 },
            { x: bottomX, y: height },
            {
              color: gridLinesNumeric,
              alpha: lineAlpha * 0.7 * gridAlphaMultiplier,
              width: 1.5,
              blendMode: lineBlend,
            }
          );
        }
      } else {
        // Standard straight lines
        for (let i = 0; i <= vertCount; i++) {
          const t = i / vertCount;
          const bottomX = t * width;
          const distFromCenter = Math.abs(t - 0.5) * 2;
          const lineAlpha = 0.3 + 0.35 * (1 - distFromCenter);

          brush.line(vanishX, vanishY, bottomX, height, {
            color: gridLinesNumeric,
            alpha: lineAlpha * 0.7 * gridAlphaMultiplier,
            width: 1.5,
            blendMode: lineBlend,
          });
        }
      }

      // Horizontal lines (perspective spacing)
      const horzCount = state.horizontalLineCount;
      for (let i = 0; i < horzCount; i++) {
        const t = (i + state.gridOffset) / horzCount;
        const perspectiveT = t * t;
        const y = horizonPixelY + perspectiveT * groundHeight;

        if (y < horizonPixelY) continue;

        const fadeT = (y - horizonPixelY) / groundHeight;
        const horzAlpha = 0.25 + fadeT * 0.4;
        const lineWidth = 1 + fadeT * 2;

        brush.line(-10, y, width + 10, y, {
          color: gridLinesNumeric,
          alpha: horzAlpha * 0.6 * gridAlphaMultiplier,
          width: lineWidth,
          blendMode: lineBlend,
        });

        state.gridLineY[i] = y;
      }
    }

    // === ATMOSPHERIC FILTERS ===
    // Vignette for depth
    const vignetteAmount = state.vignetteIntensity + 0.05 * Math.sin(state.pulsePhase * 0.5);
    filter.vignette(vignetteAmount, 0.6);

    // Subtle noise for texture
    const noiseAmount = state.noiseIntensity + 0.01 * Math.sin(state.pulsePhase * 2);
    filter.noise(noiseAmount, state.noiseSeed);

    // CRT chromatic aberration effect
    if (state.crtMode) {
      const aberrationAmount = 1.5 + 0.5 * Math.sin(state.pulsePhase * 0.3);
      filter.chromaticAberration([aberrationAmount, 0], [-aberrationAmount, 0]);
    }
  },

  async teardown(): Promise<void> {
    // State will be garbage collected
  },
};

// Register the actor
registerActor(actor);

export default actor;
