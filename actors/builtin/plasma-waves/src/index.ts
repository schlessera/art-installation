/**
 * Plasma Waves Background Actor
 *
 * Classic plasma effect with sine wave color cycling.
 * Uses overlapping soft circles with phase-shifted colors based on position and time.
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
  id: 'plasma-waves',
  name: 'Plasma Waves',
  description: 'Classic plasma effect with sine wave color cycling',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['background', 'plasma', 'retro', 'psychedelic'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  role: 'background',
};

// Color palettes (hue ranges for HSL)
// Lightness values are for dark mode; light mode uses adjusted values
interface PlasmaPalette {
  name: string;
  hueStart: number;
  hueRange: number;
  saturation: number;
  darkLightness: number; // Lightness for dark mode (higher = brighter)
  lightLightness: number; // Lightness for light mode (lower = darker)
}

const PALETTES: PlasmaPalette[] = [
  { name: 'Classic', hueStart: 0, hueRange: 360, saturation: 70, darkLightness: 25, lightLightness: 35 },
  { name: 'Fire', hueStart: 0, hueRange: 60, saturation: 90, darkLightness: 30, lightLightness: 40 },
  { name: 'Ice', hueStart: 180, hueRange: 80, saturation: 70, darkLightness: 25, lightLightness: 30 },
  { name: 'Acid', hueStart: 80, hueRange: 80, saturation: 100, darkLightness: 25, lightLightness: 35 },
  { name: 'Purple', hueStart: 260, hueRange: 60, saturation: 80, darkLightness: 20, lightLightness: 30 },
];

const CELL_SIZE = 120; // Size of each plasma cell
const PHASE_SPEED = 0.001; // Color cycling speed

interface PlasmaPoint {
  x: number;
  y: number;
  phaseX: number;
  phaseY: number;
}

interface State {
  palette: PlasmaPalette;
  points: PlasmaPoint[];
  glowTexture: string;
  startTime: number;
  waveType: 'horizontal' | 'vertical' | 'radial' | 'diagonal';
}

let state: State;

function createGlowTexture(): string {
  const canvas = document.createElement('canvas');
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

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

function hslToRgb(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return (
    (Math.round(f(0) * 255) << 16) |
    (Math.round(f(8) * 255) << 8) |
    Math.round(f(4) * 255)
  );
}

const actor: Actor = {
  metadata,

  setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];

    // Calculate grid to cover canvas
    const cols = Math.ceil(width / CELL_SIZE) + 1;
    const rows = Math.ceil(height / CELL_SIZE) + 1;

    // Pre-allocate plasma points
    const points: PlasmaPoint[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        points.push({
          x: col * CELL_SIZE,
          y: row * CELL_SIZE,
          phaseX: (col / cols) * Math.PI * 2,
          phaseY: (row / rows) * Math.PI * 2,
        });
      }
    }

    const waveTypes: Array<'horizontal' | 'vertical' | 'radial' | 'diagonal'> = [
      'horizontal',
      'vertical',
      'radial',
      'diagonal',
    ];

    state = {
      palette,
      points,
      glowTexture: createGlowTexture(),
      startTime: Date.now(),
      waveType: waveTypes[Math.floor(Math.random() * waveTypes.length)],
    };

    return Promise.resolve();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const elapsed = frame.time - state.startTime;
    const phase = elapsed * PHASE_SPEED;

    // Mode-aware settings
    const isDark = api.context.display.isDarkMode();
    const bgColor = isDark ? 0x050505 : 0xf8f8f8;
    const blendMode = isDark ? 'add' : 'multiply';
    // Light mode needs slightly lower alpha for similar visual weight
    const alpha = isDark ? 0.8 : 0.7;
    const lightness = isDark ? state.palette.darkLightness : state.palette.lightLightness;

    // Draw background
    api.brush.rect(0, 0, width, height, {
      fill: bgColor,
    });

    const centerX = width / 2;
    const centerY = height / 2;
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

    // Draw plasma points
    for (const point of state.points) {
      // Calculate plasma value based on wave type
      let plasmaValue: number;

      switch (state.waveType) {
        case 'horizontal':
          plasmaValue =
            Math.sin(point.phaseX + phase) +
            Math.sin(point.phaseY * 2 + phase * 0.7);
          break;
        case 'vertical':
          plasmaValue =
            Math.sin(point.phaseY + phase) +
            Math.sin(point.phaseX * 2 + phase * 0.7);
          break;
        case 'radial': {
          const dx = point.x - centerX;
          const dy = point.y - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
          plasmaValue =
            Math.sin(dist * Math.PI * 4 + phase) +
            Math.sin(point.phaseX + point.phaseY + phase * 0.5);
          break;
        }
        case 'diagonal':
          plasmaValue =
            Math.sin(point.phaseX + point.phaseY + phase) +
            Math.sin((point.phaseX - point.phaseY) * 2 + phase * 0.8);
          break;
      }

      // Normalize to 0-1
      plasmaValue = (plasmaValue + 2) / 4;

      // Calculate color from palette with mode-aware lightness
      const hue =
        state.palette.hueStart + plasmaValue * state.palette.hueRange;
      const color = hslToRgb(
        hue % 360,
        state.palette.saturation,
        lightness
      );

      // Draw plasma cell using pre-rendered texture
      api.brush.image(state.glowTexture, point.x, point.y, {
        width: CELL_SIZE * 1.5,
        height: CELL_SIZE * 1.5,
        anchorX: 0.5,
        anchorY: 0.5,
        tint: color,
        alpha,
        blendMode,
      });
    }
  },
};

registerActor(actor);

export default actor;
