/**
 * Mosaic Tiles Actor
 *
 * Creates a mosaic tile effect by:
 * - Dividing canvas into irregular tile grid
 * - Sampling colors from canvas content below
 * - Drawing tiles with slight rotation/offset variation
 * - Leaving grout gaps between tiles
 * - Subtle animation: tile rotation oscillation, occasional pops
 *
 * Note: This is a filter-role actor that processes content below it.
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
  id: 'mosaic-tiles',
  name: 'Mosaic Tiles',
  description: 'Mosaic tile effect with grout lines and tile variation',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'mosaic', 'tiles', 'traditional', 'craft'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  requiredContexts: [],
  role: 'filter',
};

// Tile configuration
interface Tile {
  x: number;           // Grid x position
  y: number;           // Grid y position
  offsetX: number;     // Random position offset
  offsetY: number;     // Random position offset
  rotation: number;    // Base rotation
  rotationPhase: number; // Animation phase offset
  scale: number;       // Slight scale variation
  popPhase: number;    // For occasional "pop" animation
  color: number;       // Cached sampled color
}

// Pre-allocated state
interface MosaicState {
  tiles: Tile[];
  tileSize: number;
  groutSize: number;
  cols: number;
  rows: number;
  width: number;
  height: number;
  groutColorBase: number;
  groutColorWarm: number;
  groutPhase: number;
  // Snapshot for color sampling
  snapshot: { data: Uint8Array; width: number; height: number } | null;
  snapshotPending: boolean;
  filterOpacity: number;
}

// Maximum tiles for performance
const MAX_TILES = 800;

let state: MosaicState = {
  tiles: [],
  tileSize: 16,
  groutSize: 2,
  cols: 0,
  rows: 0,
  width: 0,
  height: 0,
  groutColorBase: 0x2a2520,
  groutColorWarm: 0x3d3530,
  groutPhase: 0,
  snapshot: null,
  snapshotPending: false,
  filterOpacity: 1.0,
};

// Simple hash for deterministic randomness
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// Sample color from snapshot at tile position
function sampleColor(tile: Tile): number {
  if (!state.snapshot) {
    return 0x808080; // Default gray if no snapshot
  }

  // Calculate center position of tile in canvas coordinates
  const centerX = (tile.x + 0.5) * (state.tileSize + state.groutSize);
  const centerY = (tile.y + 0.5) * (state.tileSize + state.groutSize);

  // Convert to snapshot coordinates (note: WebGL Y is flipped)
  const snapX = Math.floor((centerX / state.width) * state.snapshot.width);
  const snapY = state.snapshot.height - 1 - Math.floor((centerY / state.height) * state.snapshot.height);

  // Clamp to valid range
  const clampedX = Math.max(0, Math.min(state.snapshot.width - 1, snapX));
  const clampedY = Math.max(0, Math.min(state.snapshot.height - 1, snapY));

  // Sample pixel
  const i = (clampedY * state.snapshot.width + clampedX) * 4;
  const r = state.snapshot.data[i] || 128;
  const g = state.snapshot.data[i + 1] || 128;
  const b = state.snapshot.data[i + 2] || 128;

  return (r << 16) | (g << 8) | b;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    state.width = width;
    state.height = height;

    // Calculate tile grid
    state.tileSize = 12 + Math.floor(Math.random() * 8); // 12-20px tiles
    state.groutSize = 1 + Math.floor(Math.random() * 2); // 1-2px grout

    const cellSize = state.tileSize + state.groutSize;
    state.cols = Math.ceil(width / cellSize);
    state.rows = Math.ceil(height / cellSize);

    // Pre-allocate tiles (limited to MAX_TILES for performance)
    state.tiles = [];
    for (let row = 0; row < state.rows; row++) {
      for (let col = 0; col < state.cols; col++) {
        if (state.tiles.length >= MAX_TILES) break;

        const tile: Tile = {
          x: col,
          y: row,
          offsetX: (hash(col, row) - 0.5) * 2, // -1 to 1 pixel offset
          offsetY: (hash(col + 100, row) - 0.5) * 2,
          rotation: (hash(col, row + 100) - 0.5) * 0.07, // ±2 degrees
          rotationPhase: hash(col + 200, row) * Math.PI * 2,
          scale: 0.95 + hash(col, row + 200) * 0.1, // 0.95-1.05
          popPhase: hash(col + 300, row) * 1000, // Random pop timing
          color: 0x808080, // Will be updated from snapshot
        };
        state.tiles.push(tile);
      }
    }

    state.groutPhase = 0;
    state.snapshot = null;
    state.snapshotPending = false;
    state.filterOpacity = 0.5 + Math.pow(Math.random(), 0.5) * 0.5;

    console.log(
      `[mosaic-tiles] Setup: ${state.tiles.length} tiles, ${state.cols}x${state.rows} grid, tile=${state.tileSize}px, grout=${state.groutSize}px, opacity=${state.filterOpacity.toFixed(2)}`
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const time = frame.time / 1000;

    // Request canvas snapshot for color sampling (only if not pending)
    if (!state.snapshotPending && !state.snapshot) {
      state.snapshotPending = true;
      api.canvas.getCanvasSnapshotAsync(1.0, { belowActorId: 'self' }).then((snap) => {
        state.snapshot = snap;
        state.snapshotPending = false;

        // Update tile colors from snapshot
        for (const tile of state.tiles) {
          tile.color = sampleColor(tile);
        }
      });
    }

    // Update grout color phase (subtle warm/cool shift)
    state.groutPhase += frame.deltaTime * 0.0005;
    const groutWarmth = (Math.sin(state.groutPhase) + 1) * 0.5;

    // Adapt grout color for light/dark mode
    const isDarkMode = api.context.display?.isDarkMode() ?? true;

    let groutR: number, groutG: number, groutB: number;
    if (isDarkMode) {
      // Dark mode: dark brown grout (original)
      groutR = Math.round(0x2a + (0x3d - 0x2a) * groutWarmth);
      groutG = Math.round(0x25 + (0x35 - 0x25) * groutWarmth);
      groutB = Math.round(0x20 + (0x30 - 0x20) * groutWarmth);
    } else {
      // Light mode: light gray/cream grout
      groutR = Math.round(0xd0 + (0xe0 - 0xd0) * groutWarmth);
      groutG = Math.round(0xc8 + (0xd8 - 0xc8) * groutWarmth);
      groutB = Math.round(0xc0 + (0xd0 - 0xc0) * groutWarmth);
    }
    const groutColor = (groutR << 16) | (groutG << 8) | groutB;

    // Draw grout background (full canvas)
    api.brush.rect(0, 0, state.width, state.height, {
      fill: groutColor,
    });

    // Draw tiles
    const cellSize = state.tileSize + state.groutSize;
    const halfGrout = state.groutSize / 2;

    for (const tile of state.tiles) {
      // Tile animation: subtle rotation oscillation
      const rotOscillation = Math.sin(time * 0.5 + tile.rotationPhase) * 0.02;
      const currentRotation = tile.rotation + rotOscillation;

      // Occasional "pop" animation
      let popScale = 1.0;
      const popCycle = (time * 0.1 + tile.popPhase) % 20;
      if (popCycle < 0.3) {
        // Pop happens every ~20 seconds for each tile
        const popProgress = popCycle / 0.3;
        popScale = 1.0 + Math.sin(popProgress * Math.PI) * 0.1;
      }

      // Calculate tile position
      const tileX = tile.x * cellSize + halfGrout + tile.offsetX;
      const tileY = tile.y * cellSize + halfGrout + tile.offsetY;
      const tileCenterX = tileX + state.tileSize / 2;
      const tileCenterY = tileY + state.tileSize / 2;

      const finalScale = tile.scale * popScale;

      // Draw tile with transform
      api.brush.pushMatrix();
      api.brush.translate(tileCenterX, tileCenterY);
      api.brush.rotate(currentRotation);
      api.brush.scale(finalScale, finalScale);

      // Main tile
      const halfTile = state.tileSize / 2;
      api.brush.rect(-halfTile, -halfTile, state.tileSize, state.tileSize, {
        fill: tile.color,
      });

      // Subtle bevel effect: adapt highlight/shadow intensity for light/dark mode
      // In dark mode: stronger white highlights, in light mode: subtle darker accents
      const highlightColor = isDarkMode ? 0xffffff : 0xffffff;
      const shadowColor = isDarkMode ? 0x000000 : 0x000000;
      const highlightAlphaTop = isDarkMode ? 0.15 : 0.25;
      const highlightAlphaLeft = isDarkMode ? 0.1 : 0.15;
      const shadowAlphaRight = isDarkMode ? 0.15 : 0.2;
      const shadowAlphaBottom = isDarkMode ? 0.1 : 0.15;

      // Top edge highlight
      api.brush.line(-halfTile, -halfTile, halfTile, -halfTile, {
        color: highlightColor,
        alpha: highlightAlphaTop,
        width: 1,
      });
      // Left edge highlight
      api.brush.line(-halfTile, -halfTile, -halfTile, halfTile, {
        color: highlightColor,
        alpha: highlightAlphaLeft,
        width: 1,
      });

      // Right edge shadow
      api.brush.line(halfTile, -halfTile, halfTile, halfTile, {
        color: shadowColor,
        alpha: shadowAlphaRight,
        width: 1,
      });
      // Bottom edge shadow
      api.brush.line(-halfTile, halfTile, halfTile, halfTile, {
        color: shadowColor,
        alpha: shadowAlphaBottom,
        width: 1,
      });

      api.brush.popMatrix();
    }

    // Periodically refresh snapshot for dynamic content
    if (state.snapshot && !state.snapshotPending && Math.random() < 0.02) {
      state.snapshotPending = true;
      api.canvas.getCanvasSnapshotAsync(1.0, { belowActorId: 'self' }).then((snap) => {
        state.snapshot = snap;
        state.snapshotPending = false;

        // Update tile colors
        for (const tile of state.tiles) {
          tile.color = sampleColor(tile);
        }
      });
    }

    // Apply overall filter opacity
    if (state.filterOpacity < 1.0) {
      api.filter.colorMatrix([
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, state.filterOpacity, 0,
      ]);
    }
  },

  async teardown(): Promise<void> {
    state.tiles = [];
    state.snapshot = null;
    state.snapshotPending = false;
    console.log('[mosaic-tiles] Teardown complete');
  },
};

registerActor(actor);

export default actor;
