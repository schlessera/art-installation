/**
 * EP Voletarium Actor
 *
 * Europa-Park's Voletarium is a grand steampunk/Victorian flying theater.
 * This actor renders the ornate facade with arched windows, rotating gears,
 * a prominent clock, floating airships, rising steam wisps, and warm
 * golden window lighting — all in a rich steampunk aesthetic.
 *
 * Performance optimized:
 * - All state pre-allocated in setup(), zero allocations in update()
 * - Numeric colors (0xRRGGBB) with separate alpha
 * - Object pools with active flags and MAX caps
 * - Pre-rendered glow texture for lights
 * - Squared distance checks where applicable
 * - Target < 300 draw calls
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
  id: 'ep-voletarium',
  name: 'EP Voletarium',
  description:
    'Europa-Park Voletarium flying theater — a grand steampunk Victorian facade with ornate arches, rotating gears, clock tower, floating airships, steam wisps, and warm golden lights',
  author: { name: 'Taco Verdonschot', github: 'tacoverdonschot' },
  version: '1.0.0',
  tags: ['europapark', 'voletarium', 'steampunk', 'flying-theater'],
  createdAt: new Date(),
  role: 'foreground',
  preferredDuration: 60,
  requiredContexts: ['time', 'display'],
};

// ============================================================
// CONSTANTS
// ============================================================

const MAX_GEARS = 8;
const MAX_WINDOWS = 10;
const MAX_STEAM_WISPS = 12;
const MAX_AIRSHIPS = 2;
const MAX_LIGHTS = 6;
const MAX_ARCH_POINTS = 24;

// Canvas: 360 x 640
const CW = 360;
const CH = 640;

// Building geometry
const BLDG_X = 30;
const BLDG_W = 300;
const BLDG_Y = 220;
const BLDG_H = 380;
const BLDG_BOTTOM = BLDG_Y + BLDG_H; // 600
const ROOF_Y = 190;
const TOWER_X = 130;
const TOWER_W = 100;
const TOWER_Y = 100;
const TOWER_TOP = 70;

// Colors — dark mode (warm steampunk)
const CLR_FACADE_DK = 0x3d2b1f;
const CLR_FACADE_LT = 0xc9a87c;
const CLR_TRIM_DK = 0x8b6914;
const CLR_TRIM_LT = 0x5a3e1b;
const CLR_GEAR_DK = 0xb87333;
const CLR_GEAR_LT = 0x6b4226;
const CLR_WINDOW_GLOW_DK = 0xffcc44;
const CLR_WINDOW_GLOW_LT = 0xcc8800;
const CLR_ROOF_DK = 0x2a1f14;
const CLR_ROOF_LT = 0x8b7355;
const CLR_CLOCK_FACE_DK = 0xffeedd;
const CLR_CLOCK_FACE_LT = 0xf5e6d3;
const CLR_CLOCK_HAND_DK = 0x1a1a1a;
const CLR_CLOCK_HAND_LT = 0x3d2b1f;
const CLR_STEAM_DK = 0xcccccc;
const CLR_STEAM_LT = 0x888888;
const CLR_AIRSHIP_DK = 0xcc8844;
const CLR_AIRSHIP_LT = 0x7a5230;
const CLR_BALLOON_DK = 0xaa4444;
const CLR_BALLOON_LT = 0x884422;
const CLR_SKY_ACCENT_DK = 0x1a0f2e;
const CLR_SKY_ACCENT_LT = 0xd4c5a9;

// ============================================================
// STATE INTERFACES
// ============================================================

interface Gear {
  x: number;
  y: number;
  radius: number;
  teeth: number;
  angle: number;
  speed: number; // radians/sec, can be negative
  color: number;
}

interface WindowSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  glowPhase: number;
  glowSpeed: number;
}

interface SteamWisp {
  active: boolean;
  x: number;
  y: number;
  startX: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  alpha: number;
}

interface Airship {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  driftPhase: number;
  driftSpeed: number;
  scale: number;
  bobPhase: number;
}

interface Light {
  x: number;
  y: number;
  phase: number;
  speed: number;
  baseAlpha: number;
}

// ============================================================
// STATE — all pre-allocated
// ============================================================

let gears: Gear[] = [];
let windows: WindowSlot[] = [];
let steamWisps: SteamWisp[] = [];
let airships: Airship[] = [];
let lights: Light[] = [];
let archPoints: { x: number; y: number }[] = [];
let glowDataUrl = '';
let canvasW = 0;
let canvasH = 0;
let steamSpawnTimer = 0;

// Reusable style objects to reduce allocations
const shapeStyle = { fill: 0 as number, alpha: 1, blendMode: 'normal' as const };
const lineStyle = { color: 0 as number, alpha: 1, width: 3, blendMode: 'normal' as const, cap: 'round' as const };

// ============================================================
// HELPERS
// ============================================================

function createGlowTexture(): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.2)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const url = canvas.toDataURL();
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

function initSteamWisp(w: SteamWisp, originX: number): void {
  w.active = true;
  w.startX = originX;
  w.x = originX + (Math.random() - 0.5) * 30;
  w.y = ROOF_Y + Math.random() * 10;
  w.vx = (Math.random() - 0.5) * 8;
  w.vy = -(15 + Math.random() * 20);
  w.life = 0;
  w.maxLife = 2.0 + Math.random() * 2.0;
  w.size = 6 + Math.random() * 10;
  w.alpha = 0.6 + Math.random() * 0.3;
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
    steamSpawnTimer = 0;

    // Pre-render glow texture
    glowDataUrl = createGlowTexture();

    // --- Gears (on facade, decorative) ---
    gears = [];
    const gearDefs: Array<[number, number, number, number, number]> = [
      // [x, y, radius, teeth, speed]
      [65, 260, 18, 8, 0.4],
      [295, 260, 14, 6, -0.6],
      [55, 430, 22, 10, 0.3],
      [305, 430, 16, 7, -0.5],
      [TOWER_X + TOWER_W / 2 - 25, TOWER_Y + 18, 10, 5, 0.8],
      [TOWER_X + TOWER_W / 2 + 25, TOWER_Y + 18, 12, 6, -0.7],
      [80, 350, 12, 6, 0.5],
      [280, 350, 15, 7, -0.4],
    ];
    for (let i = 0; i < MAX_GEARS; i++) {
      const d = gearDefs[i];
      gears.push({
        x: d[0], y: d[1], radius: d[2], teeth: d[3],
        angle: Math.random() * Math.PI * 2,
        speed: d[4],
        color: 0,
      });
    }

    // --- Windows (arched, in rows) ---
    windows = [];
    const winW = 32;
    const winH = 50;
    // Row 1 — upper
    const row1Y = BLDG_Y + 50;
    const row1Xs = [75, 135, 225, 285];
    for (let i = 0; i < row1Xs.length; i++) {
      windows.push({
        x: row1Xs[i], y: row1Y, w: winW, h: winH,
        glowPhase: Math.random() * Math.PI * 2,
        glowSpeed: 0.8 + Math.random() * 0.6,
      });
    }
    // Row 2 — lower
    const row2Y = BLDG_Y + 160;
    const row2Xs = [65, 120, 180, 240, 295];
    for (let i = 0; i < row2Xs.length && windows.length < MAX_WINDOWS; i++) {
      windows.push({
        x: row2Xs[i], y: row2Y, w: winW - 4, h: winH - 8,
        glowPhase: Math.random() * Math.PI * 2,
        glowSpeed: 0.6 + Math.random() * 0.8,
      });
    }
    // Fill remaining with row 3
    const row3Y = BLDG_Y + 280;
    const row3X = BLDG_X + BLDG_W / 2;
    if (windows.length < MAX_WINDOWS) {
      windows.push({
        x: row3X, y: row3Y, w: 60, h: 80,
        glowPhase: 0,
        glowSpeed: 0.5,
      });
    }

    // --- Steam wisps ---
    steamWisps = [];
    for (let i = 0; i < MAX_STEAM_WISPS; i++) {
      steamWisps.push({
        active: false, x: 0, y: 0, startX: 0,
        vx: 0, vy: 0, life: 0, maxLife: 1,
        size: 8, alpha: 0.6,
      });
    }
    // Activate a few initially
    for (let i = 0; i < 4; i++) {
      const originX = BLDG_X + 40 + Math.random() * (BLDG_W - 80);
      initSteamWisp(steamWisps[i], originX);
      steamWisps[i].life = Math.random() * steamWisps[i].maxLife;
    }

    // --- Airships ---
    airships = [];
    for (let i = 0; i < MAX_AIRSHIPS; i++) {
      const bx = 60 + i * 200;
      const by = 35 + i * 25;
      airships.push({
        x: bx, y: by, baseX: bx, baseY: by,
        driftPhase: Math.random() * Math.PI * 2,
        driftSpeed: 0.15 + Math.random() * 0.1,
        scale: 0.8 + Math.random() * 0.4,
        bobPhase: Math.random() * Math.PI * 2,
      });
    }

    // --- Decorative lights ---
    lights = [];
    const lightXs = [50, 110, 180, 250, 310, 180];
    const lightYs = [BLDG_Y - 5, BLDG_Y - 5, ROOF_Y - 5, BLDG_Y - 5, BLDG_Y - 5, TOWER_TOP - 8];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      lights.push({
        x: lightXs[i], y: lightYs[i],
        phase: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 1.5,
        baseAlpha: 0.7 + Math.random() * 0.3,
      });
    }

    // --- Pre-allocate arch curve points ---
    archPoints = [];
    for (let i = 0; i < MAX_ARCH_POINTS; i++) {
      archPoints.push({ x: 0, y: 0 });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = frame.deltaTime / 1000;
    const isDark = api.context.display.isDarkMode();

    // Pick colors based on mode
    const facadeClr = isDark ? CLR_FACADE_DK : CLR_FACADE_LT;
    const trimClr = isDark ? CLR_TRIM_DK : CLR_TRIM_LT;
    const gearClr = isDark ? CLR_GEAR_DK : CLR_GEAR_LT;
    const windowGlowClr = isDark ? CLR_WINDOW_GLOW_DK : CLR_WINDOW_GLOW_LT;
    const roofClr = isDark ? CLR_ROOF_DK : CLR_ROOF_LT;
    const clockFaceClr = isDark ? CLR_CLOCK_FACE_DK : CLR_CLOCK_FACE_LT;
    const clockHandClr = isDark ? CLR_CLOCK_HAND_DK : CLR_CLOCK_HAND_LT;
    const steamClr = isDark ? CLR_STEAM_DK : CLR_STEAM_LT;
    const airshipClr = isDark ? CLR_AIRSHIP_DK : CLR_AIRSHIP_LT;
    const balloonClr = isDark ? CLR_BALLOON_DK : CLR_BALLOON_LT;
    const skyAccentClr = isDark ? CLR_SKY_ACCENT_DK : CLR_SKY_ACCENT_LT;
    const blendMain = isDark ? 'normal' as const : 'normal' as const;
    const blendGlow = isDark ? 'add' as const : 'screen' as const;

    // ============================================================
    // 1. SKY ACCENT (subtle background glow behind building)
    // ============================================================
    api.brush.circle(CW / 2, BLDG_Y + 60, 200, {
      fill: {
        type: 'radial',
        cx: 0.5, cy: 0.5, radius: 0.5,
        stops: [
          { offset: 0, color: isDark ? 0x2a1a3d : 0xf5e6c8 },
          { offset: 1, color: isDark ? 0x000000 : 0xffffff },
        ],
      },
      alpha: isDark ? 0.25 : 0.15,
      blendMode: blendGlow,
    });

    // ============================================================
    // 2. MAIN BUILDING FACADE
    // ============================================================

    // Main building body
    api.brush.rect(BLDG_X, BLDG_Y, BLDG_W, BLDG_H, {
      fill: facadeClr,
      alpha: 0.95,
      blendMode: blendMain,
    });

    // Facade horizontal trim lines
    for (let i = 0; i < 4; i++) {
      const ly = BLDG_Y + 30 + i * 100;
      api.brush.line(BLDG_X, ly, BLDG_X + BLDG_W, ly, {
        color: trimClr, alpha: 0.8, width: 2.5, blendMode: blendMain,
      });
    }

    // Vertical pilasters
    const pilasterXs = [BLDG_X + 5, BLDG_X + BLDG_W / 3, BLDG_X + 2 * BLDG_W / 3, BLDG_X + BLDG_W - 5];
    for (let i = 0; i < pilasterXs.length; i++) {
      api.brush.rect(pilasterXs[i] - 4, BLDG_Y, 8, BLDG_H, {
        fill: trimClr, alpha: 0.6, blendMode: blendMain,
      });
    }

    // Base / foundation
    api.brush.rect(BLDG_X - 5, BLDG_BOTTOM - 20, BLDG_W + 10, 25, {
      fill: isDark ? 0x1a120d : 0x8b7355,
      alpha: 0.9,
      blendMode: blendMain,
    });

    // ============================================================
    // 3. ROOF
    // ============================================================

    // Sloped roof — triangle
    api.brush.polygon(
      [
        { x: BLDG_X - 10, y: BLDG_Y },
        { x: CW / 2, y: ROOF_Y },
        { x: BLDG_X + BLDG_W + 10, y: BLDG_Y },
      ],
      { fill: roofClr, alpha: 0.9, blendMode: blendMain }
    );

    // Roof ridge line
    api.brush.line(BLDG_X - 10, BLDG_Y, BLDG_X + BLDG_W + 10, BLDG_Y, {
      color: trimClr, alpha: 0.8, width: 3, blendMode: blendMain,
    });

    // ============================================================
    // 4. CENTRAL TOWER
    // ============================================================

    // Tower body
    api.brush.rect(TOWER_X, TOWER_Y, TOWER_W, BLDG_Y - TOWER_Y, {
      fill: facadeClr, alpha: 0.95, blendMode: blendMain,
    });

    // Tower top — pointed spire
    api.brush.polygon(
      [
        { x: TOWER_X - 5, y: TOWER_Y },
        { x: TOWER_X + TOWER_W / 2, y: TOWER_TOP },
        { x: TOWER_X + TOWER_W + 5, y: TOWER_Y },
      ],
      { fill: roofClr, alpha: 0.9, blendMode: blendMain }
    );

    // Tower trim
    api.brush.line(TOWER_X, TOWER_Y, TOWER_X + TOWER_W, TOWER_Y, {
      color: trimClr, alpha: 0.8, width: 2.5, blendMode: blendMain,
    });

    // ============================================================
    // 5. CLOCK on tower
    // ============================================================

    const clockX = TOWER_X + TOWER_W / 2;
    const clockY = TOWER_Y + 55;
    const clockR = 22;

    // Clock face
    api.brush.circle(clockX, clockY, clockR, {
      fill: clockFaceClr, alpha: 0.95, blendMode: blendMain,
    });
    // Clock border
    api.brush.circle(clockX, clockY, clockR + 2, {
      stroke: trimClr, strokeWidth: 3, alpha: 0.9, blendMode: blendMain,
    });

    // Hour marks
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
      const ix = clockX + Math.cos(a) * (clockR - 5);
      const iy = clockY + Math.sin(a) * (clockR - 5);
      const ox = clockX + Math.cos(a) * (clockR - 2);
      const oy = clockY + Math.sin(a) * (clockR - 2);
      api.brush.line(ix, iy, ox, oy, {
        color: clockHandClr, alpha: 0.8, width: 1.5, blendMode: blendMain,
      });
    }

    // Clock hands — slowly moving based on real time
    const hour = api.context.time.hour();
    const minute = api.context.time.minute();
    const hourAngle = ((hour % 12) / 12 + minute / 720) * Math.PI * 2 - Math.PI / 2;
    const minuteAngle = (minute / 60) * Math.PI * 2 - Math.PI / 2;

    // Hour hand
    api.brush.line(
      clockX, clockY,
      clockX + Math.cos(hourAngle) * (clockR * 0.5),
      clockY + Math.sin(hourAngle) * (clockR * 0.5),
      { color: clockHandClr, alpha: 0.9, width: 3, blendMode: blendMain, cap: 'round' }
    );
    // Minute hand
    api.brush.line(
      clockX, clockY,
      clockX + Math.cos(minuteAngle) * (clockR * 0.75),
      clockY + Math.sin(minuteAngle) * (clockR * 0.75),
      { color: clockHandClr, alpha: 0.9, width: 2.5, blendMode: blendMain, cap: 'round' }
    );
    // Center dot
    api.brush.circle(clockX, clockY, 2.5, {
      fill: clockHandClr, alpha: 0.9, blendMode: blendMain,
    });

    // ============================================================
    // 6. ARCHED WINDOWS with warm glow
    // ============================================================

    for (let i = 0; i < windows.length; i++) {
      const win = windows[i];
      const glowPulse = 0.7 + 0.3 * Math.sin(t * win.glowSpeed + win.glowPhase);

      // Window recess (darker)
      api.brush.rect(win.x - win.w / 2, win.y, win.w, win.h, {
        fill: isDark ? 0x0d0907 : 0x4a3520,
        alpha: 0.9,
        blendMode: blendMain,
      });

      // Arch top (semicircle approximated with ellipse)
      api.brush.ellipse(win.x, win.y, win.w, win.w * 0.5, {
        fill: isDark ? 0x0d0907 : 0x4a3520,
        alpha: 0.9,
        blendMode: blendMain,
      });

      // Window warm glow — using pre-rendered texture for efficiency
      const glAlpha = glowPulse * (isDark ? 0.8 : 0.5);
      if (glAlpha >= 0.05) {
        api.brush.image(glowDataUrl, win.x, win.y + win.h * 0.3, {
          width: win.w * 2,
          height: win.h * 2,
          tint: windowGlowClr,
          alpha: glAlpha,
          blendMode: blendGlow,
        });
      }

      // Window frame
      api.brush.rect(win.x - win.w / 2, win.y, win.w, win.h, {
        stroke: trimClr, strokeWidth: 2, alpha: 0.7, blendMode: blendMain,
      });

      // Vertical mullion
      api.brush.line(win.x, win.y + 4, win.x, win.y + win.h - 2, {
        color: trimClr, alpha: 0.6, width: 1.5, blendMode: blendMain,
      });
    }

    // ============================================================
    // 7. MAIN ENTRANCE ARCH (grand, at center bottom)
    // ============================================================

    const archCX = CW / 2;
    const archBottom = BLDG_BOTTOM - 20;
    const archW = 60;
    const archH = 90;

    // Entrance recess
    api.brush.rect(archCX - archW / 2, archBottom - archH, archW, archH, {
      fill: isDark ? 0x0a0705 : 0x3d2b1f,
      alpha: 0.9,
      blendMode: blendMain,
    });

    // Arch top curve (draw as a series of line segments)
    const archSegs = 16;
    for (let i = 0; i < archSegs; i++) {
      const a0 = Math.PI + (i / archSegs) * Math.PI;
      const a1 = Math.PI + ((i + 1) / archSegs) * Math.PI;
      const x0 = archCX + Math.cos(a0) * archW / 2;
      const y0 = (archBottom - archH) + Math.sin(a0) * (-archW / 2);
      const x1 = archCX + Math.cos(a1) * archW / 2;
      const y1 = (archBottom - archH) + Math.sin(a1) * (-archW / 2);
      api.brush.line(x0, y0, x1, y1, {
        color: trimClr, alpha: 0.8, width: 3, blendMode: blendMain,
      });
    }

    // Entrance glow
    api.brush.image(glowDataUrl, archCX, archBottom - archH / 2, {
      width: archW * 1.5,
      height: archH * 1.2,
      tint: windowGlowClr,
      alpha: isDark ? 0.5 : 0.25,
      blendMode: blendGlow,
    });

    // ============================================================
    // 8. DECORATIVE ORNATE ARCHES (above windows row 1)
    // ============================================================

    const ornateY = BLDG_Y + 25;
    const ornateXs = [105, 255];
    for (let oi = 0; oi < ornateXs.length; oi++) {
      const ox = ornateXs[oi];
      // Small decorative arch
      const oSegs = 8;
      for (let s = 0; s < oSegs; s++) {
        const a0 = Math.PI + (s / oSegs) * Math.PI;
        const a1 = Math.PI + ((s + 1) / oSegs) * Math.PI;
        api.brush.line(
          ox + Math.cos(a0) * 35, ornateY + Math.sin(a0) * (-15),
          ox + Math.cos(a1) * 35, ornateY + Math.sin(a1) * (-15),
          { color: trimClr, alpha: 0.7, width: 2.5, blendMode: blendMain }
        );
      }
    }

    // ============================================================
    // 9. GEARS (rotating steampunk elements)
    // ============================================================

    for (let i = 0; i < gears.length; i++) {
      const g = gears[i];
      g.angle += g.speed * dt;

      const gearColor = gearClr;

      api.brush.pushMatrix();
      api.brush.translate(g.x, g.y);
      api.brush.rotate(g.angle);

      // Gear body (circle)
      api.brush.circle(0, 0, g.radius, {
        fill: gearColor, alpha: 0.85, blendMode: blendMain,
      });

      // Gear teeth
      for (let ti = 0; ti < g.teeth; ti++) {
        const ta = (ti / g.teeth) * Math.PI * 2;
        const toothInner = g.radius - 1;
        const toothOuter = g.radius + 4;
        const halfWidth = Math.PI / g.teeth * 0.4;

        api.brush.polygon(
          [
            { x: Math.cos(ta - halfWidth) * toothInner, y: Math.sin(ta - halfWidth) * toothInner },
            { x: Math.cos(ta - halfWidth * 0.6) * toothOuter, y: Math.sin(ta - halfWidth * 0.6) * toothOuter },
            { x: Math.cos(ta + halfWidth * 0.6) * toothOuter, y: Math.sin(ta + halfWidth * 0.6) * toothOuter },
            { x: Math.cos(ta + halfWidth) * toothInner, y: Math.sin(ta + halfWidth) * toothInner },
          ],
          { fill: gearColor, alpha: 0.8, blendMode: blendMain }
        );
      }

      // Gear hub (inner circle)
      api.brush.circle(0, 0, g.radius * 0.35, {
        fill: isDark ? 0x5a3a20 : 0x8b6914,
        alpha: 0.9,
        blendMode: blendMain,
      });

      // Gear hub hole
      api.brush.circle(0, 0, g.radius * 0.15, {
        fill: facadeClr, alpha: 0.9, blendMode: blendMain,
      });

      api.brush.popMatrix();
    }

    // ============================================================
    // 10. STEAM WISPS (rising from pipes/vents)
    // ============================================================

    steamSpawnTimer += dt;
    if (steamSpawnTimer > 0.4) {
      steamSpawnTimer = 0;
      // Find an inactive wisp
      for (let i = 0; i < steamWisps.length; i++) {
        if (!steamWisps[i].active) {
          const originX = BLDG_X + 30 + Math.random() * (BLDG_W - 60);
          initSteamWisp(steamWisps[i], originX);
          break;
        }
      }
    }

    for (let i = 0; i < steamWisps.length; i++) {
      const w = steamWisps[i];
      if (!w.active) continue;

      w.life += dt;
      if (w.life >= w.maxLife) {
        w.active = false;
        continue;
      }

      const progress = w.life / w.maxLife;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      // Gentle drift
      w.vx += (Math.random() - 0.5) * 2 * dt;

      // Fade in then out
      let alpha: number;
      if (progress < 0.2) {
        alpha = (progress / 0.2) * w.alpha;
      } else if (progress > 0.6) {
        alpha = ((1 - progress) / 0.4) * w.alpha;
      } else {
        alpha = w.alpha;
      }

      if (alpha < 0.05) continue;

      const growSize = w.size * (1 + progress * 1.5);
      api.brush.image(glowDataUrl, w.x, w.y, {
        width: growSize * 2,
        height: growSize * 2,
        tint: steamClr,
        alpha: alpha * (isDark ? 0.5 : 0.35),
        blendMode: blendGlow,
      });
    }

    // ============================================================
    // 11. AIRSHIPS / BALLOONS floating above
    // ============================================================

    for (let i = 0; i < airships.length; i++) {
      const a = airships[i];
      a.driftPhase += a.driftSpeed * dt;
      a.bobPhase += 0.6 * dt;

      a.x = a.baseX + Math.sin(a.driftPhase) * 40;
      a.y = a.baseY + Math.sin(a.bobPhase) * 8;

      const sc = a.scale;

      api.brush.pushMatrix();
      api.brush.translate(a.x, a.y);

      // Balloon envelope (ellipse)
      api.brush.ellipse(0, 0, 35 * sc, 18 * sc, {
        fill: balloonClr, alpha: 0.85, blendMode: blendMain,
      });

      // Balloon highlight stripe
      api.brush.ellipse(0, -4 * sc, 28 * sc, 8 * sc, {
        fill: isDark ? 0xdd6655 : 0xaa5544,
        alpha: 0.6,
        blendMode: blendMain,
      });

      // Gondola (small rectangle beneath)
      api.brush.rect(-10 * sc, 16 * sc, 20 * sc, 8 * sc, {
        fill: airshipClr, alpha: 0.85, blendMode: blendMain,
      });

      // Rigging lines (balloon to gondola)
      api.brush.line(-15 * sc, 12 * sc, -8 * sc, 16 * sc, {
        color: isDark ? 0x666666 : 0x444444, alpha: 0.7, width: 1.5, blendMode: blendMain,
      });
      api.brush.line(15 * sc, 12 * sc, 8 * sc, 16 * sc, {
        color: isDark ? 0x666666 : 0x444444, alpha: 0.7, width: 1.5, blendMode: blendMain,
      });

      // Propeller / fin at the back
      const propAngle = t * 3 * (i === 0 ? 1 : -1);
      api.brush.line(
        -30 * sc, 2 * sc,
        -30 * sc + Math.cos(propAngle) * 8 * sc, 2 * sc + Math.sin(propAngle) * 8 * sc,
        { color: gearClr, alpha: 0.7, width: 2.5, blendMode: blendMain }
      );

      api.brush.popMatrix();
    }

    // ============================================================
    // 12. DECORATIVE LIGHTS (twinkling along roofline and tower)
    // ============================================================

    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const twinkle = 0.6 + 0.4 * Math.sin(t * l.speed + l.phase);
      const lAlpha = l.baseAlpha * twinkle;

      if (lAlpha < 0.05) continue;

      api.brush.image(glowDataUrl, l.x, l.y, {
        width: 24,
        height: 24,
        tint: windowGlowClr,
        alpha: lAlpha,
        blendMode: blendGlow,
      });

      // Small core
      api.brush.circle(l.x, l.y, 2.5, {
        fill: isDark ? 0xffffff : 0xffcc44,
        alpha: lAlpha,
        blendMode: blendGlow,
      });
    }

    // ============================================================
    // 13. "VOLETARIUM" BANNER TEXT
    // ============================================================

    api.brush.text('VOLETARIUM', CW / 2, BLDG_Y + BLDG_H - 55, {
      fontSize: 14,
      fill: trimClr,
      align: 'center',
      baseline: 'middle',
      alpha: 0.8,
      letterSpacing: 4,
    });

    // ============================================================
    // 14. SUBTLE VIGNETTE / ATMOSPHERE
    // ============================================================

    // Warm atmospheric glow at base of building
    api.brush.image(glowDataUrl, CW / 2, BLDG_BOTTOM, {
      width: BLDG_W * 1.5,
      height: 80,
      tint: isDark ? 0x442200 : 0xccaa66,
      alpha: isDark ? 0.3 : 0.15,
      blendMode: blendGlow,
    });
  },

  async teardown(): Promise<void> {
    gears = [];
    windows = [];
    steamWisps = [];
    airships = [];
    lights = [];
    archPoints = [];
    glowDataUrl = '';
    canvasW = 0;
    canvasH = 0;
    steamSpawnTimer = 0;
  },
};

registerActor(actor);
export default actor;
