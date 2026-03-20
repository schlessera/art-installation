/**
 * EP Silver Star Actor
 *
 * Europa-Park's iconic B&M hyper coaster — the tallest in the park
 * with a massive 73m hill and long, sweeping track. Rendered as a
 * dramatic silhouette against an atmospheric sky gradient with
 * twinkling stars, a moving coaster train, and gentle wind effects.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'ep-silver-star',
  name: 'EP Silver Star',
  description:
    'A dramatic silhouette of Europa-Park\'s Silver Star hyper coaster against an atmospheric twilight sky with twinkling stars and a moving train',
  author: { name: 'Taco Verdonschot', github: 'tacoverdonschot' },
  version: '1.0.0',
  tags: ['europapark', 'coaster', 'silver-star', 'silhouette', 'ambient'],
  createdAt: new Date(),
  role: 'foreground',
  preferredDuration: 60,
  requiredContexts: ['display', 'time'],
};

// ── Constants ────────────────────────────────────────────────
const MAX_STARS = 50;
const MAX_STRUTS = 30;
const MAX_TRACK_PTS = 60;
const MAX_WIND_LINES = 12;
const TRAIN_CARS = 5;
const CANVAS_W = 360;
const CANVAS_H = 640;

// ── Interfaces ───────────────────────────────────────────────
interface StarPt {
  x: number;
  y: number;
  baseR: number;
  phase: number;
  speed: number;
  bright: number;
}

interface TrackPt {
  x: number;
  y: number;
}

interface Strut {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface WindLine {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
  phase: number;
}

interface TrainCar {
  t: number; // parametric position on track 0-1
  size: number;
}

// ── State ────────────────────────────────────────────────────
let stars: StarPt[];
let trackPts: TrackPt[];
let struts: Strut[];
let windLines: WindLine[];
let trainCars: TrainCar[];
let trainT: number; // master train position
let canvasW: number;
let canvasH: number;
let glowDataUrl: string;
let glowDataUrlDark: string;

// Reusable style objects to avoid allocation in update()
const shapeStyle = { fill: 0 as number, alpha: 1, blendMode: 'normal' as const };
const lineStyle = { color: 0 as number, width: 3, alpha: 1, blendMode: 'normal' as const, cap: 'round' as const };
const imgOpts = { width: 0, height: 0, tint: 0, alpha: 1, blendMode: 'add' as const };

// ── Track generation helpers ─────────────────────────────────

/** Evaluate a cubic bezier at parameter t (0-1). */
function bezierEval(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
  t: number,
  out: TrackPt,
): void {
  const it = 1 - t;
  const it2 = it * it;
  const it3 = it2 * it;
  const t2 = t * t;
  const t3 = t2 * t;
  out.x = it3 * p0x + 3 * it2 * t * p1x + 3 * it * t2 * p2x + t3 * p3x;
  out.y = it3 * p0y + 3 * it2 * t * p1y + 3 * it * t2 * p2y + t3 * p3y;
}

/**
 * Build the coaster track profile as a series of points.
 * The track sweeps from left to right across the canvas:
 *   - Starts low-left, rises to the 73m main hill near center,
 *   - dips down into a valley, rises for a camelback,
 *   - curves down to the right, and exits.
 */
function buildTrack(w: number, h: number, pts: TrackPt[]): number {
  // Key control points (x fractions of canvas, y fractions)
  // The coaster profile across 5 bezier segments
  const segments: number[][] = [
    // Segment 0: approach from lower-left up to peak
    // P0, CP1, CP2, P3 as [x, y] fractions of canvas
    0.00, 0.78,   0.08, 0.75,   0.15, 0.30,   0.25, 0.15,
    // Segment 1: peak to first drop
    0.25, 0.15,   0.30, 0.08,   0.35, 0.10,   0.42, 0.55,
    // Segment 2: first valley to camelback
    0.42, 0.55,   0.48, 0.72,   0.52, 0.72,   0.58, 0.38,
    // Segment 3: camelback to second dip
    0.58, 0.38,   0.63, 0.28,   0.68, 0.30,   0.75, 0.52,
    // Segment 4: second dip to exit right
    0.75, 0.52,   0.82, 0.65,   0.90, 0.68,   1.00, 0.65,
  ];

  const segCount = 5;
  const ptsPerSeg = Math.floor(MAX_TRACK_PTS / segCount);
  let idx = 0;

  for (let s = 0; s < segCount; s++) {
    const base = s * 8;
    const p0x = segments[base + 0] * w;
    const p0y = segments[base + 1] * h;
    const p1x = segments[base + 2] * w;
    const p1y = segments[base + 3] * h;
    const p2x = segments[base + 4] * w;
    const p2y = segments[base + 5] * h;
    const p3x = segments[base + 6] * w;
    const p3y = segments[base + 7] * h;

    const count = (s === segCount - 1) ? ptsPerSeg + (MAX_TRACK_PTS - ptsPerSeg * segCount) : ptsPerSeg;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1 || 1);
      if (idx < MAX_TRACK_PTS) {
        bezierEval(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t, pts[idx]);
        idx++;
      }
    }
  }
  return idx;
}

/**
 * Build vertical support struts from track down to a ground line.
 */
function buildStruts(
  track: TrackPt[],
  trackLen: number,
  groundY: number,
  out: Strut[],
): number {
  let idx = 0;
  // Place a strut every few track points
  const step = Math.max(2, Math.floor(trackLen / MAX_STRUTS));
  for (let i = 0; i < trackLen && idx < MAX_STRUTS; i += step) {
    const pt = track[i];
    if (pt.y < groundY - 15) {
      out[idx].x1 = pt.x;
      out[idx].y1 = pt.y;
      out[idx].x2 = pt.x;
      out[idx].y2 = groundY;
      idx++;
    }
  }
  return idx;
}

/**
 * Create a pre-rendered soft glow texture (canvas API allowed in setup).
 */
function createGlowTexture(dark: boolean): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (dark) {
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.3, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const url = canvas.toDataURL();
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

/**
 * Get a point on the track by parametric t (0-1), interpolating between samples.
 */
function trackAt(t: number, track: TrackPt[], len: number, out: TrackPt): void {
  const pos = t * (len - 1);
  const i0 = Math.floor(pos);
  const i1 = Math.min(i0 + 1, len - 1);
  const frac = pos - i0;
  out.x = track[i0].x + (track[i1].x - track[i0].x) * frac;
  out.y = track[i0].y + (track[i1].y - track[i0].y) * frac;
}

// Temp points for train computation (pre-allocated)
const tmpPt: TrackPt = { x: 0, y: 0 };

// ── Actor ────────────────────────────────────────────────────
const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-allocate stars
    stars = [];
    for (let i = 0; i < MAX_STARS; i++) {
      stars.push({
        x: Math.random() * canvasW,
        y: Math.random() * canvasH * 0.55, // upper portion of sky
        baseR: 1 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 2.0,
        bright: 0.5 + Math.random() * 0.5,
      });
    }

    // Pre-allocate track points
    trackPts = [];
    for (let i = 0; i < MAX_TRACK_PTS; i++) {
      trackPts.push({ x: 0, y: 0 });
    }
    buildTrack(canvasW, canvasH, trackPts);

    // Pre-allocate struts
    struts = [];
    for (let i = 0; i < MAX_STRUTS; i++) {
      struts.push({ x1: 0, y1: 0, x2: 0, y2: 0 });
    }
    const groundY = canvasH * 0.82;
    buildStruts(trackPts, MAX_TRACK_PTS, groundY, struts);

    // Pre-allocate wind lines
    windLines = [];
    for (let i = 0; i < MAX_WIND_LINES; i++) {
      windLines.push({
        x: Math.random() * canvasW,
        y: canvasH * 0.10 + Math.random() * canvasH * 0.50,
        len: 20 + Math.random() * 40,
        speed: 30 + Math.random() * 60,
        alpha: 0.08 + Math.random() * 0.15,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Pre-allocate train cars
    trainCars = [];
    for (let i = 0; i < TRAIN_CARS; i++) {
      trainCars.push({ t: 0, size: 6 - i * 0.4 });
    }
    trainT = 0;

    // Pre-render glow textures
    glowDataUrl = createGlowTexture(false);
    glowDataUrlDark = createGlowTexture(true);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    const w = canvasW;
    const h = canvasH;
    const groundY = h * 0.82;

    // ── Sky gradient background ──────────────────────────────
    // Vertical gradient: deep navy top → purple mid → sunset orange bottom
    if (isDark) {
      api.brush.rect(0, 0, w, h, {
        fill: {
          type: 'linear',
          x0: 0.5, y0: 0,
          x1: 0.5, y1: 1,
          stops: [
            { offset: 0, color: 0x0a0a2e },
            { offset: 0.35, color: 0x1a1040 },
            { offset: 0.6, color: 0x2d1b4e },
            { offset: 0.8, color: 0x4a2040 },
            { offset: 1, color: 0x6b3020 },
          ],
        },
        alpha: 0.85,
        blendMode: 'normal',
      });
    } else {
      api.brush.rect(0, 0, w, h, {
        fill: {
          type: 'linear',
          x0: 0.5, y0: 0,
          x1: 0.5, y1: 1,
          stops: [
            { offset: 0, color: 0x4a6fa5 },
            { offset: 0.35, color: 0x7b8fb5 },
            { offset: 0.6, color: 0xb08d8a },
            { offset: 0.8, color: 0xd4956a },
            { offset: 1, color: 0xe8a060 },
          ],
        },
        alpha: 0.85,
        blendMode: 'normal',
      });
    }

    // ── Stars (twinkling) ────────────────────────────────────
    const starGlow = isDark ? glowDataUrl : glowDataUrlDark;
    const starBlend = isDark ? 'add' as const : 'multiply' as const;
    const starCore = isDark ? 0xffffff : 0x222244;

    for (let i = 0; i < MAX_STARS; i++) {
      const s = stars[i];
      const twinkle = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
      const alpha = s.bright * twinkle;
      if (alpha < 0.05) continue;

      // Glow sprite
      const glowSz = s.baseR * 10;
      api.brush.image(starGlow, s.x, s.y, {
        width: glowSz,
        height: glowSz,
        tint: isDark ? 0xccddff : 0x334466,
        alpha: alpha * 0.6,
        blendMode: starBlend,
      });

      // Core dot
      api.brush.circle(s.x, s.y, s.baseR * 0.7, {
        fill: starCore,
        alpha: alpha,
        blendMode: starBlend,
      });
    }

    // ── Ground / horizon ─────────────────────────────────────
    const groundColor = isDark ? 0x0c0c1a : 0x3a3a50;
    api.brush.rect(0, groundY, w, h - groundY, {
      fill: groundColor,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // ── Support struts ───────────────────────────────────────
    const strutColor = isDark ? 0x2a2a4a : 0x555570;
    for (let i = 0; i < MAX_STRUTS; i++) {
      const st = struts[i];
      if (st.y2 <= st.y1) continue;
      api.brush.line(st.x1, st.y1, st.x2, st.y2, {
        color: strutColor,
        width: 1.5,
        alpha: isDark ? 0.6 : 0.7,
        blendMode: 'normal',
        cap: 'butt',
      });

      // Cross-bracing: diagonal lines for realism (every other strut)
      if (i > 0 && (i & 1) === 0) {
        const prev = struts[i - 1];
        if (prev.y2 > prev.y1) {
          // Diagonal from top of this strut to bottom of previous
          api.brush.line(st.x1, st.y1, prev.x2, prev.y2, {
            color: strutColor,
            width: 1,
            alpha: isDark ? 0.35 : 0.45,
            blendMode: 'normal',
            cap: 'butt',
          });
        }
      }
    }

    // ── Coaster track (main rail) ────────────────────────────
    const trackColor = isDark ? 0x8888bb : 0x444466;
    const trackAlpha = isDark ? 0.9 : 0.95;

    // Draw track as connected line segments
    for (let i = 0; i < MAX_TRACK_PTS - 1; i++) {
      const p0 = trackPts[i];
      const p1 = trackPts[i + 1];
      api.brush.line(p0.x, p0.y, p1.x, p1.y, {
        color: trackColor,
        width: 3,
        alpha: trackAlpha,
        blendMode: 'normal',
        cap: 'round',
      });
    }

    // Second rail (slightly offset below)
    const railOffset = 5;
    for (let i = 0; i < MAX_TRACK_PTS - 1; i++) {
      const p0 = trackPts[i];
      const p1 = trackPts[i + 1];
      api.brush.line(p0.x, p0.y + railOffset, p1.x, p1.y + railOffset, {
        color: trackColor,
        width: 2,
        alpha: trackAlpha * 0.7,
        blendMode: 'normal',
        cap: 'round',
      });
    }

    // Rail ties (cross-pieces between rails)
    for (let i = 0; i < MAX_TRACK_PTS; i += 3) {
      const pt = trackPts[i];
      api.brush.line(pt.x, pt.y, pt.x, pt.y + railOffset, {
        color: trackColor,
        width: 1.5,
        alpha: trackAlpha * 0.5,
        blendMode: 'normal',
        cap: 'butt',
      });
    }

    // ── Animated train ───────────────────────────────────────
    // Train loops along track, speed varies with slope
    trainT = (trainT + dt * 0.06) % 1.0;

    const trainColor = isDark ? 0xccccee : 0x333355;
    const trainHighlight = isDark ? 0xffcc44 : 0xaa8822;

    for (let c = 0; c < TRAIN_CARS; c++) {
      const carT = (trainT - c * 0.025 + 1.0) % 1.0;
      trackAt(carT, trackPts, MAX_TRACK_PTS, tmpPt);

      const sz = trainCars[c].size;

      // Car body
      api.brush.rect(tmpPt.x - sz, tmpPt.y - sz * 1.2, sz * 2, sz * 1.5, {
        fill: trainColor,
        alpha: 0.9,
        blendMode: 'normal',
      });

      // Headlight on first car
      if (c === 0) {
        api.brush.image(isDark ? glowDataUrl : glowDataUrlDark, tmpPt.x, tmpPt.y - sz, {
          width: 24,
          height: 24,
          tint: trainHighlight,
          alpha: 0.7 + 0.2 * Math.sin(t * 4),
          blendMode: isDark ? 'add' : 'multiply',
        });
      }
    }

    // ── Wind effect lines ────────────────────────────────────
    const windColor = isDark ? 0xaabbcc : 0x667788;
    for (let i = 0; i < MAX_WIND_LINES; i++) {
      const wl = windLines[i];
      // Move wind lines to the right
      wl.x += wl.speed * dt;
      if (wl.x > w + wl.len) {
        wl.x = -wl.len;
        wl.y = h * 0.10 + Math.random() * h * 0.50;
      }

      // Gentle sinusoidal wave
      const yOff = Math.sin(t * 1.5 + wl.phase) * 3;
      const alpha = wl.alpha * (0.6 + 0.4 * Math.sin(t * 0.8 + wl.phase));
      if (alpha < 0.05) continue;

      api.brush.line(wl.x, wl.y + yOff, wl.x + wl.len, wl.y + yOff, {
        color: windColor,
        width: 1,
        alpha: alpha,
        blendMode: isDark ? 'add' : 'normal',
        cap: 'round',
      });
    }

    // ── Atmospheric glow at horizon ──────────────────────────
    const horizonY = groundY - 10;
    const glowColor = isDark ? 0xff6633 : 0xdd8855;
    api.brush.rect(0, horizonY - 40, w, 80, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: 0x000000 },
          { offset: 0.4, color: glowColor },
          { offset: 0.6, color: glowColor },
          { offset: 1, color: 0x000000 },
        ],
      },
      alpha: isDark ? 0.2 : 0.15,
      blendMode: isDark ? 'add' : 'screen',
    });

    // ── "SILVER STAR" text glow at bottom ────────────────────
    const textAlpha = 0.6 + 0.15 * Math.sin(t * 0.5);
    const textColor = isDark ? 0xccccdd : 0x444466;
    api.brush.text('SILVER STAR', w * 0.5, h * 0.92, {
      fontSize: 18,
      fill: textColor,
      alpha: textAlpha,
      align: 'center',
      baseline: 'middle',
    });
  },

  async teardown(): Promise<void> {
    stars = [];
    trackPts = [];
    struts = [];
    windLines = [];
    trainCars = [];
    trainT = 0;
    glowDataUrl = '';
    glowDataUrlDark = '';
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
