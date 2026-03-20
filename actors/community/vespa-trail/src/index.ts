/**
 * Vespa Trail — Foreground Actor
 *
 * A tiny Vespa scooter silhouette zips across the canvas leaving
 * colorful exhaust trails that curl and fade.
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
  id: 'vespa-trail',
  name: 'Vespa Trail',
  description: 'Vespa scooter zipping across the canvas leaving colorful curling exhaust trails',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'vespa', 'motion', 'trail'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

const MAX_TRAIL = 80;
const TRAIL_COLORS = [0xff6347, 0x4682b4, 0x32cd32, 0xffd700, 0xff69b4];

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

let canvasW = 0;
let canvasH = 0;
let vespaX = 0;
let vespaY = 0;
let vespaAngle = 0;
let speed = 0;
let targetAngle = 0;
let trail: TrailPoint[] = [];
let trailHead = 0;
let trailColor = 0;
let nextTurnTime = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    vespaX = canvasW * 0.5;
    vespaY = canvasH * 0.7;
    vespaAngle = -Math.PI / 4;
    targetAngle = vespaAngle;
    speed = 2.5;
    trailHead = 0;
    trailColor = TRAIL_COLORS[Math.floor(Math.random() * TRAIL_COLORS.length)];
    nextTurnTime = 2000;

    trail = [];
    for (let i = 0; i < MAX_TRAIL; i++) {
      trail.push({ x: 0, y: 0, age: -1 });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const tSec = t / 1000;
    const dt = Math.min(frame.deltaTime, 32) / 16;
    const isDark = api.context.display.isDarkMode();

    // Decide new direction periodically
    if (t > nextTurnTime) {
      targetAngle = vespaAngle + (Math.random() - 0.5) * 2.0;
      nextTurnTime = t + 1500 + Math.random() * 3000;

      // Occasionally change trail color
      if (Math.random() < 0.3) {
        trailColor = TRAIL_COLORS[Math.floor(Math.random() * TRAIL_COLORS.length)];
      }
    }

    // Steer towards target
    let angleDiff = targetAngle - vespaAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    vespaAngle += angleDiff * 0.03 * dt;

    // Steer away from edges
    const margin = 50;
    if (vespaX < margin) targetAngle = 0;
    else if (vespaX > canvasW - margin) targetAngle = Math.PI;
    if (vespaY < margin) targetAngle = Math.PI / 2;
    else if (vespaY > canvasH - margin) targetAngle = -Math.PI / 2;

    // Move
    vespaX += Math.cos(vespaAngle) * speed * dt;
    vespaY += Math.sin(vespaAngle) * speed * dt;

    // Clamp to canvas
    vespaX = Math.max(10, Math.min(canvasW - 10, vespaX));
    vespaY = Math.max(10, Math.min(canvasH - 10, vespaY));

    // Add trail point
    trail[trailHead].x = vespaX - Math.cos(vespaAngle) * 8;
    trail[trailHead].y = vespaY - Math.sin(vespaAngle) * 8;
    trail[trailHead].age = 0;
    trailHead = (trailHead + 1) % MAX_TRAIL;

    // Draw trail
    for (let i = 0; i < MAX_TRAIL; i++) {
      const p = trail[i];
      if (p.age < 0) continue;
      p.age += dt;

      const life = 1 - p.age / 120;
      if (life <= 0.05) {
        p.age = -1;
        continue;
      }

      // Trail expands and fades
      const size = 3 + (1 - life) * 8;
      const wobble = Math.sin(tSec * 3 + i * 0.5) * (1 - life) * 5;

      api.brush.circle(p.x + wobble, p.y + wobble * 0.5, size, {
        fill: trailColor,
        alpha: life * 0.4,
        blendMode: 'add',
      });
    }

    // Draw Vespa silhouette
    const vColor = isDark ? 0xdddddd : 0x333333;

    api.brush.pushMatrix();
    api.brush.translate(vespaX, vespaY);
    api.brush.rotate(vespaAngle);

    // Body
    api.brush.ellipse(0, 0, 12, 6, {
      fill: vColor,
      alpha: 0.9,
    });

    // Front wheel
    api.brush.circle(8, 3, 3, {
      fill: vColor,
      alpha: 0.8,
    });

    // Rear wheel
    api.brush.circle(-7, 3, 3, {
      fill: vColor,
      alpha: 0.8,
    });

    // Handlebar
    api.brush.line(5, -1, 9, -4, {
      color: vColor,
      width: 2,
      alpha: 0.8,
      cap: 'round',
    });

    // Headlight glow
    api.brush.circle(12, 0, 2, {
      fill: 0xffffaa,
      alpha: 0.7,
      blendMode: 'add',
    });

    api.brush.popMatrix();
  },

  async teardown(): Promise<void> {
    trail = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
