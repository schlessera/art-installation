/**
 * EP Wodan Coaster — Foreground Actor
 *
 * Europa-Park's Wodan Timbur Coaster: a massive GCI wooden roller coaster
 * in the Iceland area. Features interlocking lattice-work timber structure,
 * brown wood construction, dramatic drops, and torch-lit ambiance.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'ep-wodan-coaster',
  name: 'EP Wodan Coaster',
  description:
    'Massive wooden roller coaster with interlocking lattice timber structure, torch-lit ambiance, and a coaster train weaving through dramatic drops',
  author: { name: 'Taco Verdonschot', github: 'tacoverdonschot' },
  version: '1.0.0',
  tags: ['europapark', 'coaster', 'wooden', 'wodan', 'timber'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 45,
  requiredContexts: ['display'],
  role: 'foreground',
};

// --- Constants ---
const MAX_TRACK_PTS = 60;
const MAX_VERTICAL_BEAMS = 30;
const MAX_CROSS_BRACES = 60;
const MAX_TORCHES = 10;
const MAX_TRAIN_CARS = 5;
const MAX_SWAY_BEAMS = 20;

// Colors — warm brown/amber wood tones
const WOOD_DARK = 0x4a2e10;
const WOOD_MED = 0x6b3f1a;
const WOOD_LIGHT = 0x8b5a2b;
const WOOD_HIGHLIGHT = 0xa0703c;
const TRACK_RAIL = 0x3e2208;
const TRACK_RAIL_LIGHT = 0x5c3a1e;
const TORCH_ORANGE = 0xff8c00;
const TORCH_YELLOW = 0xffcc33;
const TORCH_RED = 0xff5500;
const TRAIN_BODY = 0x5c1a0a;
const TRAIN_BODY_LIGHT = 0x7a2e14;

// --- Interfaces ---
interface TrackPoint {
  x: number;
  y: number;
}

interface VerticalBeam {
  active: boolean;
  topX: number;
  topY: number;
  bottomY: number;
  thickness: number;
  swayPhase: number;
}

interface CrossBrace {
  active: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
}

interface Torch {
  active: boolean;
  x: number;
  y: number;
  flickerPhase: number;
  flickerSpeed: number;
  baseSize: number;
}

interface TrainCar {
  active: boolean;
  trackParam: number;
  width: number;
  height: number;
}

// --- Pre-allocated state ---
let canvasW = 0;
let canvasH = 0;
let trackPoints: TrackPoint[] = [];
let trackPointCount = 0;
let verticalBeams: VerticalBeam[] = [];
let crossBraces: CrossBrace[] = [];
let torches: Torch[] = [];
let trainCars: TrainCar[] = [];
let trainSpeed = 0;
let trainPosition = 0;
let glowDataUrl = '';

// Reusable style objects
const beamStyle = { color: 0x000000, width: 3, alpha: 0.9, blendMode: 'normal' as const };
const braceStyle = { color: 0x000000, width: 2, alpha: 0.8, blendMode: 'normal' as const };
const railStyle = { color: 0x000000, width: 3.5, alpha: 0.95, blendMode: 'normal' as const };
const tieStyle = { color: 0x000000, width: 2.5, alpha: 0.85, blendMode: 'normal' as const };
const trainStyle = { fill: 0x000000, alpha: 0.9, blendMode: 'normal' as const };

/** Get track Y at a given normalized parameter (0-1) along the track */
function getTrackY(param: number): number {
  // Create a roller coaster profile: big drop, hill, smaller drop, hill, rise
  const p = param * Math.PI * 2;
  const baseY = canvasH * 0.35;
  // Main shape: start high (lift hill), big drop, two hills
  const lift = Math.max(0, 1 - param * 5) * canvasH * 0.18;
  const drop1 = Math.sin(p * 1.2 + 0.5) * canvasH * 0.15;
  const drop2 = Math.sin(p * 2.4 + 1.0) * canvasH * 0.08;
  const undulation = Math.sin(p * 3.6) * canvasH * 0.04;
  return baseY - lift + drop1 + drop2 + undulation;
}

/** Get track X at a given normalized parameter (0-1) */
function getTrackX(param: number): number {
  return canvasW * 0.05 + param * canvasW * 0.9;
}

/** Interpolate position on the track at normalized t (0-1) */
function getTrackPos(t: number, out: TrackPoint): void {
  // Clamp
  const ct = t < 0 ? t + 1 : t >= 1 ? t - 1 : t;
  // Find segment
  const idx = ct * (trackPointCount - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, trackPointCount - 1);
  const frac = idx - i0;
  out.x = trackPoints[i0].x + (trackPoints[i1].x - trackPoints[i0].x) * frac;
  out.y = trackPoints[i0].y + (trackPoints[i1].y - trackPoints[i0].y) * frac;
}

/** Get track angle at normalized t */
function getTrackAngle(t: number): number {
  const ct = t < 0 ? t + 1 : t >= 1 ? t - 1 : t;
  const idx = ct * (trackPointCount - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, trackPointCount - 1);
  const dx = trackPoints[i1].x - trackPoints[i0].x;
  const dy = trackPoints[i1].y - trackPoints[i0].y;
  return Math.atan2(dy, dx);
}

function buildStructure(): void {
  // Build track profile points
  trackPointCount = MAX_TRACK_PTS;
  for (let i = 0; i < trackPointCount; i++) {
    const param = i / (trackPointCount - 1);
    trackPoints[i].x = getTrackX(param);
    trackPoints[i].y = getTrackY(param);
  }

  // Ground level
  const groundY = canvasH * 0.88;

  // Build vertical support beams from track down to ground
  let beamIdx = 0;
  const beamSpacing = Math.floor(trackPointCount / MAX_VERTICAL_BEAMS);
  for (let i = 0; i < trackPointCount && beamIdx < MAX_VERTICAL_BEAMS; i += Math.max(2, beamSpacing)) {
    const pt = trackPoints[i];
    verticalBeams[beamIdx].active = true;
    verticalBeams[beamIdx].topX = pt.x;
    verticalBeams[beamIdx].topY = pt.y;
    verticalBeams[beamIdx].bottomY = groundY;
    verticalBeams[beamIdx].thickness = 3 + Math.random() * 1.5;
    verticalBeams[beamIdx].swayPhase = Math.random() * Math.PI * 2;
    beamIdx++;
  }

  // Build cross-braces between adjacent vertical beams
  let braceIdx = 0;
  for (let i = 0; i < beamIdx - 1 && braceIdx < MAX_CROSS_BRACES - 4; i++) {
    const b1 = verticalBeams[i];
    const b2 = verticalBeams[i + 1];
    if (!b1.active || !b2.active) continue;

    const beamHeight = b1.bottomY - b1.topY;
    // Number of X-braces depends on height
    const xCount = Math.max(1, Math.floor(beamHeight / 60));

    for (let j = 0; j < xCount && braceIdx < MAX_CROSS_BRACES - 1; j++) {
      const t0 = j / xCount;
      const t1 = (j + 1) / xCount;

      const y1Top = b1.topY + beamHeight * t0;
      const y1Bot = b1.topY + beamHeight * t1;
      const y2Top = b2.topY + (b2.bottomY - b2.topY) * t0;
      const y2Bot = b2.topY + (b2.bottomY - b2.topY) * t1;

      // X-brace: diagonal from top-left to bottom-right
      crossBraces[braceIdx].active = true;
      crossBraces[braceIdx].x1 = b1.topX;
      crossBraces[braceIdx].y1 = y1Top;
      crossBraces[braceIdx].x2 = b2.topX;
      crossBraces[braceIdx].y2 = y2Bot;
      crossBraces[braceIdx].thickness = 1.5 + Math.random() * 0.5;
      braceIdx++;

      // X-brace: diagonal from bottom-left to top-right
      crossBraces[braceIdx].active = true;
      crossBraces[braceIdx].x1 = b1.topX;
      crossBraces[braceIdx].y1 = y1Bot;
      crossBraces[braceIdx].x2 = b2.topX;
      crossBraces[braceIdx].y2 = y2Top;
      crossBraces[braceIdx].thickness = 1.5 + Math.random() * 0.5;
      braceIdx++;
    }
  }

  // Horizontal stringers between beams at intervals
  for (let i = 0; i < beamIdx - 1 && braceIdx < MAX_CROSS_BRACES; i++) {
    const b1 = verticalBeams[i];
    const b2 = verticalBeams[i + 1];
    if (!b1.active || !b2.active) continue;

    const midY = (b1.topY + b1.bottomY) * 0.5;
    crossBraces[braceIdx].active = true;
    crossBraces[braceIdx].x1 = b1.topX;
    crossBraces[braceIdx].y1 = midY;
    crossBraces[braceIdx].x2 = b2.topX;
    crossBraces[braceIdx].y2 = (b2.topY + b2.bottomY) * 0.5;
    crossBraces[braceIdx].thickness = 2;
    braceIdx++;
  }

  // Place torches along the structure
  let torchIdx = 0;
  const torchSpacing = Math.max(3, Math.floor(beamIdx / MAX_TORCHES));
  for (let i = 1; i < beamIdx && torchIdx < MAX_TORCHES; i += torchSpacing) {
    const b = verticalBeams[i];
    if (!b.active) continue;
    torches[torchIdx].active = true;
    torches[torchIdx].x = b.topX + (Math.random() - 0.5) * 6;
    torches[torchIdx].y = b.topY + (b.bottomY - b.topY) * (0.15 + Math.random() * 0.2);
    torches[torchIdx].flickerPhase = Math.random() * Math.PI * 2;
    torches[torchIdx].flickerSpeed = 3 + Math.random() * 4;
    torches[torchIdx].baseSize = 6 + Math.random() * 4;
    torchIdx++;
  }

  // Init train cars
  for (let i = 0; i < MAX_TRAIN_CARS; i++) {
    trainCars[i].active = true;
    trainCars[i].trackParam = 0;
    trainCars[i].width = 14;
    trainCars[i].height = 8;
  }
}

const tmpPos: TrackPoint = { x: 0, y: 0 };

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-allocate track points
    trackPoints = [];
    for (let i = 0; i < MAX_TRACK_PTS; i++) {
      trackPoints.push({ x: 0, y: 0 });
    }

    // Pre-allocate vertical beams
    verticalBeams = [];
    for (let i = 0; i < MAX_VERTICAL_BEAMS; i++) {
      verticalBeams.push({ active: false, topX: 0, topY: 0, bottomY: 0, thickness: 3, swayPhase: 0 });
    }

    // Pre-allocate cross braces
    crossBraces = [];
    for (let i = 0; i < MAX_CROSS_BRACES; i++) {
      crossBraces.push({ active: false, x1: 0, y1: 0, x2: 0, y2: 0, thickness: 2 });
    }

    // Pre-allocate torches
    torches = [];
    for (let i = 0; i < MAX_TORCHES; i++) {
      torches.push({ active: false, x: 0, y: 0, flickerPhase: 0, flickerSpeed: 4, baseSize: 8 });
    }

    // Pre-allocate train cars
    trainCars = [];
    for (let i = 0; i < MAX_TRAIN_CARS; i++) {
      trainCars.push({ active: false, trackParam: 0, width: 14, height: 8 });
    }

    trainPosition = 0;
    trainSpeed = 0.03; // normalized units per second

    // Pre-render glow texture for torches
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = c.toDataURL();
    c.width = 0;
    c.height = 0;

    buildStructure();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = frame.deltaTime / 1000;
    const isDark = api.context.display.isDarkMode();

    const woodMain = isDark ? WOOD_MED : WOOD_LIGHT;
    const woodAccent = isDark ? WOOD_DARK : WOOD_MED;
    const woodBrace = isDark ? WOOD_LIGHT : WOOD_HIGHLIGHT;
    const trackColor = isDark ? TRACK_RAIL : TRACK_RAIL_LIGHT;
    const trainColor = isDark ? TRAIN_BODY : TRAIN_BODY_LIGHT;

    // Subtle global sway for "wood creaking" visual effect
    const globalSwayX = Math.sin(t * 0.3) * 0.5;
    const globalSwayY = Math.sin(t * 0.5) * 0.3;

    // --- Draw vertical support beams ---
    beamStyle.color = woodMain;
    for (let i = 0; i < MAX_VERTICAL_BEAMS; i++) {
      const b = verticalBeams[i];
      if (!b.active) continue;

      const sway = Math.sin(t * 0.7 + b.swayPhase) * 0.8 + globalSwayX;
      const topX = b.topX + sway;
      const botX = b.topX + sway * 0.3; // less sway at base

      beamStyle.width = b.thickness;
      beamStyle.color = woodMain;
      api.brush.line(topX, b.topY + globalSwayY, botX, b.bottomY, beamStyle);

      // Thinner highlight edge for wood grain effect
      beamStyle.width = 1;
      beamStyle.color = woodBrace;
      beamStyle.alpha = 0.3;
      api.brush.line(topX + 1, b.topY + globalSwayY, botX + 1, b.bottomY, beamStyle);
      beamStyle.alpha = 0.9;
    }

    // --- Draw cross braces (lattice work) ---
    for (let i = 0; i < MAX_CROSS_BRACES; i++) {
      const cb = crossBraces[i];
      if (!cb.active) continue;

      const sway1 = Math.sin(t * 0.7 + cb.x1 * 0.01) * 0.6 + globalSwayX;
      const sway2 = Math.sin(t * 0.7 + cb.x2 * 0.01) * 0.6 + globalSwayX;

      braceStyle.width = cb.thickness;
      braceStyle.color = woodAccent;
      api.brush.line(
        cb.x1 + sway1,
        cb.y1 + globalSwayY,
        cb.x2 + sway2,
        cb.y2 + globalSwayY,
        braceStyle,
      );
    }

    // --- Draw track (two rails with cross ties) ---
    const railOffset = 4; // half-gauge distance
    railStyle.color = trackColor;

    // Draw rails as connected line segments
    for (let i = 0; i < trackPointCount - 1; i++) {
      const p0 = trackPoints[i];
      const p1 = trackPoints[i + 1];

      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.01) continue;
      const nx = -dy / len * railOffset;
      const ny = dx / len * railOffset;

      const sw0 = Math.sin(t * 0.7 + p0.x * 0.01) * 0.6 + globalSwayX;
      const sw1 = Math.sin(t * 0.7 + p1.x * 0.01) * 0.6 + globalSwayX;
      const sy = globalSwayY;

      // Left rail
      railStyle.width = 3;
      api.brush.line(
        p0.x + nx + sw0, p0.y + ny + sy,
        p1.x + nx + sw1, p1.y + ny + sy,
        railStyle,
      );

      // Right rail
      api.brush.line(
        p0.x - nx + sw0, p0.y - ny + sy,
        p1.x - nx + sw1, p1.y - ny + sy,
        railStyle,
      );

      // Cross ties every ~3 segments
      if (i % 3 === 0) {
        tieStyle.color = woodAccent;
        api.brush.line(
          p0.x + nx * 1.3 + sw0, p0.y + ny * 1.3 + sy,
          p0.x - nx * 1.3 + sw0, p0.y - ny * 1.3 + sy,
          tieStyle,
        );
      }
    }

    // --- Animate train along track ---
    trainPosition = (trainPosition + trainSpeed * dt) % 1;

    const carSpacing = 0.025; // spacing between cars in track parameter
    for (let c = 0; c < MAX_TRAIN_CARS; c++) {
      const car = trainCars[c];
      if (!car.active) continue;

      let carParam = trainPosition - c * carSpacing;
      if (carParam < 0) carParam += 1;

      getTrackPos(carParam, tmpPos);
      const angle = getTrackAngle(carParam);
      const sw = Math.sin(t * 0.7 + tmpPos.x * 0.01) * 0.6 + globalSwayX;

      const cx = tmpPos.x + sw;
      const cy = tmpPos.y + globalSwayY - 6; // sit above the track

      api.brush.pushMatrix();
      api.brush.translate(cx, cy);
      api.brush.rotate(angle);

      // Car body
      trainStyle.fill = trainColor;
      api.brush.rect(-car.width * 0.5, -car.height * 0.5, car.width, car.height, trainStyle);

      // Wheel accents
      api.brush.circle(-car.width * 0.3, car.height * 0.4, 2, {
        fill: 0x222222,
        alpha: 0.8,
        blendMode: 'normal',
      });
      api.brush.circle(car.width * 0.3, car.height * 0.4, 2, {
        fill: 0x222222,
        alpha: 0.8,
        blendMode: 'normal',
      });

      api.brush.popMatrix();
    }

    // --- Draw torches with flickering fire ---
    for (let i = 0; i < MAX_TORCHES; i++) {
      const torch = torches[i];
      if (!torch.active) continue;

      const flicker1 = Math.sin(t * torch.flickerSpeed + torch.flickerPhase) * 0.3;
      const flicker2 = Math.sin(t * torch.flickerSpeed * 1.7 + torch.flickerPhase * 2.3) * 0.2;
      const flicker3 = Math.cos(t * torch.flickerSpeed * 0.8 + torch.flickerPhase * 0.7) * 0.15;
      const flickerTotal = 1 + flicker1 + flicker2 + flicker3;
      const size = torch.baseSize * flickerTotal;

      const sw = Math.sin(t * 0.7 + torch.x * 0.01) * 0.6 + globalSwayX;
      const tx = torch.x + sw;
      const ty = torch.y + globalSwayY;

      // Torch bracket (small line)
      api.brush.line(tx, ty, tx, ty + 8, {
        color: WOOD_DARK,
        width: 2.5,
        alpha: 0.9,
        blendMode: 'normal',
      });

      // Outer glow
      api.brush.image(glowDataUrl, tx, ty, {
        width: size * 6,
        height: size * 6,
        tint: TORCH_ORANGE,
        alpha: (0.2 + flicker1 * 0.1) * (isDark ? 1 : 0.5),
        blendMode: 'add',
      });

      // Inner glow
      api.brush.image(glowDataUrl, tx, ty - 2, {
        width: size * 3,
        height: size * 3,
        tint: TORCH_YELLOW,
        alpha: (0.4 + flicker2 * 0.15) * (isDark ? 1 : 0.6),
        blendMode: 'add',
      });

      // Flame tip — flickers upward
      const tipOffsetX = flicker3 * 3;
      const tipOffsetY = -size * 0.6 + flicker1 * 2;
      api.brush.circle(tx + tipOffsetX, ty + tipOffsetY, size * 0.35, {
        fill: TORCH_RED,
        alpha: 0.6 + flicker2 * 0.2,
        blendMode: 'add',
      });

      // Core flame
      api.brush.circle(tx, ty - 1, size * 0.5, {
        fill: TORCH_YELLOW,
        alpha: 0.7 + flicker1 * 0.15,
        blendMode: 'add',
      });
    }

    // --- Ground / foundation line ---
    const groundY = canvasH * 0.88;
    api.brush.line(canvasW * 0.02, groundY, canvasW * 0.98, groundY, {
      color: isDark ? WOOD_DARK : WOOD_MED,
      width: 4,
      alpha: 0.7,
      blendMode: 'normal',
    });

    // Foundation cross-hatching under ground line
    for (let x = canvasW * 0.05; x < canvasW * 0.95; x += 25) {
      const fAlpha = 0.3 + Math.sin(x * 0.1) * 0.1;
      if (fAlpha < 0.05) continue;
      api.brush.line(x, groundY, x + 10, groundY + 12, {
        color: woodAccent,
        width: 1.5,
        alpha: fAlpha,
        blendMode: 'normal',
      });
    }
  },

  async teardown(): Promise<void> {
    trackPoints = [];
    trackPointCount = 0;
    verticalBeams = [];
    crossBraces = [];
    torches = [];
    trainCars = [];
    trainPosition = 0;
    trainSpeed = 0;
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
