/**
 * Tuscan Swallows — Foreground Actor
 *
 * Flocking birds swooping across the canvas with emergent
 * murmuration patterns using boids-like behavior.
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
  id: 'tuscan-swallows',
  name: 'Tuscan Swallows',
  description: 'Flocking birds with emergent murmuration patterns swooping across the canvas',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'birds', 'italy', 'nature', 'flock'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['display'],
};

const MAX_BIRDS = 30;
const NEIGHBOR_DIST = 80;
const NEIGHBOR_DIST_SQ = NEIGHBOR_DIST * NEIGHBOR_DIST;
const SEPARATION_DIST = 25;
const SEPARATION_DIST_SQ = SEPARATION_DIST * SEPARATION_DIST;
const MAX_SPEED = 3.0;
const MIN_SPEED = 1.2;

interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  wingPhase: number;
  wingSpeed: number;
  size: number;
}

let canvasW = 0;
let canvasH = 0;
let birds: Bird[] = [];
// Reusable vectors to avoid allocation
let sepX = 0;
let sepY = 0;
let aliX = 0;
let aliY = 0;
let cohX = 0;
let cohY = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    birds = [];
    // Start flock from one side
    const startX = Math.random() * canvasW;
    const startY = canvasH * (0.2 + Math.random() * 0.4);
    const baseAngle = Math.random() * Math.PI * 2;

    for (let i = 0; i < MAX_BIRDS; i++) {
      const angle = baseAngle + (Math.random() - 0.5) * 0.8;
      const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
      birds.push({
        x: startX + (Math.random() - 0.5) * 100,
        y: startY + (Math.random() - 0.5) * 80,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        wingPhase: Math.random() * Math.PI * 2,
        wingSpeed: 6 + Math.random() * 4,
        size: 3 + Math.random() * 2,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = Math.min(frame.deltaTime, 32) / 16; // normalize to ~60fps
    const tSec = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    const bodyColor = isDark ? 0xccccdd : 0x222233;
    const wingColor = isDark ? 0x9999bb : 0x333344;

    // Slowly drifting attractor point to guide the flock
    const attractX = canvasW * 0.5 + Math.sin(tSec * 0.15) * canvasW * 0.35;
    const attractY = canvasH * 0.4 + Math.cos(tSec * 0.12) * canvasH * 0.25;

    // Update each bird with boids rules
    for (let i = 0; i < MAX_BIRDS; i++) {
      const b = birds[i];
      let neighbors = 0;

      sepX = 0; sepY = 0;
      aliX = 0; aliY = 0;
      cohX = 0; cohY = 0;

      for (let j = 0; j < MAX_BIRDS; j++) {
        if (i === j) continue;
        const o = birds[j];
        const dx = o.x - b.x;
        const dy = o.y - b.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < NEIGHBOR_DIST_SQ && distSq > 0) {
          neighbors++;
          // Alignment
          aliX += o.vx;
          aliY += o.vy;
          // Cohesion
          cohX += o.x;
          cohY += o.y;

          // Separation
          if (distSq < SEPARATION_DIST_SQ) {
            const dist = Math.sqrt(distSq);
            sepX -= dx / dist;
            sepY -= dy / dist;
          }
        }
      }

      if (neighbors > 0) {
        // Alignment: steer towards average heading
        aliX /= neighbors;
        aliY /= neighbors;
        b.vx += (aliX - b.vx) * 0.05 * dt;
        b.vy += (aliY - b.vy) * 0.05 * dt;

        // Cohesion: steer towards center of neighbors
        cohX = cohX / neighbors - b.x;
        cohY = cohY / neighbors - b.y;
        b.vx += cohX * 0.003 * dt;
        b.vy += cohY * 0.003 * dt;

        // Separation
        b.vx += sepX * 0.08 * dt;
        b.vy += sepY * 0.08 * dt;
      }

      // Gentle pull towards attractor
      const toAttractX = attractX - b.x;
      const toAttractY = attractY - b.y;
      b.vx += toAttractX * 0.0003 * dt;
      b.vy += toAttractY * 0.0003 * dt;

      // Soft boundary steering
      const margin = 40;
      if (b.x < margin) b.vx += 0.15 * dt;
      else if (b.x > canvasW - margin) b.vx -= 0.15 * dt;
      if (b.y < margin) b.vy += 0.15 * dt;
      else if (b.y > canvasH - margin) b.vy -= 0.15 * dt;

      // Clamp speed
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed > MAX_SPEED) {
        b.vx = (b.vx / speed) * MAX_SPEED;
        b.vy = (b.vy / speed) * MAX_SPEED;
      } else if (speed < MIN_SPEED && speed > 0) {
        b.vx = (b.vx / speed) * MIN_SPEED;
        b.vy = (b.vy / speed) * MIN_SPEED;
      }

      // Update position
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Wrap around if way off screen
      if (b.x < -50) b.x = canvasW + 40;
      if (b.x > canvasW + 50) b.x = -40;
      if (b.y < -50) b.y = canvasH + 40;
      if (b.y > canvasH + 50) b.y = -40;

      // Draw bird
      const angle = Math.atan2(b.vy, b.vx);
      const wing = Math.sin(tSec * b.wingSpeed + b.wingPhase);
      const wingSpan = b.size * (1.5 + wing * 0.8);

      api.brush.pushMatrix();
      api.brush.translate(b.x, b.y);
      api.brush.rotate(angle);

      // Body - small elongated shape
      api.brush.ellipse(0, 0, b.size * 1.8, b.size * 0.5, {
        fill: bodyColor,
        alpha: 0.85,
      });

      // Wings - two angled lines
      const wingY = wingSpan * 0.7;
      api.brush.line(
        -b.size * 0.3, 0,
        -b.size * 1.2, -wingY,
        { color: wingColor, width: b.size * 0.4, alpha: 0.8, cap: 'round' }
      );
      api.brush.line(
        -b.size * 0.3, 0,
        -b.size * 1.2, wingY,
        { color: wingColor, width: b.size * 0.4, alpha: 0.8, cap: 'round' }
      );

      // Tail fork
      api.brush.line(
        -b.size * 1.5, 0,
        -b.size * 2.5, -b.size * 0.4,
        { color: bodyColor, width: b.size * 0.25, alpha: 0.7, cap: 'round' }
      );
      api.brush.line(
        -b.size * 1.5, 0,
        -b.size * 2.5, b.size * 0.4,
        { color: bodyColor, width: b.size * 0.25, alpha: 0.7, cap: 'round' }
      );

      api.brush.popMatrix();
    }
  },

  async teardown(): Promise<void> {
    birds = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
