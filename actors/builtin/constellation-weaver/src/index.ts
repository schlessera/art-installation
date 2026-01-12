/**
 * Constellation Weaver Actor
 *
 * Creates a dynamic starfield where points drift slowly and connect
 * with glowing lines based on proximity. Features twinkling stars,
 * occasional shooting stars, and smooth line fade in/out.
 *
 * Performance optimized:
 * - Pre-rendered glow texture (1 sprite per star instead of 3 gradient circles)
 * - Numeric colors with separate alpha (no string allocation)
 * - Single line per connection (instead of 2)
 * - Squared distance early-out (avoids sqrt for distant pairs)
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
  id: 'constellation-weaver',
  name: 'Constellation Weaver',
  description: 'Drifting stars that connect with glowing lines based on proximity',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['stars', 'constellations', 'ambient', 'lines', 'space'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 120,
  requiredContexts: ['time'],
};

// Configuration constants
const MAX_STARS = 40;
const MAX_SHOOTING_STARS = 3;
const CONNECTION_DISTANCE = 120;
const CONNECTION_DISTANCE_SQ = CONNECTION_DISTANCE * CONNECTION_DISTANCE;
const CONNECTION_RESET_DISTANCE_SQ = CONNECTION_DISTANCE_SQ * 4; // 2x distance squared
const SHOOTING_STAR_CHANCE = 0.002;
const CONNECTION_FADE_SPEED = 3.0;

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  twinklePhase: number;
  twinkleSpeed: number;
  hue: number;
  color: number; // Pre-computed numeric color (0xRRGGBB)
}

interface ShootingStar {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  length: number;
  speed: number; // Pre-computed speed for trail direction
}

// Color themes
const COLOR_THEMES = [
  { name: 'Starlight', hueRange: [200, 260], saturation: 30 },
  { name: 'Warm Cosmos', hueRange: [20, 60], saturation: 40 },
  { name: 'Nebula', hueRange: [280, 340], saturation: 50 },
  { name: 'Aurora', hueRange: [120, 200], saturation: 60 },
];

interface ConstellationState {
  stars: Star[];
  shootingStars: ShootingStar[];
  width: number;
  height: number;
  theme: typeof COLOR_THEMES[0];
  time: number;
  connectionAlphaMultiplier: number;
  connectionVisibility: number[][];
  glowDataUrl: string; // Pre-rendered glow texture
  // Session variability (randomized once per setup)
  glowSizeMultiplier: number;      // 0.8-1.2
  twinkleSpeedMultiplier: number;  // 0.7-1.3
  saturationOffset: number;        // -10 to +10
}

let state: ConstellationState = {
  stars: [],
  shootingStars: [],
  width: 0,
  height: 0,
  theme: COLOR_THEMES[0],
  time: 0,
  connectionAlphaMultiplier: 1,
  connectionVisibility: [],
  glowDataUrl: '',
  glowSizeMultiplier: 1,
  twinkleSpeedMultiplier: 1,
  saturationOffset: 0,
};

/**
 * Convert HSL to numeric RGB color (0xRRGGBB).
 * Used once per star in setup, not per frame.
 */
function hslToNumeric(h: number, s: number, l: number): number {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const rInt = Math.round((r + m) * 255);
  const gInt = Math.round((g + m) * 255);
  const bInt = Math.round((b + m) * 255);
  return (rInt << 16) | (gInt << 8) | bInt;
}

/**
 * Create pre-rendered soft glow texture.
 * Called once in setup(), reused for all stars via tinting.
 */
function createGlowTexture(): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const dataUrl = canvas.toDataURL();

  // Clean up canvas
  canvas.width = 0;
  canvas.height = 0;

  return dataUrl;
}

function initStar(star: Star, width: number, height: number, theme: typeof COLOR_THEMES[0], sessionState: ConstellationState): void {
  star.x = Math.random() * width;
  star.y = Math.random() * height;

  const angle = Math.random() * Math.PI * 2;
  const speed = 2 + Math.random() * 5;
  star.vx = Math.cos(angle) * speed;
  star.vy = Math.sin(angle) * speed;

  star.radius = 1.5 + Math.random() * 2.5;
  star.baseAlpha = 0.5 + Math.random() * 0.5;
  star.twinklePhase = Math.random() * Math.PI * 2;
  star.twinkleSpeed = (1.5 + Math.random() * 2) * sessionState.twinkleSpeedMultiplier;

  const [minHue, maxHue] = theme.hueRange;
  star.hue = minHue + Math.random() * (maxHue - minHue);

  // Pre-compute numeric color with session saturation offset
  const saturation = Math.max(10, Math.min(80, theme.saturation + sessionState.saturationOffset));
  star.color = hslToNumeric(star.hue, saturation, 75);
}

function initShootingStar(ss: ShootingStar): void {
  ss.active = false;
  ss.x = 0;
  ss.y = 0;
  ss.vx = 0;
  ss.vy = 0;
  ss.life = 0;
  ss.maxLife = 0;
  ss.length = 0;
  ss.speed = 0;
}

function spawnShootingStar(ss: ShootingStar, width: number, height: number): void {
  ss.active = true;

  if (Math.random() > 0.5) {
    ss.x = Math.random() * width;
    ss.y = -10;
  } else {
    ss.x = width + 10;
    ss.y = Math.random() * height * 0.5;
  }

  const angle = Math.PI * 0.6 + Math.random() * 0.4;
  const speed = 300 + Math.random() * 200;
  ss.vx = Math.cos(angle) * speed;
  ss.vy = Math.sin(angle) * speed;
  ss.speed = speed; // Cache for trail calculation

  ss.maxLife = 0.8 + Math.random() * 0.6;
  ss.life = ss.maxLife;
  ss.length = 40 + Math.random() * 60;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;

    // Random theme
    state.theme = COLOR_THEMES[Math.floor(Math.random() * COLOR_THEMES.length)];

    // Random connection visibility
    state.connectionAlphaMultiplier = 0.5 + Math.random() * 0.7;

    // Session variability (subtle differences between reloads)
    state.glowSizeMultiplier = 0.8 + Math.random() * 0.4;      // 0.8-1.2
    state.twinkleSpeedMultiplier = 0.7 + Math.random() * 0.6;  // 0.7-1.3
    state.saturationOffset = -10 + Math.random() * 20;         // -10 to +10

    // Pre-render glow texture once
    state.glowDataUrl = createGlowTexture();

    // Pre-allocate stars
    state.stars = [];
    const starCount = 20 + Math.floor(Math.random() * (MAX_STARS - 20));
    for (let i = 0; i < starCount; i++) {
      const star: Star = {
        x: 0, y: 0, vx: 0, vy: 0,
        radius: 0, baseAlpha: 0,
        twinklePhase: 0, twinkleSpeed: 0,
        hue: 0, color: 0,
      };
      initStar(star, width, height, state.theme, state);
      state.stars.push(star);
    }

    // Pre-allocate shooting stars pool
    state.shootingStars = [];
    for (let i = 0; i < MAX_SHOOTING_STARS; i++) {
      const ss: ShootingStar = {
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 0, length: 0, speed: 0,
      };
      initShootingStar(ss);
      state.shootingStars.push(ss);
    }

    // Pre-allocate connection visibility matrix
    state.connectionVisibility = [];
    for (let i = 0; i < MAX_STARS; i++) {
      state.connectionVisibility[i] = new Array(MAX_STARS).fill(0);
    }

    state.time = 0;

    console.log(`[constellation-weaver] Setup: ${starCount} stars, theme: ${state.theme.name}, glow: ${state.glowSizeMultiplier.toFixed(2)}x, twinkle: ${state.twinkleSpeedMultiplier.toFixed(2)}x, sat: ${state.saturationOffset > 0 ? '+' : ''}${state.saturationOffset.toFixed(0)}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    state.time += dt;

    const { width, height } = state;
    const stars = state.stars;
    const fadeStep = CONNECTION_FADE_SPEED * dt;

    // Update star positions
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      star.x += star.vx * dt;
      star.y += star.vy * dt;
      star.twinklePhase += star.twinkleSpeed * dt;

      // Wrap around edges
      const pad = 20;
      if (star.x < -pad) star.x = width + pad;
      if (star.x > width + pad) star.x = -pad;
      if (star.y < -pad) star.y = height + pad;
      if (star.y > height + pad) star.y = -pad;
    }

    // Update connections with squared distance early-out
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const dx = stars[j].x - stars[i].x;
        const dy = stars[j].y - stars[i].y;
        const distSq = dx * dx + dy * dy;

        let currentAlpha = state.connectionVisibility[i][j];

        // Early-out: if way too far, reset without sqrt
        if (distSq > CONNECTION_RESET_DISTANCE_SQ) {
          if (currentAlpha > 0) {
            state.connectionVisibility[i][j] = 0;
          }
          continue;
        }

        // Only compute sqrt when needed
        if (distSq < CONNECTION_DISTANCE_SQ) {
          const dist = Math.sqrt(distSq);
          const proximity = 1 - dist / CONNECTION_DISTANCE;
          const targetAlpha = proximity * proximity * 0.8 * state.connectionAlphaMultiplier;

          if (currentAlpha < targetAlpha) {
            currentAlpha = Math.min(targetAlpha, currentAlpha + fadeStep);
          } else {
            currentAlpha = Math.max(targetAlpha, currentAlpha - fadeStep);
          }
        } else {
          // Between CONNECTION_DISTANCE and 2x: fade out
          currentAlpha = Math.max(0, currentAlpha - fadeStep);
        }

        state.connectionVisibility[i][j] = currentAlpha;

        // Draw single line per connection (instead of 2)
        if (currentAlpha > 0.01) {
          // Blend colors of connected stars
          const avgColor = blendColors(stars[i].color, stars[j].color);
          api.brush.line(
            stars[i].x, stars[i].y,
            stars[j].x, stars[j].y,
            { color: avgColor, alpha: currentAlpha, width: 1.5, blendMode: 'add', cap: 'round' }
          );
        }
      }
    }

    // Draw stars with pre-rendered glow sprite + core
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      const twinkle = 0.6 + 0.4 * Math.sin(star.twinklePhase);
      const alpha = star.baseAlpha * twinkle;

      // Soft glow sprite with tinting (size varies per session)
      const glowSize = star.radius * 8 * state.glowSizeMultiplier;
      api.brush.image(state.glowDataUrl, star.x, star.y, {
        width: glowSize,
        height: glowSize,
        tint: star.color,
        alpha: alpha,
        blendMode: 'add',
      });

      // Bright core for visibility
      api.brush.circle(star.x, star.y, star.radius * 0.6, {
        fill: 0xffffff,
        alpha: alpha,
        blendMode: 'add',
      });
    }

    // Shooting stars
    if (Math.random() < SHOOTING_STAR_CHANCE) {
      const ss = state.shootingStars.find(s => !s.active);
      if (ss) {
        spawnShootingStar(ss, width, height);
      }
    }

    for (const ss of state.shootingStars) {
      if (!ss.active) continue;

      ss.x += ss.vx * dt;
      ss.y += ss.vy * dt;
      ss.life -= dt;

      if (ss.life <= 0 || ss.x < -100 || ss.y > height + 100) {
        ss.active = false;
        continue;
      }

      const lifeRatio = ss.life / ss.maxLife;
      const alpha = lifeRatio * 0.9;

      // Simplified trail: single tapered line
      const dirX = ss.vx / ss.speed;
      const dirY = ss.vy / ss.speed;
      const tailX = ss.x - dirX * ss.length;
      const tailY = ss.y - dirY * ss.length;

      // Draw trail with gradient via 3 segments (reduced from 10 lines)
      api.brush.line(ss.x, ss.y, tailX, tailY, {
        color: 0xffffff,
        alpha: alpha * 0.6,
        width: 3,
        blendMode: 'add',
        cap: 'round',
      });

      // Bright head using pre-rendered glow
      api.brush.image(state.glowDataUrl, ss.x, ss.y, {
        width: 20,
        height: 20,
        alpha: alpha,
        blendMode: 'add',
      });
    }
  },

  async teardown(): Promise<void> {
    state.stars = [];
    state.shootingStars = [];
    state.connectionVisibility = [];
    state.glowDataUrl = '';
    state.time = 0;
    console.log('[constellation-weaver] Teardown complete');
  },
};

/**
 * Blend two numeric colors by averaging RGB components.
 */
function blendColors(c1: number, c2: number): number {
  const r = ((c1 >> 16) + (c2 >> 16)) >> 1;
  const g = (((c1 >> 8) & 0xff) + ((c2 >> 8) & 0xff)) >> 1;
  const b = ((c1 & 0xff) + (c2 & 0xff)) >> 1;
  return (r << 16) | (g << 8) | b;
}

registerActor(actor);

export default actor;
