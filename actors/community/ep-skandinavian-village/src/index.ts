import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

// ============================================================
// METADATA
// ============================================================

const metadata: ActorMetadata = {
  id: 'ep-skandinavian-village',
  name: 'EP Skandinavian Village',
  description:
    'Charming Nordic wooden houses with colorful facades, a stave church silhouette, aurora borealis dancing in the sky, chimney smoke, warm window glow, and gentle snowfall — inspired by Europa-Park\'s Scandinavian area',
  author: { name: 'Taco Verdonschot', github: 'tacoverdonschot' },
  version: '1.0.0',
  tags: ['europapark', 'skandinavian', 'nordic', 'village', 'aurora'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 45,
  requiredContexts: ['display'],
  role: 'foreground',
};

// ============================================================
// MAX CONSTANTS
// ============================================================

const MAX_HOUSES = 6;
const MAX_AURORA_BANDS = 4;
const MAX_AURORA_POINTS = 18;
const MAX_SNOWFLAKES = 60;
const MAX_SMOKE_PARTICLES = 24;
const MAX_WINDOWS_PER_HOUSE = 4;
const MAX_STARS = 30;

// ============================================================
// INTERFACES
// ============================================================

interface House {
  x: number;
  y: number;
  w: number;
  h: number;
  roofH: number;
  facadeColor: number;
  roofColor: number;
  trimColor: number;
  windowCount: number;
  windowPhases: number[];
  chimneyX: number;
  chimneyW: number;
  chimneyH: number;
  hasChimney: boolean;
}

interface AuroraBand {
  baseY: number;
  amplitude: number;
  speed: number;
  phaseOffset: number;
  color1: number;
  color2: number;
  alpha: number;
}

interface Snowflake {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  drift: number;
  phase: number;
}

interface SmokeParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  startX: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

// ============================================================
// STATE — pre-allocated in setup()
// ============================================================

let canvasW = 0;
let canvasH = 0;
let houses: House[] = [];
let auroraBands: AuroraBand[] = [];
let snowflakes: Snowflake[] = [];
let smokeParticles: SmokeParticle[] = [];
let stars: Star[] = [];
let glowDataUrl = '';
let smokeSpawnTimer = 0;
let snowSpawnTimer = 0;

// Pre-allocated reusable style objects
const shapeStyle = { fill: 0, alpha: 1, blendMode: 'normal' as const };
const lineStyle = { color: 0, alpha: 1, width: 2, blendMode: 'normal' as const, cap: 'round' as const };
const imageOpts = { width: 0, height: 0, tint: 0, alpha: 1, blendMode: 'add' as const };

// ============================================================
// COLORS
// ============================================================

// Facade colors (dark mode / light mode)
const FACADE_RED_D = 0x8b2020;
const FACADE_YELLOW_D = 0xc8a832;
const FACADE_BLUE_D = 0x2a4a7a;
const FACADE_GREEN_D = 0x2a6040;

const FACADE_RED_L = 0xcc3333;
const FACADE_YELLOW_L = 0xe8c840;
const FACADE_BLUE_L = 0x3a6aaa;
const FACADE_GREEN_L = 0x3a8858;

const ROOF_DARK = 0x1a1a2e;
const ROOF_LIGHT = 0x3a3a50;

const SNOW_CAP_D = 0xc8d8f0;
const SNOW_CAP_L = 0xf0f4ff;

const TRIM_DARK = 0xd4c4a0;
const TRIM_LIGHT = 0x6a5a40;

const WINDOW_WARM = 0xffcc44;
const WINDOW_WARM_L = 0xee9922;

const AURORA_GREEN = 0x33ff88;
const AURORA_TEAL = 0x22ddaa;
const AURORA_PURPLE = 0x8844ff;
const AURORA_PINK = 0xdd44aa;

const GROUND_SNOW_D = 0x2a3040;
const GROUND_SNOW_L = 0xe0e8f0;

const SKY_TOP_D = 0x060818;
const SKY_BOT_D = 0x101828;
const SKY_TOP_L = 0x4466aa;
const SKY_BOT_L = 0x7799cc;

const STAVE_WOOD_D = 0x2a1a10;
const STAVE_WOOD_L = 0x5a3a20;
const STAVE_ROOF_D = 0x0e0e1a;
const STAVE_ROOF_L = 0x2a2a3e;

const SMOKE_D = 0x889aaa;
const SMOKE_L = 0x667788;
const STAR_D = 0xffffff;
const SNOWFLAKE_D = 0xe8f0ff;
const SNOWFLAKE_L = 0xccddee;

// ============================================================
// HELPER: create glow texture
// ============================================================

function createGlowTexture(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  const url = canvas.toDataURL();
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

// ============================================================
// HELPER: spawn smoke
// ============================================================

function spawnSmoke(p: SmokeParticle, x: number, y: number): void {
  p.active = true;
  p.startX = x;
  p.x = x + (Math.random() - 0.5) * 3;
  p.y = y;
  p.vx = 4 + Math.random() * 6;
  p.vy = -(8 + Math.random() * 12);
  p.life = 1.5 + Math.random() * 2;
  p.maxLife = p.life;
  p.size = 2 + Math.random() * 3;
}

// ============================================================
// HELPER: init snowflake
// ============================================================

function initSnowflake(sf: Snowflake, w: number): void {
  sf.active = true;
  sf.x = Math.random() * w;
  sf.y = -2 - Math.random() * 40;
  sf.vx = 0;
  sf.vy = 8 + Math.random() * 16;
  sf.size = 1 + Math.random() * 2.5;
  sf.drift = (Math.random() - 0.5) * 20;
  sf.phase = Math.random() * Math.PI * 2;
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

    // Create glow texture
    glowDataUrl = createGlowTexture();

    // Reset timers
    smokeSpawnTimer = 0;
    snowSpawnTimer = 0;

    // ---- Houses ----
    const facadeColors = [FACADE_RED_D, FACADE_YELLOW_D, FACADE_BLUE_D, FACADE_GREEN_D, FACADE_RED_D, FACADE_YELLOW_D];
    const houseBaseY = canvasH * 0.72;
    const totalW = canvasW * 0.92;
    const startX = canvasW * 0.04;
    const houseSlotW = totalW / MAX_HOUSES;

    houses = [];
    for (let i = 0; i < MAX_HOUSES; i++) {
      const w = houseSlotW * (0.7 + Math.random() * 0.25);
      const h = 50 + Math.random() * 40;
      const roofH = 25 + Math.random() * 20;
      const phases: number[] = [];
      const wc = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < MAX_WINDOWS_PER_HOUSE; j++) {
        phases.push(Math.random() * Math.PI * 2);
      }
      const hasChimney = Math.random() < 0.6;
      houses.push({
        x: startX + i * houseSlotW + (houseSlotW - w) * 0.5,
        y: houseBaseY - h,
        w,
        h,
        roofH,
        facadeColor: facadeColors[i % facadeColors.length],
        roofColor: ROOF_DARK,
        trimColor: TRIM_DARK,
        windowCount: Math.min(wc, MAX_WINDOWS_PER_HOUSE),
        windowPhases: phases,
        chimneyX: 0.3 + Math.random() * 0.4,
        chimneyW: 6 + Math.random() * 4,
        chimneyH: 12 + Math.random() * 10,
        hasChimney,
      });
    }

    // ---- Aurora Bands ----
    const auroraColors1 = [AURORA_GREEN, AURORA_TEAL, AURORA_PURPLE, AURORA_PINK];
    const auroraColors2 = [AURORA_TEAL, AURORA_GREEN, AURORA_PINK, AURORA_PURPLE];
    auroraBands = [];
    for (let i = 0; i < MAX_AURORA_BANDS; i++) {
      auroraBands.push({
        baseY: canvasH * 0.1 + i * canvasH * 0.08,
        amplitude: 15 + Math.random() * 25,
        speed: 0.3 + Math.random() * 0.5,
        phaseOffset: Math.random() * Math.PI * 2,
        color1: auroraColors1[i % auroraColors1.length],
        color2: auroraColors2[i % auroraColors2.length],
        alpha: 0.35 + Math.random() * 0.2,
      });
    }

    // ---- Snowflakes ----
    snowflakes = [];
    for (let i = 0; i < MAX_SNOWFLAKES; i++) {
      snowflakes.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 1,
        drift: 0,
        phase: 0,
      });
    }
    // Pre-spawn some
    for (let i = 0; i < 30; i++) {
      initSnowflake(snowflakes[i], canvasW);
      snowflakes[i].y = Math.random() * canvasH;
    }

    // ---- Smoke Particles ----
    smokeParticles = [];
    for (let i = 0; i < MAX_SMOKE_PARTICLES; i++) {
      smokeParticles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        startX: 0,
      });
    }

    // ---- Stars ----
    stars = [];
    for (let i = 0; i < MAX_STARS; i++) {
      stars.push({
        x: Math.random() * canvasW,
        y: Math.random() * canvasH * 0.4,
        size: 0.8 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    const bNormal = 'normal' as const;
    const bAdd = 'add' as const;
    const bScreen = 'screen' as const;
    const bMode = isDark ? bAdd : bScreen;

    // ---- Adapted colors ----
    const groundColor = isDark ? GROUND_SNOW_D : GROUND_SNOW_L;
    const snowCapColor = isDark ? SNOW_CAP_D : SNOW_CAP_L;
    const trimColor = isDark ? TRIM_DARK : TRIM_LIGHT;
    const windowColor = isDark ? WINDOW_WARM : WINDOW_WARM_L;
    const smokeColor = isDark ? SMOKE_D : SMOKE_L;
    const snowflakeColor = isDark ? SNOWFLAKE_D : SNOWFLAKE_L;
    const staveWood = isDark ? STAVE_WOOD_D : STAVE_WOOD_L;
    const staveRoof = isDark ? STAVE_ROOF_D : STAVE_ROOF_L;

    // ============================================================
    // SKY BACKGROUND (subtle gradient via stacked rects)
    // ============================================================
    const skyTop = isDark ? SKY_TOP_D : SKY_TOP_L;
    const skyBot = isDark ? SKY_BOT_D : SKY_BOT_L;
    const skySteps = 4;
    const skyStepH = canvasH * 0.7 / skySteps;
    for (let i = 0; i < skySteps; i++) {
      const frac = i / (skySteps - 1);
      const r1 = (skyTop >> 16) & 0xff;
      const g1 = (skyTop >> 8) & 0xff;
      const b1 = skyTop & 0xff;
      const r2 = (skyBot >> 16) & 0xff;
      const g2 = (skyBot >> 8) & 0xff;
      const b2 = skyBot & 0xff;
      const r = Math.round(r1 + (r2 - r1) * frac);
      const g = Math.round(g1 + (g2 - g1) * frac);
      const b = Math.round(b1 + (b2 - b1) * frac);
      const c = (r << 16) | (g << 8) | b;
      api.brush.rect(0, i * skyStepH, canvasW, skyStepH + 1, {
        fill: c,
        alpha: 0.7,
        blendMode: bNormal,
      });
    }

    // ============================================================
    // STARS (dark mode only)
    // ============================================================
    if (isDark) {
      for (let i = 0; i < MAX_STARS; i++) {
        const s = stars[i];
        const twinkle = 0.4 + 0.4 * Math.sin(t * 2.5 + s.phase);
        if (twinkle < 0.05) continue;
        api.brush.circle(s.x, s.y, s.size, {
          fill: STAR_D,
          alpha: twinkle,
          blendMode: bAdd,
        });
      }
    }

    // ============================================================
    // AURORA BOREALIS
    // ============================================================
    const auroraAlphaBase = isDark ? 1.0 : 0.4;
    for (let b = 0; b < MAX_AURORA_BANDS; b++) {
      const band = auroraBands[b];
      const bandAlpha = band.alpha * auroraAlphaBase;
      if (bandAlpha < 0.05) continue;

      // Draw aurora as a series of connected lines
      for (let i = 0; i < MAX_AURORA_POINTS - 1; i++) {
        const frac1 = i / (MAX_AURORA_POINTS - 1);
        const frac2 = (i + 1) / (MAX_AURORA_POINTS - 1);

        const x1 = frac1 * canvasW;
        const x2 = frac2 * canvasW;

        const wave1 = Math.sin(frac1 * Math.PI * 3 + t * band.speed + band.phaseOffset);
        const wave2 = Math.sin(frac1 * Math.PI * 5 + t * band.speed * 0.7 + band.phaseOffset * 1.3);
        const y1 = band.baseY + wave1 * band.amplitude + wave2 * band.amplitude * 0.3;

        const w1next = Math.sin(frac2 * Math.PI * 3 + t * band.speed + band.phaseOffset);
        const w2next = Math.sin(frac2 * Math.PI * 5 + t * band.speed * 0.7 + band.phaseOffset * 1.3);
        const y2 = band.baseY + w1next * band.amplitude + w2next * band.amplitude * 0.3;

        // Brightness varies across the band
        const edgeFade = 1 - Math.abs(frac1 - 0.5) * 2;
        const pulse = 0.7 + 0.3 * Math.sin(t * 1.5 + b * 0.8 + frac1 * 4);
        const segAlpha = bandAlpha * edgeFade * pulse;
        if (segAlpha < 0.05) continue;

        // Alternate between band colors
        const useColor = (i + b) % 2 === 0 ? band.color1 : band.color2;

        api.brush.line(x1, y1, x2, y2, {
          color: useColor,
          alpha: segAlpha,
          width: 6 + Math.sin(t * 0.8 + i * 0.3) * 2,
          blendMode: bMode,
          cap: 'round',
        });

        // Vertical curtain drape below aurora line
        if (i % 3 === 0) {
          const curtainLen = 15 + 10 * Math.sin(t * 0.5 + i);
          api.brush.line(x1, y1, x1, y1 + curtainLen, {
            color: useColor,
            alpha: segAlpha * 0.4,
            width: 3,
            blendMode: bMode,
            cap: 'round',
          });
        }
      }
    }

    // Aurora glow using pre-rendered texture
    if (isDark) {
      const glowPulse = 0.15 + 0.08 * Math.sin(t * 0.7);
      imageOpts.width = canvasW * 0.8;
      imageOpts.height = canvasH * 0.3;
      imageOpts.tint = AURORA_GREEN;
      imageOpts.alpha = glowPulse;
      imageOpts.blendMode = bAdd;
      api.brush.image(glowDataUrl, canvasW * 0.5, canvasH * 0.15, imageOpts);
    }

    // ============================================================
    // GROUND / SNOW FIELD
    // ============================================================
    api.brush.rect(0, canvasH * 0.72, canvasW, canvasH * 0.28, {
      fill: groundColor,
      alpha: 0.85,
      blendMode: bNormal,
    });

    // Gentle snow texture lines on ground
    for (let i = 0; i < 5; i++) {
      const gy = canvasH * 0.74 + i * 12;
      api.brush.line(0, gy, canvasW, gy, {
        color: snowCapColor,
        alpha: 0.15,
        width: 1,
        blendMode: bNormal,
      });
    }

    // ============================================================
    // STAVE CHURCH (center-left)
    // ============================================================
    const churchX = canvasW * 0.14;
    const churchBaseY = canvasH * 0.72;
    const churchW = 36;
    const churchH = 80;
    const churchY = churchBaseY - churchH;

    // Church body
    api.brush.rect(churchX - churchW * 0.5, churchY, churchW, churchH, {
      fill: staveWood,
      alpha: 0.9,
      blendMode: bNormal,
    });

    // Tiered roofs (3 tiers) — distinctive stave church silhouette
    const tierWidths = [churchW * 1.3, churchW * 0.9, churchW * 0.5];
    const tierHeights = [22, 18, 15];
    let tierY = churchY;

    for (let tier = 0; tier < 3; tier++) {
      const tw = tierWidths[tier];
      const th = tierHeights[tier];

      // Roof triangle
      api.brush.polygon(
        [
          { x: churchX - tw * 0.5, y: tierY },
          { x: churchX, y: tierY - th },
          { x: churchX + tw * 0.5, y: tierY },
        ],
        {
          fill: staveRoof,
          alpha: 0.9,
          blendMode: bNormal,
        },
      );

      // Snow on roof tier
      api.brush.line(
        churchX - tw * 0.5 + 2,
        tierY,
        churchX + tw * 0.5 - 2,
        tierY,
        {
          color: snowCapColor,
          alpha: 0.7,
          width: 3,
          blendMode: bNormal,
        },
      );

      tierY = tierY - th;
    }

    // Church spire on top
    api.brush.line(churchX, tierY, churchX, tierY - 18, {
      color: staveRoof,
      alpha: 0.9,
      width: 3,
      blendMode: bNormal,
    });

    // Cross on top
    api.brush.line(churchX - 4, tierY - 15, churchX + 4, tierY - 15, {
      color: trimColor,
      alpha: 0.8,
      width: 2.5,
      blendMode: bNormal,
    });
    api.brush.line(churchX, tierY - 20, churchX, tierY - 10, {
      color: trimColor,
      alpha: 0.8,
      width: 2.5,
      blendMode: bNormal,
    });

    // Church door
    api.brush.rect(churchX - 5, churchBaseY - 16, 10, 16, {
      fill: isDark ? 0x0a0a12 : 0x3a2a1a,
      alpha: 0.9,
      blendMode: bNormal,
    });

    // Church window (warm glow)
    const churchWinGlow = 0.5 + 0.3 * Math.sin(t * 1.2);
    api.brush.circle(churchX, churchY + 15, 4, {
      fill: windowColor,
      alpha: churchWinGlow,
      blendMode: bMode,
    });

    // ============================================================
    // HOUSES
    // ============================================================
    for (let i = 0; i < MAX_HOUSES; i++) {
      const h = houses[i];
      const facadeC = isDark ? h.facadeColor : getFacadeLight(h.facadeColor);

      // House body
      api.brush.rect(h.x, h.y, h.w, h.h, {
        fill: facadeC,
        alpha: 0.9,
        blendMode: bNormal,
      });

      // Steep roof (triangle)
      api.brush.polygon(
        [
          { x: h.x - 3, y: h.y },
          { x: h.x + h.w * 0.5, y: h.y - h.roofH },
          { x: h.x + h.w + 3, y: h.y },
        ],
        {
          fill: isDark ? ROOF_DARK : ROOF_LIGHT,
          alpha: 0.9,
          blendMode: bNormal,
        },
      );

      // Snow cap on roof
      api.brush.line(h.x - 2, h.y, h.x + h.w + 2, h.y, {
        color: snowCapColor,
        alpha: 0.75,
        width: 4,
        blendMode: bNormal,
      });

      // Snow line along roof edges
      api.brush.line(h.x - 2, h.y, h.x + h.w * 0.5, h.y - h.roofH + 2, {
        color: snowCapColor,
        alpha: 0.5,
        width: 2.5,
        blendMode: bNormal,
      });
      api.brush.line(h.x + h.w * 0.5, h.y - h.roofH + 2, h.x + h.w + 2, h.y, {
        color: snowCapColor,
        alpha: 0.5,
        width: 2.5,
        blendMode: bNormal,
      });

      // Trim / timber frame
      api.brush.rect(h.x, h.y + h.h - 3, h.w, 3, {
        fill: trimColor,
        alpha: 0.6,
        blendMode: bNormal,
      });

      // Chimney
      if (h.hasChimney) {
        const cx = h.x + h.w * h.chimneyX;
        const cy = h.y - h.roofH * 0.4;
        api.brush.rect(cx - h.chimneyW * 0.5, cy - h.chimneyH, h.chimneyW, h.chimneyH, {
          fill: isDark ? 0x1a1018 : 0x4a3a30,
          alpha: 0.85,
          blendMode: bNormal,
        });

        // Snow on chimney top
        api.brush.rect(cx - h.chimneyW * 0.5 - 1, cy - h.chimneyH - 2, h.chimneyW + 2, 3, {
          fill: snowCapColor,
          alpha: 0.7,
          blendMode: bNormal,
        });
      }

      // Windows with warm glow
      const winSpacing = h.w / (h.windowCount + 1);
      for (let j = 0; j < h.windowCount; j++) {
        const wx = h.x + winSpacing * (j + 1);
        const wy = h.y + h.h * 0.35;
        const winSize = 7;

        // Window frame
        api.brush.rect(wx - winSize * 0.5 - 1, wy - winSize * 0.5 - 1, winSize + 2, winSize + 2, {
          fill: trimColor,
          alpha: 0.7,
          blendMode: bNormal,
        });

        // Window pane
        const flicker = 0.6 + 0.3 * Math.sin(t * 1.8 + h.windowPhases[j]);
        api.brush.rect(wx - winSize * 0.5, wy - winSize * 0.5, winSize, winSize, {
          fill: windowColor,
          alpha: flicker,
          blendMode: bMode,
        });

        // Window glow effect
        imageOpts.width = winSize * 4;
        imageOpts.height = winSize * 4;
        imageOpts.tint = windowColor;
        imageOpts.alpha = flicker * 0.35;
        imageOpts.blendMode = bMode;
        api.brush.image(glowDataUrl, wx, wy, imageOpts);
      }

      // Door
      const doorW = 8;
      const doorH = 14;
      api.brush.rect(h.x + h.w * 0.5 - doorW * 0.5, h.y + h.h - doorH, doorW, doorH, {
        fill: isDark ? 0x0e0a06 : 0x5a3a1a,
        alpha: 0.85,
        blendMode: bNormal,
      });
    }

    // ============================================================
    // VIKING SHIP ELEMENT (decorative, at ground level right side)
    // ============================================================
    const shipX = canvasW * 0.85;
    const shipY = canvasH * 0.73;
    const shipLen = 40;

    // Hull curve - simplified Viking ship
    api.brush.pushMatrix();
    api.brush.translate(shipX, shipY);

    // Hull body
    api.brush.polygon(
      [
        { x: -shipLen * 0.5, y: 0 },
        { x: -shipLen * 0.35, y: 8 },
        { x: shipLen * 0.35, y: 8 },
        { x: shipLen * 0.5, y: 0 },
        { x: shipLen * 0.3, y: -3 },
        { x: -shipLen * 0.3, y: -3 },
      ],
      {
        fill: staveWood,
        alpha: 0.85,
        blendMode: bNormal,
      },
    );

    // Dragon prow (upward curve on left)
    api.brush.line(-shipLen * 0.5, 0, -shipLen * 0.6, -12, {
      color: staveWood,
      alpha: 0.85,
      width: 3,
      blendMode: bNormal,
    });
    api.brush.line(-shipLen * 0.6, -12, -shipLen * 0.55, -16, {
      color: staveWood,
      alpha: 0.85,
      width: 2.5,
      blendMode: bNormal,
    });

    // Stern curve
    api.brush.line(shipLen * 0.5, 0, shipLen * 0.55, -8, {
      color: staveWood,
      alpha: 0.8,
      width: 3,
      blendMode: bNormal,
    });

    // Mast
    api.brush.line(0, -3, 0, -28, {
      color: isDark ? 0x3a2a18 : 0x6a4a28,
      alpha: 0.85,
      width: 2.5,
      blendMode: bNormal,
    });

    // Shield decorations along hull
    const shieldColors = [FACADE_RED_D, FACADE_YELLOW_D, FACADE_BLUE_D];
    for (let i = 0; i < 4; i++) {
      const sx = -shipLen * 0.25 + i * shipLen * 0.18;
      api.brush.circle(sx, 2, 3, {
        fill: isDark ? shieldColors[i % 3] : getFacadeLight(shieldColors[i % 3]),
        alpha: 0.75,
        blendMode: bNormal,
      });
    }

    // Snow on ship
    api.brush.line(-shipLen * 0.3, -3, shipLen * 0.3, -3, {
      color: snowCapColor,
      alpha: 0.5,
      width: 2,
      blendMode: bNormal,
    });

    api.brush.popMatrix();

    // ============================================================
    // SMOKE WISPS FROM CHIMNEYS
    // ============================================================
    smokeSpawnTimer += dt;
    if (smokeSpawnTimer > 0.12) {
      smokeSpawnTimer = 0;
      // Spawn smoke from houses with chimneys
      for (let i = 0; i < MAX_HOUSES; i++) {
        const h = houses[i];
        if (!h.hasChimney) continue;
        if (Math.random() > 0.4) continue;
        // Find inactive particle
        for (let j = 0; j < MAX_SMOKE_PARTICLES; j++) {
          if (!smokeParticles[j].active) {
            const cx = h.x + h.w * h.chimneyX;
            const cy = h.y - h.roofH * 0.4 - h.chimneyH;
            spawnSmoke(smokeParticles[j], cx, cy);
            break;
          }
        }
      }
    }

    for (let i = 0; i < MAX_SMOKE_PARTICLES; i++) {
      const sp = smokeParticles[i];
      if (!sp.active) continue;

      sp.life -= dt;
      if (sp.life <= 0) {
        sp.active = false;
        continue;
      }

      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vx += Math.sin(t * 2 + i) * 2 * dt;
      sp.size += dt * 2;

      const progress = 1 - sp.life / sp.maxLife;
      let alpha: number;
      if (progress < 0.1) {
        alpha = progress / 0.1;
      } else {
        alpha = 1 - (progress - 0.1) / 0.9;
      }
      alpha *= 0.4;
      if (alpha < 0.05) continue;

      imageOpts.width = sp.size * 5;
      imageOpts.height = sp.size * 5;
      imageOpts.tint = smokeColor;
      imageOpts.alpha = alpha;
      imageOpts.blendMode = bNormal;
      api.brush.image(glowDataUrl, sp.x, sp.y, imageOpts);
    }

    // ============================================================
    // SNOWFALL
    // ============================================================
    snowSpawnTimer += dt;
    if (snowSpawnTimer > 0.06) {
      snowSpawnTimer = 0;
      for (let i = 0; i < MAX_SNOWFLAKES; i++) {
        if (!snowflakes[i].active) {
          initSnowflake(snowflakes[i], canvasW);
          break;
        }
      }
    }

    for (let i = 0; i < MAX_SNOWFLAKES; i++) {
      const sf = snowflakes[i];
      if (!sf.active) continue;

      sf.x += (sf.drift + Math.sin(t * 1.5 + sf.phase) * 8) * dt;
      sf.y += sf.vy * dt;

      if (sf.y > canvasH + 5 || sf.x < -10 || sf.x > canvasW + 10) {
        sf.active = false;
        continue;
      }

      api.brush.circle(sf.x, sf.y, sf.size, {
        fill: snowflakeColor,
        alpha: 0.6 + 0.2 * Math.sin(t + sf.phase),
        blendMode: bMode,
      });
    }

    // ============================================================
    // FOREGROUND SNOW MOUNDS
    // ============================================================
    for (let i = 0; i < 3; i++) {
      const mx = canvasW * (0.15 + i * 0.35);
      const my = canvasH * 0.95;
      api.brush.ellipse(mx, my, 60 + i * 15, 12, {
        fill: snowCapColor,
        alpha: 0.3,
        blendMode: bNormal,
      });
    }
  },

  async teardown(): Promise<void> {
    houses = [];
    auroraBands = [];
    snowflakes = [];
    smokeParticles = [];
    stars = [];
    glowDataUrl = '';
    smokeSpawnTimer = 0;
    snowSpawnTimer = 0;
    canvasW = 0;
    canvasH = 0;
  },
};

// ============================================================
// HELPER: Map dark-mode facade color to light-mode
// ============================================================

function getFacadeLight(darkColor: number): number {
  if (darkColor === FACADE_RED_D) return FACADE_RED_L;
  if (darkColor === FACADE_YELLOW_D) return FACADE_YELLOW_L;
  if (darkColor === FACADE_BLUE_D) return FACADE_BLUE_L;
  if (darkColor === FACADE_GREEN_D) return FACADE_GREEN_L;
  return darkColor;
}

// ============================================================
// REGISTER & EXPORT
// ============================================================

registerActor(actor);
export default actor;
