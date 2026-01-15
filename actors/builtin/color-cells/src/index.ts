/**
 * Color Cells Background Actor
 *
 * Voronoi-inspired regions with soft color transitions.
 * Uses large overlapping soft circles to create organic cell-like regions.
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
  id: 'color-cells',
  name: 'Color Cells',
  description: 'Voronoi-inspired regions with soft color transitions',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['background', 'voronoi', 'organic', 'ambient'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  role: 'background',
};

// Color palettes - separate for dark and light modes
interface CellPalette {
  name: string;
  background: number;
  colors: number[];
}

// Dark mode palettes: dark backgrounds with muted, deep colors
const DARK_PALETTES: CellPalette[] = [
  {
    name: 'Complementary',
    background: 0x0a0a10,
    colors: [0x1a2040, 0x401a30, 0x2a3050, 0x502a40],
  },
  {
    name: 'Analogous',
    background: 0x050a10,
    colors: [0x102030, 0x152535, 0x1a303a, 0x0f2530],
  },
  {
    name: 'Triadic',
    background: 0x0a0a0a,
    colors: [0x301a1a, 0x1a301a, 0x1a1a30, 0x251515],
  },
  {
    name: 'Warm',
    background: 0x100805,
    colors: [0x251510, 0x302015, 0x352510, 0x201510],
  },
  {
    name: 'Cool',
    background: 0x050a10,
    colors: [0x101a25, 0x152030, 0x102530, 0x0a1520],
  },
];

// Light mode palettes: light backgrounds with saturated, darker colors
const LIGHT_PALETTES: CellPalette[] = [
  {
    name: 'Complementary',
    background: 0xf5f5fa,
    colors: [0x8090c0, 0xc08090, 0x90a0d0, 0xd090a0],
  },
  {
    name: 'Analogous',
    background: 0xf0f5fa,
    colors: [0x6080a0, 0x7090b0, 0x80a0b8, 0x5070a0],
  },
  {
    name: 'Triadic',
    background: 0xf5f5f5,
    colors: [0xa06060, 0x60a060, 0x6060a0, 0x905050],
  },
  {
    name: 'Warm',
    background: 0xfaf5f0,
    colors: [0xa08070, 0xb09080, 0xc0a070, 0x907060],
  },
  {
    name: 'Cool',
    background: 0xf0f5fa,
    colors: [0x6080a0, 0x7090b0, 0x6090a8, 0x507090],
  },
];

const CELL_COUNT = 10;
const MIN_SIZE = 150;
const MAX_SIZE = 350;
const COLOR_CYCLE_SPEED = 0.0003; // Phase speed for color cycling
const DRIFT_SPEED = 0.0008; // Position drift speed
const BREATHE_SPEED = 0.001; // Size breathing speed

interface Cell {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  baseSize: number;
  colorIndex: number;
  phase: number;
  driftPhaseX: number;
  driftPhaseY: number;
  breathePhase: number;
}

interface State {
  darkPalette: CellPalette;
  lightPalette: CellPalette;
  cells: Cell[];
  glowTexture: string;
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
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.7)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return canvas.toDataURL();
}

function lerpColor(color1: number, color2: number, t: number): number {
  const r1 = (color1 >> 16) & 0xff;
  const g1 = (color1 >> 8) & 0xff;
  const b1 = color1 & 0xff;

  const r2 = (color2 >> 16) & 0xff;
  const g2 = (color2 >> 8) & 0xff;
  const b2 = color2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return (r << 16) | (g << 8) | b;
}

const actor: Actor = {
  metadata,

  setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    // Select same palette index for both modes to maintain visual consistency
    const paletteIndex = Math.floor(Math.random() * DARK_PALETTES.length);
    const darkPalette = DARK_PALETTES[paletteIndex];
    const lightPalette = LIGHT_PALETTES[paletteIndex];

    // Pre-allocate cells with distributed positions
    const cells: Cell[] = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      const angle = (i / CELL_COUNT) * Math.PI * 2;
      const radius = Math.min(width, height) * 0.3;

      // Distribute around center with some randomness
      const baseX = width / 2 + Math.cos(angle) * radius * (0.5 + Math.random() * 0.5);
      const baseY = height / 2 + Math.sin(angle) * radius * (0.5 + Math.random() * 0.5);
      const baseSize = MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE);

      cells.push({
        x: baseX,
        y: baseY,
        baseX,
        baseY,
        size: baseSize,
        baseSize,
        colorIndex: i % darkPalette.colors.length,
        phase: Math.random() * Math.PI * 2,
        driftPhaseX: Math.random() * Math.PI * 2,
        driftPhaseY: Math.random() * Math.PI * 2,
        breathePhase: Math.random() * Math.PI * 2,
      });
    }

    state = {
      darkPalette,
      lightPalette,
      cells,
      glowTexture: createGlowTexture(),
    };

    return Promise.resolve();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;

    // Select palette based on display mode
    const isDarkMode = api.context.display.isDarkMode();
    const palette = isDarkMode ? state.darkPalette : state.lightPalette;

    // Mode-aware rendering settings
    // Dark mode: 'add' blend makes colors glow and brighten
    // Light mode: 'multiply' blend darkens and creates depth
    const blendMode = isDarkMode ? 'add' : 'multiply';
    // Light mode needs slightly lower alpha for similar visual weight
    const cellAlpha = isDarkMode ? 0.7 : 0.6;

    // Draw background
    api.brush.rect(0, 0, width, height, {
      fill: palette.background,
    });

    // Update and draw cells
    for (const cell of state.cells) {
      // Update phases
      cell.phase += COLOR_CYCLE_SPEED * dt;
      cell.driftPhaseX += DRIFT_SPEED * dt * 0.8;
      cell.driftPhaseY += DRIFT_SPEED * dt * 1.2;
      cell.breathePhase += BREATHE_SPEED * dt;

      // Calculate drifting position
      const driftRadius = 30;
      cell.x = cell.baseX + Math.sin(cell.driftPhaseX) * driftRadius;
      cell.y = cell.baseY + Math.sin(cell.driftPhaseY) * driftRadius;

      // Calculate breathing size
      const breatheAmount = 0.15;
      cell.size = cell.baseSize * (1 + Math.sin(cell.breathePhase) * breatheAmount);

      // Calculate interpolated color using mode-appropriate palette
      const colorProgress = (Math.sin(cell.phase) + 1) / 2;
      const nextColorIndex = (cell.colorIndex + 1) % palette.colors.length;
      const color = lerpColor(
        palette.colors[cell.colorIndex],
        palette.colors[nextColorIndex],
        colorProgress
      );

      // Draw soft cell using pre-rendered texture
      api.brush.image(state.glowTexture, cell.x, cell.y, {
        width: cell.size,
        height: cell.size,
        anchorX: 0.5,
        anchorY: 0.5,
        tint: color,
        alpha: cellAlpha,
        blendMode,
      });
    }
  },
};

registerActor(actor);

export default actor;
