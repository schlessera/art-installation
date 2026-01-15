/**
 * Gradient Sweep Background Actor
 *
 * Rotating linear gradient that slowly spins around the canvas center.
 * Creates a smooth, hypnotic background effect.
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
  id: 'gradient-sweep',
  name: 'Gradient Sweep',
  description: 'Rotating linear gradient background with multiple color palettes',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['background', 'gradient', 'ambient', 'rotating'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  role: 'background',
};

// Color palettes (hex colors)
interface GradientPalette {
  name: string;
  darkColors: number[];  // Colors for dark mode (dark to medium)
  lightColors: number[]; // Colors for light mode (light to medium)
}

const PALETTES: GradientPalette[] = [
  {
    name: 'Sunset',
    darkColors: [0x1a0a2e, 0x4a1942, 0x7b2d5b, 0xff6b35],
    lightColors: [0xfff5f0, 0xffd5c5, 0xffb095, 0xff6b35],
  },
  {
    name: 'Ocean',
    darkColors: [0x0a1628, 0x1a3a5c, 0x2a6a8a, 0x3a9ab8],
    lightColors: [0xf0f8ff, 0xc5e5f5, 0x8ac5e5, 0x3a9ab8],
  },
  {
    name: 'Forest',
    darkColors: [0x0a1a0a, 0x1a3a1a, 0x2a5a2a, 0x4a8a4a],
    lightColors: [0xf0fff0, 0xc5ecc5, 0x8ad58a, 0x4a8a4a],
  },
  {
    name: 'Candy',
    darkColors: [0x2a1a3a, 0x5a2a6a, 0x8a3a9a, 0xba5aba],
    lightColors: [0xfff0ff, 0xecc5ec, 0xd5a0d5, 0xba5aba],
  },
  {
    name: 'Noir',
    darkColors: [0x0a0a0a, 0x1a1a1a, 0x2a2a2a, 0x3a3a3a],
    lightColors: [0xffffff, 0xf0f0f0, 0xe0e0e0, 0xd0d0d0],
  },
];

// Animation settings
const ROTATION_SPEED = 0.0002; // Radians per ms (full rotation in ~31 seconds)

interface State {
  palette: GradientPalette;
  startTime: number;
  direction: number; // 1 or -1
}

let state: State;

function hexToString(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

const actor: Actor = {
  metadata,

  setup(_api: ActorSetupAPI): Promise<void> {
    state = {
      palette: PALETTES[Math.floor(Math.random() * PALETTES.length)],
      startTime: Date.now(),
      direction: Math.random() > 0.5 ? 1 : -1,
    };
    return Promise.resolve();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const elapsed = frame.time - state.startTime;

    // Calculate rotation angle
    const angle = elapsed * ROTATION_SPEED * state.direction;

    // Calculate gradient direction vector from angle
    // Angle 0 = horizontal left-to-right
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Convert to 0-1 coordinates for gradient
    // Start and end points on unit circle, offset to 0-1 range
    const x0 = 0.5 - cos * 0.5;
    const y0 = 0.5 - sin * 0.5;
    const x1 = 0.5 + cos * 0.5;
    const y1 = 0.5 + sin * 0.5;

    // Build gradient stops - select colors based on display mode
    const isDarkMode = api.context.display.isDarkMode();
    const colors = isDarkMode ? state.palette.darkColors : state.palette.lightColors;
    const stops = colors.map((color, i) => ({
      offset: i / (colors.length - 1),
      color: hexToString(color),
    }));

    // Draw full-screen rect with rotating linear gradient
    api.brush.rect(0, 0, width, height, {
      fill: {
        type: 'linear',
        x0,
        y0,
        x1,
        y1,
        stops,
      },
    });
  },
};

registerActor(actor);

export default actor;
