/**
 * Dance Floor Actor
 *
 * A 6x10 grid of disco tiles that light up based on motion detection.
 * When motion is detected in a region, the corresponding tile lights up
 * brightly and then fades. Colors cycle through a disco palette.
 * Tiles pulse with audio bass when available. Without video input,
 * tiles animate in a wave pattern simulating motion.
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
  id: 'dance-floor',
  name: 'Dance Floor',
  description: 'Grid of disco tiles that react to motion and audio',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['foreground', 'video', 'interactive', 'dance', 'disco'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 60,
  requiredContexts: ['video', 'audio', 'display'],
};

// Grid dimensions
const COLS = 6;
const ROWS = 10;
const TILE_COUNT = COLS * ROWS;

// Disco palette (numeric colors)
const DISCO_COLORS: number[] = [
  0xff2266, // pink
  0x22ccff, // cyan
  0xffdd22, // yellow
  0x22ff88, // green
  0xaa44ff, // purple
];

// Grid line color
const GRID_COLOR_DARK = 0x111122;
const GRID_COLOR_LIGHT = 0xccccdd;

// Tile fade speed (per second)
const FADE_SPEED = 1.5;

// Wave simulation speed (radians per second)
const WAVE_SPEED = 2.0;

// Bass pulse multiplier
const BASS_PULSE_SCALE = 0.3;

interface TileState {
  brightness: number;    // 0..1 current brightness
  colorIndex: number;    // index into DISCO_COLORS
  targetBrightness: number; // target to lerp toward
}

interface DanceFloorState {
  tiles: TileState[];
  canvasWidth: number;
  canvasHeight: number;
  time: number;
  wavePhaseOffset: number;
  colorCycleOffset: number;
}

let state: DanceFloorState = {
  tiles: [],
  canvasWidth: 360,
  canvasHeight: 640,
  time: 0,
  wavePhaseOffset: 0,
  colorCycleOffset: 0,
};

// Pre-allocate tile objects in setup
function createTile(): TileState {
  return {
    brightness: 0,
    colorIndex: 0,
    targetBrightness: 0,
  };
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    state.canvasWidth = width;
    state.canvasHeight = height;
    state.time = 0;
    state.wavePhaseOffset = Math.random() * Math.PI * 2;
    state.colorCycleOffset = Math.random() * DISCO_COLORS.length;

    // Pre-allocate all tiles
    state.tiles = [];
    for (let i = 0; i < TILE_COUNT; i++) {
      const tile = createTile();
      tile.colorIndex = i % DISCO_COLORS.length;
      state.tiles.push(tile);
    }

    console.log(`[dance-floor] Setup complete: ${COLS}x${ROWS} grid`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime / 1000;
    state.time += dt;

    const isDark = api.context.display.isDarkMode();
    const gridColor = isDark ? GRID_COLOR_DARK : GRID_COLOR_LIGHT;

    const tileWidth = width / COLS;
    const tileHeight = height / ROWS;

    // Check video availability
    const videoAvailable = api.context.video.isAvailable();

    // Get bass level from audio if available
    let bassLevel = 0;
    const audioAvailable = api.context.audio.isAvailable();
    if (audioAvailable) {
      const freq = api.context.audio.getFrequencyData();
      if (freq && freq.length > 0) {
        // Average the low frequency bins (bass)
        const bassBins = Math.min(4, freq.length);
        let sum = 0;
        for (let b = 0; b < bassBins; b++) {
          sum += freq[b];
        }
        bassLevel = (sum / bassBins) / 255;
      }
    }

    // Update tile target brightness from motion or wave simulation
    if (videoAvailable) {
      const motionData = api.context.video.getMotion();
      if (motionData && motionData.regions.length > 0) {
        // Map motion regions to grid tiles
        for (let r = 0; r < motionData.regions.length; r++) {
          const region = motionData.regions[r];
          // Determine which tiles overlap this region
          const colStart = Math.max(0, Math.floor(region.x / tileWidth));
          const colEnd = Math.min(COLS - 1, Math.floor((region.x + region.width) / tileWidth));
          const rowStart = Math.max(0, Math.floor(region.y / tileHeight));
          const rowEnd = Math.min(ROWS - 1, Math.floor((region.y + region.height) / tileHeight));

          for (let row = rowStart; row <= rowEnd; row++) {
            for (let col = colStart; col <= colEnd; col++) {
              const idx = row * COLS + col;
              const tile = state.tiles[idx];
              tile.targetBrightness = 1.0;
              // Cycle color on activation
              tile.colorIndex = (col + row + Math.floor(state.time * 2 + state.colorCycleOffset)) % DISCO_COLORS.length;
            }
          }
        }
      }
    } else {
      // Wave pattern simulation - no video available
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const idx = row * COLS + col;
          const tile = state.tiles[idx];

          // Multiple overlapping waves for variety
          const wave1 = Math.sin(state.time * WAVE_SPEED + col * 0.8 + row * 0.5 + state.wavePhaseOffset);
          const wave2 = Math.sin(state.time * WAVE_SPEED * 0.7 - row * 0.6 + col * 0.3 + state.wavePhaseOffset * 1.5);
          const combined = (wave1 + wave2) * 0.5;

          // Only light up when wave is positive (creates moving patches)
          if (combined > 0.3) {
            tile.targetBrightness = combined;
            tile.colorIndex = (col + row + Math.floor(state.time * 1.5 + state.colorCycleOffset)) % DISCO_COLORS.length;
          } else {
            tile.targetBrightness = 0;
          }
        }
      }
    }

    // Draw tiles
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const idx = row * COLS + col;
        const tile = state.tiles[idx];

        // Fade brightness toward target, then decay target
        if (tile.brightness < tile.targetBrightness) {
          tile.brightness += (tile.targetBrightness - tile.brightness) * 0.3;
        } else {
          tile.brightness -= FADE_SPEED * dt;
        }
        tile.targetBrightness *= (1 - FADE_SPEED * dt);

        // Clamp brightness
        if (tile.brightness < 0.02) {
          tile.brightness = 0;
        }
        if (tile.brightness > 1) {
          tile.brightness = 1;
        }

        const x = col * tileWidth;
        const y = row * tileHeight;

        // Apply bass pulse to brightness
        const pulseBoost = bassLevel * BASS_PULSE_SCALE;
        const effectiveBrightness = Math.min(1, tile.brightness + pulseBoost * tile.brightness);

        // Base dim tile (always visible)
        const baseAlpha = isDark ? 0.08 : 0.05;
        const tileColor = DISCO_COLORS[tile.colorIndex];

        // Draw dim base tile
        api.brush.rect(x + 1, y + 1, tileWidth - 2, tileHeight - 2, {
          fill: tileColor,
          alpha: Math.max(0.6, baseAlpha),
          blendMode: 'normal',
        });

        // Draw bright overlay when active
        if (effectiveBrightness > 0.02) {
          // Main bright tile
          api.brush.rect(x + 1, y + 1, tileWidth - 2, tileHeight - 2, {
            fill: tileColor,
            alpha: Math.max(0.6, effectiveBrightness * 0.9),
            blendMode: 'normal',
          });

          // Additive glow layer for active tiles
          api.brush.rect(x + 2, y + 2, tileWidth - 4, tileHeight - 4, {
            fill: tileColor,
            alpha: Math.max(0.6, effectiveBrightness * 0.5),
            blendMode: 'add',
          });
        }
      }
    }

    // Draw grid lines on top
    // Vertical lines
    for (let col = 0; col <= COLS; col++) {
      const x = col * tileWidth;
      api.brush.line(x, 0, x, height, {
        color: gridColor,
        width: 2,
        alpha: 0.8,
      });
    }

    // Horizontal lines
    for (let row = 0; row <= ROWS; row++) {
      const y = row * tileHeight;
      api.brush.line(0, y, width, y, {
        color: gridColor,
        width: 2,
        alpha: 0.8,
      });
    }
  },

  async teardown(): Promise<void> {
    state.tiles = [];
    state.time = 0;
    console.log('[dance-floor] Teardown complete');
  },
};

registerActor(actor);

export default actor;
