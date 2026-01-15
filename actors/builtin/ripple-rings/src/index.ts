/**
 * Ripple Rings Background Actor
 *
 * Concentric circles expanding outward from origin points.
 * Rings spawn on interval, expand, and fade out.
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
  id: 'ripple-rings',
  name: 'Ripple Rings',
  description: 'Concentric circles expanding outward from origin points',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['background', 'ripple', 'ambient', 'geometric'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  role: 'background',
};

// Color palettes - separate dark and light mode versions
interface RipplePalette {
  name: string;
  darkBackground: number;
  lightBackground: number;
  darkRingColor: number;
  lightRingColor: number;
}

const PALETTES: RipplePalette[] = [
  {
    name: 'Water',
    darkBackground: 0x0a1a2a,
    lightBackground: 0xe8f4fc,
    darkRingColor: 0x4488cc,
    lightRingColor: 0x1a5588,
  },
  {
    name: 'Energy',
    darkBackground: 0x1a0a1a,
    lightBackground: 0xf8e8f8,
    darkRingColor: 0xff44ff,
    lightRingColor: 0x882288,
  },
  {
    name: 'Zen',
    darkBackground: 0x0a0a0a,
    lightBackground: 0xf5f5f5,
    darkRingColor: 0xffffff,
    lightRingColor: 0x222222,
  },
  {
    name: 'Neon',
    darkBackground: 0x0a1a0a,
    lightBackground: 0xe8f8e8,
    darkRingColor: 0x44ff88,
    lightRingColor: 0x228844,
  },
  {
    name: 'Fire',
    darkBackground: 0x1a0a05,
    lightBackground: 0xfcf0e8,
    darkRingColor: 0xff6600,
    lightRingColor: 0xaa4400,
  },
];

const MAX_RINGS = 15;
const SPAWN_INTERVAL = 1200; // ms between new rings
const EXPANSION_SPEED = 0.08; // Pixels per ms
const RING_LIFETIME = 6000; // ms before fully faded
const RING_WIDTH = 2;

interface Ring {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  age: number; // ms since spawn
}

interface Origin {
  x: number;
  y: number;
}

interface State {
  palette: RipplePalette;
  rings: Ring[];
  origins: Origin[];
  lastSpawnTime: number;
  currentOriginIndex: number;
}

let state: State;

const actor: Actor = {
  metadata,

  setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];

    // Create origin points (center + random positions)
    const originCount = 1 + Math.floor(Math.random() * 3); // 1-3 origins
    const origins: Origin[] = [];

    // Always include center
    origins.push({ x: width / 2, y: height / 2 });

    // Add random additional origins
    for (let i = 1; i < originCount; i++) {
      origins.push({
        x: width * (0.2 + Math.random() * 0.6),
        y: height * (0.2 + Math.random() * 0.6),
      });
    }

    // Pre-allocate rings
    const rings: Ring[] = [];
    for (let i = 0; i < MAX_RINGS; i++) {
      rings.push({
        active: false,
        x: 0,
        y: 0,
        radius: 0,
        age: 0,
      });
    }

    state = {
      palette,
      rings,
      origins,
      lastSpawnTime: 0,
      currentOriginIndex: 0,
    };

    return Promise.resolve();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;
    const isDarkMode = api.context.display.isDarkMode();

    // Draw background - use mode-appropriate color
    const backgroundColor = isDarkMode
      ? state.palette.darkBackground
      : state.palette.lightBackground;
    api.brush.rect(0, 0, width, height, {
      fill: backgroundColor,
    });

    // Select ring color based on mode
    const ringColor = isDarkMode
      ? state.palette.darkRingColor
      : state.palette.lightRingColor;

    // Check if we should spawn a new ring
    const timeSinceSpawn = frame.time - state.lastSpawnTime;
    if (timeSinceSpawn >= SPAWN_INTERVAL) {
      // Find inactive ring
      const inactiveRing = state.rings.find((r) => !r.active);
      if (inactiveRing) {
        const origin = state.origins[state.currentOriginIndex];
        inactiveRing.active = true;
        inactiveRing.x = origin.x;
        inactiveRing.y = origin.y;
        inactiveRing.radius = 0;
        inactiveRing.age = 0;

        state.lastSpawnTime = frame.time;
        state.currentOriginIndex =
          (state.currentOriginIndex + 1) % state.origins.length;
      }
    }

    // Update and draw rings
    for (const ring of state.rings) {
      if (!ring.active) continue;

      // Update age and radius
      ring.age += dt;
      ring.radius += EXPANSION_SPEED * dt;

      // Check if ring is too old
      if (ring.age >= RING_LIFETIME) {
        ring.active = false;
        continue;
      }

      // Calculate alpha based on age (fade out over lifetime)
      // Light mode uses slightly higher alpha for better visibility
      const progress = ring.age / RING_LIFETIME;
      const baseAlpha = isDarkMode ? 0.6 : 0.7;
      const alpha = Math.max(0.05, baseAlpha * (1 - progress));

      // Skip if too faint
      if (alpha < 0.05) continue;

      // Draw ring as arc (full circle)
      api.brush.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2, {
        stroke: ringColor,
        strokeWidth: RING_WIDTH,
        alpha,
      });
    }
  },
};

registerActor(actor);

export default actor;
