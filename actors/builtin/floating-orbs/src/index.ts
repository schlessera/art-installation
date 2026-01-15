/**
 * Floating Orbs Background Actor
 *
 * Large soft bokeh-style circles that drift slowly across the background.
 * Uses pre-rendered glow texture for efficient rendering.
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
  id: 'floating-orbs',
  name: 'Floating Orbs',
  description: 'Soft bokeh-style circles drifting slowly with parallax depth',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['background', 'bokeh', 'ambient', 'dreamy'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  role: 'background',
};

// Color palettes with dark and light mode variants
interface OrbPalette {
  name: string;
  dark: {
    background: number;
    colors: number[];
  };
  light: {
    background: number;
    colors: number[];
  };
}

const PALETTES: OrbPalette[] = [
  {
    name: 'Warm',
    dark: {
      background: 0x1a0a05,
      colors: [0xff6600, 0xff3300, 0xffaa00, 0xff0066],
    },
    light: {
      background: 0xfff5ee,
      colors: [0xcc4400, 0xcc2200, 0xcc8800, 0xcc0044],
    },
  },
  {
    name: 'Cool',
    dark: {
      background: 0x05101a,
      colors: [0x0066ff, 0x00aaff, 0x0033ff, 0x00ffff],
    },
    light: {
      background: 0xeef5ff,
      colors: [0x0044cc, 0x0088cc, 0x0022cc, 0x00cccc],
    },
  },
  {
    name: 'Neon',
    dark: {
      background: 0x0a0a1a,
      colors: [0xff00ff, 0x00ffff, 0xff0066, 0x66ff00],
    },
    light: {
      background: 0xf5f0ff,
      colors: [0xcc00cc, 0x00cccc, 0xcc0044, 0x44cc00],
    },
  },
  {
    name: 'Pastel',
    dark: {
      background: 0x151015,
      colors: [0xffaacc, 0xaaccff, 0xccffaa, 0xffccaa],
    },
    light: {
      background: 0xfff8fa,
      colors: [0xcc6699, 0x6699cc, 0x99cc66, 0xcc9966],
    },
  },
  {
    name: 'Mono',
    dark: {
      background: 0x080808,
      colors: [0xffffff, 0xcccccc, 0xaaaaaa, 0x888888],
    },
    light: {
      background: 0xf8f8f8,
      colors: [0x000000, 0x333333, 0x555555, 0x777777],
    },
  },
];

const MAX_ORBS = 8;
const MIN_SIZE = 60;
const MAX_SIZE = 200;
const DRIFT_SPEED = 0.015; // Pixels per ms

interface Orb {
  x: number;
  y: number;
  size: number;
  color: number;
  speedX: number;
  speedY: number;
  alpha: number;
  depth: number; // 0-1, affects speed and size
}

interface State {
  palette: OrbPalette;
  orbs: Orb[];
  glowTexture: string;
  canvasWidth: number;
  canvasHeight: number;
}

let state: State;

function createGlowTexture(): string {
  const canvas = document.createElement('canvas');
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Create soft radial gradient
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.2)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return canvas.toDataURL();
}

function initOrb(
  orb: Orb,
  width: number,
  height: number,
  colors: number[],
  isDarkMode: boolean
): void {
  orb.x = Math.random() * width;
  orb.y = Math.random() * height;
  orb.depth = 0.3 + Math.random() * 0.7;
  orb.size = MIN_SIZE + (MAX_SIZE - MIN_SIZE) * orb.depth;
  orb.color = colors[Math.floor(Math.random() * colors.length)];
  // Light mode needs slightly lower alpha for similar visual weight
  const baseAlpha = isDarkMode ? 0.2 : 0.15;
  const depthAlpha = isDarkMode ? 0.4 : 0.35;
  orb.alpha = baseAlpha + orb.depth * depthAlpha;

  // Random drift direction, speed based on depth (closer = faster)
  const angle = Math.random() * Math.PI * 2;
  const speed = DRIFT_SPEED * orb.depth;
  orb.speedX = Math.cos(angle) * speed;
  orb.speedY = Math.sin(angle) * speed;
}

const actor: Actor = {
  metadata,

  setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const isDarkMode = api.context.display.isDarkMode();
    const modeColors = isDarkMode ? palette.dark.colors : palette.light.colors;

    // Pre-allocate orbs
    const orbs: Orb[] = [];
    for (let i = 0; i < MAX_ORBS; i++) {
      const orb: Orb = {
        x: 0,
        y: 0,
        size: 0,
        color: 0,
        speedX: 0,
        speedY: 0,
        alpha: 0,
        depth: 0,
      };
      initOrb(orb, width, height, modeColors, isDarkMode);
      orbs.push(orb);
    }

    state = {
      palette,
      orbs,
      glowTexture: createGlowTexture(),
      canvasWidth: width,
      canvasHeight: height,
    };

    return Promise.resolve();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;
    const isDarkMode = api.context.display.isDarkMode();

    // Update canvas size reference
    state.canvasWidth = width;
    state.canvasHeight = height;

    // Draw background with mode-appropriate color
    const background = isDarkMode
      ? state.palette.dark.background
      : state.palette.light.background;
    api.brush.rect(0, 0, width, height, {
      fill: background,
    });

    // Select blend mode based on display mode
    // Dark mode: 'add' makes colors glow brightly
    // Light mode: 'multiply' darkens and blends colors naturally
    const blendMode = isDarkMode ? 'add' : 'multiply';

    // Update and draw orbs (sorted by depth for proper layering)
    const sortedOrbs = state.orbs.slice().sort((a, b) => a.depth - b.depth);

    for (const orb of sortedOrbs) {
      // Update position
      orb.x += orb.speedX * dt;
      orb.y += orb.speedY * dt;

      // Wrap around edges with buffer for size
      const buffer = orb.size;
      if (orb.x < -buffer) orb.x = width + buffer;
      if (orb.x > width + buffer) orb.x = -buffer;
      if (orb.y < -buffer) orb.y = height + buffer;
      if (orb.y > height + buffer) orb.y = -buffer;

      // Draw orb using pre-rendered texture
      api.brush.image(state.glowTexture, orb.x, orb.y, {
        width: orb.size,
        height: orb.size,
        anchorX: 0.5,
        anchorY: 0.5,
        tint: orb.color,
        alpha: orb.alpha,
        blendMode,
      });
    }
  },
};

registerActor(actor);

export default actor;
