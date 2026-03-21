/**
 * Trevi Fountain -- Foreground Actor
 *
 * A baroque Trevi Fountain with a large central arch flanked by two smaller
 * side arches, Corinthian columns, cascading water flowing over rocky
 * formations into a semicircular pool. Animated water particles fall and
 * splash, coins glint at the bottom of the pool, and ripples radiate
 * across the water surface.
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
  id: 'trevi-fountain',
  name: 'Trevi Fountain',
  description:
    'Baroque Trevi Fountain with cascading water, animated particles, coin glints, and pool ripples',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'rome', 'architecture', 'fountain'],
  createdAt: new Date('2026-03-21'),
  role: 'foreground',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// -- Constants ---------------------------------------------------------------
const MAX_WATER_PARTICLES = 60;
const MAX_SPLASH_PARTICLES = 24;
const MAX_COINS = 14;
const MAX_RIPPLES = 8;
const MAX_ROCK_BLOCKS = 18;
const MAX_COLUMN_LINES = 10;

// Stone palette
const COL_STONE_LIGHT = 0xe0d8c8;
const COL_STONE_MID   = 0xc0b8a8;
const COL_STONE_DARK  = 0xa09888;
const COL_STONE_ACCENT = 0xd0c8b8;

// Water palette
const COL_WATER       = 0x5aadbd;
const COL_WATER_DEEP  = 0x3a8d9d;
const COL_SPLASH      = 0xddeeff;
const COL_COIN_GOLD   = 0xdaa520;
const COL_COIN_SILVER = 0xc0c0c0;

// -- State types -------------------------------------------------------------
interface WaterParticle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  phase: number;
  sourceArch: number; // 0=left, 1=center, 2=right
  active: boolean;
}

interface SplashParticle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
}

interface Coin {
  x: number; y: number;
  size: number;
  phase: number;
  speed: number;
  isGold: boolean;
}

interface Ripple {
  cx: number; cy: number;
  radius: number;
  maxRadius: number;
  life: number;
  speed: number;
}

interface RockBlock {
  x: number; y: number;
  w: number; h: number;
  color: number;
}

// -- Pre-allocated state -----------------------------------------------------
let canvasW = 0;
let canvasH = 0;

// Layout
let facadeLeft = 0;
let facadeRight = 0;
let facadeW = 0;
let facadeTop = 0;
let facadeBottom = 0;
let poolTop = 0;
let poolBottom = 0;
let poolCenterX = 0;
let poolCenterY = 0;

// Arch geometry
let centerArchCX = 0;
let centerArchTop = 0;
let centerArchW = 0;
let centerArchH = 0;
let leftArchCX = 0;
let leftArchTop = 0;
let rightArchCX = 0;
let rightArchTop = 0;
let sideArchW = 0;
let sideArchH = 0;

// Pre-allocated arrays
let waterParticles: WaterParticle[] = [];
let splashParticles: SplashParticle[] = [];
let coins: Coin[] = [];
let ripples: Ripple[] = [];
let rockBlocks: RockBlock[] = [];

// Glow texture
let glowDataUrl = '';

// Reusable style objects
const rectStyle   = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const circleStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const arcStyle    = { color: 0, width: 2, alpha: 1.0, blendMode: 'normal' as const };
const ellipseStyle = { fill: 0, alpha: 1.0, blendMode: 'normal' as const };
const imageStyle  = { width: 0, height: 0, tint: 0, alpha: 1.0, blendMode: 'add' as const };

// -- Helpers -----------------------------------------------------------------
function resetWaterParticle(p: WaterParticle, archIdx: number): void {
  p.sourceArch = archIdx;
  p.active = true;
  p.phase = Math.random() * Math.PI * 2;

  if (archIdx === 1) {
    // Center arch -- wider spread
    p.x = centerArchCX + (Math.random() - 0.5) * centerArchW * 0.6;
    p.y = centerArchTop + centerArchH * 0.5 + Math.random() * 10;
    p.vx = (Math.random() - 0.5) * 1.2;
    p.vy = 0.8 + Math.random() * 1.0;
    p.size = 2 + Math.random() * 2.5;
  } else {
    const cx = archIdx === 0 ? leftArchCX : rightArchCX;
    p.x = cx + (Math.random() - 0.5) * sideArchW * 0.5;
    p.y = leftArchTop + sideArchH * 0.5 + Math.random() * 8;
    p.vx = (Math.random() - 0.5) * 0.8;
    p.vy = 0.6 + Math.random() * 0.8;
    p.size = 1.5 + Math.random() * 2;
  }
}

function resetSplash(s: SplashParticle, x: number, y: number): void {
  s.x = x;
  s.y = y;
  s.vx = (Math.random() - 0.5) * 3;
  s.vy = -(1.0 + Math.random() * 2.5);
  s.life = 0;
  s.maxLife = 20 + Math.random() * 25;
  s.size = 1 + Math.random() * 1.5;
  s.active = true;
}

// -- Actor -------------------------------------------------------------------
const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Layout -- fountain centered horizontally, lower two-thirds of canvas
    facadeLeft = canvasW * 0.06;
    facadeRight = canvasW * 0.94;
    facadeW = facadeRight - facadeLeft;
    facadeTop = canvasH * 0.18;
    facadeBottom = canvasH * 0.62;

    poolTop = canvasH * 0.68;
    poolBottom = canvasH * 0.88;
    poolCenterX = canvasW * 0.5;
    poolCenterY = (poolTop + poolBottom) * 0.5;

    // Central arch
    centerArchCX = canvasW * 0.5;
    centerArchW = facadeW * 0.32;
    centerArchH = (facadeBottom - facadeTop) * 0.55;
    centerArchTop = facadeTop + (facadeBottom - facadeTop) * 0.15;

    // Side arches
    sideArchW = facadeW * 0.18;
    sideArchH = centerArchH * 0.65;
    leftArchCX = facadeLeft + facadeW * 0.2;
    rightArchCX = facadeRight - facadeW * 0.2;
    leftArchTop = centerArchTop + (centerArchH - sideArchH) * 0.4;
    rightArchTop = leftArchTop;

    // Pre-allocate water particles
    waterParticles = [];
    for (let i = 0; i < MAX_WATER_PARTICLES; i++) {
      const p: WaterParticle = {
        x: 0, y: 0, vx: 0, vy: 0,
        size: 2, phase: 0, sourceArch: 0, active: false,
      };
      const archIdx = i < 30 ? 1 : (i < 45 ? 0 : 2);
      resetWaterParticle(p, archIdx);
      // Stagger initial positions
      p.y += Math.random() * (poolTop - p.y);
      waterParticles.push(p);
    }

    // Pre-allocate splash particles
    splashParticles = [];
    for (let i = 0; i < MAX_SPLASH_PARTICLES; i++) {
      splashParticles.push({
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 30, size: 1, active: false,
      });
    }

    // Pre-allocate coins in pool
    coins = [];
    for (let i = 0; i < MAX_COINS; i++) {
      const angle = Math.random() * Math.PI;
      const dist = Math.random() * (facadeW * 0.38);
      coins.push({
        x: poolCenterX + Math.cos(angle + Math.PI) * dist * 0.8,
        y: poolCenterY + Math.sin(angle) * dist * 0.2 + (Math.random() - 0.5) * 15,
        size: 1.5 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 1.5,
        isGold: Math.random() > 0.3,
      });
    }

    // Pre-allocate ripples
    ripples = [];
    for (let i = 0; i < MAX_RIPPLES; i++) {
      ripples.push({
        cx: poolCenterX + (Math.random() - 0.5) * facadeW * 0.6,
        cy: poolCenterY + (Math.random() - 0.5) * 20,
        radius: Math.random() * 30,
        maxRadius: 20 + Math.random() * 30,
        life: Math.random(),
        speed: 0.3 + Math.random() * 0.5,
      });
    }

    // Pre-allocate rock formations between facade and pool
    rockBlocks = [];
    const rockBaseY = facadeBottom;
    const rockH = poolTop - facadeBottom;
    for (let i = 0; i < MAX_ROCK_BLOCKS; i++) {
      const t = i / MAX_ROCK_BLOCKS;
      rockBlocks.push({
        x: facadeLeft + facadeW * (0.05 + t * 0.9) + (Math.random() - 0.5) * 12,
        y: rockBaseY + Math.random() * rockH * 0.8,
        w: 10 + Math.random() * 25,
        h: 8 + Math.random() * 18,
        color: [COL_STONE_LIGHT, COL_STONE_MID, COL_STONE_DARK][Math.floor(Math.random() * 3)],
      });
    }

    // Glow texture
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
    const tSec = frame.time / 1000;
    const dt = Math.min(frame.delta / 16.667, 3); // normalised to ~60fps
    const isDark = api.context.display.isDarkMode();

    // ================================================================
    // FACADE -- main stone wall
    // ================================================================
    const facadeFill = isDark ? COL_STONE_MID : COL_STONE_LIGHT;
    api.brush.rect(facadeLeft, facadeTop, facadeW, facadeBottom - facadeTop, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: isDark ? COL_STONE_LIGHT : 0xece4d4 },
          { offset: 0.5, color: facadeFill },
          { offset: 1, color: isDark ? COL_STONE_DARK : COL_STONE_MID },
        ],
      },
      alpha: 0.95,
      blendMode: 'normal',
    });

    // Top cornice
    rectStyle.fill = isDark ? COL_STONE_ACCENT : 0xece4d4;
    rectStyle.alpha = 0.9;
    rectStyle.blendMode = 'normal';
    api.brush.rect(facadeLeft - 4, facadeTop - 8, facadeW + 8, 10, rectStyle);

    // Pediment (triangular crown) -- approximated with a narrow rect
    rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xece4d4;
    rectStyle.alpha = 0.85;
    api.brush.rect(centerArchCX - centerArchW * 0.6, facadeTop - 18, centerArchW * 1.2, 12, rectStyle);

    // Sub-cornice divider
    rectStyle.fill = isDark ? COL_STONE_DARK : COL_STONE_MID;
    rectStyle.alpha = 0.7;
    api.brush.rect(facadeLeft, facadeTop + (facadeBottom - facadeTop) * 0.08, facadeW, 3, rectStyle);

    // ================================================================
    // COLUMNS -- flanking the arches
    // ================================================================
    const columnPositions = [
      leftArchCX - sideArchW * 0.6,
      leftArchCX + sideArchW * 0.6,
      centerArchCX - centerArchW * 0.55,
      centerArchCX + centerArchW * 0.55,
      rightArchCX - sideArchW * 0.6,
      rightArchCX + sideArchW * 0.6,
    ];
    const colTop = facadeTop + (facadeBottom - facadeTop) * 0.05;
    const colBottom = facadeBottom;
    const colW = 8;

    for (let i = 0; i < 6; i++) {
      const cx = columnPositions[i];

      // Column shaft
      api.brush.rect(cx - colW / 2, colTop, colW, colBottom - colTop, {
        fill: {
          type: 'linear',
          x0: 0, y0: 0.5,
          x1: 1, y1: 0.5,
          stops: [
            { offset: 0, color: isDark ? COL_STONE_LIGHT : 0xece4d4 },
            { offset: 0.4, color: isDark ? COL_STONE_ACCENT : COL_STONE_LIGHT },
            { offset: 1, color: isDark ? COL_STONE_DARK : COL_STONE_MID },
          ],
        },
        alpha: 0.85,
        blendMode: 'normal',
      });

      // Capital (top ornament)
      rectStyle.fill = isDark ? COL_STONE_LIGHT : 0xece4d4;
      rectStyle.alpha = 0.8;
      rectStyle.blendMode = 'normal';
      api.brush.rect(cx - colW * 0.7, colTop - 2, colW * 1.4, 6, rectStyle);

      // Base
      api.brush.rect(cx - colW * 0.6, colBottom - 5, colW * 1.2, 5, rectStyle);
    }

    // Vertical fluting lines on columns
    arcStyle.color = isDark ? COL_STONE_DARK : COL_STONE_MID;
    arcStyle.width = 0.8;
    arcStyle.alpha = 0.3;
    arcStyle.blendMode = 'normal';
    for (let i = 0; i < 6; i++) {
      const cx = columnPositions[i];
      api.brush.line(cx - 1, colTop + 6, cx - 1, colBottom - 5, arcStyle);
      api.brush.line(cx + 1, colTop + 6, cx + 1, colBottom - 5, arcStyle);
    }

    // ================================================================
    // ARCHES -- central large + two smaller side arches
    // ================================================================
    const archInterior = isDark ? 0x2a2a3a : 0x4a4a5a;

    // Central arch interior
    const cArchR = centerArchW / 2;
    rectStyle.fill = archInterior;
    rectStyle.alpha = 0.9;
    rectStyle.blendMode = 'normal';
    api.brush.rect(centerArchCX - cArchR, centerArchTop + cArchR, centerArchW, centerArchH - cArchR, rectStyle);
    circleStyle.fill = archInterior;
    circleStyle.alpha = 0.9;
    circleStyle.blendMode = 'normal';
    api.brush.ellipse(centerArchCX, centerArchTop + cArchR, cArchR, cArchR, circleStyle);

    // Central arch surround
    arcStyle.color = isDark ? COL_STONE_LIGHT : 0xece4d4;
    arcStyle.width = 4;
    arcStyle.alpha = 0.85;
    arcStyle.blendMode = 'normal';
    api.brush.arc(centerArchCX, centerArchTop + cArchR, cArchR + 2, Math.PI, 0, arcStyle);

    // Keystone at top of central arch
    rectStyle.fill = isDark ? COL_STONE_ACCENT : 0xece4d4;
    rectStyle.alpha = 0.8;
    api.brush.rect(centerArchCX - 5, centerArchTop - 2, 10, 12, rectStyle);

    // Side arches
    const sArchR = sideArchW / 2;
    for (let side = 0; side < 2; side++) {
      const cx = side === 0 ? leftArchCX : rightArchCX;
      const top = side === 0 ? leftArchTop : rightArchTop;

      // Interior
      rectStyle.fill = archInterior;
      rectStyle.alpha = 0.85;
      rectStyle.blendMode = 'normal';
      api.brush.rect(cx - sArchR, top + sArchR, sideArchW, sideArchH - sArchR, rectStyle);
      circleStyle.fill = archInterior;
      circleStyle.alpha = 0.85;
      circleStyle.blendMode = 'normal';
      api.brush.ellipse(cx, top + sArchR, sArchR, sArchR, circleStyle);

      // Surround
      arcStyle.color = isDark ? COL_STONE_LIGHT : 0xece4d4;
      arcStyle.width = 3;
      arcStyle.alpha = 0.8;
      api.brush.arc(cx, top + sArchR, sArchR + 1.5, Math.PI, 0, arcStyle);
    }

    // ================================================================
    // ROCKY FORMATIONS between facade and pool
    // ================================================================
    // Large rocky base
    rectStyle.fill = isDark ? COL_STONE_DARK : COL_STONE_MID;
    rectStyle.alpha = 0.9;
    rectStyle.blendMode = 'normal';
    api.brush.rect(facadeLeft, facadeBottom, facadeW, poolTop - facadeBottom, rectStyle);

    // Individual rocks for texture
    for (let i = 0; i < MAX_ROCK_BLOCKS; i++) {
      const rock = rockBlocks[i];
      rectStyle.fill = isDark
        ? (rock.color === COL_STONE_LIGHT ? COL_STONE_MID : rock.color)
        : rock.color;
      rectStyle.alpha = 0.75;
      rectStyle.blendMode = 'normal';
      api.brush.rect(rock.x, rock.y, rock.w, rock.h, rectStyle);

      // Highlight edge
      rectStyle.fill = isDark ? COL_STONE_ACCENT : COL_STONE_LIGHT;
      rectStyle.alpha = 0.3;
      api.brush.rect(rock.x, rock.y, rock.w, 2, rectStyle);
    }

    // Central cascade rock mound
    circleStyle.fill = isDark ? COL_STONE_DARK : COL_STONE_MID;
    circleStyle.alpha = 0.8;
    circleStyle.blendMode = 'normal';
    api.brush.ellipse(centerArchCX, facadeBottom + 10, centerArchW * 0.45, 20, circleStyle);

    // ================================================================
    // WATER STREAMS -- flowing from arches
    // ================================================================
    // Continuous water streams (translucent rects from arch bases)
    const streamAlpha = 0.35 + 0.1 * Math.sin(tSec * 2);
    rectStyle.fill = COL_WATER;
    rectStyle.alpha = streamAlpha;
    rectStyle.blendMode = 'normal';

    // Center stream (wider)
    const cStreamW = centerArchW * 0.3 + Math.sin(tSec * 1.5) * 3;
    api.brush.rect(
      centerArchCX - cStreamW / 2,
      centerArchTop + centerArchH * 0.6,
      cStreamW,
      poolTop - (centerArchTop + centerArchH * 0.6),
      rectStyle,
    );

    // Side streams (narrower)
    const sStreamW = sideArchW * 0.25 + Math.sin(tSec * 1.8) * 2;
    rectStyle.alpha = streamAlpha * 0.8;
    api.brush.rect(
      leftArchCX - sStreamW / 2,
      leftArchTop + sideArchH * 0.5,
      sStreamW,
      poolTop - (leftArchTop + sideArchH * 0.5),
      rectStyle,
    );
    api.brush.rect(
      rightArchCX - sStreamW / 2,
      rightArchTop + sideArchH * 0.5,
      sStreamW,
      poolTop - (rightArchTop + sideArchH * 0.5),
      rectStyle,
    );

    // ================================================================
    // WATER PARTICLES -- animated droplets
    // ================================================================
    let nextSplashIdx = 0;
    for (let i = 0; i < MAX_WATER_PARTICLES; i++) {
      const p = waterParticles[i];

      // Physics
      p.vy += 0.12 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx += Math.sin(tSec * 3 + p.phase) * 0.02 * dt; // wind wobble

      // Hit pool surface -> splash + reset
      if (p.y >= poolTop - 2) {
        // Spawn a splash
        if (nextSplashIdx < MAX_SPLASH_PARTICLES) {
          resetSplash(splashParticles[nextSplashIdx], p.x, poolTop);
          nextSplashIdx++;
        }
        resetWaterParticle(p, p.sourceArch);
        continue;
      }

      // Draw droplet
      circleStyle.fill = COL_WATER;
      circleStyle.alpha = 0.7;
      circleStyle.blendMode = 'normal';
      api.brush.circle(p.x, p.y, p.size, circleStyle);

      // Bright highlight on droplet
      circleStyle.fill = COL_SPLASH;
      circleStyle.alpha = 0.35;
      circleStyle.blendMode = 'add';
      api.brush.circle(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.5, circleStyle);
    }

    // ================================================================
    // SPLASH PARTICLES
    // ================================================================
    for (let i = 0; i < MAX_SPLASH_PARTICLES; i++) {
      const s = splashParticles[i];
      if (!s.active) continue;

      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        continue;
      }

      s.vy += 0.08 * dt; // gravity
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      const lifeRatio = s.life / s.maxLife;
      const alpha = 0.7 * (1 - lifeRatio);
      if (alpha < 0.05) continue;

      circleStyle.fill = COL_SPLASH;
      circleStyle.alpha = alpha;
      circleStyle.blendMode = 'add';
      api.brush.circle(s.x, s.y, s.size * (1 - lifeRatio * 0.5), circleStyle);
    }

    // ================================================================
    // POOL
    // ================================================================
    // Pool basin (semicircular approximation via ellipse)
    ellipseStyle.fill = isDark ? COL_WATER_DEEP : COL_WATER;
    ellipseStyle.alpha = 0.75;
    ellipseStyle.blendMode = 'normal';
    api.brush.ellipse(
      poolCenterX, poolTop + 4,
      facadeW * 0.46, (poolBottom - poolTop) * 0.55,
      ellipseStyle,
    );

    // Pool surface highlight
    api.brush.ellipse(poolCenterX, poolTop + 2, facadeW * 0.44, (poolBottom - poolTop) * 0.15, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0,
        x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: COL_SPLASH },
          { offset: 1, color: COL_WATER },
        ],
      },
      alpha: 0.3,
      blendMode: 'add',
    });

    // Pool stone rim
    arcStyle.color = isDark ? COL_STONE_MID : COL_STONE_LIGHT;
    arcStyle.width = 4;
    arcStyle.alpha = 0.8;
    arcStyle.blendMode = 'normal';
    api.brush.arc(
      poolCenterX, poolTop + 4,
      facadeW * 0.46,
      0, Math.PI,
      arcStyle,
    );

    // ================================================================
    // RIPPLES on pool surface
    // ================================================================
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = ripples[i];
      r.life += r.speed * dt * 0.02;

      if (r.life >= 1.0) {
        // Reset ripple
        r.life = 0;
        r.cx = poolCenterX + (Math.random() - 0.5) * facadeW * 0.5;
        r.cy = poolTop + 5 + Math.random() * (poolBottom - poolTop) * 0.35;
        r.maxRadius = 15 + Math.random() * 25;
        r.speed = 0.3 + Math.random() * 0.5;
      }

      r.radius = r.life * r.maxRadius;
      const rippleAlpha = 0.25 * (1 - r.life);
      if (rippleAlpha < 0.05) continue;

      arcStyle.color = COL_SPLASH;
      arcStyle.width = 1.2;
      arcStyle.alpha = rippleAlpha;
      arcStyle.blendMode = 'add';
      api.brush.arc(r.cx, r.cy, r.radius, 0, Math.PI * 2, arcStyle);
    }

    // ================================================================
    // COINS in pool
    // ================================================================
    for (let i = 0; i < MAX_COINS; i++) {
      const coin = coins[i];
      const sparkle = 0.5 + 0.5 * Math.sin(tSec * coin.speed + coin.phase);
      const alpha = 0.6 + sparkle * 0.3;

      // Coin body
      circleStyle.fill = coin.isGold ? COL_COIN_GOLD : COL_COIN_SILVER;
      circleStyle.alpha = alpha;
      circleStyle.blendMode = 'normal';
      api.brush.circle(coin.x, coin.y, coin.size, circleStyle);

      // Sparkle highlight
      if (sparkle > 0.75) {
        circleStyle.fill = 0xffffff;
        circleStyle.alpha = (sparkle - 0.75) * 3.0;
        circleStyle.blendMode = 'add';
        api.brush.circle(coin.x, coin.y, coin.size * 0.6, circleStyle);
      }
    }

    // ================================================================
    // WARM GLOW from arches (ambient lighting)
    // ================================================================
    if (isDark) {
      const glowPulse = 0.08 + 0.03 * Math.sin(tSec * 0.7);
      imageStyle.width = centerArchW * 2;
      imageStyle.height = centerArchH * 1.5;
      imageStyle.tint = 0xffcc80;
      imageStyle.alpha = glowPulse;
      imageStyle.blendMode = 'add';
      api.brush.image(glowDataUrl, centerArchCX, centerArchTop + centerArchH * 0.4, imageStyle);

      // Side arch glows
      imageStyle.width = sideArchW * 1.8;
      imageStyle.height = sideArchH * 1.3;
      imageStyle.alpha = glowPulse * 0.7;
      api.brush.image(glowDataUrl, leftArchCX, leftArchTop + sideArchH * 0.4, imageStyle);
      api.brush.image(glowDataUrl, rightArchCX, rightArchTop + sideArchH * 0.4, imageStyle);
    }

    // Water surface shimmer on pool
    const shimmerAlpha = isDark ? 0.05 : 0.08;
    imageStyle.width = facadeW * 0.7;
    imageStyle.height = (poolBottom - poolTop) * 0.6;
    imageStyle.tint = COL_SPLASH;
    imageStyle.alpha = shimmerAlpha + 0.02 * Math.sin(tSec * 1.2);
    imageStyle.blendMode = 'add';
    api.brush.image(glowDataUrl, poolCenterX, poolCenterY - 5, imageStyle);

    // ================================================================
    // GROUND below pool
    // ================================================================
    rectStyle.fill = isDark ? 0x5a5040 : 0x9a9080;
    rectStyle.alpha = 0.9;
    rectStyle.blendMode = 'normal';
    api.brush.rect(0, poolBottom, canvasW, canvasH - poolBottom, rectStyle);

    // Cobblestone strip
    rectStyle.fill = isDark ? 0x6a6050 : 0xaaa090;
    rectStyle.alpha = 0.6;
    api.brush.rect(facadeLeft - 10, poolBottom, facadeW + 20, 12, rectStyle);
  },

  async teardown(): Promise<void> {
    waterParticles = [];
    splashParticles = [];
    coins = [];
    ripples = [];
    rockBlocks = [];
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
