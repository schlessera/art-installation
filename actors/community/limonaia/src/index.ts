/**
 * Limonaia Background Actor
 *
 * Shows photos of La Limonaia, a Tuscan holiday home in the hills above Lucca.
 * Cycles through images with a gentle ken-burns zoom/pan effect.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';
import { IMG_PH12, IMG_PH3, IMG_7, IMG_176 } from './images';

const metadata: ActorMetadata = {
  id: 'limonaia',
  name: 'La Limonaia',
  description: 'Photos of La Limonaia, a Tuscan villa in the hills above Lucca, with a gentle ken-burns effect',
  author: {
    name: 'Joost de Valk',
    github: 'jdevalk',
  },
  version: '1.0.0',
  tags: ['background', 'photos', 'italy', 'tuscany', 'villa'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  role: 'background',
};

const IMAGES = [IMG_PH12, IMG_PH3, IMG_7, IMG_176];
const TRANSITION_DURATION = 2000; // ms for crossfade
const IMAGE_DURATION = 12000; // ms per image (before transition starts)
const CYCLE_DURATION = IMAGE_DURATION + TRANSITION_DURATION;

// Pre-allocated state
let canvasW = 0;
let canvasH = 0;
let currentIndex = 0;
let cycleStartTime = 0;

// Ken-burns parameters per image (pre-allocated)
interface KenBurns {
  startScale: number;
  endScale: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

const kenBurns: KenBurns[] = [];

function randomKenBurns(): KenBurns {
  const startScale = 1.0 + Math.random() * 0.15;
  const endScale = 1.1 + Math.random() * 0.15;
  // Offset range limited so image stays covering canvas
  const range = 0.05;
  return {
    startScale,
    endScale,
    startX: (Math.random() - 0.5) * range,
    startY: (Math.random() - 0.5) * range,
    endX: (Math.random() - 0.5) * range,
    endY: (Math.random() - 0.5) * range,
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    currentIndex = Math.floor(Math.random() * IMAGES.length);
    cycleStartTime = 0;

    // Pre-allocate ken-burns params for all images
    kenBurns.length = 0;
    for (let i = 0; i < IMAGES.length; i++) {
      kenBurns.push(randomKenBurns());
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    if (cycleStartTime === 0) cycleStartTime = frame.time;

    const elapsed = frame.time - cycleStartTime;

    // Check if we need to advance to next image
    if (elapsed >= CYCLE_DURATION) {
      currentIndex = (currentIndex + 1) % IMAGES.length;
      cycleStartTime = frame.time;
      // Regenerate ken-burns for the image we just left
      const prevIndex = (currentIndex - 1 + IMAGES.length) % IMAGES.length;
      kenBurns[prevIndex] = randomKenBurns();
      return;
    }

    const cycleElapsed = frame.time - cycleStartTime;

    // Image source dimensions are 480x270 (landscape)
    // Canvas is 360x640 (portrait)
    // We need to cover the canvas, so scale based on height
    const imgAspect = 480 / 270; // ~1.78
    const canvasAspect = canvasW / canvasH; // ~0.5625

    // To cover portrait canvas with landscape image, scale to fill height
    // then the image will be wider than the canvas (which we want for panning)
    const baseH = canvasH;
    const baseW = baseH * imgAspect;

    // Draw current image with ken-burns
    const kb = kenBurns[currentIndex];
    const progress = Math.min(cycleElapsed / CYCLE_DURATION, 1);
    const scale = kb.startScale + (kb.endScale - kb.startScale) * progress;
    const panX = kb.startX + (kb.endX - kb.startX) * progress;
    const panY = kb.startY + (kb.endY - kb.startY) * progress;

    const drawW = baseW * scale;
    const drawH = baseH * scale;
    const drawX = (canvasW - drawW) / 2 + panX * canvasW;
    const drawY = (canvasH - drawH) / 2 + panY * canvasH;

    // Fill background with dark color first
    api.brush.background(0x0a0a0a);

    // Draw current image
    api.brush.image(IMAGES[currentIndex], drawX, drawY, {
      width: drawW,
      height: drawH,
      anchorX: 0,
      anchorY: 0,
    });

    // Crossfade: draw next image on top during transition period
    if (cycleElapsed > IMAGE_DURATION) {
      const fadeProgress = (cycleElapsed - IMAGE_DURATION) / TRANSITION_DURATION;
      const fadeAlpha = easeInOutCubic(Math.min(fadeProgress, 1));

      const nextIndex = (currentIndex + 1) % IMAGES.length;
      const nkb = kenBurns[nextIndex];
      // Next image starts at the beginning of its ken-burns
      const nScale = nkb.startScale;
      const nDrawW = baseW * nScale;
      const nDrawH = baseH * nScale;
      const nDrawX = (canvasW - nDrawW) / 2 + nkb.startX * canvasW;
      const nDrawY = (canvasH - nDrawH) / 2 + nkb.startY * canvasH;

      api.brush.image(IMAGES[nextIndex], nDrawX, nDrawY, {
        width: nDrawW,
        height: nDrawH,
        anchorX: 0,
        anchorY: 0,
        alpha: fadeAlpha,
      });
    }
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
    currentIndex = 0;
    cycleStartTime = 0;
    kenBurns.length = 0;
  },
};

registerActor(actor);
export default actor;
