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

// Color palettes for ghosts - dark mode (high lightness)
const GHOST_PALETTES_DARK: { name: string; colors: RGB[] }[] = [
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

// Color palettes for ghosts - light mode (low lightness, higher saturation)
const GHOST_PALETTES_LIGHT: { name: string; colors: RGB[] }[] = [
  {
    name: 'Ethereal',
    colors: [
      { r: 40, g: 60, b: 120 },
      { r: 50, g: 70, b: 140 },
      { r: 60, g: 80, b: 160 },
    ],
  },
  {
    name: 'Spectral',
    colors: [
      { r: 30, g: 100, b: 50 },
      { r: 40, g: 120, b: 60 },
      { r: 50, g: 140, b: 70 },
    ],
  },
  {
    name: 'Phantom',
    colors: [
      { r: 120, g: 40, b: 60 },
      { r: 140, g: 50, b: 70 },
      { r: 160, g: 60, b: 80 },
    ],
  },
  {
    name: 'Wraith',
    colors: [
      { r: 80, g: 40, b: 120 },
      { r: 100, g: 50, b: 140 },
      { r: 120, g: 60, b: 160 },
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

// Motion region tracking with animated ellipse
interface MotionRegion {
  active: boolean;
  wasActive: boolean; // Track if was active last frame for lerp vs snap
  x: number;
  y: number;
  width: number;
  height: number;
  intensity: number;
  dx: number;
  dy: number;
  color: RGB;
  // Animated ellipse state (current interpolated values)
  ellipseCx: number;
  ellipseCy: number;
  ellipseRx: number;
  ellipseRy: number;
}

interface GhostState {
  // Circular buffer for trail points
  trailBuffer: TrailPoint[];
  trailHead: number;
  trailLength: number;
  // Motion regions
  regions: MotionRegion[];
  // Settings
  paletteIndex: number; // Store index to switch palettes based on mode
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
  // Pre-rendered glow textures for dark and light modes
  glowTextureDark: string;
  glowTextureLight: string;
}

const MAX_TRAIL_POINTS = 100;
const MAX_REGIONS = 5;

let state: GhostState = {
  trailBuffer: [],
  trailHead: 0,
  trailLength: 0,
  regions: [],
  paletteIndex: 0,
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
  glowTextureDark: '',
  glowTextureLight: '',
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
    wasActive: false,
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    intensity: 0,
    dx: 0,
    dy: 0,
    color: { r: 200, g: 220, b: 255 },
    // Ellipse state
    ellipseCx: 0,
    ellipseCy: 0,
    ellipseRx: 25,
    ellipseRy: 25,
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

    // Random palette index (used to pick from mode-appropriate palettes)
    state.paletteIndex = Math.floor(Math.random() * GHOST_PALETTES_DARK.length);

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

    // Create pre-rendered glow textures for both modes
    const textureSize = 64;
    const center = textureSize / 2;

    // Dark mode: white glow (for additive blending)
    const canvasDark = document.createElement('canvas');
    canvasDark.width = textureSize;
    canvasDark.height = textureSize;
    const ctxDark = canvasDark.getContext('2d')!;
    const gradientDark = ctxDark.createRadialGradient(center, center, 0, center, center, center);
    gradientDark.addColorStop(0, 'rgba(255,255,255,1)');
    gradientDark.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    gradientDark.addColorStop(0.6, 'rgba(255,255,255,0.2)');
    gradientDark.addColorStop(1, 'rgba(255,255,255,0)');
    ctxDark.fillStyle = gradientDark;
    ctxDark.fillRect(0, 0, textureSize, textureSize);
    state.glowTextureDark = canvasDark.toDataURL();

    // Light mode: dark glow (for multiply blending)
    const canvasLight = document.createElement('canvas');
    canvasLight.width = textureSize;
    canvasLight.height = textureSize;
    const ctxLight = canvasLight.getContext('2d')!;
    const gradientLight = ctxLight.createRadialGradient(center, center, 0, center, center, center);
    gradientLight.addColorStop(0, 'rgba(0,0,0,1)');
    gradientLight.addColorStop(0.3, 'rgba(0,0,0,0.6)');
    gradientLight.addColorStop(0.6, 'rgba(0,0,0,0.2)');
    gradientLight.addColorStop(1, 'rgba(0,0,0,0)');
    ctxLight.fillStyle = gradientLight;
    ctxLight.fillRect(0, 0, textureSize, textureSize);
    state.glowTextureLight = canvasLight.toDataURL();

    const paletteName = GHOST_PALETTES_DARK[state.paletteIndex].name;
    console.log(
      `[motion-ghost] Setup: palette=${paletteName}, chromatic=${state.chromaticIntensity.toFixed(1)}`
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    state.time += dt;

    // Get display mode for adaptive rendering
    const isDarkMode = api.context.display.isDarkMode();
    const palette = isDarkMode
      ? GHOST_PALETTES_DARK[state.paletteIndex]
      : GHOST_PALETTES_LIGHT[state.paletteIndex];
    const glowTexture = isDarkMode ? state.glowTextureDark : state.glowTextureLight;
    const blendMode = isDarkMode ? 'add' : 'multiply';
    // Light mode needs slightly lower alpha for better visibility
    const alphaMultiplier = isDarkMode ? 1.0 : 0.7;

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

    // Ellipse animation lerp factor (0 = no change, 1 = instant snap)
    const ellipseLerp = 0.12;

    // Update motion regions from video or simulation
    if (motionData && motionData.regions.length > 0) {
      // Use real motion data
      for (let i = 0; i < MAX_REGIONS; i++) {
        const region = state.regions[i];
        if (i < motionData.regions.length) {
          const src = motionData.regions[i];
          const wasActive = region.wasActive;
          region.active = true;
          region.x = src.x;
          region.y = src.y;
          region.width = src.width;
          region.height = src.height;
          region.intensity = motionData.intensity;
          region.dx = motionData.direction.x;
          region.dy = motionData.direction.y;
          region.color = dominantColor || palette.colors[0];

          // Target ellipse from bounding box
          const targetCx = src.x + src.width / 2;
          const targetCy = src.y + src.height / 2;
          const targetRx = Math.max(src.width / 2, 20); // Minimum radius
          const targetRy = Math.max(src.height / 2, 20);

          if (!wasActive) {
            // Snap to position on first activation
            region.ellipseCx = targetCx;
            region.ellipseCy = targetCy;
            region.ellipseRx = targetRx;
            region.ellipseRy = targetRy;
          } else {
            // Lerp ellipse towards target
            region.ellipseCx += (targetCx - region.ellipseCx) * ellipseLerp;
            region.ellipseCy += (targetCy - region.ellipseCy) * ellipseLerp;
            region.ellipseRx += (targetRx - region.ellipseRx) * ellipseLerp;
            region.ellipseRy += (targetRy - region.ellipseRy) * ellipseLerp;
          }
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
      const wasActive = region.wasActive;
      region.active = true;
      region.x = state.simulatedX - 30;
      region.y = state.simulatedY - 30;
      region.width = 60;
      region.height = 60;
      region.intensity = 0.5 + Math.sin(state.time * 2) * 0.3;
      region.dx = state.simulatedVx / 100;
      region.dy = state.simulatedVy / 100;
      region.color = palette.colors[Math.floor(state.time) % palette.colors.length];

      // Snap or lerp ellipse for simulated region
      if (!wasActive) {
        region.ellipseCx = state.simulatedX;
        region.ellipseCy = state.simulatedY;
        region.ellipseRx = 30;
        region.ellipseRy = 30;
      } else {
        region.ellipseCx += (state.simulatedX - region.ellipseCx) * ellipseLerp;
        region.ellipseCy += (state.simulatedY - region.ellipseCy) * ellipseLerp;
        region.ellipseRx += (30 - region.ellipseRx) * ellipseLerp;
        region.ellipseRy += (30 - region.ellipseRy) * ellipseLerp;
      }

      // Deactivate other regions
      for (let i = 1; i < MAX_REGIONS; i++) {
        state.regions[i].active = false;
      }
    }

    // Update wasActive for next frame
    for (const region of state.regions) {
      region.wasActive = region.active;
    }

    // Add trail points distributed across active regions (within animated ellipse)
    for (const region of state.regions) {
      if (!region.active) continue;

      // Add multiple points spread across the ellipse
      const pointsPerRegion = 15; // Number of points to add per region per frame
      const size = 24; // Point size

      for (let i = 0; i < pointsPerRegion; i++) {
        // Random position within ellipse (uniform distribution)
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()); // sqrt for uniform area distribution
        const x = region.ellipseCx + r * Math.cos(angle) * region.ellipseRx;
        const y = region.ellipseCy + r * Math.sin(angle) * region.ellipseRy;
        addTrailPoint(x, y, size);
      }
    }

    // Age and draw trail points (oldest to newest) using pre-rendered texture
    for (let i = 0; i < state.trailLength; i++) {
      const idx = (state.trailHead - state.trailLength + i + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS;
      const point = state.trailBuffer[idx];

      point.age += dt;
      point.alpha = Math.max(0, 1 - point.age * 2); // Fade over 0.5 seconds

      if (point.alpha < 0.05) continue; // Skip nearly invisible points

      const progress = i / state.trailLength;
      const colorIdx = Math.floor(progress * palette.colors.length);
      const color = palette.colors[Math.min(colorIdx, palette.colors.length - 1)];
      const colorNumeric = rgbToNumeric(color);

      // Draw using pre-rendered glow texture with tinting
      const size = point.size * 3; // Texture size for the glow
      api.brush.image(glowTexture, point.x, point.y, {
        width: size,
        height: size,
        tint: colorNumeric,
        alpha: point.alpha * state.glowIntensity * alphaMultiplier,
        blendMode: blendMode,
      });
    }
  },

  async teardown(): Promise<void> {
    state.trailBuffer = [];
    state.trailHead = 0;
    state.trailLength = 0;
    state.regions = [];
    state.time = 0;
    state.glowTextureDark = '';
    state.glowTextureLight = '';
    console.log('[motion-ghost] Teardown complete');
  },
};

registerActor(actor);

export default actor;
