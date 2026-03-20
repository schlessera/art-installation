/**
 * EP Piraten in Batavia — Foreground Actor
 *
 * Europa-Park's beloved boat dark ride in the Dutch-themed area.
 * A colonial-era harbor scene with pirate ships, burning buildings,
 * treasure chests, cannon splashes, and lantern-lit docks.
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
  id: 'ep-piraten-batavia',
  name: 'EP Piraten in Batavia',
  description:
    'Colonial harbor scene with a pirate ship, burning Dutch buildings, treasure, cannon splashes, and lantern-lit docks — inspired by Europa-Park\'s Piraten in Batavia dark ride',
  author: { name: 'Taco Verdonschot', github: 'tacoverdonschot' },
  version: '1.0.0',
  tags: ['europapark', 'pirates', 'batavia', 'ship', 'harbor'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 45,
  requiredContexts: ['display'],
};

// ── Constants ────────────────────────────────────────────────
const MAX_FLAMES = 12;
const MAX_EMBERS = 20;
const MAX_SPLASHES = 6;
const MAX_STARS = 30;
const MAX_WAVE_PTS = 36;
const MAX_RIPPLES = 8;

// Canvas
let W = 360;
let H = 640;

// Water line
let WATER_Y = 0;

// ── Pre-allocated state interfaces ──────────────────────────
interface Flame {
  x: number;
  y: number;
  baseSize: number;
  phase: number;
  speed: number;
}

interface Ember {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface Splash {
  active: boolean;
  x: number;
  y: number;
  age: number;
  maxAge: number;
  size: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

interface WavePoint {
  x: number;
  y: number;
}

interface Ripple {
  x: number;
  phase: number;
  amp: number;
}

// ── Pre-allocated pools ─────────────────────────────────────
let flames: Flame[] = [];
let embers: Ember[] = [];
let splashes: Splash[] = [];
let stars: Star[] = [];
let wavePts: WavePoint[] = [];
let ripples: Ripple[] = [];

// Ship rocking state
let shipRockPhase = 0;
let flagPhase = 0;

// Glow texture
let glowDataUrl = '';

// Reusable style objects (avoid allocation in update)
const shapeStyle = { fill: 0 as number, alpha: 1, blendMode: 'normal' as string };
const lineStyle = { color: 0 as number, width: 3, alpha: 1, blendMode: 'normal' as string };
const imgStyle = { width: 0, height: 0, tint: 0 as number, alpha: 1, blendMode: 'add' as string };

// ── Colors ──────────────────────────────────────────────────
// Dark mode palette (primary)
const C_DARK = {
  sky: 0x0a0e1a,
  water: 0x0c1a2e,
  waterHighlight: 0x1a3050,
  dock: 0x3d2b1a,
  dockLight: 0x5a4030,
  building: 0x2a1f14,
  buildingLight: 0x4a3828,
  roof: 0x8b3a1a,
  roofLight: 0xa04020,
  window: 0xffcc44,
  hull: 0x2e1a0a,
  hullTrim: 0x8b5a2b,
  sail: 0xd4c4a8,
  mast: 0x4a3020,
  flag: 0x111111,
  skull: 0xeeeeee,
  flame: 0xff6600,
  flameInner: 0xffcc00,
  ember: 0xff4400,
  treasure: 0xdaa520,
  treasureGem: 0xff2244,
  lantern: 0xffaa33,
  splash: 0x5588bb,
  star: 0xccccdd,
  cannon: 0x333333,
};

// Light mode palette
const C_LIGHT = {
  sky: 0x6688aa,
  water: 0x2a5577,
  waterHighlight: 0x3a7090,
  dock: 0x5a4030,
  dockLight: 0x7a6050,
  building: 0x4a3828,
  buildingLight: 0x6a5848,
  roof: 0xa04020,
  roofLight: 0xb85030,
  window: 0xffdd66,
  hull: 0x3e2a1a,
  hullTrim: 0x9b6a3b,
  sail: 0xe4d4b8,
  mast: 0x5a4030,
  flag: 0x222222,
  skull: 0xffffff,
  flame: 0xff7711,
  flameInner: 0xffdd22,
  ember: 0xff5511,
  treasure: 0xeebb30,
  treasureGem: 0xff3355,
  lantern: 0xffbb44,
  splash: 0x6699cc,
  star: 0x445566,
  cannon: 0x444444,
};

function getColors(isDark: boolean) {
  return isDark ? C_DARK : C_LIGHT;
}

// ── Actor ───────────────────────────────────────────────────
const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    W = size.width;
    H = size.height;
    WATER_Y = H * 0.55;

    shipRockPhase = Math.random() * Math.PI * 2;
    flagPhase = Math.random() * Math.PI * 2;

    // Pre-allocate flames (on buildings)
    flames = [];
    for (let i = 0; i < MAX_FLAMES; i++) {
      flames.push({
        x: 0,
        y: 0,
        baseSize: 4 + Math.random() * 6,
        phase: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 2,
      });
    }
    // Place flames on the right-side burning building
    const bldgX = W * 0.72;
    const bldgY = WATER_Y - H * 0.18;
    for (let i = 0; i < MAX_FLAMES; i++) {
      flames[i].x = bldgX + (Math.random() - 0.5) * W * 0.2;
      flames[i].y = bldgY + Math.random() * H * 0.06;
    }

    // Pre-allocate embers
    embers = [];
    for (let i = 0; i < MAX_EMBERS; i++) {
      embers.push({
        active: true,
        x: bldgX + (Math.random() - 0.5) * W * 0.25,
        y: bldgY - Math.random() * H * 0.1,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(0.2 + Math.random() * 0.4),
        life: Math.random() * 200,
        maxLife: 200 + Math.random() * 150,
        size: 1 + Math.random() * 2,
      });
    }

    // Pre-allocate splashes
    splashes = [];
    for (let i = 0; i < MAX_SPLASHES; i++) {
      splashes.push({
        active: true,
        x: W * (0.15 + Math.random() * 0.55),
        y: WATER_Y + 5 + Math.random() * 20,
        age: Math.random() * 3000,
        maxAge: 3000 + Math.random() * 2000,
        size: 3 + Math.random() * 5,
      });
    }

    // Pre-allocate stars
    stars = [];
    for (let i = 0; i < MAX_STARS; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * WATER_Y * 0.5,
        size: 0.8 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Pre-allocate wave points
    wavePts = [];
    for (let i = 0; i < MAX_WAVE_PTS; i++) {
      wavePts.push({ x: 0, y: 0 });
    }

    // Pre-allocate ripples
    ripples = [];
    for (let i = 0; i < MAX_RIPPLES; i++) {
      ripples.push({
        x: W * (0.1 + Math.random() * 0.8),
        phase: Math.random() * Math.PI * 2,
        amp: 1 + Math.random() * 2,
      });
    }

    // Pre-render glow texture
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = c.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = frame.deltaTime;
    const isDark = api.context.display.isDarkMode();
    const C = getColors(isDark);

    // ── Sky gradient background ──────────────────────────────
    api.brush.rect(0, 0, W, WATER_Y, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: isDark ? 0x050810 : 0x445577 },
          { offset: 1, color: C.sky },
        ],
      },
      alpha: 0.9,
      blendMode: 'normal',
    });

    // ── Stars (dark mode only) ───────────────────────────────
    if (isDark) {
      for (let i = 0; i < MAX_STARS; i++) {
        const s = stars[i];
        const twinkle = 0.4 + 0.4 * Math.sin(t * 2 + s.phase);
        if (twinkle < 0.05) continue;
        api.brush.circle(s.x, s.y, s.size, {
          fill: C.star,
          alpha: twinkle,
          blendMode: 'add',
        });
      }
    }

    // ── Moon (dark mode) / Sun hint (light mode) ─────────────
    if (isDark) {
      imgStyle.width = 50;
      imgStyle.height = 50;
      imgStyle.tint = 0xeeeedd;
      imgStyle.alpha = 0.25;
      imgStyle.blendMode = 'add';
      api.brush.image(glowDataUrl, W * 0.82, H * 0.08, imgStyle);

      api.brush.circle(W * 0.82, H * 0.08, 12, {
        fill: 0xddddc8,
        alpha: 0.8,
        blendMode: 'normal',
      });
    }

    // ── Distant colonial buildings (left side) ───────────────
    drawBuilding(api, W * 0.02, WATER_Y - H * 0.22, W * 0.18, H * 0.22, C, false, t);
    drawBuilding(api, W * 0.17, WATER_Y - H * 0.18, W * 0.14, H * 0.18, C, false, t);

    // ── Burning building (right side) ────────────────────────
    drawBuilding(api, W * 0.65, WATER_Y - H * 0.25, W * 0.2, H * 0.25, C, true, t);
    drawBuilding(api, W * 0.82, WATER_Y - H * 0.17, W * 0.18, H * 0.17, C, true, t);

    // ── Flames on burning buildings ──────────────────────────
    for (let i = 0; i < MAX_FLAMES; i++) {
      const fl = flames[i];
      const flicker = Math.sin(t * fl.speed + fl.phase) * 0.4 + 0.6;
      const sz = fl.baseSize * flicker;
      if (sz < 1) continue;

      // Outer flame
      imgStyle.width = sz * 5;
      imgStyle.height = sz * 5;
      imgStyle.tint = C.flame;
      imgStyle.alpha = 0.5 * flicker;
      imgStyle.blendMode = 'add';
      api.brush.image(glowDataUrl, fl.x, fl.y - sz, imgStyle);

      // Inner flame (brighter)
      imgStyle.width = sz * 2.5;
      imgStyle.height = sz * 2.5;
      imgStyle.tint = C.flameInner;
      imgStyle.alpha = 0.7 * flicker;
      api.brush.image(glowDataUrl, fl.x, fl.y - sz * 0.5, imgStyle);
    }

    // ── Embers rising ────────────────────────────────────────
    const bldgX = W * 0.72;
    const bldgY = WATER_Y - H * 0.18;
    for (let i = 0; i < MAX_EMBERS; i++) {
      const e = embers[i];
      if (!e.active) continue;

      e.life += dt * 0.06;
      e.x += e.vx * dt * 0.06;
      e.y += e.vy * dt * 0.06;

      if (e.life > e.maxLife) {
        // Reset ember (no allocation)
        e.x = bldgX + (Math.random() - 0.5) * W * 0.25;
        e.y = bldgY;
        e.life = 0;
        e.vx = (Math.random() - 0.5) * 0.3;
        e.vy = -(0.2 + Math.random() * 0.4);
        continue;
      }

      const lifeRatio = e.life / e.maxLife;
      const alpha = lifeRatio < 0.1 ? lifeRatio * 10 : 1 - lifeRatio;
      if (alpha < 0.05) continue;

      api.brush.circle(e.x, e.y, e.size * (1 - lifeRatio * 0.5), {
        fill: C.ember,
        alpha: alpha * 0.8,
        blendMode: 'add',
      });
    }

    // ── Dock / pier ──────────────────────────────────────────
    const dockY = WATER_Y - 4;
    // Main dock platform
    api.brush.rect(W * 0.02, dockY, W * 0.35, 8, {
      fill: C.dock,
      alpha: 0.9,
      blendMode: 'normal',
    });
    // Dock posts
    for (let i = 0; i < 4; i++) {
      const px = W * 0.05 + i * W * 0.09;
      api.brush.rect(px, dockY, 4, 18, {
        fill: C.dockLight,
        alpha: 0.85,
        blendMode: 'normal',
      });
    }

    // Right dock
    api.brush.rect(W * 0.62, dockY, W * 0.38, 8, {
      fill: C.dock,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // ── Lanterns on dock ─────────────────────────────────────
    const lanternPositions = [W * 0.08, W * 0.26, W * 0.68, W * 0.88];
    for (let i = 0; i < lanternPositions.length; i++) {
      const lx = lanternPositions[i];
      const ly = dockY - 18;
      // Pole
      api.brush.rect(lx - 1, ly, 2, 18, {
        fill: C.cannon,
        alpha: 0.8,
        blendMode: 'normal',
      });
      // Lantern body
      api.brush.rect(lx - 3, ly - 6, 6, 8, {
        fill: C.lantern,
        alpha: 0.85,
        blendMode: 'normal',
      });
      // Lantern glow
      const glowPulse = 0.6 + 0.3 * Math.sin(t * 3 + i * 1.7);
      imgStyle.width = 35;
      imgStyle.height = 35;
      imgStyle.tint = C.lantern;
      imgStyle.alpha = 0.35 * glowPulse;
      imgStyle.blendMode = 'add';
      api.brush.image(glowDataUrl, lx, ly - 2, imgStyle);
    }

    // ── Treasure chests on left dock ─────────────────────────
    drawTreasureChest(api, W * 0.12, dockY - 5, 16, 10, C);
    drawTreasureChest(api, W * 0.22, dockY - 4, 12, 8, C);

    // ── Pirate ship (center) ─────────────────────────────────
    const shipCX = W * 0.46;
    const shipCY = WATER_Y + H * 0.04;
    const rockAngle = Math.sin(t * 0.8 + shipRockPhase) * 0.03;
    const rockBob = Math.sin(t * 1.2 + shipRockPhase) * 3;

    api.brush.pushMatrix();
    api.brush.translate(shipCX, shipCY + rockBob);
    api.brush.rotate(rockAngle);

    // Hull
    const hullW = W * 0.38;
    const hullH = H * 0.06;
    api.brush.polygon([
      { x: -hullW * 0.5, y: 0 },
      { x: -hullW * 0.4, y: hullH },
      { x: hullW * 0.35, y: hullH },
      { x: hullW * 0.5, y: -hullH * 0.2 },
      { x: hullW * 0.45, y: -hullH * 0.6 },
      { x: -hullW * 0.45, y: -hullH * 0.3 },
    ], {
      fill: C.hull,
      alpha: 0.95,
      blendMode: 'normal',
    });

    // Hull trim stripe
    api.brush.line(-hullW * 0.42, hullH * 0.3, hullW * 0.42, hullH * 0.3, {
      color: C.hullTrim,
      width: 3,
      alpha: 0.8,
      blendMode: 'normal',
    });

    // Bow sprit
    api.brush.line(hullW * 0.45, -hullH * 0.4, hullW * 0.62, -hullH * 1.2, {
      color: C.mast,
      width: 2.5,
      alpha: 0.85,
      blendMode: 'normal',
    });

    // Cannon ports
    for (let i = 0; i < 4; i++) {
      const cx = -hullW * 0.25 + i * hullW * 0.18;
      api.brush.rect(cx - 2.5, hullH * 0.1, 5, 5, {
        fill: C.cannon,
        alpha: 0.7,
        blendMode: 'normal',
      });
    }

    // Main mast
    const mastH = H * 0.28;
    api.brush.line(0, -hullH * 0.3, 0, -mastH, {
      color: C.mast,
      width: 4,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Crow's nest
    api.brush.rect(-8, -mastH + 5, 16, 4, {
      fill: C.mast,
      alpha: 0.8,
      blendMode: 'normal',
    });

    // Fore mast
    const foreMastH = H * 0.2;
    const foreMastX = hullW * 0.25;
    api.brush.line(foreMastX, -hullH * 0.3, foreMastX, -foreMastH, {
      color: C.mast,
      width: 3,
      alpha: 0.85,
      blendMode: 'normal',
    });

    // Yard arms + sails (main mast)
    const yardY1 = -mastH * 0.5;
    const yardY2 = -mastH * 0.78;
    const yardLen = hullW * 0.3;
    // Lower yard
    api.brush.line(-yardLen, yardY1, yardLen, yardY1, {
      color: C.mast,
      width: 2.5,
      alpha: 0.8,
      blendMode: 'normal',
    });
    // Lower sail
    const sailBillow1 = Math.sin(t * 1.5 + 0.5) * 4;
    api.brush.polygon([
      { x: -yardLen * 0.9, y: yardY1 },
      { x: yardLen * 0.9, y: yardY1 },
      { x: yardLen * 0.85, y: yardY1 + mastH * 0.22 },
      { x: sailBillow1, y: yardY1 + mastH * 0.25 },
      { x: -yardLen * 0.85, y: yardY1 + mastH * 0.22 },
    ], {
      fill: C.sail,
      alpha: 0.85,
      blendMode: 'normal',
    });

    // Upper yard
    api.brush.line(-yardLen * 0.7, yardY2, yardLen * 0.7, yardY2, {
      color: C.mast,
      width: 2.5,
      alpha: 0.8,
      blendMode: 'normal',
    });
    // Upper sail
    const sailBillow2 = Math.sin(t * 1.5 + 1.2) * 3;
    api.brush.polygon([
      { x: -yardLen * 0.6, y: yardY2 },
      { x: yardLen * 0.6, y: yardY2 },
      { x: yardLen * 0.55, y: yardY2 + mastH * 0.2 },
      { x: sailBillow2, y: yardY2 + mastH * 0.22 },
      { x: -yardLen * 0.55, y: yardY2 + mastH * 0.2 },
    ], {
      fill: C.sail,
      alpha: 0.8,
      blendMode: 'normal',
    });

    // Fore sail
    const foreYardY = -foreMastH * 0.6;
    const foreYardLen = hullW * 0.2;
    api.brush.line(foreMastX - foreYardLen, foreYardY, foreMastX + foreYardLen, foreYardY, {
      color: C.mast,
      width: 2.5,
      alpha: 0.8,
      blendMode: 'normal',
    });
    const sailBillow3 = Math.sin(t * 1.5 + 2.0) * 3;
    api.brush.polygon([
      { x: foreMastX - foreYardLen * 0.85, y: foreYardY },
      { x: foreMastX + foreYardLen * 0.85, y: foreYardY },
      { x: foreMastX + foreYardLen * 0.8, y: foreYardY + foreMastH * 0.28 },
      { x: foreMastX + sailBillow3, y: foreYardY + foreMastH * 0.3 },
      { x: foreMastX - foreYardLen * 0.8, y: foreYardY + foreMastH * 0.28 },
    ], {
      fill: C.sail,
      alpha: 0.8,
      blendMode: 'normal',
    });

    // ── Jolly Roger flag ─────────────────────────────────────
    const flagX = 0;
    const flagY = -mastH;
    const flagW = 20;
    const flagH = 14;
    flagPhase += dt * 0.004;

    // Flag polygon with wave
    const wave1 = Math.sin(flagPhase * 3) * 2;
    const wave2 = Math.sin(flagPhase * 3 + 1.5) * 2.5;
    api.brush.polygon([
      { x: flagX, y: flagY },
      { x: flagX + flagW * 0.5, y: flagY + wave1 },
      { x: flagX + flagW, y: flagY + wave2 },
      { x: flagX + flagW, y: flagY + flagH + wave2 },
      { x: flagX + flagW * 0.5, y: flagY + flagH + wave1 },
      { x: flagX, y: flagY + flagH },
    ], {
      fill: C.flag,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Skull on flag (simplified)
    const skullX = flagX + flagW * 0.5;
    const skullY = flagY + flagH * 0.4 + (wave1 + wave2) * 0.25;
    api.brush.circle(skullX, skullY, 3.5, {
      fill: C.skull,
      alpha: 0.85,
      blendMode: 'normal',
    });
    // Crossbones
    api.brush.line(skullX - 4, skullY + 3, skullX + 4, skullY + 7, {
      color: C.skull,
      width: 1.5,
      alpha: 0.8,
      blendMode: 'normal',
    });
    api.brush.line(skullX + 4, skullY + 3, skullX - 4, skullY + 7, {
      color: C.skull,
      width: 1.5,
      alpha: 0.8,
      blendMode: 'normal',
    });

    api.brush.popMatrix();

    // ── Water surface ────────────────────────────────────────
    // Main water body
    api.brush.rect(0, WATER_Y, W, H - WATER_Y, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: C.water },
          { offset: 1, color: isDark ? 0x050e18 : 0x1a3555 },
        ],
      },
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Wave highlights
    const segW = W / (MAX_WAVE_PTS - 1);
    for (let layer = 0; layer < 3; layer++) {
      const waveY = WATER_Y + layer * 12;
      const waveAmp = 2.5 - layer * 0.5;
      const waveSpeed = 1.2 + layer * 0.3;
      const count = Math.min(MAX_WAVE_PTS, MAX_WAVE_PTS);
      for (let i = 0; i < count; i++) {
        wavePts[i].x = i * segW;
        wavePts[i].y = waveY + Math.sin(t * waveSpeed + i * 0.5 + layer) * waveAmp;
      }
      const sliced = wavePts.slice(0, count);
      api.brush.stroke(sliced, {
        color: C.waterHighlight,
        width: 1.5,
        alpha: 0.35 - layer * 0.08,
        blendMode: 'add',
      });
    }

    // ── Water ripples ────────────────────────────────────────
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = ripples[i];
      const rippleW = 15 + Math.sin(t * 1.5 + r.phase) * 5;
      const rippleAlpha = 0.15 + 0.1 * Math.sin(t * 2 + r.phase);
      if (rippleAlpha < 0.05) continue;
      const ry = WATER_Y + 10 + i * 15 + r.amp * Math.sin(t + r.phase);
      api.brush.ellipse(r.x, ry, rippleW, 2, {
        fill: C.waterHighlight,
        alpha: rippleAlpha,
        blendMode: 'add',
      });
    }

    // ── Ship reflection in water ─────────────────────────────
    const reflAlpha = isDark ? 0.12 : 0.08;
    api.brush.rect(shipCX - W * 0.15, WATER_Y + 5, W * 0.3, H * 0.08, {
      fill: C.hull,
      alpha: reflAlpha,
      blendMode: 'normal',
    });

    // ── Cannonball splashes ──────────────────────────────────
    for (let i = 0; i < MAX_SPLASHES; i++) {
      const sp = splashes[i];
      if (!sp.active) continue;

      sp.age += dt;
      if (sp.age > sp.maxAge) {
        sp.age = 0;
        sp.x = W * (0.15 + Math.random() * 0.55);
        sp.size = 3 + Math.random() * 5;
        continue;
      }

      const progress = sp.age / sp.maxAge;
      if (progress < 0.05) {
        // Splash burst
        const burstAlpha = (1 - progress / 0.05) * 0.7;
        if (burstAlpha >= 0.05) {
          imgStyle.width = sp.size * 8;
          imgStyle.height = sp.size * 6;
          imgStyle.tint = C.splash;
          imgStyle.alpha = burstAlpha;
          imgStyle.blendMode = 'add';
          api.brush.image(glowDataUrl, sp.x, sp.y, imgStyle);
        }
      }

      // Droplets rising then falling
      if (progress < 0.15) {
        const dropProgress = progress / 0.15;
        const dropH = sp.size * 3 * Math.sin(dropProgress * Math.PI);
        const dropAlpha = 0.6 * (1 - dropProgress);
        if (dropAlpha >= 0.05) {
          for (let d = -1; d <= 1; d += 2) {
            api.brush.circle(
              sp.x + d * sp.size * dropProgress * 2,
              sp.y - dropH,
              1.5,
              { fill: C.splash, alpha: dropAlpha, blendMode: 'add' }
            );
          }
        }
      }

      // Expanding ring
      if (progress > 0.02 && progress < 0.3) {
        const ringProgress = (progress - 0.02) / 0.28;
        const ringR = sp.size * (1 + ringProgress * 3);
        const ringAlpha = 0.4 * (1 - ringProgress);
        if (ringAlpha >= 0.05) {
          api.brush.ellipse(sp.x, sp.y + 2, ringR, ringR * 0.3, {
            stroke: C.splash,
            strokeWidth: 1.5,
            alpha: ringAlpha,
            blendMode: 'add',
          });
        }
      }
    }

    // ── Fire reflection in water ─────────────────────────────
    const fireReflX = W * 0.72;
    const fireFlicker = 0.5 + 0.3 * Math.sin(t * 4);
    imgStyle.width = 80;
    imgStyle.height = 40;
    imgStyle.tint = C.flame;
    imgStyle.alpha = 0.15 * fireFlicker;
    imgStyle.blendMode = 'add';
    api.brush.image(glowDataUrl, fireReflX, WATER_Y + 20, imgStyle);
  },

  async teardown(): Promise<void> {
    flames = [];
    embers = [];
    splashes = [];
    stars = [];
    wavePts = [];
    ripples = [];
    glowDataUrl = '';
  },
};

// ── Helper: Draw a colonial building ────────────────────────
function drawBuilding(
  api: ActorUpdateAPI,
  x: number, y: number, w: number, h: number,
  C: typeof C_DARK, burning: boolean, t: number,
): void {
  // Main wall
  api.brush.rect(x, y, w, h, {
    fill: burning ? C.buildingLight : C.building,
    alpha: 0.9,
    blendMode: 'normal',
  });

  // Dutch stepped gable roof
  const roofH = h * 0.25;
  const stepW = w * 0.15;
  api.brush.polygon([
    { x: x - 2, y: y },
    { x: x + stepW, y: y - roofH * 0.5 },
    { x: x + stepW, y: y - roofH * 0.5 },
    { x: x + w * 0.3, y: y - roofH * 0.5 },
    { x: x + w * 0.35, y: y - roofH },
    { x: x + w * 0.5, y: y - roofH * 1.15 },
    { x: x + w * 0.65, y: y - roofH },
    { x: x + w * 0.7, y: y - roofH * 0.5 },
    { x: x + w - stepW, y: y - roofH * 0.5 },
    { x: x + w + 2, y: y },
  ], {
    fill: C.roof,
    alpha: 0.9,
    blendMode: 'normal',
  });

  // Windows (2 rows, 2 cols)
  const winW = w * 0.15;
  const winH = h * 0.12;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const wx = x + w * 0.2 + col * w * 0.4;
      const wy = y + h * 0.25 + row * h * 0.3;
      const glow = burning
        ? 0.5 + 0.4 * Math.sin(t * 5 + row + col)
        : 0.6 + 0.2 * Math.sin(t * 0.5 + row * 2 + col);
      api.brush.rect(wx, wy, winW, winH, {
        fill: C.window,
        alpha: glow,
        blendMode: 'normal',
      });
    }
  }
}

// ── Helper: Draw a treasure chest ───────────────────────────
function drawTreasureChest(
  api: ActorUpdateAPI,
  x: number, y: number, w: number, h: number,
  C: typeof C_DARK,
): void {
  // Chest body
  api.brush.rect(x - w * 0.5, y - h, w, h, {
    fill: C.treasure,
    alpha: 0.85,
    blendMode: 'normal',
  });

  // Lid (slightly open arc shape)
  api.brush.rect(x - w * 0.55, y - h - 3, w * 1.1, 4, {
    fill: C.hull,
    alpha: 0.8,
    blendMode: 'normal',
  });

  // Gold gleam
  api.brush.circle(x, y - h * 0.5, 2, {
    fill: C.treasureGem,
    alpha: 0.8,
    blendMode: 'add',
  });

  // Metal bands
  api.brush.line(x - w * 0.5, y - h * 0.5, x + w * 0.5, y - h * 0.5, {
    color: C.hull,
    width: 1.5,
    alpha: 0.6,
    blendMode: 'normal',
  });
}

registerActor(actor);
export default actor;
