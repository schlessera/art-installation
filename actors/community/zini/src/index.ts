/**
 * Zini — the "electronic moderator" from the German children's TV show
 * "Spaß am Dienstag" (1984–1992).
 *
 * A plain orange-yellow circular disk that darts around the screen,
 * leaving a ghostly trailing afterimage — recreating the analog video
 * feedback loop effect of the original.
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
  id: 'zini',
  name: 'Zini',
  description:
    'The electronic moderator from Spaß am Dienstag — an orange-yellow disk darting across the screen with analog video feedback trails',
  author: {
    name: 'Matthias Pfefferle',
    github: 'pfefferle',
  },
  version: '1.0.0',
  tags: ['retro', 'tv', 'german', 'animation', 'trail'],
  role: 'background',
  createdAt: new Date(),
  preferredDuration: 45,
};

// Trail circular buffer
const MAX_TRAIL = 50;

interface TrailPoint {
  x: number;
  y: number;
  size: number;
  hue: number;
  active: boolean;
}

let trail: TrailPoint[] = [];
let trailHead = 0;
let trailCount = 0;

// Position and movement
let posX = 0;
let posY = 0;
let targetX = 0;
let targetY = 0;
let moveProgress = 0; // 0-1, how far along current dart
let startX = 0;
let startY = 0;
let dartDuration = 0; // frames for current dart
let pauseTimer = 0; // frames to pause before next dart

// Animation
let baseSize = 0;
let hue = 35;
let canvasW = 0;
let canvasH = 0;
let frameCount = 0;

function pickNewDart(): void {
  startX = posX;
  startY = posY;
  // Dart to a random position, favoring big moves
  const margin = canvasW * 0.1;
  targetX = margin + Math.random() * (canvasW - margin * 2);
  targetY = margin + Math.random() * (canvasH - margin * 2);
  moveProgress = 0;
  // Fast darts: 15-40 frames (0.25-0.67s)
  dartDuration = 15 + Math.random() * 25;
  // Short pause after arriving: 5-30 frames
  pauseTimer = 5 + Math.random() * 25;
}

// Ease-in-out for smooth darting
function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    canvasW = width;
    canvasH = height;

    posX = width * 0.5;
    posY = height * 0.5;
    baseSize = Math.min(width, height) * 0.05;
    hue = 35;
    frameCount = 0;

    // Pre-allocate trail
    trail = new Array(MAX_TRAIL);
    for (let i = 0; i < MAX_TRAIL; i++) {
      trail[i] = { x: 0, y: 0, size: 0, hue: 35, active: false };
    }
    trailHead = 0;
    trailCount = 0;

    pickNewDart();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const time = frame.time / 1000;
    frameCount++;

    // Black background
    api.brush.rect(0, 0, width, height, { fill: '#000000' });

    // Size oscillation
    const sizeOsc = Math.sin(time * 1.8) * 0.2 + Math.sin(time * 4.3) * 0.1;
    const currentSize = baseSize * (1 + sizeOsc);

    // Hue shift in orange-yellow range
    hue = 30 + Math.sin(time * 0.7) * 12 + Math.sin(time * 1.9) * 5;

    // Movement: dart to target, pause, repeat
    if (pauseTimer > 0 && moveProgress >= 1) {
      pauseTimer--;
      if (pauseTimer <= 0) {
        pickNewDart();
      }
    } else if (moveProgress < 1) {
      moveProgress += 1 / dartDuration;
      if (moveProgress > 1) moveProgress = 1;
      const ease = easeInOutCubic(moveProgress);
      posX = startX + (targetX - startX) * ease;
      posY = startY + (targetY - startY) * ease;
    }

    // Record trail every 2nd frame
    if (frameCount % 2 === 0) {
      trail[trailHead].x = posX;
      trail[trailHead].y = posY;
      trail[trailHead].size = currentSize;
      trail[trailHead].hue = hue;
      trail[trailHead].active = true;
      trailHead = (trailHead + 1) % MAX_TRAIL;
      if (trailCount < MAX_TRAIL) trailCount++;
    }

    // Draw trail — analog feedback afterimage
    for (let i = 0; i < trailCount; i++) {
      const bufIdx = (trailHead - trailCount + i + MAX_TRAIL) % MAX_TRAIL;
      const tp = trail[bufIdx];
      if (!tp.active) continue;

      const age = i / trailCount; // 0=oldest, 1=newest
      const alpha = age * age; // Quadratic: old=faint, new=strong
      if (alpha < 0.05) continue;

      const trailRadius = tp.size * (0.4 + age * 0.6);
      const h = Math.round(tp.hue);

      // Trail ghost circle
      api.brush.circle(tp.x, tp.y, trailRadius, {
        fill: `hsla(${h}, 85%, 55%, ${(alpha * 0.7).toFixed(2)})`,
      });
    }

    // Main Zini disk — outer glow
    const glowRadius = currentSize * 2;
    const h = Math.round(hue);
    api.brush.circle(posX, posY, glowRadius, {
      fill: {
        type: 'radial',
        cx: 0.5, cy: 0.5, radius: 0.5,
        stops: [
          { offset: 0, color: `hsla(${h}, 90%, 60%, 0.9)` },
          { offset: 0.4, color: `hsla(${h}, 85%, 55%, 0.4)` },
          { offset: 0.7, color: `hsla(${h}, 80%, 50%, 0.1)` },
          { offset: 1, color: `hsla(${h}, 80%, 45%, 0)` },
        ],
      },
      blendMode: 'add',
    });

    // Bright core
    api.brush.circle(posX, posY, currentSize * 0.55, {
      fill: `hsla(${h + 10}, 100%, 85%, 0.95)`,
    });
  },

  async teardown(): Promise<void> {
    trailHead = 0;
    trailCount = 0;
    frameCount = 0;
  },
};

registerActor(actor);
export default actor;
