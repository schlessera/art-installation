/**
 * Death Star Trench Run
 *
 * A perspective flight through the Death Star trench, inspired by
 * the iconic attack run from Star Wars: A New Hope. Features scrolling
 * trench walls with panel details, a targeting computer overlay, and
 * laser bolts streaking past.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
  Point,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'trench-run',
  name: 'Death Star Trench Run',
  description:
    'Perspective flight through the Death Star trench with targeting computer overlay',
  author: {
    name: 'Rolf',
    github: 'rolfvandekrol',
  },
  version: '1.0.0',
  tags: ['space', 'scifi', 'starwars', 'perspective'],
  createdAt: new Date('2026-03-22'),
  preferredDuration: 30,
  requiredContexts: ['audio'],
};

// --- Layout ---
// Vanishing point high up — we're inside the trench looking forward
const VP_Y_FRAC = 0.15;
const STRIPS = 20;
const SCROLL_SPEED = 0.35;

// Trench cross-section: narrow floor, walls fill the screen
const FLOOR_HW = 0.14;   // narrow floor
const WALL_HW = 0.50;    // wall tops reach screen edges

// --- Pool sizes ---
const MAX_STARS = 30;
const MAX_GREEBLES = 16;
const MAX_LASERS = 6;

// --- Colors ---
const COL_SPACE = 0x020408;
const COL_SURFACE = 0x1a2030;     // Death Star surface (clearly visible)
const COL_SURFACE_LINE = 0x2a3448; // surface panel lines
const COL_WALL_NEAR = 0x283448;   // wall near viewer (brighter)
const COL_WALL_FAR = 0x141c28;    // wall at distance
const COL_WALL_LINE = 0x3a4c68;   // wall panel lines (bright)
const COL_EDGE = 0x4a5c78;        // bright edges at wall junctions
const COL_FLOOR = 0x101820;       // trench floor
const COL_FLOOR_LINE = 0x2a3848;  // floor grid lines
const COL_GREEBLE = 0x3a4860;
const COL_GREEBLE_LIT = 0x607890;
const COL_HUD = 0x00ff44;
const COL_LASER_GREEN = 0x44ff44;
const COL_LASER_RED = 0xff4444;

// --- State ---
let W = 0;
let H = 0;
let vpX = 0;
let vpY = 0;

// Pre-allocated polygon point arrays
const leftWallPts: Point[][] = [];
const rightWallPts: Point[][] = [];
const floorPts: Point[][] = [];
const leftSurfPts: Point[][] = [];
const rightSurfPts: Point[][] = [];

interface Star { x: number; y: number; size: number; phase: number }
let stars: Star[] = [];

interface Greeble {
  depth: number; side: number; vPos: number;
  w: number; h: number; color: number; active: boolean;
}
let greebles: Greeble[] = [];

interface Laser {
  depth: number; xFrac: number; color: number;
  speed: number; active: boolean;
}
let lasers: Laser[] = [];

let rngSeed = 0;
function rng(): number {
  rngSeed = (rngSeed * 16807) % 2147483647;
  return (rngSeed & 0x7fffffff) / 0x7fffffff;
}

let scrollOff = 0;
let lastLaserT = 0;
let startT = -1;

const wallColors: number[] = [];

// --- Perspective helpers ---
// perspective factor: 1 at near (bottom), 0 at vanishing point
function perspScale(depth: number): number {
  return 1 - depth * 0.97;
}

// Floor edge half-width at depth
function fhw(d: number): number { return W * FLOOR_HW * perspScale(d); }
// Wall top half-width at depth
function whw(d: number): number { return W * WALL_HW * perspScale(d); }
// Floor Y at depth
function fy(d: number): number { return vpY + (H - vpY) * (1 - d); }
// Wall top Y at depth — walls are very tall, nearly reaching the sky
function wty(d: number): number {
  const wallH = (H - vpY) * 0.9 * perspScale(d);
  return fy(d) - wallH;
}

function lerpCol(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t;
  const g = ((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * t;
  const bl = (a & 0xff) + ((b & 0xff) - (a & 0xff)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const s = api.canvas.getSize();
    W = s.width;
    H = s.height;
    vpX = W * 0.5;
    vpY = H * VP_Y_FRAC;
    rngSeed = 54321;
    scrollOff = 0;
    lastLaserT = 0;
    startT = -1;

    // Allocate polygon arrays
    leftWallPts.length = 0;
    rightWallPts.length = 0;
    floorPts.length = 0;
    leftSurfPts.length = 0;
    rightSurfPts.length = 0;
    for (let i = 0; i < STRIPS; i++) {
      const mkPts = () => {
        const a: Point[] = [];
        for (let j = 0; j < 4; j++) a.push({ x: 0, y: 0 });
        return a;
      };
      leftWallPts.push(mkPts());
      rightWallPts.push(mkPts());
      floorPts.push(mkPts());
      leftSurfPts.push(mkPts());
      rightSurfPts.push(mkPts());
    }

    // Wall colors per strip
    wallColors.length = 0;
    for (let i = 0; i < STRIPS; i++) {
      const t = (i + 0.5) / STRIPS;
      wallColors.push(lerpCol(COL_WALL_NEAR, COL_WALL_FAR, t * 0.9));
    }

    // Stars
    stars = [];
    for (let i = 0; i < MAX_STARS; i++) {
      stars.push({
        x: rng() * W, y: rng() * vpY,
        size: 0.5 + rng() * 1.5, phase: rng() * 6.28,
      });
    }

    // Greebles
    greebles = [];
    for (let i = 0; i < MAX_GREEBLES; i++) {
      greebles.push({
        depth: rng(), side: i < MAX_GREEBLES / 2 ? -1 : 1,
        vPos: 0.2 + rng() * 0.5,
        w: 0.02 + rng() * 0.03, h: 0.03 + rng() * 0.05,
        color: rng() > 0.7 ? COL_GREEBLE_LIT : COL_GREEBLE,
        active: true,
      });
    }

    // Lasers — pre-activate 3 so they're visible immediately
    lasers = [];
    const laserColors = [COL_LASER_GREEN, COL_LASER_RED, COL_LASER_GREEN,
                         COL_LASER_RED, COL_LASER_GREEN, COL_LASER_RED];
    for (let i = 0; i < MAX_LASERS; i++) {
      lasers.push({
        depth: 0.2 + (i * 0.15),
        xFrac: (i % 2 === 0 ? -0.3 : 0.3),
        color: laserColors[i],
        speed: 0.4 + i * 0.05,
        active: i < 3, // first 3 are active from the start
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    if (startT < 0) startT = t;
    const elapsed = t - startT;
    const dt = frame.delta / 1000;
    scrollOff = (t * SCROLL_SPEED) % 1;

    api.brush.background(COL_SPACE);

    // === Stars ===
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + s.phase));
      api.brush.circle(s.x, s.y, s.size, { fill: 0xffffff, alpha: tw * 0.8 });
    }

    // === Fill bottom corners (behind walls) so no black triangles show ===
    // Left corner
    api.brush.polygon([
      { x: 0, y: wty(0) },
      { x: 0, y: H },
      { x: vpX - fhw(0), y: H },
    ], { fill: COL_WALL_NEAR, alpha: 0.95 });
    // Right corner
    api.brush.polygon([
      { x: W, y: wty(0) },
      { x: W, y: H },
      { x: vpX + fhw(0), y: H },
    ], { fill: COL_WALL_NEAR, alpha: 0.95 });

    // === Death Star surface (above walls, extends to screen edges) ===
    for (let i = 0; i < STRIPS; i++) {
      const d0 = i / STRIPS;
      const d1 = (i + 1) / STRIPS;
      const y0 = wty(d0);
      const y1 = wty(d1);
      const hw0 = whw(d0);
      const hw1 = whw(d1);
      const a = 0.9 - d0 * 0.4;
      if (a < 0.05) continue;

      // Left surface
      const lp = leftSurfPts[i];
      lp[0].x = vpX - hw0; lp[0].y = y0;
      lp[1].x = 0;         lp[1].y = y0;
      lp[2].x = 0;         lp[2].y = y1;
      lp[3].x = vpX - hw1; lp[3].y = y1;
      api.brush.polygon(lp, { fill: COL_SURFACE, alpha: a });

      // Right surface
      const rp = rightSurfPts[i];
      rp[0].x = vpX + hw0; rp[0].y = y0;
      rp[1].x = W;         rp[1].y = y0;
      rp[2].x = W;         rp[2].y = y1;
      rp[3].x = vpX + hw1; rp[3].y = y1;
      api.brush.polygon(rp, { fill: COL_SURFACE, alpha: a });
    }

    // === Trench walls ===
    for (let i = 0; i < STRIPS; i++) {
      const d0 = i / STRIPS;
      const d1 = (i + 1) / STRIPS;

      const fy0 = fy(d0); const fy1 = fy(d1);
      const fhw0 = fhw(d0); const fhw1 = fhw(d1);
      const wty0 = wty(d0); const wty1 = wty(d1);
      const whw0 = whw(d0); const whw1 = whw(d1);

      const wa = 0.95 - d0 * 0.4;
      if (wa < 0.05) continue;

      // Left wall: from floor left edge up to wall top
      const lp = leftWallPts[i];
      lp[0].x = vpX - fhw0;  lp[0].y = fy0;   // bottom-near
      lp[1].x = vpX - whw0;  lp[1].y = wty0;  // top-near
      lp[2].x = vpX - whw1;  lp[2].y = wty1;  // top-far
      lp[3].x = vpX - fhw1;  lp[3].y = fy1;   // bottom-far
      api.brush.polygon(lp, { fill: wallColors[i], alpha: wa });

      // Right wall
      const rp = rightWallPts[i];
      rp[0].x = vpX + fhw0;  rp[0].y = fy0;
      rp[1].x = vpX + whw0;  rp[1].y = wty0;
      rp[2].x = vpX + whw1;  rp[2].y = wty1;
      rp[3].x = vpX + fhw1;  rp[3].y = fy1;
      api.brush.polygon(rp, { fill: wallColors[i], alpha: wa });

      // Wall panel lines (horizontal across wall face, 2 per strip)
      const lineA = 0.6 - d0 * 0.5;
      if (lineA > 0.08) {
        for (let ln = 1; ln <= 2; ln++) {
          const frac = ln / 3;
          // Left wall
          const llx0 = lp[0].x + (lp[1].x - lp[0].x) * frac;
          const lly0 = lp[0].y + (lp[1].y - lp[0].y) * frac;
          const llx1 = lp[3].x + (lp[2].x - lp[3].x) * frac;
          const lly1 = lp[3].y + (lp[2].y - lp[3].y) * frac;
          api.brush.line(llx0, lly0, llx1, lly1, { color: COL_WALL_LINE, alpha: lineA, width: 1 });
          // Right wall
          const rlx0 = rp[0].x + (rp[1].x - rp[0].x) * frac;
          const rly0 = rp[0].y + (rp[1].y - rp[0].y) * frac;
          const rlx1 = rp[3].x + (rp[2].x - rp[3].x) * frac;
          const rly1 = rp[3].y + (rp[2].y - rp[3].y) * frac;
          api.brush.line(rlx0, rly0, rlx1, rly1, { color: COL_WALL_LINE, alpha: lineA, width: 1 });
        }
      }
    }

    // === Bright edge lines where walls meet floor ===
    // Left floor edge
    api.brush.line(vpX - fhw(0), fy(0), vpX, vpY, { color: COL_EDGE, alpha: 0.7, width: 1.5 });
    // Right floor edge
    api.brush.line(vpX + fhw(0), fy(0), vpX, vpY, { color: COL_EDGE, alpha: 0.7, width: 1.5 });
    // Left wall top edge
    api.brush.line(vpX - whw(0), wty(0), vpX, vpY, { color: COL_EDGE, alpha: 0.5, width: 1 });
    // Right wall top edge
    api.brush.line(vpX + whw(0), wty(0), vpX, vpY, { color: COL_EDGE, alpha: 0.5, width: 1 });

    // === Trench floor ===
    for (let i = 0; i < STRIPS; i++) {
      const d0 = i / STRIPS;
      const d1 = (i + 1) / STRIPS;
      const y0 = fy(d0); const y1 = fy(d1);
      const hw0 = fhw(d0); const hw1 = fhw(d1);

      const fp = floorPts[i];
      fp[0].x = vpX - hw0; fp[0].y = y0;
      fp[1].x = vpX + hw0; fp[1].y = y0;
      fp[2].x = vpX + hw1; fp[2].y = y1;
      fp[3].x = vpX - hw1; fp[3].y = y1;

      const fa = 0.9 - d0 * 0.4;
      if (fa < 0.05) continue;
      api.brush.polygon(fp, { fill: COL_FLOOR, alpha: fa });

      // Scrolling horizontal lines on floor
      const phase = ((d0 + scrollOff) % 0.1) / 0.1;
      if (phase < 0.25) {
        const la = 0.6 - d0 * 0.45;
        if (la > 0.05) {
          const ly = y0 + (y1 - y0) * phase;
          const lhw = hw0 + (hw1 - hw0) * phase;
          api.brush.line(vpX - lhw, ly, vpX + lhw, ly, { color: COL_FLOOR_LINE, alpha: la, width: 1 });
        }
      }
    }

    // Floor center line
    api.brush.line(vpX, fy(0), vpX, fy(0.9), { color: COL_FLOOR_LINE, alpha: 0.4, width: 1 });

    // === Greebles ===
    for (let i = 0; i < greebles.length; i++) {
      const g = greebles[i];
      if (!g.active) continue;
      g.depth -= dt * SCROLL_SPEED;
      if (g.depth < -0.05) {
        g.depth = 0.85 + rng() * 0.15;
        g.vPos = 0.2 + rng() * 0.5;
        g.w = 0.02 + rng() * 0.03;
        g.h = 0.03 + rng() * 0.05;
      }
      if (g.depth < 0 || g.depth > 1) continue;

      const ps = perspScale(g.depth);
      const gfy = fy(g.depth);
      const gwty = wty(g.depth);
      const gfhw = fhw(g.depth);
      const gwhw = whw(g.depth);

      // Position on wall face
      const vt = g.vPos;
      const gx = vpX + g.side * (gfhw + (gwhw - gfhw) * vt);
      const gy = gfy + (gwty - gfy) * vt;
      const gw = W * g.w * ps;
      const gh = H * g.h * ps;
      const ga = 0.7 - g.depth * 0.5;
      if (ga > 0.05 && gw > 1 && gh > 1) {
        api.brush.rect(gx - gw / 2, gy - gh / 2, gw, gh, { fill: g.color, alpha: ga });
      }
    }

    // === Lasers ===
    // Spawn every 0.5 seconds
    if (t - lastLaserT > 0.5) {
      let laser: Laser | null = null;
      for (let li = 0; li < lasers.length; li++) {
        if (!lasers[li].active) { laser = lasers[li]; break; }
      }
      if (laser) {
        laser.active = true;
        laser.depth = 0.85;
        laser.xFrac = (rng() - 0.5) * 0.6;
        laser.color = rng() > 0.5 ? COL_LASER_RED : COL_LASER_GREEN;
        laser.speed = 0.5 + rng() * 0.3;
        lastLaserT = t;
      }
    }

    // === Lasers (pure math, no state) ===
    // 6 laser bolts flying through the trench toward the viewer
    const laserCount = 6;
    const laserInterval = 0.8;
    const laserSpeed = 0.75;
    // Varied positions and colors — mixed sides and heights
    const laserXOff = [-0.5, 0.6, 0.15, -0.35, 0.45, -0.1];
    const laserHOff = [0.55, 0.65, 0.7, 0.6, 0.5, 0.75];
    const laserCols = [COL_LASER_GREEN, COL_LASER_GREEN, COL_LASER_RED,
                       COL_LASER_RED, COL_LASER_GREEN, COL_LASER_RED];

    for (let i = 0; i < laserCount; i++) {
      const laserAge = elapsed - i * laserInterval;
      if (laserAge < 0) continue;
      // Cycle long enough to fully exit screen (depth -0.8 is well past bottom)
      const travelDist = 1.8;
      const cycleDur = travelDist / laserSpeed;
      const cycleAge = laserAge % (cycleDur + 0.5);
      const depth = 0.95 - cycleAge * laserSpeed;
      if (depth > 0.95 || depth < -0.8) continue;

      const boltLen = 0.03 + Math.max(0, 1 - depth) * 0.12;
      const d0 = depth;
      const d1 = Math.min(depth + boltLen, 0.95);

      // X: spread across trench, scaling with perspective
      const xOff = laserXOff[i];
      const ps0 = 1 - d0 * 0.97;
      const ps1 = 1 - d1 * 0.97;
      const x0 = vpX + xOff * W * 0.35 * ps0;
      const x1 = vpX + xOff * W * 0.35 * ps1;

      // Y: simple line from vanishing point that goes off-screen at negative depths
      const hOff = laserHOff[i];
      const y0 = vpY + (H - vpY) * (1 - d0) * (1 - hOff * 0.4);
      const y1 = vpY + (H - vpY) * (1 - d1) * (1 - hOff * 0.4);

      // Subtle perspective scaling
      const scale = Math.max(0, 1 - d0);
      const glowW = 2 + scale * 4;
      const coreW = 1 + scale * 1.5;

      // Colored glow
      api.brush.line(x0, y0, x1, y1, {
        color: laserCols[i], alpha: 0.9, width: glowW,
      });
      // White-hot core
      api.brush.line(x0, y0, x1, y1, {
        color: 0xffffff, alpha: 0.85, width: coreW,
      });
    }

    // === HUD Targeting Computer ===
    const cx = W / 2;
    const cy = H * 0.38;
    const bSize = 50; // fixed size
    const bLen = 12;

    const bx0 = cx - bSize;
    const bx1 = cx + bSize;
    const by0 = cy - bSize;
    const by1 = cy + bSize;

    // Corner brackets
    api.brush.line(bx0, by0, bx0 + bLen, by0, { color: COL_HUD, alpha: 0.85, width: 2 });
    api.brush.line(bx0, by0, bx0, by0 + bLen, { color: COL_HUD, alpha: 0.85, width: 2 });
    api.brush.line(bx1, by0, bx1 - bLen, by0, { color: COL_HUD, alpha: 0.85, width: 2 });
    api.brush.line(bx1, by0, bx1, by0 + bLen, { color: COL_HUD, alpha: 0.85, width: 2 });
    api.brush.line(bx0, by1, bx0 + bLen, by1, { color: COL_HUD, alpha: 0.85, width: 2 });
    api.brush.line(bx0, by1, bx0, by1 - bLen, { color: COL_HUD, alpha: 0.85, width: 2 });
    api.brush.line(bx1, by1, bx1 - bLen, by1, { color: COL_HUD, alpha: 0.85, width: 2 });
    api.brush.line(bx1, by1, bx1, by1 - bLen, { color: COL_HUD, alpha: 0.85, width: 2 });

    // Crosshair dot
    api.brush.circle(cx, cy, 2, { fill: COL_HUD, alpha: 0.7 });

    // Targeting circle
    const cR = bSize * 0.5;
    if (cR > 4) {
      api.brush.circle(cx, cy, cR, { stroke: COL_HUD, strokeWidth: 1, alpha: 0.35 });
    }

    // CRT scanlines (sparse)
    const slSpace = H / 6;
    const slPhase = (t * 25) % slSpace;
    for (let si = 0; si < 6; si++) {
      const sy = (si * slSpace + slPhase) % H;
      api.brush.line(0, sy, W, sy, { color: COL_HUD, alpha: 0.07, width: 1 });
    }

    // "FIRE" blinks after 25 seconds
    if (elapsed > 25) {
      const flash = 0.5 + 0.5 * Math.sin(t * 8);
      api.brush.text('FIRE', cx, by1 + 18, {
        fill: COL_HUD, alpha: flash * 0.9, fontSize: 12,
        font: 'monospace', align: 'center', baseline: 'top',
      });
    }
  },

  async teardown(): Promise<void> {
    W = 0; H = 0; vpX = 0; vpY = 0;
    leftWallPts.length = 0; rightWallPts.length = 0;
    floorPts.length = 0; leftSurfPts.length = 0; rightSurfPts.length = 0;
    stars = []; greebles = []; lasers = [];
    scrollOff = 0; lastLaserT = 0; startT = -1;
    wallColors.length = 0;
  },
};

registerActor(actor);
export default actor;
