/**
 * Grid Pulse Background Actor
 *
 * Subtle grid lines that pulse alpha in wave patterns.
 * Creates a structured but dynamic backdrop.
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
  id: 'grid-pulse',
  name: 'Grid Pulse',
  description: 'Subtle grid lines that pulse alpha in wave patterns',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['background', 'grid', 'ambient', 'geometric'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  role: 'background',
};

// Color palettes - dark mode version (high lightness line colors)
interface GridPalette {
  name: string;
  darkBackground: number;
  lightBackground: number;
  darkLineColor: number;
  lightLineColor: number;
}

const PALETTES: GridPalette[] = [
  // Cyber: cyan lines
  {
    name: 'Cyber',
    darkBackground: 0x0a0a15,
    lightBackground: 0xf0f0fa,
    darkLineColor: 0x00ffff, // bright cyan
    lightLineColor: 0x006666, // dark cyan
  },
  // Matrix: green lines
  {
    name: 'Matrix',
    darkBackground: 0x0a1a0a,
    lightBackground: 0xf0faf0,
    darkLineColor: 0x00ff44, // bright green
    lightLineColor: 0x006622, // dark green
  },
  // Neon: magenta lines
  {
    name: 'Neon',
    darkBackground: 0x15051a,
    lightBackground: 0xfaf0fa,
    darkLineColor: 0xff00ff, // bright magenta
    lightLineColor: 0x660066, // dark magenta
  },
  // Minimal: neutral lines
  {
    name: 'Minimal',
    darkBackground: 0x0a0a0a,
    lightBackground: 0xf5f5f5,
    darkLineColor: 0xffffff, // white
    lightLineColor: 0x222222, // near black
  },
  // Warm: orange lines
  {
    name: 'Warm',
    darkBackground: 0x150a05,
    lightBackground: 0xfaf5f0,
    darkLineColor: 0xff8844, // bright orange
    lightLineColor: 0x884422, // dark orange
  },
];

// Grid configurations
const GRID_SIZES = [6, 8, 10, 12];
const LINE_WIDTH = 1;
const WAVE_SPEED = 0.002; // Radians per ms
const MIN_ALPHA = 0.1;
const MAX_ALPHA = 0.5;

interface State {
  palette: GridPalette;
  gridSize: number;
  startTime: number;
  waveDirection: 'horizontal' | 'vertical' | 'diagonal' | 'radial';
}

let state: State;

const actor: Actor = {
  metadata,

  setup(_api: ActorSetupAPI): Promise<void> {
    const directions: Array<'horizontal' | 'vertical' | 'diagonal' | 'radial'> = [
      'horizontal',
      'vertical',
      'diagonal',
      'radial',
    ];

    state = {
      palette: PALETTES[Math.floor(Math.random() * PALETTES.length)],
      gridSize: GRID_SIZES[Math.floor(Math.random() * GRID_SIZES.length)],
      startTime: Date.now(),
      waveDirection: directions[Math.floor(Math.random() * directions.length)],
    };

    return Promise.resolve();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const elapsed = frame.time - state.startTime;
    const phase = elapsed * WAVE_SPEED;

    // Mode-aware colors
    const isDarkMode = api.context.display.isDarkMode();
    const backgroundColor = isDarkMode
      ? state.palette.darkBackground
      : state.palette.lightBackground;
    const lineColor = isDarkMode
      ? state.palette.darkLineColor
      : state.palette.lightLineColor;

    // Draw background
    api.brush.rect(0, 0, width, height, {
      fill: backgroundColor,
    });

    const cellWidth = width / state.gridSize;
    const cellHeight = height / state.gridSize;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

    // Draw vertical lines
    for (let i = 0; i <= state.gridSize; i++) {
      const x = i * cellWidth;

      // Calculate alpha based on wave direction
      let waveOffset: number;
      switch (state.waveDirection) {
        case 'horizontal':
          waveOffset = i / state.gridSize;
          break;
        case 'vertical':
          waveOffset = 0.5; // Same for all vertical lines
          break;
        case 'diagonal':
          waveOffset = i / state.gridSize;
          break;
        case 'radial':
          waveOffset = Math.abs(i - state.gridSize / 2) / (state.gridSize / 2);
          break;
      }

      const baseAlpha =
        MIN_ALPHA +
        ((MAX_ALPHA - MIN_ALPHA) *
          (Math.sin(phase + waveOffset * Math.PI * 2) + 1)) /
          2;
      // Light mode needs slightly lower alpha for softer appearance
      const alpha = isDarkMode ? baseAlpha : baseAlpha * 0.8;

      api.brush.line(x, 0, x, height, {
        color: lineColor,
        width: LINE_WIDTH,
        alpha,
      });
    }

    // Draw horizontal lines
    for (let i = 0; i <= state.gridSize; i++) {
      const y = i * cellHeight;

      // Calculate alpha based on wave direction
      let waveOffset: number;
      switch (state.waveDirection) {
        case 'horizontal':
          waveOffset = 0.5; // Same for all horizontal lines
          break;
        case 'vertical':
          waveOffset = i / state.gridSize;
          break;
        case 'diagonal':
          waveOffset = i / state.gridSize;
          break;
        case 'radial':
          waveOffset = Math.abs(i - state.gridSize / 2) / (state.gridSize / 2);
          break;
      }

      const baseAlpha =
        MIN_ALPHA +
        ((MAX_ALPHA - MIN_ALPHA) *
          (Math.sin(phase + waveOffset * Math.PI * 2) + 1)) /
          2;
      // Light mode needs slightly lower alpha for softer appearance
      const alpha = isDarkMode ? baseAlpha : baseAlpha * 0.8;

      api.brush.line(0, y, width, y, {
        color: lineColor,
        width: LINE_WIDTH,
        alpha,
      });
    }
  },
};

registerActor(actor);

export default actor;
