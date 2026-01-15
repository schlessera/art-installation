/**
 * Soft Noise Background Actor
 *
 * Organic noise field using overlapping soft circles.
 * Each circle has a phase-shifted alpha creating a flowing noise effect.
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
  id: 'soft-noise',
  name: 'Soft Noise',
  description: 'Organic noise field using overlapping soft circles',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['background', 'noise', 'organic', 'ambient'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  role: 'background',
};

// Color palettes for dark and light modes
interface NoisePalette {
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

const PALETTES: NoisePalette[] = [
  {
    name: 'Mono',
    dark: {
      background: 0x0a0a0a,
      colors: [0x1a1a1a, 0x252525, 0x303030],
    },
    light: {
      background: 0xf5f5f5,
      colors: [0xe5e5e5, 0xdadada, 0xcfcfcf],
    },
  },
  {
    name: 'Ocean',
    dark: {
      background: 0x051020,
      colors: [0x0a2040, 0x103050, 0x154060],
    },
    light: {
      background: 0xeaf2fa,
      colors: [0xc5d8eb, 0xafc8e0, 0x99b8d5],
    },
  },
  {
    name: 'Forest',
    dark: {
      background: 0x051005,
      colors: [0x0a250a, 0x103510, 0x154515],
    },
    light: {
      background: 0xeaf5ea,
      colors: [0xc5e0c5, 0xafd5af, 0x99ca99],
    },
  },
  {
    name: 'Warm',
    dark: {
      background: 0x150805,
      colors: [0x251510, 0x352015, 0x45251a],
    },
    light: {
      background: 0xfaf2ea,
      colors: [0xebd8c5, 0xe0c8af, 0xd5b899],
    },
  },
  {
    name: 'Purple',
    dark: {
      background: 0x0a0510,
      colors: [0x150a20, 0x201030, 0x2a1540],
    },
    light: {
      background: 0xf2eaf5,
      colors: [0xdbc5eb, 0xcbafe0, 0xbb99d5],
    },
  },
];

const BLOB_COUNT = 25;
const MIN_SIZE = 80;
const MAX_SIZE = 200;
const PHASE_SPEED = 0.001; // Radians per ms
const DRIFT_SPEED = 0.005; // Pixels per ms

interface NoiseBlob {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  color: number;
  phase: number;
  driftPhaseX: number;
  driftPhaseY: number;
  driftAmplitude: number;
}

interface State {
  palette: NoisePalette;
  blobs: NoiseBlob[];
  glowTexture: string;
  isDarkMode: boolean;
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
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return canvas.toDataURL();
}

const actor: Actor = {
  metadata,

  setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const isDarkMode = api.context.display.isDarkMode();
    const modeColors = isDarkMode ? palette.dark : palette.light;

    // Pre-allocate blobs in a grid-like pattern with offsets
    const blobs: NoiseBlob[] = [];
    const gridSize = Math.ceil(Math.sqrt(BLOB_COUNT));
    const cellWidth = width / gridSize;
    const cellHeight = height / gridSize;

    for (let i = 0; i < BLOB_COUNT; i++) {
      const gridX = i % gridSize;
      const gridY = Math.floor(i / gridSize);

      // Position with random offset from grid
      const baseX = (gridX + 0.5) * cellWidth + (Math.random() - 0.5) * cellWidth * 0.8;
      const baseY = (gridY + 0.5) * cellHeight + (Math.random() - 0.5) * cellHeight * 0.8;

      blobs.push({
        x: baseX,
        y: baseY,
        baseX,
        baseY,
        size: MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE),
        color: modeColors.colors[Math.floor(Math.random() * modeColors.colors.length)],
        phase: Math.random() * Math.PI * 2,
        driftPhaseX: Math.random() * Math.PI * 2,
        driftPhaseY: Math.random() * Math.PI * 2,
        driftAmplitude: 20 + Math.random() * 40,
      });
    }

    state = {
      palette,
      blobs,
      glowTexture: createGlowTexture(),
      isDarkMode,
    };

    return Promise.resolve();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;
    const modeColors = state.isDarkMode ? state.palette.dark : state.palette.light;

    // Draw background
    api.brush.rect(0, 0, width, height, {
      fill: modeColors.background,
    });

    // Select blend mode based on display mode
    // Dark mode: 'add' makes light colors glow on dark background
    // Light mode: 'multiply' makes dark colors blend on light background
    const blendMode = state.isDarkMode ? 'add' : 'multiply';

    // Light mode needs slightly higher alpha for similar visual weight
    const alphaMultiplier = state.isDarkMode ? 1.0 : 1.2;

    // Update and draw blobs
    for (const blob of state.blobs) {
      // Update phases
      blob.phase += PHASE_SPEED * dt;
      blob.driftPhaseX += DRIFT_SPEED * dt * 0.7;
      blob.driftPhaseY += DRIFT_SPEED * dt * 1.1;

      // Calculate drifting position
      blob.x = blob.baseX + Math.sin(blob.driftPhaseX) * blob.driftAmplitude;
      blob.y = blob.baseY + Math.sin(blob.driftPhaseY) * blob.driftAmplitude;

      // Calculate pulsing alpha (capped at 1.0)
      const baseAlpha = 0.3 + 0.4 * (Math.sin(blob.phase) + 1) / 2;
      const alpha = Math.min(1.0, baseAlpha * alphaMultiplier);

      // Draw soft blob using pre-rendered texture
      api.brush.image(state.glowTexture, blob.x, blob.y, {
        width: blob.size,
        height: blob.size,
        anchorX: 0.5,
        anchorY: 0.5,
        tint: blob.color,
        alpha,
        blendMode,
      });
    }
  },
};

registerActor(actor);

export default actor;
