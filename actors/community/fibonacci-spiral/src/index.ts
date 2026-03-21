/**
 * Fibonacci Spiral
 *
 * Golden ratio spiral growing from center outward, drawn as quarter-circle
 * arcs each larger than the last by phi (1.618). Adjacent Fibonacci
 * rectangles are shown as outlines, with marble-texture colors and small
 * golden dots at key intersection points. The spiral slowly rotates and
 * extends outward over time.
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
  id: 'fibonacci-spiral',
  name: 'Fibonacci Spiral',
  description:
    'Golden ratio spiral with Fibonacci rectangle decomposition in marble tones',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'fibonacci', 'math', 'golden-ratio'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 45,
  requiredContexts: ['time', 'display'],
};

// -- Constants --

const PHI = 1.618033988749895;
const HALF_PI = Math.PI / 2;

// Marble palette
const CREAM = 0xe8dcc8;
const GREY = 0xc8c0b0;
const GOLD = 0xd4aa44;

// Number of Fibonacci rectangles / arcs to draw
const NUM_RECTS = 14;

// Pre-computed Fibonacci sizes (normalised; scaled at draw time)
// fib[0]=1, fib[1]=1, fib[2]=2, ...
const FIB_SIZES: number[] = [];
// Cumulative corner offsets for each rectangle relative to origin
// Each rect: { x, y, size, arcStartAngle }
interface RectDef {
  x: number;
  y: number;
  size: number;
  startAngle: number; // arc start angle for this quarter-turn
  arcCenterDx: number; // arc center offset inside rect (corner the arc pivots on)
  arcCenterDy: number;
}

const RECT_DEFS: RectDef[] = [];

// Pre-compute the rectangle layout
(function precompute() {
  // Fibonacci sequence
  FIB_SIZES[0] = 1;
  FIB_SIZES[1] = 1;
  for (let i = 2; i < NUM_RECTS; i++) {
    FIB_SIZES[i] = FIB_SIZES[i - 1] + FIB_SIZES[i - 2];
  }

  // Build rectangles.  Each new rectangle is placed adjacent to the
  // previous one, cycling through four directions: right, up, left, down.
  // We track the "cursor" corner where the next rect attaches.

  let cx = 0; // current rect origin x (bottom-left of rect in local coords)
  let cy = 0;

  for (let i = 0; i < NUM_RECTS; i++) {
    const s = FIB_SIZES[i];
    // Direction cycles every 4 steps: 0=right, 1=up, 2=left, 3=down
    const dir = i % 4;

    let rx: number;
    let ry: number;
    let acDx: number;
    let acDy: number;
    let angle: number;

    if (i === 0) {
      rx = 0;
      ry = 0;
      // Arc pivots on bottom-right corner, sweeps from 3pi/2 to 2pi
      acDx = s;
      acDy = s;
      angle = Math.PI;
    } else if (i === 1) {
      rx = FIB_SIZES[0];
      ry = 0;
      acDx = 0;
      acDy = s;
      angle = Math.PI / 2;
    } else {
      const prev = RECT_DEFS[i - 1];
      const ps = FIB_SIZES[i - 1];

      switch (dir) {
        case 0: // place to the right
          rx = prev.x + ps;
          ry = prev.y + ps - s;
          acDx = 0;
          acDy = s;
          angle = Math.PI / 2;
          break;
        case 1: // place above
          rx = prev.x + ps - s;
          ry = prev.y - s;
          acDx = 0;
          acDy = 0;
          angle = 0;
          break;
        case 2: // place to the left
          rx = prev.x - s;
          ry = prev.y;
          acDx = s;
          acDy = 0;
          angle = -Math.PI / 2;
          break;
        case 3: // place below
        default:
          rx = prev.x;
          ry = prev.y + ps;
          acDx = s;
          acDy = s;
          angle = Math.PI;
          break;
      }
    }

    RECT_DEFS.push({
      x: rx,
      y: ry,
      size: s,
      startAngle: angle,
      arcCenterDx: acDx,
      arcCenterDy: acDy,
    });
  }
})();

// -- State --

let centerX = 0;
let centerY = 0;
let scale = 0;
let growProgress = 0; // 0..1 entrance animation
let rotation = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    centerX = width / 2;
    centerY = height / 2;

    // Scale so the largest rectangle fills about 80% of the smaller dimension
    const maxFib = FIB_SIZES[NUM_RECTS - 1];
    scale = (Math.min(width, height) * 0.38) / maxFib;

    growProgress = 0;
    rotation = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const dt = frame.deltaTime / 1000;
    const isDark = api.context.display.isDarkMode();

    const brush = api.brush;

    // Growth animation: extend over ~4 seconds
    if (growProgress < 1) {
      growProgress = Math.min(1, growProgress + dt * 0.25);
    }
    const growEase = 1 - (1 - growProgress) * (1 - growProgress);

    // How many rectangles are currently visible
    const visibleCount = Math.min(
      NUM_RECTS,
      Math.floor(growEase * NUM_RECTS) + 1,
    );

    // Slow rotation (~3 degrees/sec)
    rotation = tSec * 0.052;

    const rectStroke = isDark ? CREAM : GREY;
    const spiralColor = GOLD;
    const dotColor = GOLD;
    const rectAlpha = isDark ? 0.6 : 0.65;
    const spiralAlpha = isDark ? 0.85 : 0.9;
    const dotAlpha = isDark ? 0.8 : 0.85;

    brush.pushMatrix();
    brush.translate(centerX, centerY);
    brush.rotate(rotation);

    // Draw rectangle outlines
    for (let i = 0; i < visibleCount; i++) {
      const def = RECT_DEFS[i];
      const s = def.size * scale;
      const rx = def.x * scale;
      const ry = def.y * scale;

      const path = brush.beginPath();
      path.moveTo(rx, ry);
      path.lineTo(rx + s, ry);
      path.lineTo(rx + s, ry + s);
      path.lineTo(rx, ry + s);
      path.closePath();
      path.stroke({
        color: rectStroke,
        width: 1.2,
        alpha: rectAlpha,
        blendMode: 'normal',
      });
    }

    // Draw the spiral arcs
    for (let i = 0; i < visibleCount; i++) {
      const def = RECT_DEFS[i];
      const s = def.size * scale;
      const rx = def.x * scale;
      const ry = def.y * scale;

      // Arc center is at a specific corner of the rectangle
      const acx = rx + def.arcCenterDx * scale;
      const acy = ry + def.arcCenterDy * scale;

      const path = brush.beginPath();
      path.arc(
        acx,
        acy,
        s,
        def.startAngle,
        def.startAngle + HALF_PI,
        false,
      );
      path.stroke({
        color: spiralColor,
        width: 2.5,
        alpha: spiralAlpha,
        blendMode: 'normal',
      });
    }

    // Draw golden dots at rectangle corners / spiral intersection points
    for (let i = 0; i < visibleCount; i++) {
      const def = RECT_DEFS[i];
      const acx = (def.x + def.arcCenterDx) * scale;
      const acy = (def.y + def.arcCenterDy) * scale;

      // Dot at the arc pivot corner
      const dotR = Math.max(2, scale * 0.8);
      brush.circle(acx, acy, dotR, {
        fill: dotColor,
        alpha: dotAlpha,
        blendMode: 'normal',
      });
    }

    // Draw endpoint dots along the spiral at each arc boundary
    for (let i = 0; i < visibleCount; i++) {
      const def = RECT_DEFS[i];
      const s = def.size * scale;
      const acx = (def.x + def.arcCenterDx) * scale;
      const acy = (def.y + def.arcCenterDy) * scale;

      const endAngle = def.startAngle + HALF_PI;
      const ex = acx + Math.cos(endAngle) * s;
      const ey = acy + Math.sin(endAngle) * s;

      const dotR = Math.max(1.5, scale * 0.6);
      brush.circle(ex, ey, dotR, {
        fill: dotColor,
        alpha: dotAlpha * 0.8,
        blendMode: 'normal',
      });
    }

    brush.popMatrix();

    // Subtle radial glow at center
    const glowR = scale * FIB_SIZES[6] * growEase * 0.5;
    if (glowR > 2) {
      brush.circle(centerX, centerY, glowR, {
        fill: {
          type: 'radial',
          cx: 0.5,
          cy: 0.5,
          radius: 0.5,
          stops: [
            { offset: 0, color: GOLD },
            { offset: 1, color: isDark ? 0x000000 : 0xffffff },
          ],
        },
        alpha: isDark ? 0.15 : 0.1,
        blendMode: 'add',
      });
    }
  },

  async teardown(): Promise<void> {
    growProgress = 0;
    rotation = 0;
  },
};

registerActor(actor);
export default actor;
