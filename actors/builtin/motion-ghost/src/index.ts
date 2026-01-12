/**
 * Motion Ghost Actor
 *
 * Creates ethereal ghost trails that follow detected motion.
 * Uses video context for motion detection, with chromatic
 * aberration and glow effects for otherworldly appearance.
 *
 * Falls back to simulated motion when video is unavailable.
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
  id: 'motion-ghost',
  name: 'Motion Ghost',
  description: 'Ethereal trails following detected motion',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['motion', 'ghost', 'ethereal', 'video', 'interactive'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['video'],
};

interface RGB {
  r: number;
  g: number;
  b: number;
}

// Color palettes for ghosts
const GHOST_PALETTES: { name: string; colors: RGB[] }[] = [
  {
    name: 'Ethereal',
    colors: [
      { r: 200, g: 220, b: 255 },
      { r: 180, g: 200, b: 240 },
      { r: 150, g: 180, b: 230 },
    ],
  },
  {
    name: 'Spectral',
    colors: [
      { r: 180, g: 255, b: 200 },
      { r: 150, g: 230, b: 180 },
      { r: 120, g: 200, b: 160 },
    ],
  },
  {
    name: 'Phantom',
    colors: [
      { r: 255, g: 200, b: 220 },
      { r: 230, g: 180, b: 200 },
      { r: 200, g: 150, b: 180 },
    ],
  },
  {
    name: 'Wraith',
    colors: [
      { r: 220, g: 200, b: 255 },
      { r: 200, g: 180, b: 240 },
      { r: 180, g: 160, b: 220 },
    ],
  },
];

// Ghost trail point for circular buffer
interface TrailPoint {
  x: number;
  y: number;
  size: number;
  alpha: number;
  age: number;
}

// Motion region tracking
interface MotionRegion {
  active: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  intensity: number;
  dx: number;
  dy: number;
  color: RGB;
}

interface GhostState {
  // Circular buffer for trail points
  trailBuffer: TrailPoint[];
  trailHead: number;
  trailLength: number;
  // Motion regions
  regions: MotionRegion[];
  // Settings
  palette: { name: string; colors: RGB[] };
  canvasWidth: number;
  canvasHeight: number;
  chromaticIntensity: number;
  glowIntensity: number;
  trailOpacity: number;
  blurKernel: number;
  // Simulated motion (when video unavailable)
  simulatedX: number;
  simulatedY: number;
  simulatedVx: number;
  simulatedVy: number;
  // Time
  time: number;
}

const MAX_TRAIL_POINTS = 100;
const MAX_REGIONS = 5;

let state: GhostState = {
  trailBuffer: [],
  trailHead: 0,
  trailLength: 0,
  regions: [],
  palette: GHOST_PALETTES[0],
  canvasWidth: 0,
  canvasHeight: 0,
  chromaticIntensity: 5,
  glowIntensity: 0.5,
  trailOpacity: 0.5,
  blurKernel: 10,
  simulatedX: 0,
  simulatedY: 0,
  simulatedVx: 0,
  simulatedVy: 0,
  time: 0,
};

function rgbToNumeric(color: RGB): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

function createTrailPoint(): TrailPoint {
  return {
    x: 0,
    y: 0,
    size: 10,
    alpha: 1,
    age: 0,
  };
}

function createMotionRegion(): MotionRegion {
  return {
    active: false,
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    intensity: 0,
    dx: 0,
    dy: 0,
    color: { r: 200, g: 220, b: 255 },
  };
}

function addTrailPoint(x: number, y: number, size: number): void {
  const point = state.trailBuffer[state.trailHead];
  point.x = x;
  point.y = y;
  point.size = size;
  point.alpha = 1;
  point.age = 0;

  state.trailHead = (state.trailHead + 1) % MAX_TRAIL_POINTS;
  if (state.trailLength < MAX_TRAIL_POINTS) {
    state.trailLength++;
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    state.canvasWidth = width;
    state.canvasHeight = height;

    // Random palette
    state.palette = GHOST_PALETTES[Math.floor(Math.random() * GHOST_PALETTES.length)];

    // Random settings
    state.chromaticIntensity = 2 + Math.random() * 6;
    state.glowIntensity = 0.3 + Math.random() * 0.4;
    state.trailOpacity = 0.3 + Math.random() * 0.4;
    state.blurKernel = 5 + Math.random() * 10;

    // Pre-allocate trail buffer
    state.trailBuffer = [];
    for (let i = 0; i < MAX_TRAIL_POINTS; i++) {
      state.trailBuffer.push(createTrailPoint());
    }
    state.trailHead = 0;
    state.trailLength = 0;

    // Pre-allocate motion regions
    state.regions = [];
    for (let i = 0; i < MAX_REGIONS; i++) {
      state.regions.push(createMotionRegion());
    }

    // Initialize simulated motion
    state.simulatedX = width / 2;
    state.simulatedY = height / 2;
    state.simulatedVx = (Math.random() - 0.5) * 100;
    state.simulatedVy = (Math.random() - 0.5) * 100;

    state.time = 0;

    console.log(
      `[motion-ghost] Setup: palette=${state.palette.name}, chromatic=${state.chromaticIntensity.toFixed(1)}`
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    state.time += dt;

    // Check for video/motion availability
    const videoAvailable = api.context.video.isAvailable();
    let motionData: { intensity: number; direction: { x: number; y: number }; regions: { x: number; y: number; width: number; height: number }[] } | null = null;
    let dominantColor: RGB | null = null;

    if (videoAvailable) {
      motionData = api.context.video.getMotion();
      const rawColor = api.context.video.getDominantColor();
      if (rawColor) {
        dominantColor = { r: rawColor.r, g: rawColor.g, b: rawColor.b };
      }
    }

    // Update motion regions from video or simulation
    if (motionData && motionData.regions.length > 0) {
      // Use real motion data
      for (let i = 0; i < MAX_REGIONS; i++) {
        const region = state.regions[i];
        if (i < motionData.regions.length) {
          const src = motionData.regions[i];
          region.active = true;
          region.x = src.x;
          region.y = src.y;
          region.width = src.width;
          region.height = src.height;
          region.intensity = motionData.intensity;
          region.dx = motionData.direction.x;
          region.dy = motionData.direction.y;
          region.color = dominantColor || state.palette.colors[0];
        } else {
          region.active = false;
        }
      }
    } else {
      // Simulate motion with wandering point
      state.simulatedVx += (Math.random() - 0.5) * 200 * dt;
      state.simulatedVy += (Math.random() - 0.5) * 200 * dt;

      // Damping
      state.simulatedVx *= 0.98;
      state.simulatedVy *= 0.98;

      // Bounds
      state.simulatedX += state.simulatedVx * dt;
      state.simulatedY += state.simulatedVy * dt;

      if (state.simulatedX < 50 || state.simulatedX > state.canvasWidth - 50) {
        state.simulatedVx *= -1;
        state.simulatedX = Math.max(50, Math.min(state.canvasWidth - 50, state.simulatedX));
      }
      if (state.simulatedY < 50 || state.simulatedY > state.canvasHeight - 50) {
        state.simulatedVy *= -1;
        state.simulatedY = Math.max(50, Math.min(state.canvasHeight - 50, state.simulatedY));
      }

      // Create single simulated region
      const region = state.regions[0];
      region.active = true;
      region.x = state.simulatedX - 30;
      region.y = state.simulatedY - 30;
      region.width = 60;
      region.height = 60;
      region.intensity = 0.5 + Math.sin(state.time * 2) * 0.3;
      region.dx = state.simulatedVx / 100;
      region.dy = state.simulatedVy / 100;
      region.color = state.palette.colors[Math.floor(state.time) % state.palette.colors.length];

      // Deactivate other regions
      for (let i = 1; i < MAX_REGIONS; i++) {
        state.regions[i].active = false;
      }
    }

    // Add trail points from active regions
    for (const region of state.regions) {
      if (!region.active) continue;

      // Add point at region center
      const cx = region.x + region.width / 2;
      const cy = region.y + region.height / 2;
      const size = Math.max(region.width, region.height) * 0.5 * region.intensity;

      addTrailPoint(cx, cy, size);
    }

    // Age and draw trail points (oldest to newest)
    for (let i = 0; i < state.trailLength; i++) {
      const idx = (state.trailHead - state.trailLength + i + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS;
      const point = state.trailBuffer[idx];

      point.age += dt;
      point.alpha = Math.max(0, 1 - point.age * 2); // Fade over 0.5 seconds

      if (point.alpha <= 0) continue;

      const progress = i / state.trailLength;
      const colorIdx = Math.floor(progress * state.palette.colors.length);
      const color = state.palette.colors[Math.min(colorIdx, state.palette.colors.length - 1)];

      // Draw ghost glow layers
      const glowLayers = 3;
      const colorNumeric = rgbToNumeric(color);
      for (let g = glowLayers - 1; g >= 0; g--) {
        const glowRadius = point.size * (1 + g * 0.8);
        const glowAlpha = point.alpha * state.glowIntensity / (g + 1);

        api.brush.circle(point.x, point.y, glowRadius, {
          fill: colorNumeric,
          alpha: glowAlpha,
          blendMode: 'add',
        });
      }

      // Core ghost shape
      api.brush.circle(point.x, point.y, point.size * 0.5, {
        fill: colorNumeric,
        alpha: point.alpha * state.trailOpacity,
        blendMode: 'add',
      });
    }

    // Draw active region halos
    for (const region of state.regions) {
      if (!region.active) continue;

      const cx = region.x + region.width / 2;
      const cy = region.y + region.height / 2;
      const radius = Math.max(region.width, region.height) * 0.5;

      // Chromatic halo effect
      const chromaticOffset = state.chromaticIntensity * region.intensity;

      // Red channel offset
      api.brush.circle(cx - chromaticOffset, cy, radius * 0.8, {
        fill: 0xff6464,  // { r: 255, g: 100, b: 100 }
        alpha: 0.15 * region.intensity,
        blendMode: 'add',
      });

      // Blue channel offset
      api.brush.circle(cx + chromaticOffset, cy, radius * 0.8, {
        fill: 0x6464ff,  // { r: 100, g: 100, b: 255 }
        alpha: 0.15 * region.intensity,
        blendMode: 'add',
      });

      // Central white glow
      api.brush.circle(cx, cy, radius * 0.6, {
        fill: 0xffffff,
        alpha: 0.2 * region.intensity,
        blendMode: 'add',
      });
    }

    // ============ Apply filters (with performance optimization) ============
    //
    // Filter cost reference:
    // - motionBlur: HIGH cost (multi-pass directional blur)
    // - glow: HIGH cost (blur + blend operation)
    //
    // Optimization: Both filters are expensive. Apply them conditionally:
    // - motionBlur: Only when there's significant motion (increased threshold)
    // - glow: Only when there are enough trail points AND at reduced intensity
    //
    // Note: Using both filters together may cause performance issues on
    // lower-end hardware. Consider reducing filter quality or making
    // them mutually exclusive if performance problems occur.

    // Apply motion blur only when motion is significant
    // Increased threshold from 0.1 to 0.3 for better performance
    const MOTION_BLUR_THRESHOLD = 0.3;
    const MIN_BLUR_MAGNITUDE = 2; // Increased from 1 for performance
    if (motionData && motionData.intensity > MOTION_BLUR_THRESHOLD) {
      const blurX = motionData.direction.x * state.blurKernel * motionData.intensity;
      const blurY = motionData.direction.y * state.blurKernel * motionData.intensity;
      const blurMagnitude = Math.sqrt(blurX * blurX + blurY * blurY);
      if (blurMagnitude > MIN_BLUR_MAGNITUDE) {
        // Reduce kernel size from 5 to 3 for better performance
        api.filter.motionBlur([blurX, blurY], 3);
      }
    }

    // Apply glow only when there are enough active trail points
    // and scale intensity with trail density for visual consistency
    const GLOW_TRAIL_THRESHOLD = 20; // Increased from 10
    if (state.trailLength > GLOW_TRAIL_THRESHOLD) {
      // Scale glow intensity based on trail density (more trails = stronger glow)
      const trailDensity = Math.min(1, (state.trailLength - GLOW_TRAIL_THRESHOLD) / (MAX_TRAIL_POINTS - GLOW_TRAIL_THRESHOLD));
      const effectiveGlowIntensity = state.glowIntensity * 0.3 * trailDensity;
      // Reduce glow radius from 20 to 15 for better performance
      // Note: api.filter.glow() expects string color, not numeric
      const glowColor = state.palette.colors[0];
      const glowColorStr = `rgb(${glowColor.r}, ${glowColor.g}, ${glowColor.b})`;
      api.filter.glow(
        glowColorStr,
        effectiveGlowIntensity,
        15
      );
    }
  },

  async teardown(): Promise<void> {
    state.trailBuffer = [];
    state.trailHead = 0;
    state.trailLength = 0;
    state.regions = [];
    state.time = 0;
    console.log('[motion-ghost] Teardown complete');
  },
};

registerActor(actor);

export default actor;
