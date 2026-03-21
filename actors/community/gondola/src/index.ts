/**
 * Gondola — Foreground Actor
 *
 * A Venetian gondola gliding across water in the lower portion of the canvas,
 * with a gondolier silhouette, striped mooring pole, and teal water ripples.
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
  id: 'gondola',
  name: 'Gondola',
  description: 'A Venetian gondola gliding across teal water with a gondolier and mooring pole',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'venice', 'gondola', 'water'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// Constants
const HULL_COLOR = 0x1a1a1a;
const POLE_RED = 0xdd3333;
const POLE_WHITE = 0xffffff;
const WATER_TEAL = 0x2a6a7a;
const WATER_DARK = 0x1d4d5a;
const GONDOLA_SPEED = 0.4;
const ROCK_AMPLITUDE = 0.015; // radians
const ROCK_SPEED = 1.8;
const RIPPLE_COUNT = 12;
const GONDOLIER_COLOR = 0x111111;

// Pre-allocated state
let canvasW = 0;
let canvasH = 0;
let waterY = 0;
let gondolaX = 0;
let gondolaDir = 1; // 1 = right, -1 = left
let poleX = 0;

// Pre-allocated ripple positions
const rippleX: number[] = [];
const ripplePhase: number[] = [];
const rippleWidth: number[] = [];

// Hull polygon points (pre-allocated arrays)
const hullPointsX: number[] = [];
const hullPointsY: number[] = [];

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Water starts at 70% of canvas height
    waterY = canvasH * 0.70;

    // Start gondola at random position
    gondolaX = Math.random() * canvasW;
    gondolaDir = Math.random() > 0.5 ? 1 : -1;

    // Place mooring pole at a fixed position
    poleX = canvasW * (0.15 + Math.random() * 0.15);

    // Initialize ripple data
    rippleX.length = 0;
    ripplePhase.length = 0;
    rippleWidth.length = 0;
    for (let i = 0; i < RIPPLE_COUNT; i++) {
      rippleX.push(Math.random() * canvasW);
      ripplePhase.push(Math.random() * Math.PI * 2);
      rippleWidth.push(20 + Math.random() * 40);
    }

    // Pre-build hull shape points
    hullPointsX.length = 0;
    hullPointsY.length = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = Math.min(frame.deltaTime, 32) / 16;
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    const waterColor = isDark ? WATER_TEAL : 0x3a8a9a;
    const waterDarkColor = isDark ? WATER_DARK : 0x2a6a7a;
    const reflectionAlpha = isDark ? 0.3 : 0.2;

    // Update gondola position
    gondolaX += GONDOLA_SPEED * gondolaDir * dt;

    // Wrap around
    if (gondolaX > canvasW + 120) {
      gondolaX = -120;
    } else if (gondolaX < -120) {
      gondolaX = canvasW + 120;
    }

    // Rocking motion
    const rockAngle = Math.sin(tSec * ROCK_SPEED) * ROCK_AMPLITUDE;

    // --- Draw water ripples (background layer) ---
    for (let i = 0; i < RIPPLE_COUNT; i++) {
      const rx = rippleX[i];
      const rPhase = ripplePhase[i];
      const rw = rippleWidth[i];
      const ry = waterY + 10 + (i / RIPPLE_COUNT) * (canvasH - waterY - 20);
      const waveOffset = Math.sin(tSec * 1.2 + rPhase) * 8;

      api.brush.line(
        rx - rw + waveOffset, ry,
        rx + rw + waveOffset, ry,
        { color: waterColor, width: 2, alpha: 0.6 + Math.sin(tSec + rPhase) * 0.15, blendMode: 'normal' }
      );
    }

    // A few larger water surface lines
    for (let i = 0; i < 5; i++) {
      const ly = waterY + 5 + i * ((canvasH - waterY) / 5);
      const lWave = Math.sin(tSec * 0.8 + i * 1.3) * 15;
      api.brush.line(
        0 + lWave, ly,
        canvasW + lWave, ly,
        { color: waterDarkColor, width: 1, alpha: 0.35, blendMode: 'normal' }
      );
    }

    // --- Draw mooring pole ---
    const poleTop = waterY - 70;
    const poleBottom = waterY + 40;
    const poleHeight = poleBottom - poleTop;
    const stripeCount = 8;
    const stripeH = poleHeight / stripeCount;

    for (let i = 0; i < stripeCount; i++) {
      const sy = poleTop + i * stripeH;
      const stripeColor = i % 2 === 0 ? POLE_RED : POLE_WHITE;
      api.brush.rect(poleX - 3, sy, 6, stripeH + 1, {
        fill: stripeColor,
        alpha: 0.9,
        blendMode: 'normal',
      });
    }

    // Pole cap (gold ornament)
    api.brush.circle(poleX, poleTop - 4, 5, {
      fill: 0xdaa520,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Pole reflection in water
    for (let i = 0; i < 3; i++) {
      const ry = waterY + 45 + i * 12;
      const rWave = Math.sin(tSec * 1.5 + i) * 3;
      api.brush.rect(poleX - 2 + rWave, ry, 4, 8, {
        fill: POLE_RED,
        alpha: 0.2 - i * 0.05,
        blendMode: 'normal',
      });
    }

    // --- Draw gondola ---
    const gondolaY = waterY - 5;

    api.brush.pushMatrix();
    api.brush.translate(gondolaX, gondolaY);
    api.brush.rotate(rockAngle);

    // Hull - main body (elongated ellipse)
    const hullLen = 100;
    const hullHalfH = 10;
    api.brush.ellipse(0, 0, hullLen, hullHalfH, {
      fill: HULL_COLOR,
      alpha: 0.95,
      blendMode: 'normal',
    });

    // Prow (ferro) - the distinctive upswept front
    const prowDir = gondolaDir;
    const prowBaseX = prowDir * hullLen * 0.85;

    // Upswept prow curve using lines
    api.brush.line(
      prowBaseX, -2,
      prowBaseX + prowDir * 15, -25,
      { color: HULL_COLOR, width: 4, alpha: 0.95, cap: 'round', blendMode: 'normal' }
    );
    // Ferro teeth (the comb-like decoration)
    for (let i = 0; i < 4; i++) {
      const ty = -10 - i * 4;
      const tx = prowBaseX + prowDir * (10 + i * 1.5);
      api.brush.line(
        tx, ty,
        tx + prowDir * 6, ty - 2,
        { color: 0x333333, width: 2, alpha: 0.8, cap: 'round', blendMode: 'normal' }
      );
    }

    // Stern rise (slight upturn at back)
    const sternX = -prowDir * hullLen * 0.8;
    api.brush.line(
      sternX, -2,
      sternX - prowDir * 8, -12,
      { color: HULL_COLOR, width: 3, alpha: 0.9, cap: 'round', blendMode: 'normal' }
    );

    // --- Gondolier (stick figure silhouette at stern) ---
    const gX = sternX - prowDir * 2;
    const gBodyBottom = -hullHalfH + 2;
    const gBodyTop = gBodyBottom - 35;

    // Legs
    api.brush.line(gX - 4, gBodyBottom, gX, gBodyBottom - 15,
      { color: GONDOLIER_COLOR, width: 2.5, alpha: 0.85, blendMode: 'normal' });
    api.brush.line(gX + 4, gBodyBottom, gX, gBodyBottom - 15,
      { color: GONDOLIER_COLOR, width: 2.5, alpha: 0.85, blendMode: 'normal' });

    // Torso
    api.brush.line(gX, gBodyBottom - 15, gX, gBodyTop + 5,
      { color: GONDOLIER_COLOR, width: 3, alpha: 0.85, blendMode: 'normal' });

    // Head
    api.brush.circle(gX, gBodyTop, 4, {
      fill: GONDOLIER_COLOR,
      alpha: 0.85,
      blendMode: 'normal',
    });

    // Arms + oar
    const oarPhase = Math.sin(tSec * 2.0) * 0.3;
    const armY = gBodyBottom - 22;
    // Arms reach back
    api.brush.line(gX, armY, gX - prowDir * 12, armY - 3,
      { color: GONDOLIER_COLOR, width: 2, alpha: 0.8, blendMode: 'normal' });

    // Oar (long pole)
    const oarHandX = gX - prowDir * 12;
    const oarEndX = oarHandX - prowDir * 30;
    api.brush.line(
      oarHandX, armY - 3,
      oarEndX, 25 + oarPhase * 15,
      { color: 0x4a3520, width: 2, alpha: 0.8, cap: 'round', blendMode: 'normal' }
    );

    // Oar blade
    api.brush.ellipse(oarEndX, 28 + oarPhase * 15, 6, 3, {
      fill: 0x4a3520,
      alpha: 0.7,
      blendMode: 'normal',
    });

    api.brush.popMatrix();

    // --- Gondola reflection in water ---
    const reflBaseY = waterY + 12;
    api.brush.ellipse(gondolaX, reflBaseY + 8, hullLen * 0.9, hullHalfH * 0.6, {
      fill: HULL_COLOR,
      alpha: reflectionAlpha,
      blendMode: 'normal',
    });

    // Wake ripples behind gondola
    for (let i = 0; i < 4; i++) {
      const wakeX = gondolaX - gondolaDir * (30 + i * 20);
      const wakeY = waterY + 3 + i * 3;
      const wakeAlpha = 0.3 - i * 0.06;
      const wakeW = 15 + i * 8;
      const waveOff = Math.sin(tSec * 2.5 + i * 0.8) * 3;

      api.brush.line(
        wakeX - wakeW, wakeY + waveOff,
        wakeX + wakeW, wakeY + waveOff,
        { color: waterColor, width: 1.5, alpha: wakeAlpha, blendMode: 'normal' }
      );
    }
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    rippleX.length = 0;
    ripplePhase.length = 0;
    rippleWidth.length = 0;
    hullPointsX.length = 0;
    hullPointsY.length = 0;
  },
};

registerActor(actor);
export default actor;
