/**
 * Tuscan Storm
 *
 * Weather-reactive dramatic storm foreground actor. Renders diagonal rain,
 * forked lightning, dark drifting clouds, and wind streaks based on live
 * weather data. Falls back to an animated storm when weather is unavailable.
 *
 * Canvas: 360x640 portrait (Pixi.js)
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

// ── Metadata ────────────────────────────────────────────────

const metadata: ActorMetadata = {
  id: 'tuscan-storm',
  name: 'Tuscan Storm',
  description: 'Weather-reactive dramatic storm with rain, lightning, clouds, and wind streaks over a Tuscan landscape.',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'weather', 'storm', 'rain'],
  createdAt: new Date(),
  preferredDuration: 60,
  requiredContexts: ['weather', 'display'],
};

// ── Constants ───────────────────────────────────────────────

const MAX_RAINDROPS = 120;
const MAX_CLOUDS = 8;
const MAX_WIND_STREAKS = 15;
const MAX_LIGHTNING_FORKS = 6;

const COLOR_RAIN = 0x8899aa;
const COLOR_CLOUD = 0x3a3a4a;
const COLOR_LIGHTNING = 0xffffff;
const COLOR_WIND = 0x667788;

// ── State ───────────────────────────────────────────────────

interface Raindrop {
  x: number;
  y: number;
  speed: number;
  length: number;
  active: number; // 1 = active, 0 = inactive
}

interface Cloud {
  x: number;
  y: number;
  rx: number;
  ry: number;
  speed: number;
  alpha: number;
}

interface WindStreak {
  x: number;
  y: number;
  length: number;
  speed: number;
  active: number;
}

interface LightningSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface ActorState {
  raindrops: Raindrop[];
  clouds: Cloud[];
  windStreaks: WindStreak[];
  lightningSegments: LightningSegment[];
  lightningTimer: number;
  lightningFlashAlpha: number;
  lightningActive: number;
  lightningSegmentCount: number;
  isRaining: number; // 1 = rain/drizzle/thunderstorm
  isThunderstorm: number;
  windAngle: number;
  initialized: number;
}

let state: ActorState = {
  raindrops: [],
  clouds: [],
  windStreaks: [],
  lightningSegments: [],
  lightningTimer: 0,
  lightningFlashAlpha: 0,
  lightningActive: 0,
  lightningSegmentCount: 0,
  isRaining: 1,
  isThunderstorm: 0,
  windAngle: 0.3,
  initialized: 0,
};

// ── Helpers ─────────────────────────────────────────────────

function isDarkMode(): boolean {
  return true;
}

function resetRaindrop(drop: Raindrop, w: number, _h: number): void {
  drop.x = Math.random() * (w + 100) - 50;
  drop.y = -Math.random() * 80;
  drop.speed = 8 + Math.random() * 6;
  drop.length = 12 + Math.random() * 18;
  drop.active = 1;
}

function resetWindStreak(streak: WindStreak, w: number, h: number): void {
  streak.x = -Math.random() * 60;
  streak.y = Math.random() * h * 0.6;
  streak.length = 30 + Math.random() * 50;
  streak.speed = 3 + Math.random() * 4;
  streak.active = 1;
}

function generateLightning(
  segments: LightningSegment[],
  startX: number,
  startY: number,
  endY: number,
): number {
  let count = 0;
  let x = startX;
  let y = startY;
  const stepY = (endY - startY) / MAX_LIGHTNING_FORKS;

  for (let i = 0; i < MAX_LIGHTNING_FORKS; i++) {
    if (count >= segments.length) break;
    const nx = x + (Math.random() - 0.5) * 60;
    const ny = y + stepY + (Math.random() - 0.5) * 10;
    const seg = segments[count];
    seg.x1 = x;
    seg.y1 = y;
    seg.x2 = nx;
    seg.y2 = ny;
    count++;

    // Fork branch (50% chance, once)
    if (i === 2 && Math.random() > 0.5 && count < segments.length) {
      const fx = nx + (Math.random() - 0.4) * 80;
      const fy = ny + stepY * 0.8;
      const fork = segments[count];
      fork.x1 = nx;
      fork.y1 = ny;
      fork.x2 = fx;
      fork.y2 = fy;
      count++;
    }

    x = nx;
    y = ny;
  }

  return count;
}

// ── Actor ───────────────────────────────────────────────────

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    // Pre-allocate raindrops
    state.raindrops = new Array(MAX_RAINDROPS);
    for (let i = 0; i < MAX_RAINDROPS; i++) {
      state.raindrops[i] = {
        x: Math.random() * width,
        y: Math.random() * height,
        speed: 8 + Math.random() * 6,
        length: 12 + Math.random() * 18,
        active: 1,
      };
    }

    // Pre-allocate clouds
    state.clouds = new Array(MAX_CLOUDS);
    for (let i = 0; i < MAX_CLOUDS; i++) {
      state.clouds[i] = {
        x: Math.random() * (width + 200) - 100,
        y: 20 + Math.random() * 120,
        rx: 60 + Math.random() * 80,
        ry: 25 + Math.random() * 20,
        speed: 0.15 + Math.random() * 0.35,
        alpha: 0.6 + Math.random() * 0.3,
      };
    }

    // Pre-allocate wind streaks
    state.windStreaks = new Array(MAX_WIND_STREAKS);
    for (let i = 0; i < MAX_WIND_STREAKS; i++) {
      state.windStreaks[i] = {
        x: Math.random() * width,
        y: Math.random() * height * 0.6,
        length: 30 + Math.random() * 50,
        speed: 3 + Math.random() * 4,
        active: 1,
      };
    }

    // Pre-allocate lightning segments
    const maxSegments = MAX_LIGHTNING_FORKS + 2; // extra for fork branches
    state.lightningSegments = new Array(maxSegments);
    for (let i = 0; i < maxSegments; i++) {
      state.lightningSegments[i] = { x1: 0, y1: 0, x2: 0, y2: 0 };
    }

    state.lightningTimer = 3 + Math.random() * 5;
    state.lightningFlashAlpha = 0;
    state.lightningActive = 0;
    state.lightningSegmentCount = 0;
    state.isRaining = 1;
    state.isThunderstorm = 0;
    state.windAngle = 0.3;
    state.initialized = 1;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    if (!state.initialized) return;

    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime / 1000;
    const dark = isDarkMode();

    // ── Read weather context ──────────────────────────────
    let weatherAvailable = 0;
    let condition = '';
    try {
      const weather = api.context.weather;
      if (weather) {
        condition = (weather.condition() || '').toLowerCase();
        weatherAvailable = 1;
      }
    } catch (_e) {
      weatherAvailable = 0;
    }

    if (weatherAvailable) {
      state.isRaining =
        condition.indexOf('rain') >= 0 ||
        condition.indexOf('drizzle') >= 0 ||
        condition.indexOf('thunderstorm') >= 0
          ? 1
          : 0;
      state.isThunderstorm = condition.indexOf('thunderstorm') >= 0 ? 1 : 0;
    } else {
      // Fallback: full animated storm
      state.isRaining = 1;
      state.isThunderstorm = 0;
    }

    const raining = state.isRaining === 1;
    const activeDropCount = raining ? MAX_RAINDROPS : 0;
    const activeStreakCount = raining ? MAX_WIND_STREAKS : 6;
    const lightningInterval = raining
      ? state.isThunderstorm === 1
        ? 1.5 + Math.random() * 2
        : 4 + Math.random() * 6
      : 8 + Math.random() * 12;

    // ── Lightning timer ───────────────────────────────────
    state.lightningTimer -= dt;
    if (state.lightningTimer <= 0) {
      const lx = 40 + Math.random() * (width - 80);
      state.lightningSegmentCount = generateLightning(
        state.lightningSegments,
        lx,
        0,
        height * (0.4 + Math.random() * 0.3),
      );
      state.lightningActive = 1;
      state.lightningFlashAlpha = raining ? 0.35 : 0.12;
      state.lightningTimer = lightningInterval;
    }

    // ── Decay lightning flash ─────────────────────────────
    if (state.lightningFlashAlpha > 0) {
      state.lightningFlashAlpha -= dt * 1.8;
      if (state.lightningFlashAlpha < 0) {
        state.lightningFlashAlpha = 0;
        state.lightningActive = 0;
      }
    }

    // ── Draw: Screen flash ────────────────────────────────
    if (state.lightningFlashAlpha > 0.01) {
      api.brush.rect(0, 0, width, height, {
        fill: COLOR_LIGHTNING,
        alpha: state.lightningFlashAlpha,
        blendMode: 'add',
      });
    }

    // ── Draw: Clouds ──────────────────────────────────────
    for (let i = 0; i < MAX_CLOUDS; i++) {
      const cloud = state.clouds[i];
      cloud.x += cloud.speed * dt * 30;
      if (cloud.x - cloud.rx > width + 50) {
        cloud.x = -cloud.rx - 50;
        cloud.y = 20 + Math.random() * 120;
      }
      const cloudAlpha = dark ? cloud.alpha : cloud.alpha * 0.7;
      api.brush.ellipse(cloud.x, cloud.y, cloud.rx, cloud.ry, {
        fill: COLOR_CLOUD,
        alpha: Math.max(0.6, cloudAlpha),
        blendMode: 'normal',
      });
    }

    // ── Draw: Rain ────────────────────────────────────────
    const windOffsetX = Math.sin(state.windAngle) * 4;
    for (let i = 0; i < activeDropCount; i++) {
      const drop = state.raindrops[i];
      drop.x += windOffsetX * dt * 30;
      drop.y += drop.speed * dt * 30;

      if (drop.y > height + 20) {
        resetRaindrop(drop, width, height);
      }

      const endX = drop.x + windOffsetX * drop.length * 0.3;
      const endY = drop.y + drop.length;

      api.brush.line(drop.x, drop.y, endX, endY, {
        color: COLOR_RAIN,
        width: 1.5,
        alpha: 0.7,
        blendMode: 'normal',
      });
    }

    // ── Draw: Wind streaks ────────────────────────────────
    for (let i = 0; i < activeStreakCount; i++) {
      const streak = state.windStreaks[i];
      streak.x += streak.speed * dt * 30;
      if (streak.x > width + 60) {
        resetWindStreak(streak, width, height);
      }

      api.brush.line(streak.x, streak.y, streak.x + streak.length, streak.y + 2, {
        color: COLOR_WIND,
        width: 1,
        alpha: 0.6,
        blendMode: 'normal',
      });
    }

    // ── Draw: Lightning bolts ─────────────────────────────
    if (state.lightningActive === 1 && state.lightningFlashAlpha > 0.02) {
      const boltAlpha = Math.min(1, state.lightningFlashAlpha * 3);
      for (let i = 0; i < state.lightningSegmentCount; i++) {
        const seg = state.lightningSegments[i];
        api.brush.line(seg.x1, seg.y1, seg.x2, seg.y2, {
          color: COLOR_LIGHTNING,
          width: 3,
          alpha: Math.max(0.6, boltAlpha),
          blendMode: 'add',
        });
        // Glow line
        api.brush.line(seg.x1, seg.y1, seg.x2, seg.y2, {
          color: COLOR_LIGHTNING,
          width: 8,
          alpha: Math.max(0.6, boltAlpha * 0.3),
          blendMode: 'add',
        });
      }
    }
  },

  async teardown(): Promise<void> {
    state = {
      raindrops: [],
      clouds: [],
      windStreaks: [],
      lightningSegments: [],
      lightningTimer: 0,
      lightningFlashAlpha: 0,
      lightningActive: 0,
      lightningSegmentCount: 0,
      isRaining: 1,
      isThunderstorm: 0,
      windAngle: 0.3,
      initialized: 0,
    };
  },

  onContextChange(_context): void {
    // Weather changes are picked up each frame in update()
  },
};

registerActor(actor);
export default actor;
