/**
 * EP Euro Tower Actor
 *
 * Europa-Park's iconic 75m Euro-Tower observation tower.
 * A slender spire rises from a landscaped base with trees, topped by
 * a disc-shaped rotating observation deck. A beacon light pulses at
 * the very top. The Black Forest silhouette frames the background.
 *
 * Supports light/dark display modes with adapted color palettes.
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
  id: 'ep-euro-tower',
  name: 'EP Euro Tower',
  description:
    'Europa-Park\'s 75m Euro-Tower observation tower with rotating deck, beacon light, surrounding trees, and Black Forest silhouette',
  author: { name: 'Taco Verdonschot', github: 'tacoverdonschot' },
  version: '1.0.0',
  tags: ['europapark', 'tower', 'observation', 'landmark'],
  createdAt: new Date(),
  preferredDuration: 60,
  requiredContexts: ['time', 'display'],
};

// ============================================================
// CONSTANTS
// ============================================================

const TOWER_WIDTH = 10;
const DECK_WIDTH = 70;
const DECK_HEIGHT = 18;

// Landscape
const MAX_TREES = 16;
const MAX_MOUNTAIN_POINTS = 24;
const MAX_DECK_WINDOWS = 12;
const MAX_STARS = 30;

// ============================================================
// STATE INTERFACES
// ============================================================

interface TreeState {
  x: number;
  y: number;
  height: number;
  width: number;
  sway: number;     // phase offset for gentle sway
}

interface MountainPoint {
  x: number;
  y: number;
}

interface WindowLight {
  angle: number;     // position around the deck (radians)
  brightness: number;
}

interface StarState {
  x: number;
  y: number;
  size: number;
  phase: number;
}

// ============================================================
// PRE-ALLOCATED STATE
// ============================================================

let canvasW = 0;
let canvasH = 0;

// Derived geometry (computed from actual canvas size in setup)
let towerBaseX = 0;
let towerBaseY = 0;
let deckY = 0;
let beaconY = 0;

// Trees at the base
let trees: TreeState[] = [];

// Mountain silhouette points
let mountainPoints: MountainPoint[] = [];

// Pre-allocated polygon arrays for mountains (reused each frame)
let farMountainPoly: { x: number; y: number }[] = [];
let nearMountainPoly: { x: number; y: number }[] = [];

// Window lights on observation deck
let deckWindows: WindowLight[] = [];

// Stars (for dark mode night sky)
let stars: StarState[] = [];

// Animation accumulators (no allocations in update)
let beaconPhase = 0;
let deckRotation = 0;
let glowTexture = '';

// ============================================================
// HELPERS
// ============================================================

function createGlowTexture(): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const dataUrl = canvas.toDataURL();
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}

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

    // Compute geometry from actual canvas size
    towerBaseX = canvasW * 0.5;
    towerBaseY = canvasH * 0.72;
    deckY = canvasH * 0.17;
    beaconY = canvasH * 0.12 - 6;

    // Pre-render glow texture
    glowTexture = createGlowTexture();

    // Reset animation
    beaconPhase = 0;
    deckRotation = 0;

    // Pre-allocate trees at the tower base
    trees = [];
    for (let i = 0; i < MAX_TREES; i++) {
      const side = i < MAX_TREES / 2 ? -1 : 1;
      const idx = i < MAX_TREES / 2 ? i : i - MAX_TREES / 2;
      const spread = 30 + idx * 22;
      trees.push({
        x: towerBaseX + side * spread + (seededRandom(i * 7) - 0.5) * 20,
        y: towerBaseY + seededRandom(i * 13) * 20 - 5,
        height: 30 + seededRandom(i * 19) * 35,
        width: 14 + seededRandom(i * 23) * 12,
        sway: seededRandom(i * 31) * Math.PI * 2,
      });
    }

    // Pre-allocate mountain silhouette
    mountainPoints = [];
    const mountainBaseY = canvasH * 0.55;
    const mountainPeakY = canvasH * 0.25;
    for (let i = 0; i < MAX_MOUNTAIN_POINTS; i++) {
      const t = i / (MAX_MOUNTAIN_POINTS - 1);
      const x = t * canvasW;
      // Generate a natural mountain silhouette using layered sine waves
      const y = mountainBaseY
        - Math.sin(t * Math.PI) * (mountainBaseY - mountainPeakY) * 0.4
        - Math.sin(t * Math.PI * 2.3 + 0.5) * 25
        - Math.sin(t * Math.PI * 5.7 + 1.2) * 12
        - seededRandom(i * 41) * 15;
      mountainPoints.push({ x, y });
    }

    // Pre-allocate mountain polygon arrays (reused each frame)
    // +2 for the two closing points at bottom corners
    farMountainPoly = [];
    nearMountainPoly = [];
    for (let i = 0; i < MAX_MOUNTAIN_POINTS + 2; i++) {
      farMountainPoly.push({ x: 0, y: 0 });
      nearMountainPoly.push({ x: 0, y: 0 });
    }

    // Pre-allocate deck windows
    deckWindows = [];
    for (let i = 0; i < MAX_DECK_WINDOWS; i++) {
      deckWindows.push({
        angle: (i / MAX_DECK_WINDOWS) * Math.PI * 2,
        brightness: 0.5 + seededRandom(i * 53) * 0.5,
      });
    }

    // Pre-allocate stars
    stars = [];
    for (let i = 0; i < MAX_STARS; i++) {
      stars.push({
        x: seededRandom(i * 67) * canvasW,
        y: seededRandom(i * 71) * canvasH * 0.4,
        size: 1 + seededRandom(i * 79) * 1.5,
        phase: seededRandom(i * 83) * Math.PI * 2,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    // Advance animations
    beaconPhase += dt * 1.8;
    deckRotation += dt * 0.15; // slow rotation

    // ---- COLOR PALETTE ----
    const skyDarkTop = isDark ? 0x0a0e2a : 0x6ba3d6;
    const skyDarkBot = isDark ? 0x1a1e3a : 0xa8cce8;
    const mountainColor = isDark ? 0x1a2a1a : 0x4a7a4a;
    const mountainFarColor = isDark ? 0x15201a : 0x6a9a6a;
    const treeColorDark = isDark ? 0x1a3a1a : 0x2a6a2a;
    const treeColorLight = isDark ? 0x2a5a2a : 0x3a8a3a;
    const towerColor = isDark ? 0x8899aa : 0x667788;
    const towerHighlight = isDark ? 0xaabbcc : 0x889aab;
    const deckColor = isDark ? 0x7788aa : 0x556688;
    const deckTopColor = isDark ? 0x99aabb : 0x778899;
    const windowColor = isDark ? 0xffdd88 : 0xeebb44;
    const beaconColor = isDark ? 0xff3333 : 0xcc2222;
    const groundColor = isDark ? 0x1a2a15 : 0x4a8a3a;
    const baseStructColor = isDark ? 0x556677 : 0x445566;

    // ---- SKY GRADIENT (using a tall rect with gradient) ----
    api.brush.rect(0, 0, canvasW, canvasH, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: skyDarkTop },
          { offset: 1, color: skyDarkBot },
        ],
      },
      alpha: 0.9,
      blendMode: 'normal',
    });

    // ---- STARS (dark mode only) ----
    if (isDark) {
      for (let i = 0; i < MAX_STARS; i++) {
        const s = stars[i];
        const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.5 + s.phase));
        if (twinkle < 0.05) continue;
        api.brush.circle(s.x, s.y, s.size, {
          fill: 0xffffff,
          alpha: twinkle * 0.8,
          blendMode: 'add',
        });
      }
    }

    // ---- FAR MOUNTAIN RANGE (Black Forest silhouette) ----
    // Update pre-allocated polygon points (no allocations)
    for (let i = 0; i < MAX_MOUNTAIN_POINTS; i++) {
      farMountainPoly[i].x = mountainPoints[i].x;
      farMountainPoly[i].y = mountainPoints[i].y - 20;
    }
    farMountainPoly[MAX_MOUNTAIN_POINTS].x = canvasW;
    farMountainPoly[MAX_MOUNTAIN_POINTS].y = towerBaseY + 30;
    farMountainPoly[MAX_MOUNTAIN_POINTS + 1].x = 0;
    farMountainPoly[MAX_MOUNTAIN_POINTS + 1].y = towerBaseY + 30;
    api.brush.polygon(farMountainPoly, {
      fill: mountainFarColor,
      alpha: isDark ? 0.7 : 0.6,
      blendMode: 'normal',
    });

    // ---- NEAR MOUNTAIN RANGE ----
    for (let i = 0; i < MAX_MOUNTAIN_POINTS; i++) {
      nearMountainPoly[i].x = mountainPoints[i].x;
      nearMountainPoly[i].y = mountainPoints[i].y + 15;
    }
    nearMountainPoly[MAX_MOUNTAIN_POINTS].x = canvasW;
    nearMountainPoly[MAX_MOUNTAIN_POINTS].y = towerBaseY + 30;
    nearMountainPoly[MAX_MOUNTAIN_POINTS + 1].x = 0;
    nearMountainPoly[MAX_MOUNTAIN_POINTS + 1].y = towerBaseY + 30;
    api.brush.polygon(nearMountainPoly, {
      fill: mountainColor,
      alpha: isDark ? 0.8 : 0.7,
      blendMode: 'normal',
    });

    // ---- GROUND ----
    api.brush.rect(0, towerBaseY - 10, canvasW, canvasH - towerBaseY + 10, {
      fill: groundColor,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Ground highlight
    api.brush.ellipse(towerBaseX, towerBaseY + 5, canvasW * 0.6, 30, {
      fill: isDark ? 0x2a3a20 : 0x5a9a4a,
      alpha: 0.7,
      blendMode: 'normal',
    });

    // ---- BACK TREES (behind tower) ----
    for (let i = 0; i < MAX_TREES / 2; i++) {
      const tr = trees[i];
      const sway = Math.sin(t * 0.6 + tr.sway) * 2;

      // Tree trunk
      api.brush.rect(tr.x - 2, tr.y - tr.height * 0.3, 4, tr.height * 0.4, {
        fill: isDark ? 0x3a2a1a : 0x5a4a3a,
        alpha: 0.8,
        blendMode: 'normal',
      });

      // Triangular canopy (using polygon)
      api.brush.polygon([
        { x: tr.x + sway, y: tr.y - tr.height },
        { x: tr.x - tr.width * 0.5, y: tr.y },
        { x: tr.x + tr.width * 0.5, y: tr.y },
      ], {
        fill: treeColorDark,
        alpha: 0.85,
        blendMode: 'normal',
      });

      // Lighter canopy overlay
      api.brush.polygon([
        { x: tr.x + sway + 2, y: tr.y - tr.height * 0.7 },
        { x: tr.x - tr.width * 0.3, y: tr.y - tr.height * 0.1 },
        { x: tr.x + tr.width * 0.35, y: tr.y - tr.height * 0.15 },
      ], {
        fill: treeColorLight,
        alpha: 0.6,
        blendMode: 'normal',
      });
    }

    // ---- TOWER BASE STRUCTURE ----
    // Wider base / entrance structure
    api.brush.rect(towerBaseX - 20, towerBaseY - 40, 40, 45, {
      fill: baseStructColor,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Base entrance arch
    api.brush.rect(towerBaseX - 8, towerBaseY - 25, 16, 30, {
      fill: isDark ? 0x222222 : 0x334455,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // ---- TOWER SHAFT ----
    // Main shaft with subtle gradient
    api.brush.rect(towerBaseX - TOWER_WIDTH / 2, deckY + DECK_HEIGHT / 2, TOWER_WIDTH, towerBaseY - deckY - DECK_HEIGHT / 2 - 35, {
      fill: {
        type: 'linear',
        x0: 0, y0: 0.5,
        x1: 1, y1: 0.5,
        stops: [
          { offset: 0, color: towerColor },
          { offset: 0.4, color: towerHighlight },
          { offset: 1, color: towerColor },
        ],
      },
      alpha: 0.95,
      blendMode: 'normal',
    });

    // Tower shaft highlight strip (metallic reflection)
    api.brush.rect(towerBaseX - 1, deckY + DECK_HEIGHT / 2, 3, towerBaseY - deckY - DECK_HEIGHT / 2 - 35, {
      fill: isDark ? 0xccddee : 0x99aabb,
      alpha: 0.3,
      blendMode: 'normal',
    });

    // ---- SPIRE (above deck to beacon) ----
    const spireBaseY = deckY - DECK_HEIGHT / 2;
    api.brush.polygon([
      { x: towerBaseX - 3, y: spireBaseY },
      { x: towerBaseX + 3, y: spireBaseY },
      { x: towerBaseX + 1, y: beaconY + 4 },
      { x: towerBaseX - 1, y: beaconY + 4 },
    ], {
      fill: towerHighlight,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // ---- OBSERVATION DECK ----
    // Deck bottom (underside shadow)
    api.brush.ellipse(towerBaseX, deckY + 4, DECK_WIDTH, 8, {
      fill: isDark ? 0x3a4a5a : 0x445566,
      alpha: 0.8,
      blendMode: 'normal',
    });

    // Main deck body
    api.brush.ellipse(towerBaseX, deckY, DECK_WIDTH, DECK_HEIGHT, {
      fill: {
        type: 'radial',
        cx: 0.5, cy: 0.4,
        radius: 0.5,
        stops: [
          { offset: 0, color: deckTopColor },
          { offset: 0.7, color: deckColor },
          { offset: 1, color: isDark ? 0x556677 : 0x445566 },
        ],
      },
      alpha: 0.95,
      blendMode: 'normal',
    });

    // Deck rim / railing
    api.brush.ellipse(towerBaseX, deckY - 2, DECK_WIDTH + 4, 6, {
      fill: isDark ? 0xaabbcc : 0x889aab,
      alpha: 0.7,
      blendMode: 'normal',
    });

    // ---- DECK WINDOW LIGHTS (simulated rotation) ----
    for (let i = 0; i < MAX_DECK_WINDOWS; i++) {
      const w = deckWindows[i];
      // Rotate window positions around the deck
      const angle = w.angle + deckRotation;
      const wx = towerBaseX + Math.cos(angle) * (DECK_WIDTH * 0.42);
      const wy = deckY + Math.sin(angle) * (DECK_HEIGHT * 0.25);

      // Only draw windows on the "visible" half (front-facing)
      const facing = Math.cos(angle);
      if (facing < -0.2) continue;

      const facingAlpha = 0.3 + facing * 0.7;
      const pulse = 0.7 + 0.3 * Math.sin(t * 1.2 + w.angle * 3);
      const windowAlpha = facingAlpha * pulse * w.brightness;

      if (windowAlpha < 0.05) continue;

      // Window glow
      api.brush.image(glowTexture, wx, wy, {
        width: 14,
        height: 14,
        tint: windowColor,
        alpha: windowAlpha * 0.6,
        blendMode: isDark ? 'add' : 'screen',
      });

      // Window core
      api.brush.circle(wx, wy, 2, {
        fill: windowColor,
        alpha: Math.min(windowAlpha * 0.9, 1),
        blendMode: isDark ? 'add' : 'normal',
      });
    }

    // ---- DECK REFLECTION SWEEP (rotating light highlight) ----
    const reflectAngle = deckRotation * 2;
    const reflectX = towerBaseX + Math.cos(reflectAngle) * (DECK_WIDTH * 0.3);
    const reflectAlpha = 0.15 + 0.1 * Math.sin(reflectAngle);
    api.brush.image(glowTexture, reflectX, deckY - 1, {
      width: 30,
      height: 12,
      tint: isDark ? 0xffffff : 0xccddee,
      alpha: reflectAlpha,
      blendMode: isDark ? 'add' : 'screen',
    });

    // ---- BEACON LIGHT ----
    const beaconPulse = 0.5 + 0.5 * Math.sin(beaconPhase);
    const beaconGlowSize = 40 + beaconPulse * 25;

    // Outer glow
    api.brush.image(glowTexture, towerBaseX, beaconY, {
      width: beaconGlowSize,
      height: beaconGlowSize,
      tint: beaconColor,
      alpha: 0.3 + beaconPulse * 0.3,
      blendMode: isDark ? 'add' : 'screen',
    });

    // Inner glow
    api.brush.image(glowTexture, towerBaseX, beaconY, {
      width: beaconGlowSize * 0.4,
      height: beaconGlowSize * 0.4,
      tint: isDark ? 0xff6666 : 0xff4444,
      alpha: 0.5 + beaconPulse * 0.4,
      blendMode: isDark ? 'add' : 'screen',
    });

    // Beacon core
    api.brush.circle(towerBaseX, beaconY, 3, {
      fill: isDark ? 0xff5555 : 0xcc3333,
      alpha: 0.7 + beaconPulse * 0.3,
      blendMode: 'normal',
    });

    // Beacon sweep ray (rotating beam)
    const beamAngle = beaconPhase * 0.7;
    const beamLen = 60 + beaconPulse * 20;
    const beamEndX = towerBaseX + Math.cos(beamAngle) * beamLen;
    const beamEndY = beaconY + Math.sin(beamAngle) * beamLen * 0.3;
    const beamAlpha = 0.08 + beaconPulse * 0.08;
    if (beamAlpha >= 0.05) {
      api.brush.line(towerBaseX, beaconY, beamEndX, beamEndY, {
        color: beaconColor,
        width: 3,
        alpha: beamAlpha,
        blendMode: isDark ? 'add' : 'screen',
      });
    }

    // ---- FRONT TREES (in front of tower) ----
    for (let i = MAX_TREES / 2; i < MAX_TREES; i++) {
      const tr = trees[i];
      const sway = Math.sin(t * 0.6 + tr.sway) * 2;

      // Tree trunk
      api.brush.rect(tr.x - 2.5, tr.y - tr.height * 0.3, 5, tr.height * 0.4, {
        fill: isDark ? 0x3a2a1a : 0x5a4a3a,
        alpha: 0.85,
        blendMode: 'normal',
      });

      // Triangular canopy
      api.brush.polygon([
        { x: tr.x + sway, y: tr.y - tr.height },
        { x: tr.x - tr.width * 0.5, y: tr.y },
        { x: tr.x + tr.width * 0.5, y: tr.y },
      ], {
        fill: treeColorDark,
        alpha: 0.9,
        blendMode: 'normal',
      });

      // Lighter canopy overlay
      api.brush.polygon([
        { x: tr.x + sway + 2, y: tr.y - tr.height * 0.7 },
        { x: tr.x - tr.width * 0.3, y: tr.y - tr.height * 0.1 },
        { x: tr.x + tr.width * 0.35, y: tr.y - tr.height * 0.15 },
      ], {
        fill: treeColorLight,
        alpha: 0.65,
        blendMode: 'normal',
      });
    }

    // ---- GROUND DETAILS ----
    // Circular path around base
    api.brush.ellipse(towerBaseX, towerBaseY + 8, 55, 10, {
      fill: isDark ? 0x3a3a2a : 0x8a8a6a,
      alpha: 0.6,
      blendMode: 'normal',
    });

    // Inner path
    api.brush.ellipse(towerBaseX, towerBaseY + 8, 40, 7, {
      fill: groundColor,
      alpha: 0.7,
      blendMode: 'normal',
    });
  },

  async teardown(): Promise<void> {
    trees = [];
    mountainPoints = [];
    farMountainPoly = [];
    nearMountainPoly = [];
    deckWindows = [];
    stars = [];
    beaconPhase = 0;
    deckRotation = 0;
    glowTexture = '';
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
