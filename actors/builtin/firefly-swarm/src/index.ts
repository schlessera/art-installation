/**
 * Firefly Swarm Actor
 *
 * Bioluminescent fireflies with boids flocking behavior.
 * Features synchronized flashing patterns, soft glowing trails,
 * and time-aware activity (more active at "night").
 *
 * Supports light/dark display modes:
 * - Dark mode: Bright glowing fireflies with 'add' blend mode
 * - Light mode: Darker fireflies with 'multiply' blend mode for visibility
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  BlendMode,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'firefly-swarm',
  name: 'Firefly Swarm',
  description: 'Bioluminescent fireflies with flocking behavior and synchronized flashing',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['fireflies', 'boids', 'glow', 'nature', 'ambient'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 90,
  requiredContexts: ['time', 'audio', 'display'],
};

// Configuration
const MAX_FIREFLIES = 50;
const TRAIL_LENGTH = 8;

// Boids parameters
const SEPARATION_RADIUS = 25;
const ALIGNMENT_RADIUS = 50;
const COHESION_RADIUS = 80;
const SEPARATION_FORCE = 1.5;
const ALIGNMENT_FORCE = 0.5;
const COHESION_FORCE = 0.3;
const MAX_SPEED = 60;
const MAX_FORCE = 80;

// Color palettes for dark mode (bright, saturated colors)
const GLOW_PALETTES_DARK = [
  { name: 'Classic', colors: [[180, 255, 80], [200, 255, 100], [160, 230, 60]] },      // Yellow-green
  { name: 'Blue', colors: [[100, 200, 255], [80, 180, 255], [120, 220, 255]] },        // Cool blue
  { name: 'Amber', colors: [[255, 180, 50], [255, 200, 80], [255, 160, 30]] },         // Warm amber
  { name: 'Pink', colors: [[255, 150, 200], [255, 130, 180], [255, 170, 210]] },       // Soft pink
];

// Color palettes for light mode (darker, more saturated for visibility on light backgrounds)
const GLOW_PALETTES_LIGHT = [
  { name: 'Classic', colors: [[80, 140, 20], [100, 150, 40], [60, 120, 10]] },         // Dark yellow-green
  { name: 'Blue', colors: [[20, 80, 160], [10, 70, 150], [30, 100, 170]] },            // Dark blue
  { name: 'Amber', colors: [[180, 100, 0], [200, 120, 20], [160, 80, 0]] },            // Dark amber/brown
  { name: 'Pink', colors: [[180, 60, 120], [160, 40, 100], [200, 80, 140]] },          // Dark magenta
];

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;          // Flash phase
  flashSpeed: number;     // Individual flash rate
  syncStrength: number;   // How much it syncs with neighbors
  size: number;
  colorIndex: number;
  trailHead: number;      // Circular buffer head
  trail: TrailPoint[];    // Pre-allocated trail buffer
}

interface SwarmState {
  fireflies: Firefly[];
  width: number;
  height: number;
  paletteDark: typeof GLOW_PALETTES_DARK[0];
  paletteLight: typeof GLOW_PALETTES_LIGHT[0];
  paletteIndex: number;   // Index to keep palettes in sync between modes
  globalFlashPhase: number;
  syncLevel: number;      // 0 = independent, 1 = fully synchronized
  time: number;
  nightFactor: number;    // 0 = day (less active), 1 = night (more active)
  glowTexture: string;    // Pre-rendered glow texture for performance
}

let state: SwarmState = {
  fireflies: [],
  width: 0,
  height: 0,
  paletteDark: GLOW_PALETTES_DARK[0],
  paletteLight: GLOW_PALETTES_LIGHT[0],
  paletteIndex: 0,
  globalFlashPhase: 0,
  syncLevel: 0.5,
  time: 0,
  nightFactor: 1,
  glowTexture: '',
};

/**
 * Create pre-rendered soft glow texture.
 * Called once in setup(), reused for all fireflies via tinting.
 * Reduces 3 circle calls per firefly to 1 image call.
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
  gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.15)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const dataUrl = canvas.toDataURL();

  // Clean up canvas
  canvas.width = 0;
  canvas.height = 0;

  return dataUrl;
}

function initFirefly(f: Firefly, width: number, height: number): void {
  f.x = Math.random() * width;
  f.y = Math.random() * height;

  const angle = Math.random() * Math.PI * 2;
  const speed = 20 + Math.random() * 30;
  f.vx = Math.cos(angle) * speed;
  f.vy = Math.sin(angle) * speed;

  f.phase = Math.random() * Math.PI * 2;
  f.flashSpeed = 1.5 + Math.random() * 1.5;
  f.syncStrength = 0.3 + Math.random() * 0.5;
  f.size = 2 + Math.random() * 2;
  f.colorIndex = Math.floor(Math.random() * 3);

  // Initialize trail circular buffer
  f.trailHead = 0;
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    f.trail[i].x = f.x;
    f.trail[i].y = f.y;
    f.trail[i].alpha = 0;
  }
}

function limitVector(vx: number, vy: number, max: number): [number, number] {
  const mag = Math.sqrt(vx * vx + vy * vy);
  if (mag > max && mag > 0) {
    return [(vx / mag) * max, (vy / mag) * max];
  }
  return [vx, vy];
}

/**
 * Convert RGB array to numeric color (0xRRGGBB format).
 */
function rgbArrayToNumeric(rgb: number[]): number {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;

    // Pre-render glow texture once
    state.glowTexture = createGlowTexture();

    // Random palette (same index for both light and dark modes)
    state.paletteIndex = Math.floor(Math.random() * GLOW_PALETTES_DARK.length);
    state.paletteDark = GLOW_PALETTES_DARK[state.paletteIndex];
    state.paletteLight = GLOW_PALETTES_LIGHT[state.paletteIndex];

    // Random sync level (how synchronized the flashing is)
    state.syncLevel = 0.3 + Math.random() * 0.5;

    // Pre-allocate fireflies
    const count = 25 + Math.floor(Math.random() * (MAX_FIREFLIES - 25));
    state.fireflies = [];

    for (let i = 0; i < count; i++) {
      const trail: TrailPoint[] = [];
      for (let t = 0; t < TRAIL_LENGTH; t++) {
        trail.push({ x: 0, y: 0, alpha: 0 });
      }

      const firefly: Firefly = {
        x: 0, y: 0, vx: 0, vy: 0,
        phase: 0, flashSpeed: 0, syncStrength: 0,
        size: 0, colorIndex: 0,
        trailHead: 0, trail,
      };

      initFirefly(firefly, width, height);
      state.fireflies.push(firefly);
    }

    state.globalFlashPhase = 0;
    state.time = 0;

    console.log(`[firefly-swarm] Setup: ${count} fireflies, palette: ${state.paletteDark.name}, sync: ${state.syncLevel.toFixed(2)}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    state.time += dt;

    const { width, height, fireflies } = state;

    // Get time context for night factor
    const dayProgress = api.context.time.dayProgress();
    // Night = evening to morning (roughly 0.75-0.25), day = rest
    // Simplified: use sin wave where night peaks at midnight (dayProgress = 0 or 1)
    state.nightFactor = 0.5 + 0.5 * Math.cos(dayProgress * Math.PI * 2);

    // Audio reactivity - flash on beat
    const isBeat = api.context.audio.isBeat();
    if (isBeat) {
      state.globalFlashPhase += 0.5;
    }

    // Update global flash phase
    state.globalFlashPhase += dt * 2;

    // Update each firefly
    for (let i = 0; i < fireflies.length; i++) {
      const f = fireflies[i];

      // Boids forces
      let sepX = 0, sepY = 0, sepCount = 0;
      let alignX = 0, alignY = 0, alignCount = 0;
      let cohX = 0, cohY = 0, cohCount = 0;

      for (let j = 0; j < fireflies.length; j++) {
        if (i === j) continue;
        const other = fireflies[j];
        const dx = other.x - f.x;
        const dy = other.y - f.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
          // Separation
          if (dist < SEPARATION_RADIUS) {
            sepX -= dx / dist;
            sepY -= dy / dist;
            sepCount++;
          }

          // Alignment
          if (dist < ALIGNMENT_RADIUS) {
            alignX += other.vx;
            alignY += other.vy;
            alignCount++;
          }

          // Cohesion
          if (dist < COHESION_RADIUS) {
            cohX += other.x;
            cohY += other.y;
            cohCount++;
          }
        }
      }

      // Calculate steering forces
      let steerX = 0, steerY = 0;

      if (sepCount > 0) {
        steerX += (sepX / sepCount) * SEPARATION_FORCE;
        steerY += (sepY / sepCount) * SEPARATION_FORCE;
      }

      if (alignCount > 0) {
        const avgVx = alignX / alignCount;
        const avgVy = alignY / alignCount;
        steerX += (avgVx - f.vx) * ALIGNMENT_FORCE;
        steerY += (avgVy - f.vy) * ALIGNMENT_FORCE;
      }

      if (cohCount > 0) {
        const avgX = cohX / cohCount;
        const avgY = cohY / cohCount;
        steerX += (avgX - f.x) * COHESION_FORCE * 0.01;
        steerY += (avgY - f.y) * COHESION_FORCE * 0.01;
      }

      // Edge avoidance
      const margin = 50;
      const edgeForce = 2;
      if (f.x < margin) steerX += edgeForce;
      if (f.x > width - margin) steerX -= edgeForce;
      if (f.y < margin) steerY += edgeForce;
      if (f.y > height - margin) steerY -= edgeForce;

      // Limit steering force
      [steerX, steerY] = limitVector(steerX, steerY, MAX_FORCE);

      // Apply forces
      f.vx += steerX * dt;
      f.vy += steerY * dt;

      // Limit speed
      [f.vx, f.vy] = limitVector(f.vx, f.vy, MAX_SPEED);

      // Update position
      f.x += f.vx * dt;
      f.y += f.vy * dt;

      // Soft wrap at edges
      if (f.x < -10) f.x = width + 10;
      if (f.x > width + 10) f.x = -10;
      if (f.y < -10) f.y = height + 10;
      if (f.y > height + 10) f.y = -10;

      // Update flash phase - blend individual and global
      const individualPhase = f.phase + dt * f.flashSpeed;
      const syncedPhase = state.globalFlashPhase * f.flashSpeed;
      f.phase = individualPhase + (syncedPhase - individualPhase) * state.syncLevel * f.syncStrength * dt;

      // Update trail circular buffer
      f.trailHead = (f.trailHead + 1) % TRAIL_LENGTH;
      f.trail[f.trailHead].x = f.x;
      f.trail[f.trailHead].y = f.y;
      f.trail[f.trailHead].alpha = 1;
    }

    // Get display mode for color and blend mode selection
    const isDarkMode = api.context.display.isDarkMode();
    const palette = isDarkMode ? state.paletteDark : state.paletteLight;
    // Use 'add' blend mode for dark backgrounds (brightens), 'multiply' for light (darkens)
    const glowBlendMode: BlendMode = isDarkMode ? 'add' : 'multiply';
    // For trails on light mode, use slightly higher alpha since multiply is less visible
    const trailAlphaMultiplier = isDarkMode ? 0.2 : 0.4;

    // Draw trails first (behind fireflies)
    for (const f of fireflies) {
      // Calculate flash brightness
      const flash = 0.3 + 0.7 * Math.max(0, Math.sin(f.phase));
      const brightness = flash * state.nightFactor;

      // Skip logic: in dark mode skip dim fireflies, in light mode skip bright ones
      // (inverted because we're darkening on light backgrounds)
      if (isDarkMode && brightness < 0.2) continue;
      if (!isDarkMode && brightness < 0.2) continue; // Still skip very dim - nothing to show

      const color = palette.colors[f.colorIndex];
      const numericColor = rgbArrayToNumeric(color);

      // Draw trail from oldest to newest
      for (let t = 0; t < TRAIL_LENGTH; t++) {
        const idx = (f.trailHead - TRAIL_LENGTH + 1 + t + TRAIL_LENGTH) % TRAIL_LENGTH;
        const point = f.trail[idx];
        const age = (TRAIL_LENGTH - t) / TRAIL_LENGTH;
        const trailAlpha = brightness * age * trailAlphaMultiplier;

        if (trailAlpha > 0.02) {
          const trailSize = f.size * age * 0.5;
          api.brush.circle(point.x, point.y, trailSize * 2, {
            fill: numericColor,
            alpha: trailAlpha,
            blendMode: glowBlendMode,
          });
        }
      }
    }

    // Draw fireflies using pre-rendered glow texture
    // Reduces 3 circle calls per firefly to 1 image + 1 circle (core)
    // Core color: white on dark (visible glow), dark on light (visible against bright background)
    const coreColor = api.context.display.accentColor();
    // Glow alpha: slightly higher on light mode to compensate for multiply blending
    const glowAlphaMultiplier = isDarkMode ? 0.7 : 0.85;
    const coreAlphaMultiplier = isDarkMode ? 0.9 : 0.95;

    for (const f of fireflies) {
      // Flash brightness with sync
      const flash = 0.3 + 0.7 * Math.max(0, Math.sin(f.phase));
      const brightness = flash * state.nightFactor;

      if (brightness < 0.1) continue;

      const color = palette.colors[f.colorIndex];
      const numericColor = rgbArrayToNumeric(color);

      // Soft glow using pre-rendered texture with tinting
      // Size covers the outer glow area (f.size * 4 radius = f.size * 8 diameter)
      const glowSize = f.size * 10;
      api.brush.image(state.glowTexture, f.x, f.y, {
        width: glowSize,
        height: glowSize,
        tint: numericColor,
        alpha: brightness * glowAlphaMultiplier,
        blendMode: glowBlendMode,
      });

      // Core for visibility - white on dark mode, black on light mode
      api.brush.circle(f.x, f.y, f.size * 0.8, {
        fill: coreColor,
        alpha: brightness * coreAlphaMultiplier,
        blendMode: glowBlendMode,
      });
    }
  },

  async teardown(): Promise<void> {
    state.fireflies = [];
    state.glowTexture = '';
    state.time = 0;
    console.log('[firefly-swarm] Teardown complete');
  },
};

registerActor(actor);

export default actor;
