/**
 * Stripe Scroll Background Actor
 *
 * Angled stripes scrolling continuously across the background.
 * Creates a dynamic but non-distracting backdrop.
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
  id: 'stripe-scroll',
  name: 'Stripe Scroll',
  description: 'Angled stripes scrolling continuously',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['background', 'stripes', 'ambient', 'geometric'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  role: 'background',
};

// Color palettes for dark and light modes
interface StripePalette {
  name: string;
  background: number;
  stripeColors: number[];
}

// Dark mode palettes - dark backgrounds with slightly lighter stripes
const DARK_PALETTES: StripePalette[] = [
  {
    name: 'Retro',
    background: 0x1a0a20,
    stripeColors: [0x2a1530, 0x3a2040],
  },
  {
    name: 'Ocean',
    background: 0x051520,
    stripeColors: [0x0a2030, 0x102535],
  },
  {
    name: 'Sunset',
    background: 0x200a10,
    stripeColors: [0x301520, 0x402030],
  },
  {
    name: 'Forest',
    background: 0x051005,
    stripeColors: [0x0a200a, 0x152515],
  },
  {
    name: 'Mono',
    background: 0x0a0a0a,
    stripeColors: [0x151515, 0x1a1a1a],
  },
];

// Light mode palettes - light backgrounds with slightly darker stripes
const LIGHT_PALETTES: StripePalette[] = [
  {
    name: 'Retro',
    background: 0xf5eaf0,
    stripeColors: [0xe5d5e0, 0xd5c5d0],
  },
  {
    name: 'Ocean',
    background: 0xeaf5fa,
    stripeColors: [0xd5e5ef, 0xc5d5e5],
  },
  {
    name: 'Sunset',
    background: 0xfaf0f0,
    stripeColors: [0xf0e0e0, 0xe5d0d5],
  },
  {
    name: 'Forest',
    background: 0xf0f5f0,
    stripeColors: [0xe0f0e0, 0xd5e5d5],
  },
  {
    name: 'Mono',
    background: 0xf5f5f5,
    stripeColors: [0xeaeaea, 0xe0e0e0],
  },
];

// Angle options (degrees)
const ANGLES = [45, -45, 30, -30, 60, -60];
const STRIPE_WIDTH = 40;
const GAP_WIDTH = 40;
const SCROLL_SPEED = 0.03; // Pixels per ms

interface State {
  paletteIndex: number; // Index to select same palette name in both modes
  angle: number; // radians
  offset: number;
  scrollDirection: number; // 1 or -1
}

let state: State;

const actor: Actor = {
  metadata,

  setup(_api: ActorSetupAPI): Promise<void> {
    const angleIndex = Math.floor(Math.random() * ANGLES.length);
    const angle = (ANGLES[angleIndex] * Math.PI) / 180;

    state = {
      paletteIndex: Math.floor(Math.random() * DARK_PALETTES.length),
      angle,
      offset: 0,
      scrollDirection: Math.random() > 0.5 ? 1 : -1,
    };

    return Promise.resolve();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;

    // Select palette based on display mode
    const palettes = api.context.display.isDarkMode()
      ? DARK_PALETTES
      : LIGHT_PALETTES;
    const palette = palettes[state.paletteIndex];

    // Draw background
    api.brush.rect(0, 0, width, height, {
      fill: palette.background,
    });

    // Update scroll offset
    state.offset += SCROLL_SPEED * dt * state.scrollDirection;

    // Calculate stripe pattern period
    const period = STRIPE_WIDTH + GAP_WIDTH;

    // Full pattern repeats every (period * number of colors) for seamless color cycling
    const fullPattern = period * palette.stripeColors.length;

    // Wrap offset to prevent floating point issues
    state.offset = state.offset % fullPattern;
    if (state.offset < 0) state.offset += fullPattern;

    // Calculate diagonal extent needed to cover canvas
    const diagonal = Math.sqrt(width * width + height * height);
    const stripeCount = Math.ceil(diagonal / period) + 2;

    // Apply rotation transform
    api.brush.pushMatrix();
    api.brush.translate(width / 2, height / 2);
    api.brush.rotate(state.angle);

    // Draw stripes
    const startOffset = -diagonal / 2 - period + state.offset;

    for (let i = 0; i < stripeCount; i++) {
      const x = startOffset + i * period;
      const colorIndex = i % palette.stripeColors.length;

      api.brush.rect(x, -diagonal / 2, STRIPE_WIDTH, diagonal, {
        fill: palette.stripeColors[colorIndex],
      });
    }

    api.brush.popMatrix();
  },
};

registerActor(actor);

export default actor;
