/**
 * Pizza Toss — Foreground Actor
 *
 * Spinning pizza dough flying up from the bottom, stretching as it spins.
 * The dough oscillates between round and stretched, rotates as it rises,
 * slows, then falls back down in a repeating cycle. Flour particles scatter
 * on each toss. Toppings gradually appear as the dough develops.
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
  id: 'pizza-toss',
  name: 'Pizza Toss',
  description: 'Spinning pizza dough tossed into the air with flour particles and developing toppings',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'pizza', 'food', 'fun'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// Dough colors
const DOUGH_LIGHT = 0xe8d4a0;
const DOUGH_EDGE = 0xd4b880;
const DOUGH_SHADOW = 0xc4a870;

// Topping colors
const SAUCE_RED = 0xcc3322;
const BASIL_GREEN = 0x44aa44;
const MOZZ_WHITE = 0xf5f0e0;

// Flour colors
const FLOUR_LIGHT = 0xfaf6ee;
const FLOUR_DARK = 0xe8e0d0;

// Pool sizes
const MAX_FLOUR = 40;
const MAX_TOPPINGS = 18;

interface FlourParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface Topping {
  active: boolean;
  angle: number;      // position on dough (radial angle)
  dist: number;       // distance from dough center (0-1 fraction of radius)
  size: number;
  color: number;
  spawnCycle: number;  // which toss cycle it appeared on
}

// Dough state
let canvasW = 0;
let canvasH = 0;
let doughX = 0;
let doughY = 0;
let doughBaseY = 0;        // bottom rest position
let doughPeakY = 0;        // top of arc
let doughVy = 0;
let doughRotation = 0;
let doughRotSpeed = 0;
let doughPhase = 0;         // 0=rising, 1=falling, 2=resting
let doughStretch = 0;       // 0=round, positive=stretched
let doughBaseRadius = 0;
let tossCycle = 0;
let restTimer = 0;
let tossSpeed = 0;

// Pools
let flour: FlourParticle[] = [];
let toppings: Topping[] = [];

// Reusable math vars
let tmpSin = 0;
let tmpCos = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    doughBaseRadius = Math.min(canvasW, canvasH) * 0.12;
    doughBaseY = canvasH * 0.82;
    doughPeakY = canvasH * 0.18;
    doughX = canvasW * 0.5;
    doughY = doughBaseY;
    doughVy = 0;
    doughRotation = 0;
    doughRotSpeed = 0;
    doughStretch = 0;
    doughPhase = 2; // start resting, will toss quickly
    tossCycle = 0;
    restTimer = 500; // short initial rest before first toss
    tossSpeed = 0;

    // Pre-allocate flour particles
    flour = [];
    for (let i = 0; i < MAX_FLOUR; i++) {
      flour.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        size: 0, alpha: 0, life: 0, maxLife: 0,
      });
    }

    // Pre-allocate toppings
    toppings = [];
    for (let i = 0; i < MAX_TOPPINGS; i++) {
      toppings.push({
        active: false, angle: 0, dist: 0,
        size: 0, color: 0, spawnCycle: 0,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const dt = Math.min(frame.deltaTime, 32) / 16;
    const isDark = api.context.display.isDarkMode();

    // --- Dough physics ---
    if (doughPhase === 2) {
      // Resting at bottom — wait then toss
      restTimer -= frame.deltaTime;
      if (restTimer <= 0) {
        doughPhase = 0; // start rising
        tossSpeed = 6 + Math.random() * 2;
        doughVy = -tossSpeed;
        doughRotSpeed = (3 + Math.random() * 4) * (Math.random() > 0.5 ? 1 : -1);
        tossCycle++;

        // Spawn flour burst
        spawnFlour(doughX, doughY, 12 + Math.floor(Math.random() * 8));

        // Add toppings after first few cycles
        if (tossCycle >= 2) {
          spawnToppings(1 + Math.floor(Math.random() * 2));
        }
      }
    } else {
      // Rising or falling
      const gravity = 0.12;
      doughVy += gravity * dt;
      doughY += doughVy * dt;

      // Rotation (faster when higher, slower near bottom)
      const heightFraction = 1 - (doughY - doughPeakY) / (doughBaseY - doughPeakY);
      doughRotation += doughRotSpeed * dt * 0.04 * (0.5 + heightFraction * 0.5);

      // Stretch oscillation: more stretched at peak, round at bottom
      const stretchOsc = Math.sin(t * 0.008) * 0.3;
      doughStretch = heightFraction * 0.35 + stretchOsc * heightFraction;

      // Slow rotation as dough approaches bottom
      if (doughPhase === 0 && doughVy >= 0) {
        doughPhase = 1; // now falling
      }

      // Landed
      if (doughY >= doughBaseY) {
        doughY = doughBaseY;
        doughVy = 0;
        doughPhase = 2;
        doughStretch = 0;
        doughRotSpeed *= 0.3; // dampen spin
        restTimer = 800 + Math.random() * 1200;

        // Small flour puff on landing
        spawnFlour(doughX, doughY, 4 + Math.floor(Math.random() * 4));
      }
    }

    // Gentle sway when airborne
    if (doughPhase !== 2) {
      doughX = canvasW * 0.5 + Math.sin(t * 0.003) * canvasW * 0.06;
    } else {
      // Drift back to center while resting
      doughX += (canvasW * 0.5 - doughX) * 0.05 * dt;
    }

    // --- Update flour particles ---
    for (let i = 0; i < MAX_FLOUR; i++) {
      const f = flour[i];
      if (!f.active) continue;

      f.life += frame.deltaTime;
      if (f.life >= f.maxLife) {
        f.active = false;
        continue;
      }

      f.vy += 0.03 * dt; // gentle gravity
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 0.98; // air drag
      f.alpha = Math.max(0.6, 1 - f.life / f.maxLife) * 0.8;
    }

    // --- Rendering ---

    // Draw flour particles behind dough
    for (let i = 0; i < MAX_FLOUR; i++) {
      const f = flour[i];
      if (!f.active) continue;
      if (f.alpha < 0.6) continue;

      api.brush.circle(f.x, f.y, f.size, {
        fill: isDark ? FLOUR_DARK : FLOUR_LIGHT,
        alpha: f.alpha,
        blendMode: 'normal',
      });
    }

    // Draw shadow on ground
    const shadowScale = 1 - (doughBaseY - doughY) / (doughBaseY - doughPeakY) * 0.5;
    const shadowAlpha = 0.15 + shadowScale * 0.1;
    if (shadowAlpha >= 0.6) {
      api.brush.ellipse(doughX, doughBaseY + 8, doughBaseRadius * shadowScale * 1.3, 6, {
        fill: 0x000000,
        alpha: 0.6,
        blendMode: 'normal',
      });
    } else {
      api.brush.ellipse(doughX, doughBaseY + 8, doughBaseRadius * shadowScale * 1.3, 6, {
        fill: 0x000000,
        alpha: Math.max(0.6, shadowAlpha),
        blendMode: 'normal',
      });
    }

    // Compute dough radii with stretch
    const radiusA = doughBaseRadius * (1 + doughStretch * 0.6);  // wider axis
    const radiusB = doughBaseRadius * (1 - doughStretch * 0.3);  // narrower axis

    // Draw dough shadow layer (slightly offset)
    api.brush.pushMatrix();
    api.brush.translate(doughX + 2, doughY + 3);
    api.brush.rotate(doughRotation);
    api.brush.ellipse(0, 0, radiusA + 2, radiusB + 2, {
      fill: DOUGH_SHADOW,
      alpha: 0.7,
      blendMode: 'normal',
    });
    api.brush.popMatrix();

    // Draw dough edge ring
    api.brush.pushMatrix();
    api.brush.translate(doughX, doughY);
    api.brush.rotate(doughRotation);
    api.brush.ellipse(0, 0, radiusA, radiusB, {
      fill: DOUGH_EDGE,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Draw dough inner (lighter center)
    api.brush.ellipse(0, 0, radiusA * 0.82, radiusB * 0.82, {
      fill: DOUGH_LIGHT,
      alpha: 0.9,
      blendMode: 'normal',
    });

    // Draw toppings on the dough (rotate with it)
    for (let i = 0; i < MAX_TOPPINGS; i++) {
      const top = toppings[i];
      if (!top.active) continue;

      const tx = Math.cos(top.angle) * top.dist * radiusA * 0.7;
      const ty = Math.sin(top.angle) * top.dist * radiusB * 0.7;

      api.brush.circle(tx, ty, top.size, {
        fill: top.color,
        alpha: 0.85,
        blendMode: 'normal',
      });
    }

    // Dough highlight (specular spot upper-left in local space)
    api.brush.ellipse(-radiusA * 0.2, -radiusB * 0.25, radiusA * 0.3, radiusB * 0.25, {
      fill: 0xffffff,
      alpha: 0.15,
      blendMode: 'add',
    });

    api.brush.popMatrix();

    // Draw crust rim dots along edge for texture (only when airborne for visual interest)
    if (doughPhase !== 2) {
      const rimCount = 16;
      for (let i = 0; i < rimCount; i++) {
        const a = (i / rimCount) * Math.PI * 2 + doughRotation;
        tmpCos = Math.cos(a);
        tmpSin = Math.sin(a);
        const rx = doughX + tmpCos * radiusA * 0.92;
        const ry = doughY + tmpSin * radiusB * 0.92;

        api.brush.circle(rx, ry, 2 + Math.sin(a * 3 + t * 0.005) * 0.8, {
          fill: DOUGH_EDGE,
          alpha: 0.6,
          blendMode: 'normal',
        });
      }
    }
  },

  async teardown(): Promise<void> {
    flour = [];
    toppings = [];
    canvasW = 0;
    canvasH = 0;
    tossCycle = 0;
  },
};

// --- Helper functions (no allocations, reuse pool objects) ---

function spawnFlour(cx: number, cy: number, count: number): void {
  let spawned = 0;
  for (let i = 0; i < MAX_FLOUR && spawned < count; i++) {
    if (!flour[i].active) {
      const f = flour[i];
      f.active = true;
      f.x = cx + (Math.random() - 0.5) * 20;
      f.y = cy + (Math.random() - 0.5) * 10;
      f.vx = (Math.random() - 0.5) * 3;
      f.vy = -(1 + Math.random() * 2.5);
      f.size = 1.5 + Math.random() * 3;
      f.alpha = 0.8;
      f.life = 0;
      f.maxLife = 600 + Math.random() * 800;
      spawned++;
    }
  }
}

function spawnToppings(count: number): void {
  const toppingColors = [SAUCE_RED, SAUCE_RED, BASIL_GREEN, MOZZ_WHITE];
  let spawned = 0;
  for (let i = 0; i < MAX_TOPPINGS && spawned < count; i++) {
    if (!toppings[i].active) {
      const top = toppings[i];
      top.active = true;
      top.angle = Math.random() * Math.PI * 2;
      top.dist = 0.2 + Math.random() * 0.7;
      top.size = 2 + Math.random() * 3;
      top.color = toppingColors[Math.floor(Math.random() * toppingColors.length)];
      top.spawnCycle = tossCycle;
      spawned++;
    }
  }
}

registerActor(actor);
export default actor;
