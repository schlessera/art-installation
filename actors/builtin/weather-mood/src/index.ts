/**
 * Weather Mood Actor
 *
 * Creates atmospheric visuals driven by weather context.
 * Rain drops, sun rays, snow flakes, fog effects based on current weather.
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  WeatherCondition,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

// ============================================================
// Noise utilities for rich texture generation
// ============================================================

/**
 * Simple hash-based 2D noise.
 */
function noise2D(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Smoothed noise with bilinear interpolation.
 */
function smoothNoise(x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const v00 = noise2D(x0, y0), v10 = noise2D(x0 + 1, y0);
  const v01 = noise2D(x0, y0 + 1), v11 = noise2D(x0 + 1, y0 + 1);
  const ix0 = v00 + (v10 - v00) * fx;
  const ix1 = v01 + (v11 - v01) * fx;
  return ix0 + (ix1 - ix0) * fy;
}

/**
 * Multi-octave fractal noise for rich, detailed textures.
 */
function fractalNoise(x: number, y: number, octaves: number = 4): number {
  let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxValue;
}

// Actor metadata for gallery attribution
const metadata: ActorMetadata = {
  id: 'weather-mood',
  name: 'Weather Mood',
  description: 'Atmospheric visuals driven by weather - rain, sun, snow, fog',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['weather', 'ambient', 'particles', 'atmospheric'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['weather', 'time'],
};

// Particle types
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
  type: 'rain' | 'snow' | 'sun' | 'fog' | 'cloud';
  active: boolean;  // For object pooling
}

// State
interface WeatherState {
  particlePool: Particle[];  // Pre-allocated pool
  activeCount: number;       // Number of active particles
  currentWeather: WeatherCondition;
  temperature: number;
  width: number;
  height: number;
  sunAngle: number;
  cloudOffset: number;
  // Pre-rendered textures for enhanced visuals
  rainTexture: string;
  snowflakeTextures: string[];  // 3 variants
  sunGlowTexture: string;
  godRayTexture: string;
  bokehTexture: string;  // Ring-like bokeh for sun particles
  fogTexture: string;
  lightningGlowTexture: string;
  frostTexture: string;
  // Lightning afterimage state
  lightningHistory: { points: { x: number; y: number }[]; age: number }[];
}

const MAX_PARTICLES = 300;

// Pre-allocate particle pool once
function createParticlePool(): Particle[] {
  const pool: Particle[] = new Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    pool[i] = {
      x: 0, y: 0, vx: 0, vy: 0,
      size: 0, opacity: 0, life: 0, maxLife: 0,
      type: 'rain', active: false,
    };
  }
  return pool;
}

let state: WeatherState = {
  particlePool: [],
  activeCount: 0,
  currentWeather: 'clear',
  temperature: 20,
  width: 1920,
  height: 1080,
  sunAngle: 0,
  cloudOffset: 0,
  // Textures initialized in setup()
  rainTexture: '',
  snowflakeTextures: [],
  sunGlowTexture: '',
  godRayTexture: '',
  bokehTexture: '',
  fogTexture: '',
  lightningGlowTexture: '',
  frostTexture: '',
  lightningHistory: [],
};

/**
 * Initialize a particle from the pool (no allocation).
 * Returns the particle if one is available, null otherwise.
 */
function activateParticle(type: Particle['type']): Particle | null {
  // Find an inactive particle in the pool
  const p = state.particlePool.find(particle => !particle.active);
  if (!p) return null;

  const { width, height } = state;
  p.active = true;
  p.type = type;
  p.life = 0;

  switch (type) {
    case 'rain':
      p.x = Math.random() * width * 1.2 - width * 0.1;
      p.y = -20;
      p.vx = -2 - Math.random() * 2;
      p.vy = 15 + Math.random() * 10;
      p.size = 2 + Math.random() * 3;
      p.opacity = 0.4 + Math.random() * 0.4;
      p.maxLife = 200;
      break;

    case 'snow':
      p.x = Math.random() * width;
      p.y = -10;
      p.vx = Math.sin(Math.random() * Math.PI * 2) * 0.5;
      p.vy = 1 + Math.random() * 2;
      p.size = 3 + Math.random() * 5;
      p.opacity = 0.6 + Math.random() * 0.4;
      p.maxLife = 500;
      break;

    case 'sun':
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 200;
      p.x = width * 0.8 + Math.cos(angle) * dist;
      p.y = height * 0.2 + Math.sin(angle) * dist;
      p.vx = Math.cos(angle) * 0.5;
      p.vy = Math.sin(angle) * 0.5;
      p.size = 20 + Math.random() * 40;
      p.opacity = 0.1 + Math.random() * 0.2;
      p.maxLife = 100;
      break;

    case 'fog':
      p.x = -100 - Math.random() * 200;
      p.y = Math.random() * height;
      p.vx = 0.5 + Math.random() * 1;
      p.vy = Math.sin(Math.random() * Math.PI * 2) * 0.1;
      p.size = 100 + Math.random() * 200;
      p.opacity = 0.05 + Math.random() * 0.1;
      p.maxLife = 600;
      break;

    case 'cloud':
      p.x = -200;
      p.y = 50 + Math.random() * (height * 0.3);
      p.vx = 0.3 + Math.random() * 0.3;
      p.vy = 0;
      p.size = 80 + Math.random() * 120;
      p.opacity = 0.3 + Math.random() * 0.3;
      p.maxLife = 1000;
      break;
  }

  state.activeCount++;
  return p;
}

/**
 * Get particle spawn rate based on weather.
 */
function getSpawnRate(weather: WeatherCondition): { type: Particle['type']; rate: number }[] {
  switch (weather) {
    case 'rain':
      return [{ type: 'rain', rate: 10 }];
    case 'drizzle':
      return [{ type: 'rain', rate: 4 }];
    case 'thunderstorm':
      return [{ type: 'rain', rate: 15 }];
    case 'snow':
      return [{ type: 'snow', rate: 6 }];
    case 'fog':
    case 'mist':
      return [{ type: 'fog', rate: 1 }];
    case 'clear':
      return [
        { type: 'sun', rate: 0.5 },
        { type: 'cloud', rate: 0.1 },
      ];
    case 'clouds':
      return [{ type: 'cloud', rate: 0.3 }];
    default:
      return [{ type: 'cloud', rate: 0.1 }];
  }
}

// ============================================================
// Texture Creation Functions
// ============================================================

/**
 * Create rain streak texture (32×96) with tapered gradient.
 */
function createRainTexture(): string {
  const w = 32, h = 96;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Vertical gradient with taper
  const gradient = ctx.createLinearGradient(w / 2, 0, w / 2, h);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.15, 'rgba(200, 230, 255, 0.6)');
  gradient.addColorStop(0.4, 'rgba(180, 220, 255, 1)');
  gradient.addColorStop(0.7, 'rgba(200, 230, 255, 0.7)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  // Draw tapered streak shape
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.bezierCurveTo(w * 0.7, h * 0.3, w * 0.6, h * 0.7, w / 2, h);
  ctx.bezierCurveTo(w * 0.4, h * 0.7, w * 0.3, h * 0.3, w / 2, 0);
  ctx.fillStyle = gradient;
  ctx.fill();

  return canvas.toDataURL();
}

/**
 * Create 6-pointed crystal snowflake texture (64×64).
 */
function createSnowflakeTexture(variant: number): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2, cy = size / 2;
  ctx.strokeStyle = 'white';
  ctx.lineCap = 'round';

  // Draw 6-pointed star with fractal branches
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const armLength = size * 0.4;

    // Main arm
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const endX = cx + Math.cos(angle) * armLength;
    const endY = cy + Math.sin(angle) * armLength;
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Side branches (fractal-like) - more branches for higher variants
    const branchCount = 2 + variant;
    for (let b = 1; b <= branchCount; b++) {
      const t = b / (branchCount + 1);
      const bx = cx + Math.cos(angle) * armLength * t;
      const by = cy + Math.sin(angle) * armLength * t;
      const branchLen = armLength * 0.3 * (1 - t * 0.5);

      ctx.lineWidth = 1.5;
      for (const dir of [-1, 1]) {
        const branchAngle = angle + dir * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(branchAngle) * branchLen,
                   by + Math.sin(branchAngle) * branchLen);
        ctx.stroke();
      }
    }
  }

  // Center glow
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.12);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  return canvas.toDataURL();
}

/**
 * Create sun glow texture with lens flare (256×256).
 */
function createSunGlowTexture(): string {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2, cy = size / 2;

  // Outer warm haze
  const outer = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  outer.addColorStop(0, 'rgba(255, 240, 200, 0.95)');
  outer.addColorStop(0.15, 'rgba(255, 220, 150, 0.7)');
  outer.addColorStop(0.35, 'rgba(255, 180, 80, 0.35)');
  outer.addColorStop(0.6, 'rgba(255, 130, 30, 0.1)');
  outer.addColorStop(1, 'rgba(255, 80, 0, 0)');
  ctx.fillStyle = outer;
  ctx.fillRect(0, 0, size, size);

  // Bright core
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.12);
  core.addColorStop(0, 'rgba(255, 255, 255, 1)');
  core.addColorStop(0.4, 'rgba(255, 255, 220, 0.9)');
  core.addColorStop(1, 'rgba(255, 255, 200, 0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  // Lens flare spikes
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    const spike = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    spike.addColorStop(0, 'rgba(255, 255, 255, 0)');
    spike.addColorStop(0.42, 'rgba(255, 255, 220, 0.25)');
    spike.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
    spike.addColorStop(0.58, 'rgba(255, 255, 220, 0.25)');
    spike.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = spike;
    ctx.fillRect(-4, -size / 2, 8, size);
    ctx.restore();
  }

  return canvas.toDataURL();
}

/**
 * Create god ray texture (32×256) for sun rays.
 * Fades in from sun center, peaks early, then gradually fades out.
 */
function createGodRayTexture(): string {
  const w = 32, h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Vertical gradient: fade in from sun, peak early, fade out gradually
  const gradient = ctx.createLinearGradient(w / 2, 0, w / 2, h);
  gradient.addColorStop(0, 'rgba(255, 245, 200, 0)');      // Start transparent (at sun center)
  gradient.addColorStop(0.08, 'rgba(255, 240, 180, 0.5)'); // Fade in
  gradient.addColorStop(0.2, 'rgba(255, 235, 160, 0.4)');  // Peak brightness
  gradient.addColorStop(0.4, 'rgba(255, 220, 140, 0.25)'); // Start fading
  gradient.addColorStop(0.65, 'rgba(255, 200, 100, 0.1)'); // Continue fade
  gradient.addColorStop(0.85, 'rgba(255, 180, 80, 0.03)'); // Nearly gone
  gradient.addColorStop(1, 'rgba(255, 160, 60, 0)');       // Fully transparent

  // Horizontal gradient for soft edges on sides
  const hGradient = ctx.createLinearGradient(0, 0, w, 0);
  hGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  hGradient.addColorStop(0.25, 'rgba(255, 255, 255, 1)');
  hGradient.addColorStop(0.75, 'rgba(255, 255, 255, 1)');
  hGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Apply horizontal fade as mask
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = hGradient;
  ctx.fillRect(0, 0, w, h);

  return canvas.toDataURL();
}

/**
 * Create bokeh texture (64×64) with ring-like appearance.
 * Transparent center, brighter soft edge, fading outer edge.
 */
function createBokehTexture(): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  const cx = size / 2, cy = size / 2;
  const maxRadius = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normalizedDist = dist / maxRadius;

      // Bokeh ring profile: dim center, bright ring at ~70-85%, soft outer fade
      let intensity = 0;
      if (normalizedDist < 0.6) {
        // Transparent center with slight fill
        intensity = 0.15 + normalizedDist * 0.3;
      } else if (normalizedDist < 0.85) {
        // Bright ring
        const ringPos = (normalizedDist - 0.6) / 0.25;
        intensity = 0.45 + ringPos * 0.55; // Ramp up to full brightness
      } else if (normalizedDist < 1.0) {
        // Soft outer fade
        const fadePos = (normalizedDist - 0.85) / 0.15;
        intensity = 1.0 - fadePos * fadePos; // Quadratic falloff
      } else {
        intensity = 0;
      }

      const alpha = Math.min(255, intensity * 255);

      const idx = (y * size + x) * 4;
      data[idx] = 255;     // R - white, will be tinted
      data[idx + 1] = 255; // G
      data[idx + 2] = 255; // B
      data[idx + 3] = alpha;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

/**
 * Create fog/mist texture with ethereal noise (256×256).
 * Also used for clouds.
 */
function createFogTexture(): string {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Multi-octave noise for wispy fog (5 octaves)
      const noise = fractalNoise(x * 0.012, y * 0.012, 5);

      // Radial falloff for soft edges
      const dx = (x - size / 2) / (size / 2);
      const dy = (y - size / 2) / (size / 2);
      const radial = 1 - Math.sqrt(dx * dx + dy * dy);
      const falloff = Math.max(0, radial * radial * radial);

      const fogVal = noise * falloff;
      const alpha = Math.min(255, fogVal * 220);

      const idx = (y * size + x) * 4;
      data[idx] = 225;     // R - cool blue-gray
      data[idx + 1] = 230; // G
      data[idx + 2] = 240; // B
      data[idx + 3] = alpha;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

/**
 * Create lightning electric glow texture (48×48).
 */
function createLightningGlowTexture(): string {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2, cy = size / 2;

  // Electric corona (white center, blue-purple edges)
  const corona = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  corona.addColorStop(0, 'rgba(255, 255, 255, 1)');
  corona.addColorStop(0.15, 'rgba(220, 220, 255, 0.95)');
  corona.addColorStop(0.35, 'rgba(170, 170, 255, 0.6)');
  corona.addColorStop(0.6, 'rgba(120, 100, 220, 0.25)');
  corona.addColorStop(1, 'rgba(80, 60, 180, 0)');
  ctx.fillStyle = corona;
  ctx.fillRect(0, 0, size, size);

  return canvas.toDataURL();
}

/**
 * Create frost edge texture with crystalline noise (256×256).
 */
function createFrostTexture(): string {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // High-frequency noise for crystalline frost (6 octaves)
      const noise = fractalNoise(x * 0.04, y * 0.04, 6);

      // Edge vignette (frost concentrates on edges)
      const dx = Math.abs(x - size / 2) / (size / 2);
      const dy = Math.abs(y - size / 2) / (size / 2);
      const edge = Math.max(dx, dy);
      const edgeFade = Math.pow(edge, 1.8);

      const frostVal = noise * edgeFade;
      const alpha = Math.min(255, frostVal * 450);

      const idx = (y * size + x) * 4;
      data[idx] = 235;     // R - icy blue-white
      data[idx + 1] = 245; // G
      data[idx + 2] = 255; // B
      data[idx + 3] = alpha;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

/**
 * Draw a lightning bolt effect with electric corona at each vertex.
 * Returns points for afterimage storage.
 */
function drawLightning(
  api: ActorUpdateAPI,
  x: number,
  y: number,
  length: number,
  branches: number,
  isDark: boolean,
  isMain: boolean = true
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [{ x, y }];
  let currentX = x;
  let currentY = y;

  const segments = isMain ? 12 : 8;
  for (let i = 0; i < segments; i++) {
    currentX += (Math.random() - 0.5) * (isMain ? 50 : 30);
    currentY += length / segments;
    points.push({ x: currentX, y: currentY });

    // Create branches
    if (branches > 0 && Math.random() > 0.65) {
      drawLightning(api, currentX, currentY, length * 0.35, branches - 1, isDark, false);
    }
  }

  // Dark mode: blue-purple lightning; Light mode: deeper purple-blue
  const outerGlowColor = isDark ? 0x8080ff : 0x404080;
  const midGlowColor = isDark ? 0xb4b4ff : 0x6060a0;
  const coreColor = isDark ? 0xffffff : 0x303060;
  const coronaTint = isDark ? 0xc8c8ff : 0x505090;
  const outerAlpha = isDark ? 0.15 : 0.2;
  const midAlpha = isDark ? 0.35 : 0.4;
  const coreAlpha = isDark ? 0.95 : 0.8;
  const coronaAlpha = isDark ? 0.6 : 0.5;
  const coronaBlend = isDark ? 'add' : 'multiply';

  // Wide outer glow
  api.brush.stroke(points, {
    color: outerGlowColor,
    alpha: outerAlpha,
    width: 20,
  });

  // Medium electric glow
  api.brush.stroke(points, {
    color: midGlowColor,
    alpha: midAlpha,
    width: 10,
  });

  // Bright core
  api.brush.stroke(points, {
    color: coreColor,
    alpha: coreAlpha,
    width: isMain ? 3 : 2,
  });

  // Electric corona at key vertices using pre-rendered glow
  const coronaInterval = isMain ? 3 : 4;
  for (let i = 0; i < points.length; i += coronaInterval) {
    const pt = points[i];
    const coronaSize = 30 + Math.random() * 15;
    api.brush.image(state.lightningGlowTexture, pt.x, pt.y, {
      width: coronaSize,
      height: coronaSize,
      tint: coronaTint,
      alpha: coronaAlpha,
      blendMode: coronaBlend,
    });
  }

  return isMain ? points : [];
}

/**
 * The Weather Mood actor.
 */
const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;
    state.particlePool = createParticlePool();
    state.activeCount = 0;
    state.sunAngle = 0;
    state.cloudOffset = 0;

    // Pre-render all textures for enhanced visuals
    state.rainTexture = createRainTexture();
    state.snowflakeTextures = [
      createSnowflakeTexture(0),
      createSnowflakeTexture(1),
      createSnowflakeTexture(2),
    ];
    state.sunGlowTexture = createSunGlowTexture();
    state.godRayTexture = createGodRayTexture();
    state.bokehTexture = createBokehTexture();
    state.fogTexture = createFogTexture();
    state.lightningGlowTexture = createLightningGlowTexture();
    state.frostTexture = createFrostTexture();
    state.lightningHistory = [];

    // Get initial weather
    state.currentWeather = api.context.weather.condition() as WeatherCondition;
    state.temperature = api.context.weather.temperature();

    console.log(`[weather-mood] Setup complete with enhanced textures, weather: ${state.currentWeather}, temp: ${state.temperature}C`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;

    // Update weather periodically
    if (frame.frameCount % 60 === 0) {
      state.currentWeather = api.context.weather.condition() as WeatherCondition;
      state.temperature = api.context.weather.temperature();
    }

    const dt = frame.deltaTime / 16.67;

    // Light/dark mode awareness
    const isDark = api.context.display.isDarkMode();
    // Additive blending for dark mode, multiply for light mode
    const additiveBlend = isDark ? 'add' : 'multiply';
    const screenBlend = isDark ? 'screen' : 'multiply';

    // Spawn new particles from pool (no allocation)
    const spawnRates = getSpawnRate(state.currentWeather);
    for (const { type, rate } of spawnRates) {
      if (state.activeCount < MAX_PARTICLES && Math.random() < rate * dt) {
        activateParticle(type);
      }
    }

    // Update and draw particles from pool
    for (const p of state.particlePool) {
      if (!p.active) continue;

      p.life += dt;

      // Check if particle should be deactivated
      let shouldDeactivate = p.life > p.maxLife;

      // Update position
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Type-specific behavior
      switch (p.type) {
        case 'rain':
          if (p.y > height) shouldDeactivate = true;
          if (!shouldDeactivate) {
            // Use pre-rendered rain streak texture with rotation based on velocity
            const rainAngle = Math.atan2(p.vy, p.vx) - Math.PI / 2;
            // Dark mode: light blue rain; Light mode: darker blue rain
            const rainTint = isDark ? 0x96c8ff : 0x4080c0;
            const rainAlpha = isDark ? p.opacity * 0.85 : p.opacity * 0.6;
            api.brush.image(state.rainTexture, p.x, p.y, {
              width: p.size * 2.5,
              height: p.size * 10,
              rotation: rainAngle,
              tint: rainTint,
              alpha: rainAlpha,
              blendMode: additiveBlend,
            });
          }
          break;

        case 'snow':
          p.vx = Math.sin(p.life * 0.02 + p.x * 0.01) * 0.5;
          if (p.y > height) shouldDeactivate = true;
          if (!shouldDeactivate) {
            // Use crystal snowflake texture with slow rotation
            const snowVariant = Math.floor(Math.abs(p.x * 17)) % 3;
            const snowRotation = p.life * 0.015; // Gentle spin as it falls
            const snowSize = p.size * 2.5;

            // Occasional sparkle effect
            const sparkle = Math.sin(p.life * 0.1 + p.x) > 0.92 ? 1.3 : 1;

            // Dark mode: white snowflakes; Light mode: light gray with subtle blue
            const snowTint = isDark ? 0xffffff : 0x708090;
            const snowAlpha = isDark ? p.opacity * sparkle : p.opacity * sparkle * 0.7;

            api.brush.image(state.snowflakeTextures[snowVariant], p.x, p.y, {
              width: snowSize * sparkle,
              height: snowSize * sparkle,
              rotation: snowRotation,
              tint: snowTint,
              alpha: snowAlpha,
              blendMode: screenBlend,
            });
          }
          break;

        case 'sun':
          if (!shouldDeactivate) {
            // Use bokeh texture for soft ring-like particles
            // Smooth fade in/out using sine curve over lifetime
            const lifeProgress = p.life / p.maxLife;
            const fadeInOut = Math.sin(lifeProgress * Math.PI); // 0 -> 1 -> 0
            const sunAlpha = p.opacity * fadeInOut;
            const bokehSize = p.size * 2;

            // Sun bokeh should stay warm/bright in both modes
            const bokehTint = 0xffe090; // Warm golden
            const bokehAlpha = isDark ? sunAlpha * 0.25 : sunAlpha * 0.35;
            // Use normal blend in light mode for visibility
            const bokehBlend = isDark ? 'add' : 'normal';

            api.brush.image(state.bokehTexture, p.x, p.y, {
              width: bokehSize,
              height: bokehSize,
              tint: bokehTint,
              alpha: bokehAlpha,
              blendMode: bokehBlend,
            });
          }
          break;

        case 'fog':
          if (p.x > width + 200) shouldDeactivate = true;
          if (!shouldDeactivate) {
            // Use ethereal fog texture with depth-based layering
            const fogAlpha = p.opacity * Math.sin((p.life / p.maxLife) * Math.PI);
            const depthFactor = 0.6 + (p.y / height) * 0.4; // Deeper fog near bottom
            const fogWidth = p.size * 3 * depthFactor;
            const fogHeight = p.size * 2 * depthFactor;

            // Dark mode: light blue-gray fog; Light mode: darker gray fog
            const fogTint = isDark ? 0xe0e4ec : 0x606878;
            const fogTintSecondary = isDark ? 0xd0d4e0 : 0x505868;
            const fogAlphaAdjust = isDark ? fogAlpha * depthFactor : fogAlpha * depthFactor * 0.6;

            api.brush.image(state.fogTexture, p.x, p.y, {
              width: fogWidth,
              height: fogHeight,
              tint: fogTint,
              alpha: fogAlphaAdjust,
              blendMode: screenBlend,
            });

            // Add a second layer offset for more depth
            if (p.size > 150) {
              api.brush.image(state.fogTexture, p.x - p.size * 0.3, p.y + p.size * 0.2, {
                width: fogWidth * 0.7,
                height: fogHeight * 0.6,
                tint: fogTintSecondary,
                alpha: (isDark ? fogAlpha * 0.4 : fogAlpha * 0.3),
                blendMode: screenBlend,
              });
            }
          }
          break;

        case 'cloud':
          if (p.x > width + 300) shouldDeactivate = true;
          if (!shouldDeactivate) {
            // Use fog texture for softer, more natural clouds
            const cloudWidth = p.size * 2.5;
            const cloudHeight = p.size * 2;

            // Dark mode: light clouds with dark shadow; Light mode: darker clouds with darker shadow
            const cloudShadowTint = isDark ? 0x606878 : 0x404858;
            const cloudMainTint = isDark ? 0xf0f4ff : 0x708090;
            const cloudShadowAlpha = isDark ? p.opacity * 0.15 : p.opacity * 0.2;
            const cloudMainAlpha = isDark ? p.opacity * 0.9 : p.opacity * 0.6;

            // Draw subtle shadow first (offset below)
            api.brush.image(state.fogTexture, p.x + 6, p.y + p.size * 0.1, {
              width: cloudWidth * 0.95,
              height: cloudHeight * 0.9,
              tint: cloudShadowTint,
              alpha: cloudShadowAlpha,
            });

            // Main cloud with fog texture
            api.brush.image(state.fogTexture, p.x, p.y, {
              width: cloudWidth,
              height: cloudHeight,
              tint: cloudMainTint,
              alpha: cloudMainAlpha,
            });
          }
          break;
      }

      if (shouldDeactivate) {
        p.active = false;
        state.activeCount--;
      }
    }

    // Draw weather-specific background effects
    if (state.currentWeather === 'clear') {
      // Draw enhanced sun with pre-rendered glow texture
      state.sunAngle += 0.005 * dt;
      const sunX = width * 0.8;
      const sunY = height * 0.2;

      // Sun should always be bright and warm - it's a light source!
      // In light mode, use normal blend with a subtle shadow ring for visibility
      const rayTint = 0xffd880;       // Warm golden rays
      const sunGlowTint = 0xfff0d0;   // Warm cream glow
      const sunCoreTint = 0xffffff;   // Bright white core
      const rayAlphaBase = isDark ? 0.2 : 0.35;
      const sunGlowAlpha = isDark ? 0.85 : 0.9;
      const sunCoreAlpha = 0.95;
      // Use additive in dark mode for glow, normal in light mode
      const sunBlend = isDark ? 'add' : 'normal';

      // In light mode, add a subtle darker ring behind sun for contrast
      if (!isDark) {
        api.brush.circle(sunX, sunY, 110, {
          fill: 0xd0c8b0,
          alpha: 0.3,
        });
      }

      // God rays using pre-rendered texture (8 rays, animated)
      for (let i = 0; i < 8; i++) {
        const angle = state.sunAngle + (i / 8) * Math.PI * 2;
        const rayLength = 180 + Math.sin(state.sunAngle * 2.5 + i * 1.3) * 40;
        const rayAlpha = rayAlphaBase + Math.sin(state.sunAngle * 1.5 + i * 0.8) * 0.08;

        api.brush.image(state.godRayTexture, sunX, sunY, {
          width: 24 + Math.sin(state.sunAngle + i) * 4,
          height: rayLength,
          rotation: angle - Math.PI / 2, // Point outward from sun
          tint: rayTint,
          alpha: rayAlpha,
          blendMode: sunBlend,
        });
      }

      // Main sun glow texture (replaces 3 circles)
      api.brush.image(state.sunGlowTexture, sunX, sunY, {
        width: 200,
        height: 200,
        tint: sunGlowTint,
        alpha: sunGlowAlpha,
        blendMode: sunBlend,
      });

      // Bright core for extra intensity
      api.brush.circle(sunX, sunY, 20, {
        fill: sunCoreTint,
        alpha: sunCoreAlpha,
        blendMode: sunBlend,
      });

      // Subtle warm vignette for atmospheric haze
      api.filter.vignette(0.15, 0.6);
    }

    // Lightning for thunderstorms with afterimage effect
    if (state.currentWeather === 'thunderstorm') {
      // Draw fading afterimages from lightning history
      for (let h = state.lightningHistory.length - 1; h >= 0; h--) {
        const history = state.lightningHistory[h];
        history.age += dt;

        // Remove old afterimages (fade over ~20 frames)
        if (history.age > 20) {
          state.lightningHistory.splice(h, 1);
          continue;
        }

        // Draw fading ghost stroke
        const fadeAlpha = Math.max(0, 0.3 * (1 - history.age / 20));
        // Dark mode: blue ghost; Light mode: darker purple ghost
        const ghostColor = isDark ? 0x9090ff : 0x505080;
        const ghostAlpha = isDark ? fadeAlpha : fadeAlpha * 0.8;
        if (ghostAlpha > 0.02 && history.points.length > 1) {
          api.brush.stroke(history.points, {
            color: ghostColor,
            alpha: ghostAlpha,
            width: 4,
          });
        }
      }

      // Spawn new lightning
      if (Math.random() < 0.006) {
        const lightningX = Math.random() * width;
        const points = drawLightning(api, lightningX, 0, height * 0.65, 2, isDark);

        // Store for afterimage effect (limit to 3 stored)
        if (points.length > 0 && state.lightningHistory.length < 3) {
          state.lightningHistory.push({ points, age: 0 });
        }

        // Screen flash effect
        // Dark mode: white flash; Light mode: dark flash
        const flashColor = isDark ? 0xffffff : 0x202030;
        const flashAlpha = isDark ? 0.15 : 0.1;
        api.brush.rect(0, 0, width, height, {
          fill: flashColor,
          alpha: flashAlpha,
        });

        // Chromatic aberration for dramatic effect
        api.filter.chromaticAberration([-3, 0], [3, 0]);
      }
    }

    // Enhanced temperature-based atmospheric effects
    if (state.temperature < 5) {
      // Cold: frost overlay on edges
      const frostIntensity = Math.min(0.25, (5 - state.temperature) / 20);

      // Dark mode: icy blue-white frost; Light mode: darker blue-gray frost
      const frostTint = isDark ? 0xe8f4ff : 0x607090;
      const frostCornerTint = isDark ? 0xd0e8ff : 0x506080;
      const frostAlpha = isDark ? frostIntensity : frostIntensity * 0.7;

      // Draw frost texture as full-screen overlay
      api.brush.image(state.frostTexture, width / 2, height / 2, {
        width: width,
        height: height,
        tint: frostTint,
        alpha: frostAlpha,
        blendMode: screenBlend,
      });

      // Extra frost corners for very cold temperatures
      if (state.temperature < -5) {
        const cornerFrost = Math.min(0.15, (-5 - state.temperature) / 30);
        const cornerFrostAlpha = isDark ? cornerFrost : cornerFrost * 0.6;

        // Top-left corner
        api.brush.image(state.frostTexture, 0, 0, {
          width: width * 0.5,
          height: height * 0.5,
          tint: frostCornerTint,
          alpha: cornerFrostAlpha,
          blendMode: additiveBlend,
        });

        // Bottom-right corner
        api.brush.image(state.frostTexture, width, height, {
          width: width * 0.5,
          height: height * 0.5,
          tint: frostCornerTint,
          alpha: cornerFrostAlpha,
          blendMode: additiveBlend,
        });
      }

      // Cool vignette for cold atmosphere
      api.filter.vignette(0.2, 0.5);
    } else if (state.temperature > 30) {
      // Hot: warm haze effect
      const heatIntensity = Math.min(0.2, (state.temperature - 30) / 20);

      // Dark mode: warm orange; Light mode: deeper amber
      const heatTint = isDark ? 0xffa040 : 0x905010;
      const heatAlpha = isDark ? heatIntensity * 0.08 : heatIntensity * 0.06;

      // Warm haze tint
      api.brush.rect(0, 0, width, height, {
        fill: heatTint,
        alpha: heatAlpha,
        blendMode: additiveBlend,
      });

      // Heat shimmer vignette
      api.filter.vignette(0.25, 0.7);
    }

    // Subtle temperature indicator bar (integrated with atmosphere)
    const tempColorNumeric =
      state.temperature < 0
        ? 0x88c0ff  // Icy blue
        : state.temperature < 10
          ? 0x63B3ED // Cool blue
          : state.temperature < 25
            ? 0x48BB78 // Pleasant green
            : state.temperature < 35
              ? 0xF6AD55 // Warm orange
              : 0xff6040; // Hot red

    // Draw gradient temperature bar at bottom
    api.brush.rect(0, height - 25, width, 25, {
      fill: tempColorNumeric,
      alpha: 0.06,
    });
    api.brush.rect(0, height - 8, width, 8, {
      fill: tempColorNumeric,
      alpha: 0.12,
    });
  },

  async teardown(): Promise<void> {
    // Deactivate all particles but keep pool for reuse
    for (const p of state.particlePool) {
      p.active = false;
    }
    state.activeCount = 0;
    state.currentWeather = 'clear';
    state.temperature = 20;
    state.sunAngle = 0;
    state.cloudOffset = 0;
    console.log('[weather-mood] Teardown complete');
  },
};

// Self-register with the runtime
registerActor(actor);

export default actor;
