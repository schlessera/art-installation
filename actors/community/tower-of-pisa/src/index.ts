/**
 * Tower of Pisa Actor
 *
 * A stylized view of the Leaning Tower of Pisa with 8 tiers of
 * columned arcades, tilted ~5.5 degrees to the right. White marble
 * palette with subtle sway animation and drifting clouds behind.
 *
 * Foreground actor for 360x640 portrait canvas.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';

// ============================================================
// METADATA
// ============================================================

const metadata: ActorMetadata = {
  id: 'tower-of-pisa',
  name: 'Tower Of Pisa',
  description:
    'The Leaning Tower of Pisa with 8 tiers of marble arcades, tilted 5.5 degrees with gentle sway and drifting clouds',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'pisa', 'architecture', 'landmark'],
  createdAt: new Date(),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// ============================================================
// CONSTANTS
// ============================================================

// Tower geometry
const TIER_COUNT = 8;
const TOWER_BASE_RADIUS = 38;
const TOWER_TOP_RADIUS = 32;
const TIER_HEIGHT = 32;
const ARCH_COUNT = 5; // arches per tier
const BELL_CHAMBER_EXTRA = 6; // wider at top
const TILT_ANGLE = 5.5 * (Math.PI / 180); // ~5.5 degrees in radians

// Clouds
const MAX_CLOUDS = 5;

// ============================================================
// STATE
// ============================================================

interface CloudState {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
}

let canvasW = 0;
let canvasH = 0;
let towerBaseX = 0;
let towerBaseY = 0;

// Clouds pre-allocated
let clouds: CloudState[] = [];

// Animation phase
let swayPhase = 0;

// Pre-allocated arch polygon arrays (reused per frame)
// Each arch needs 2 columns + arch top = simplified as rect+ellipse
// No polygon arrays needed -- we draw with rects and ellipses

// ============================================================
// HELPERS
// ============================================================

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ============================================================
// ACTOR
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Tower positioned in lower portion
    towerBaseX = canvasW * 0.45;
    towerBaseY = canvasH * 0.82;

    swayPhase = 0;

    // Pre-allocate clouds
    clouds = [];
    for (let i = 0; i < MAX_CLOUDS; i++) {
      clouds.push({
        x: seededRandom(i * 37) * canvasW * 1.5 - canvasW * 0.25,
        y: canvasH * 0.05 + seededRandom(i * 43) * canvasH * 0.25,
        width: 50 + seededRandom(i * 59) * 70,
        height: 15 + seededRandom(i * 67) * 15,
        speed: 4 + seededRandom(i * 71) * 8,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    // Advance sway (very slow, barely perceptible)
    swayPhase += dt * 0.3;

    // ---- COLOR PALETTE ----
    const marbleWhite = isDark ? 0xc8c4b8 : 0xf0ece0;
    const marbleShadow = isDark ? 0x9a968a : 0xd8d4c8;
    const marbleDark = isDark ? 0x7a766a : 0xc8c4b8;
    const archDark = isDark ? 0x5a564a : 0xa8a498;
    const archVoid = isDark ? 0x3a3830 : 0x888478;
    const groundColor = isDark ? 0x2a3a20 : 0x6a9a5a;
    const grassHighlight = isDark ? 0x3a4a30 : 0x7aaa6a;
    const cloudColor = isDark ? 0x4a4a5a : 0xffffff;

    // ---- CLOUDS (behind tower) ----
    for (let i = 0; i < MAX_CLOUDS; i++) {
      const c = clouds[i];
      c.x += c.speed * dt;
      // Wrap around
      if (c.x > canvasW + c.width) {
        c.x = -c.width;
      }

      // Draw cloud as overlapping ellipses (3 per cloud)
      const cloudAlpha = isDark ? 0.6 : 0.7;
      api.brush.ellipse(c.x, c.y, c.width, c.height, {
        fill: cloudColor,
        alpha: cloudAlpha,
        blendMode: 'normal',
      });
      api.brush.ellipse(c.x - c.width * 0.25, c.y + 3, c.width * 0.7, c.height * 0.8, {
        fill: cloudColor,
        alpha: cloudAlpha * 0.8,
        blendMode: 'normal',
      });
      api.brush.ellipse(c.x + c.width * 0.2, c.y + 2, c.width * 0.6, c.height * 0.9, {
        fill: cloudColor,
        alpha: cloudAlpha * 0.85,
        blendMode: 'normal',
      });
    }

    // ---- GROUND ----
    api.brush.rect(0, towerBaseY - 5, canvasW, canvasH - towerBaseY + 5, {
      fill: groundColor,
      alpha: 0.9,
      blendMode: 'normal',
    });
    // Grass highlight
    api.brush.ellipse(canvasW * 0.5, towerBaseY + 2, canvasW * 0.7, 20, {
      fill: grassHighlight,
      alpha: 0.7,
      blendMode: 'normal',
    });

    // ---- TOWER (tilted via pushMatrix) ----
    // Very subtle sway added to the base tilt
    const sway = Math.sin(swayPhase) * 0.003; // barely perceptible

    api.brush.pushMatrix();
    api.brush.translate(towerBaseX, towerBaseY);
    api.brush.rotate(TILT_ANGLE + sway);

    // The tower is drawn upward from origin (0,0 = base)
    // Each tier draws from bottom to top

    // -- Foundation / base cylinder --
    const baseW = TOWER_BASE_RADIUS * 2 + 8;
    const baseH = 18;
    api.brush.rect(-baseW / 2, -baseH, baseW, baseH, {
      fill: marbleDark,
      alpha: 0.9,
      blendMode: 'normal',
    });
    // Base top edge
    api.brush.rect(-baseW / 2 - 2, -baseH - 3, baseW + 4, 5, {
      fill: marbleShadow,
      alpha: 0.85,
      blendMode: 'normal',
    });

    // -- Draw 8 tiers of arcades --
    let currentY = -baseH - 3;

    for (let tier = 0; tier < TIER_COUNT; tier++) {
      const isBellChamber = tier === TIER_COUNT - 1;
      const tierProgress = tier / (TIER_COUNT - 1);
      // Taper slightly from base to top
      const tierRadius = TOWER_BASE_RADIUS + (TOWER_TOP_RADIUS - TOWER_BASE_RADIUS) * tierProgress;
      const tierW = tierRadius * 2 + (isBellChamber ? BELL_CHAMBER_EXTRA : 0);
      const tierH = isBellChamber ? TIER_HEIGHT + 4 : TIER_HEIGHT;
      const archesInTier = isBellChamber ? ARCH_COUNT - 1 : ARCH_COUNT;

      // Tier background (solid marble wall)
      api.brush.rect(-tierW / 2, currentY - tierH, tierW, tierH, {
        fill: marbleWhite,
        alpha: 0.95,
        blendMode: 'normal',
      });

      // Left shadow edge
      api.brush.rect(-tierW / 2, currentY - tierH, 3, tierH, {
        fill: marbleShadow,
        alpha: 0.7,
        blendMode: 'normal',
      });

      // Right highlight edge
      api.brush.rect(tierW / 2 - 2, currentY - tierH, 2, tierH, {
        fill: marbleDark,
        alpha: 0.6,
        blendMode: 'normal',
      });

      // Cornice / ledge between tiers
      api.brush.rect(-tierW / 2 - 2, currentY - tierH - 2, tierW + 4, 3, {
        fill: marbleShadow,
        alpha: 0.8,
        blendMode: 'normal',
      });

      // Draw arches in this tier
      const archZoneW = tierW - 6;
      const archSpacing = archZoneW / archesInTier;
      const archW = archSpacing * 0.55;
      const archH = tierH * 0.6;
      const archTopY = currentY - tierH + 5;

      for (let a = 0; a < archesInTier; a++) {
        const ax = -archZoneW / 2 + archSpacing * (a + 0.5);

        // Arch void (dark opening)
        api.brush.rect(ax - archW / 2, archTopY, archW, archH, {
          fill: archVoid,
          alpha: 0.8,
          blendMode: 'normal',
        });

        // Arch top (semicircle)
        api.brush.ellipse(ax, archTopY, archW, archW * 0.6, {
          fill: archVoid,
          alpha: 0.8,
          blendMode: 'normal',
        });

        // Column between arches (thin divider)
        api.brush.rect(ax - archW / 2 - 1.5, archTopY - 1, 2, archH + 2, {
          fill: archDark,
          alpha: 0.85,
          blendMode: 'normal',
        });
      }

      currentY = currentY - tierH - 2;
    }

    // -- Bell / cupola at the very top --
    const cupolaW = 24;
    const cupolaH = 14;
    api.brush.ellipse(0, currentY - cupolaH / 2, cupolaW, cupolaH, {
      fill: marbleWhite,
      alpha: 0.9,
      blendMode: 'normal',
    });
    // Dome top
    api.brush.ellipse(0, currentY - cupolaH + 1, cupolaW * 0.7, cupolaH * 0.5, {
      fill: marbleShadow,
      alpha: 0.8,
      blendMode: 'normal',
    });
    // Cross / finial at very top
    api.brush.rect(-1, currentY - cupolaH - 8, 2, 10, {
      fill: marbleDark,
      alpha: 0.9,
      blendMode: 'normal',
    });
    api.brush.rect(-4, currentY - cupolaH - 6, 8, 2, {
      fill: marbleDark,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // -- Subtle shadow on right side of entire tower --
    // A tall narrow rect on the right side to give depth
    api.brush.rect(
      TOWER_TOP_RADIUS - 4,
      currentY,
      5,
      towerBaseY - currentY - baseH,
      {
        fill: marbleDark,
        alpha: 0.3,
        blendMode: 'normal',
      },
    );

    api.brush.popMatrix();

    // ---- TOWER SHADOW ON GROUND ----
    // Elliptical shadow cast to the right (because tower leans right)
    api.brush.ellipse(towerBaseX + 30, towerBaseY + 4, 80, 10, {
      fill: isDark ? 0x111510 : 0x3a5a30,
      alpha: 0.6,
      blendMode: 'normal',
    });

    // ---- GROUND PLAZA DETAIL ----
    // Simple stone path / plaza around base
    api.brush.ellipse(towerBaseX, towerBaseY + 2, 100, 12, {
      fill: isDark ? 0x4a4a3a : 0xc8c0a8,
      alpha: 0.6,
      blendMode: 'normal',
    });
  },

  async teardown(): Promise<void> {
    clouds = [];
    swayPhase = 0;
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
