/**
 * EP Poseidon — Foreground Actor
 *
 * Europa-Park's water coaster in the Greek-themed area.
 * Features a classical Greek temple facade with Doric columns,
 * a triangular pediment, Poseidon's glowing trident, animated
 * water splashing into a pool, and rippling waves.
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
  id: 'ep-poseidon',
  name: 'EP Poseidon',
  description:
    'Europa-Park Poseidon water coaster: Greek temple with columns, trident, and animated water splashdown',
  author: { name: 'Taco Verdonschot', github: 'tacoverdonschot' },
  version: '1.0.0',
  tags: ['europapark', 'poseidon', 'water', 'greek', 'temple'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
  role: 'foreground',
};

// ── Constants ────────────────────────────────────────────────
const MAX_DROPLETS = 30;
const MAX_WAVES = 8;
const MAX_COLUMN_LIGHTS = 6;
const NUM_COLUMNS = 6;
const CANVAS_W = 360;
const CANVAS_H = 640;

// ── Color palette ────────────────────────────────────────────
const COL_MARBLE_DARK = 0xc8bfa0;
const COL_MARBLE_LIGHT = 0xf0ead6;
const COL_MARBLE_ACCENT_DARK = 0xa89878;
const COL_MARBLE_ACCENT_LIGHT = 0xddd5c0;
const COL_GOLD_DARK = 0xd4a843;
const COL_GOLD_LIGHT = 0xb8922e;
const COL_WATER_DARK = 0x2288bb;
const COL_WATER_LIGHT = 0x1a6699;
const COL_FOAM_DARK = 0x88ccee;
const COL_FOAM_LIGHT = 0x66aacc;
const COL_SKY_GLOW_DARK = 0x3399cc;
const COL_SKY_GLOW_LIGHT = 0x2277aa;
const COL_TRIDENT_DARK = 0xf0d060;
const COL_TRIDENT_LIGHT = 0xc8a830;
const COL_SHADOW_DARK = 0x1a1a2e;
const COL_SHADOW_LIGHT = 0x555566;
const COL_STEP_DARK = 0x9a8e70;
const COL_STEP_LIGHT = 0xc4b898;

// ── Types ────────────────────────────────────────────────────
interface Droplet {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  phase: number;
}

interface Wave {
  active: boolean;
  x: number;
  amplitude: number;
  speed: number;
  phase: number;
  width: number;
}

interface ColumnLight {
  active: boolean;
  x: number;
  y: number;
  phase: number;
  size: number;
}

// ── Pre-allocated state ──────────────────────────────────────
let droplets: Droplet[] = [];
let waves: Wave[] = [];
let columnLights: ColumnLight[] = [];
let glowDataUrl = '';
let canvasW = 0;
let canvasH = 0;
let nextDropletIdx = 0;

// Reusable style objects (avoid allocations in update)
const shapeStyle = { fill: 0, alpha: 1, blendMode: 'normal' as const };
const lineStyle = { color: 0, width: 3, alpha: 1, blendMode: 'normal' as const };
const addStyle = { fill: 0, alpha: 1, blendMode: 'add' as const };

// Temple layout (computed in setup)
let templeBaseY = 0;
let templeTopY = 0;
let templeLeft = 0;
let templeRight = 0;
let templeWidth = 0;
let columnSpacing = 0;
let columnHeight = 0;
let columnWidth = 0;
let pedimentPeakY = 0;
let poolY = 0;
let poolHeight = 0;
let tridentCenterX = 0;
let tridentTopY = 0;

function resetDroplet(d: Droplet, baseX: number, baseY: number): void {
  d.active = true;
  d.x = baseX + (Math.random() - 0.5) * 80;
  d.y = baseY;
  d.vx = (Math.random() - 0.5) * 1.8;
  d.vy = -(1.5 + Math.random() * 3);
  d.size = 1.5 + Math.random() * 2.5;
  d.life = 0;
  d.maxLife = 40 + Math.random() * 40;
  d.phase = Math.random() * Math.PI * 2;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Temple geometry
    templeWidth = canvasW * 0.82;
    templeLeft = (canvasW - templeWidth) / 2;
    templeRight = templeLeft + templeWidth;
    templeBaseY = canvasH * 0.55;
    columnHeight = canvasH * 0.22;
    templeTopY = templeBaseY - columnHeight;
    columnWidth = templeWidth * 0.055;
    columnSpacing = templeWidth / (NUM_COLUMNS + 1);
    pedimentPeakY = templeTopY - canvasH * 0.09;
    poolY = canvasH * 0.62;
    poolHeight = canvasH * 0.18;
    tridentCenterX = canvasW * 0.5;
    tridentTopY = pedimentPeakY - canvasH * 0.15;

    // Pre-allocate droplets
    droplets = [];
    for (let i = 0; i < MAX_DROPLETS; i++) {
      droplets.push({
        active: false,
        x: 0, y: 0, vx: 0, vy: 0,
        size: 2, life: 0, maxLife: 60, phase: 0,
      });
    }
    nextDropletIdx = 0;

    // Pre-allocate waves
    waves = [];
    for (let i = 0; i < MAX_WAVES; i++) {
      waves.push({
        active: true,
        x: canvasW * (i / MAX_WAVES),
        amplitude: 2 + Math.random() * 3,
        speed: 0.3 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        width: canvasW * 0.35 + Math.random() * canvasW * 0.2,
      });
    }

    // Pre-allocate column lights
    columnLights = [];
    for (let i = 0; i < MAX_COLUMN_LIGHTS && i < NUM_COLUMNS; i++) {
      const cx = templeLeft + columnSpacing * (i + 1);
      columnLights.push({
        active: true,
        x: cx,
        y: templeBaseY - columnHeight * 0.5,
        phase: (i / NUM_COLUMNS) * Math.PI * 2,
        size: columnWidth * 3,
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

    // Pick colors based on mode
    const marble = isDark ? COL_MARBLE_DARK : COL_MARBLE_LIGHT;
    const marbleAccent = isDark ? COL_MARBLE_ACCENT_DARK : COL_MARBLE_ACCENT_LIGHT;
    const gold = isDark ? COL_GOLD_DARK : COL_GOLD_LIGHT;
    const water = isDark ? COL_WATER_DARK : COL_WATER_LIGHT;
    const foam = isDark ? COL_FOAM_DARK : COL_FOAM_LIGHT;
    const tridentColor = isDark ? COL_TRIDENT_DARK : COL_TRIDENT_LIGHT;
    const shadow = isDark ? COL_SHADOW_DARK : COL_SHADOW_LIGHT;
    const stepColor = isDark ? COL_STEP_DARK : COL_STEP_LIGHT;
    const skyGlow = isDark ? COL_SKY_GLOW_DARK : COL_SKY_GLOW_LIGHT;

    // ── Background glow behind temple ────────────────────────
    api.brush.image(glowDataUrl, canvasW * 0.5, templeTopY, {
      width: canvasW * 1.2,
      height: canvasH * 0.5,
      tint: skyGlow,
      alpha: isDark ? 0.12 : 0.08,
      blendMode: 'add',
    });

    // ── Temple steps (3 steps) ───────────────────────────────
    for (let s = 0; s < 3; s++) {
      const stepW = templeWidth + s * 16;
      const stepX = (canvasW - stepW) / 2;
      const stepY = templeBaseY + s * 8;
      const stepH = 8;
      const stepAlpha = 0.75 - s * 0.08;
      api.brush.rect(stepX, stepY, stepW, stepH, {
        fill: stepColor,
        alpha: stepAlpha,
        blendMode: 'normal',
      });
    }

    // ── Architrave (entablature) ─────────────────────────────
    const entH = canvasH * 0.025;
    api.brush.rect(templeLeft - 4, templeTopY - entH, templeWidth + 8, entH, {
      fill: marble,
      alpha: 0.85,
      blendMode: 'normal',
    });
    // Frieze line
    api.brush.line(templeLeft - 4, templeTopY - entH, templeRight + 4, templeTopY - entH, {
      color: marbleAccent,
      width: 2.5,
      alpha: 0.7,
      blendMode: 'normal',
    });

    // ── Triangular pediment ──────────────────────────────────
    const pedLeft = templeLeft - 6;
    const pedRight = templeRight + 6;
    const pedBaseY = templeTopY - entH;

    api.brush.polygon(
      [
        { x: pedLeft, y: pedBaseY },
        { x: canvasW * 0.5, y: pedimentPeakY },
        { x: pedRight, y: pedBaseY },
      ],
      { fill: marble, alpha: 0.82, blendMode: 'normal' },
    );
    // Pediment border
    api.brush.line(pedLeft, pedBaseY, canvasW * 0.5, pedimentPeakY, {
      color: marbleAccent,
      width: 2.5,
      alpha: 0.7,
      blendMode: 'normal',
    });
    api.brush.line(canvasW * 0.5, pedimentPeakY, pedRight, pedBaseY, {
      color: marbleAccent,
      width: 2.5,
      alpha: 0.7,
      blendMode: 'normal',
    });

    // ── Columns (Doric style) ────────────────────────────────
    for (let i = 0; i < NUM_COLUMNS; i++) {
      const cx = templeLeft + columnSpacing * (i + 1);
      const colTop = templeTopY;
      const colBot = templeBaseY;
      const halfW = columnWidth * 0.5;

      // Column shaft (slight entasis: thicker at middle)
      const entasis = columnWidth * 0.06;
      api.brush.polygon(
        [
          { x: cx - halfW, y: colBot },
          { x: cx - halfW - entasis, y: colBot - columnHeight * 0.5 },
          { x: cx - halfW + 1, y: colTop },
          { x: cx + halfW - 1, y: colTop },
          { x: cx + halfW + entasis, y: colBot - columnHeight * 0.5 },
          { x: cx + halfW, y: colBot },
        ],
        { fill: marble, alpha: 0.85, blendMode: 'normal' },
      );

      // Doric capital (simple abacus)
      api.brush.rect(cx - halfW - 3, colTop, columnWidth + 6, 6, {
        fill: marbleAccent,
        alpha: 0.8,
        blendMode: 'normal',
      });

      // Column base
      api.brush.rect(cx - halfW - 2, colBot - 5, columnWidth + 4, 5, {
        fill: marbleAccent,
        alpha: 0.8,
        blendMode: 'normal',
      });

      // Fluting lines (3 per column)
      for (let f = 0; f < 3; f++) {
        const fx = cx - halfW * 0.5 + f * halfW * 0.5;
        api.brush.line(fx, colTop + 6, fx, colBot - 5, {
          color: shadow,
          width: 1,
          alpha: 0.15,
          blendMode: 'normal',
        });
      }
    }

    // ── Column lighting (glow at column base/mid) ────────────
    for (let i = 0; i < columnLights.length; i++) {
      const cl = columnLights[i];
      if (!cl.active) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.2 + cl.phase);
      const glowAlpha = 0.06 + pulse * 0.08;
      if (glowAlpha < 0.05) continue;
      api.brush.image(glowDataUrl, cl.x, cl.y, {
        width: cl.size * (1.5 + pulse * 0.5),
        height: columnHeight * 0.8,
        tint: gold,
        alpha: glowAlpha,
        blendMode: 'add',
      });
    }

    // ── Trident ──────────────────────────────────────────────
    // Trident is centered above the pediment
    const tridentShaftLen = canvasH * 0.2;
    const tridentBotY = tridentTopY + tridentShaftLen;
    const tridentGlowPulse = 0.5 + 0.5 * Math.sin(t * 0.8);

    // Glow behind trident
    api.brush.image(glowDataUrl, tridentCenterX, tridentTopY + tridentShaftLen * 0.35, {
      width: 80 + tridentGlowPulse * 20,
      height: tridentShaftLen * 1.3,
      tint: tridentColor,
      alpha: isDark ? 0.2 + tridentGlowPulse * 0.12 : 0.1 + tridentGlowPulse * 0.08,
      blendMode: 'add',
    });

    // Shaft
    api.brush.line(tridentCenterX, tridentTopY + 25, tridentCenterX, tridentBotY, {
      color: tridentColor,
      width: 4,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Prongs
    const prongHeight = canvasH * 0.06;
    const prongSpread = 18;

    // Center prong
    api.brush.line(tridentCenterX, tridentTopY + 25, tridentCenterX, tridentTopY, {
      color: tridentColor,
      width: 3.5,
      alpha: 0.9,
      blendMode: 'normal',
    });
    // Center prong tip
    api.brush.polygon(
      [
        { x: tridentCenterX - 3, y: tridentTopY + 2 },
        { x: tridentCenterX, y: tridentTopY - 8 },
        { x: tridentCenterX + 3, y: tridentTopY + 2 },
      ],
      { fill: tridentColor, alpha: 0.9, blendMode: 'normal' },
    );

    // Left prong
    const lpBaseY = tridentTopY + 25;
    const lpTopX = tridentCenterX - prongSpread;
    const lpTopY = tridentTopY + 4;
    api.brush.line(tridentCenterX - 4, lpBaseY, lpTopX, lpTopY, {
      color: tridentColor,
      width: 3,
      alpha: 0.9,
      blendMode: 'normal',
    });
    api.brush.polygon(
      [
        { x: lpTopX - 3, y: lpTopY + 2 },
        { x: lpTopX, y: lpTopY - 6 },
        { x: lpTopX + 3, y: lpTopY + 2 },
      ],
      { fill: tridentColor, alpha: 0.9, blendMode: 'normal' },
    );

    // Right prong
    const rpTopX = tridentCenterX + prongSpread;
    const rpTopY = tridentTopY + 4;
    api.brush.line(tridentCenterX + 4, lpBaseY, rpTopX, rpTopY, {
      color: tridentColor,
      width: 3,
      alpha: 0.9,
      blendMode: 'normal',
    });
    api.brush.polygon(
      [
        { x: rpTopX - 3, y: rpTopY + 2 },
        { x: rpTopX, y: rpTopY - 6 },
        { x: rpTopX + 3, y: rpTopY + 2 },
      ],
      { fill: tridentColor, alpha: 0.9, blendMode: 'normal' },
    );

    // Cross-bar on trident
    api.brush.line(
      tridentCenterX - prongSpread + 2, lpBaseY - 2,
      tridentCenterX + prongSpread - 2, lpBaseY - 2,
      { color: tridentColor, width: 3, alpha: 0.85, blendMode: 'normal' },
    );

    // Trident glow tips
    const tipGlow = 0.12 + tridentGlowPulse * 0.15;
    api.brush.image(glowDataUrl, tridentCenterX, tridentTopY - 4, {
      width: 20, height: 20, tint: 0xffffff, alpha: tipGlow, blendMode: 'add',
    });
    api.brush.image(glowDataUrl, lpTopX, lpTopY - 3, {
      width: 16, height: 16, tint: 0xffffff, alpha: tipGlow * 0.8, blendMode: 'add',
    });
    api.brush.image(glowDataUrl, rpTopX, rpTopY - 3, {
      width: 16, height: 16, tint: 0xffffff, alpha: tipGlow * 0.8, blendMode: 'add',
    });

    // ── Water pool ───────────────────────────────────────────
    const poolTop = poolY;
    const poolBot = poolY + poolHeight;

    // Pool body
    api.brush.rect(0, poolTop, canvasW, poolHeight, {
      fill: water,
      alpha: isDark ? 0.65 : 0.55,
      blendMode: 'normal',
    });

    // ── Waves ────────────────────────────────────────────────
    for (let i = 0; i < MAX_WAVES; i++) {
      const w = waves[i];
      if (!w.active) continue;

      const wy = poolTop + 4 + i * (poolHeight / MAX_WAVES) * 0.5;
      const waveSin = Math.sin(t * w.speed + w.phase);
      const waveOff = waveSin * w.amplitude;

      const alpha = 0.25 + Math.abs(waveSin) * 0.2;
      if (alpha < 0.05) continue;

      // Wave as a gentle curve
      api.brush.line(
        w.x - w.width * 0.5, wy + waveOff,
        w.x + w.width * 0.5, wy - waveOff,
        { color: foam, width: 2.5, alpha, blendMode: 'add' },
      );

      // Second harmonic for realism
      const wy2 = wy + 5;
      const waveOff2 = Math.sin(t * w.speed * 1.3 + w.phase + 1) * w.amplitude * 0.6;
      api.brush.line(
        w.x - w.width * 0.4, wy2 + waveOff2,
        w.x + w.width * 0.4, wy2 - waveOff2,
        { color: foam, width: 1.5, alpha: alpha * 0.6, blendMode: 'add' },
      );
    }

    // ── Splash zone (where ride hits water) ──────────────────
    const splashX = canvasW * 0.5;
    const splashY = poolTop;

    // Splash foam arc
    const splashPulse = 0.6 + 0.4 * Math.sin(t * 2.5);
    api.brush.image(glowDataUrl, splashX, splashY, {
      width: 60 * splashPulse,
      height: 40 * splashPulse,
      tint: foam,
      alpha: isDark ? 0.25 : 0.18,
      blendMode: 'add',
    });

    // Spray mist
    api.brush.image(glowDataUrl, splashX - 20, splashY - 15, {
      width: 40,
      height: 30,
      tint: 0xffffff,
      alpha: 0.06 + splashPulse * 0.05,
      blendMode: 'add',
    });
    api.brush.image(glowDataUrl, splashX + 20, splashY - 15, {
      width: 40,
      height: 30,
      tint: 0xffffff,
      alpha: 0.06 + splashPulse * 0.05,
      blendMode: 'add',
    });

    // ── Animated water droplets ──────────────────────────────
    // Spawn 1-2 droplets per frame (round-robin pool)
    const spawnCount = 1 + (frame.frameCount % 3 === 0 ? 1 : 0);
    for (let s = 0; s < spawnCount; s++) {
      const d = droplets[nextDropletIdx];
      resetDroplet(d, splashX, splashY);
      nextDropletIdx = (nextDropletIdx + 1) % MAX_DROPLETS;
    }

    // Update and render droplets
    const gravity = 0.08;
    for (let i = 0; i < MAX_DROPLETS; i++) {
      const d = droplets[i];
      if (!d.active) continue;

      d.life += 1;
      if (d.life > d.maxLife) {
        d.active = false;
        continue;
      }

      d.vy += gravity;
      d.x += d.vx;
      d.y += d.vy;

      const lifeRatio = d.life / d.maxLife;
      let alpha = 0.7;
      if (lifeRatio < 0.15) {
        alpha = (lifeRatio / 0.15) * 0.7;
      } else if (lifeRatio > 0.7) {
        alpha = ((1 - lifeRatio) / 0.3) * 0.7;
      }
      if (alpha < 0.05) continue;

      const dropSize = d.size * (1 - lifeRatio * 0.4);
      api.brush.circle(d.x, d.y, dropSize, {
        fill: foam,
        alpha,
        blendMode: 'add',
      });
    }

    // ── Water surface shimmer ────────────────────────────────
    const shimmerCount = 5;
    for (let i = 0; i < shimmerCount; i++) {
      const sx = canvasW * (0.15 + i * 0.17);
      const sy = poolTop + 10 + Math.sin(t * 1.5 + i * 1.2) * 6;
      const shimmerAlpha = 0.08 + Math.sin(t * 2 + i * 0.9) * 0.06;
      if (shimmerAlpha < 0.05) continue;
      api.brush.image(glowDataUrl, sx, sy, {
        width: 30,
        height: 12,
        tint: 0xffffff,
        alpha: shimmerAlpha,
        blendMode: 'add',
      });
    }

    // ── Pool edge / foam line at top ─────────────────────────
    api.brush.line(0, poolTop, canvasW, poolTop, {
      color: foam,
      width: 3,
      alpha: 0.5 + Math.sin(t * 1.8) * 0.15,
      blendMode: 'normal',
    });

    // ── Decorative Greek key pattern on architrave ───────────
    const keyY = templeTopY - entH + 3;
    const keySize = 5;
    const keyCount = Math.floor(templeWidth / (keySize * 3));
    for (let i = 0; i < keyCount; i++) {
      const kx = templeLeft + 8 + i * keySize * 3;
      const alpha = 0.3;
      // Simple meander motif as small rect outlines
      api.brush.rect(kx, keyY, keySize, keySize, {
        fill: gold,
        alpha,
        blendMode: 'normal',
      });
      api.brush.rect(kx + keySize, keyY + keySize * 0.5, keySize, keySize * 0.5, {
        fill: gold,
        alpha: alpha * 0.7,
        blendMode: 'normal',
      });
    }

    // ── Pediment decoration: small sun disk ──────────────────
    const sunX = canvasW * 0.5;
    const sunY = pedimentPeakY + (templeTopY - entH - pedimentPeakY) * 0.45;
    api.brush.circle(sunX, sunY, 10, {
      fill: gold,
      alpha: 0.7,
      blendMode: 'normal',
    });
    // Sun rays
    for (let r = 0; r < 8; r++) {
      const angle = (r / 8) * Math.PI * 2 + t * 0.2;
      const rx1 = sunX + Math.cos(angle) * 12;
      const ry1 = sunY + Math.sin(angle) * 12;
      const rx2 = sunX + Math.cos(angle) * 18;
      const ry2 = sunY + Math.sin(angle) * 18;
      api.brush.line(rx1, ry1, rx2, ry2, {
        color: gold,
        width: 1.5,
        alpha: 0.5,
        blendMode: 'normal',
      });
    }

    // ── Reflections in pool (column reflections) ─────────────
    for (let i = 0; i < NUM_COLUMNS; i++) {
      const cx = templeLeft + columnSpacing * (i + 1);
      const reflY = poolTop + 15;
      const reflH = 25;
      const reflAlpha = 0.08 + Math.sin(t * 1.4 + i) * 0.04;
      if (reflAlpha < 0.05) continue;
      api.brush.rect(cx - columnWidth * 0.3, reflY, columnWidth * 0.6, reflH, {
        fill: marble,
        alpha: reflAlpha,
        blendMode: 'add',
      });
    }
  },

  async teardown(): Promise<void> {
    droplets = [];
    waves = [];
    columnLights = [];
    glowDataUrl = '';
    canvasW = 0;
    canvasH = 0;
    nextDropletIdx = 0;
  },
};

registerActor(actor);
export default actor;
