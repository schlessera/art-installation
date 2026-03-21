/**
 * Tiramisu Layers — Foreground Actor
 *
 * A cross-section of tiramisu building up from the bottom.
 * Alternating layers of coffee-soaked ladyfingers and mascarpone cream
 * slide in from alternating sides, topped with cocoa powder dusting.
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
  id: 'tiramisu-layers',
  name: 'Tiramisu Layers',
  description: 'Cross-section of tiramisu with layers building up, cocoa dusting, and coffee drip stains',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'tiramisu', 'food', 'dessert'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 45,
  requiredContexts: ['display'],
};

// Colors
const LADYFINGER = 0xa87040;
const MASCARPONE = 0xf0e8d8;
const COCOA = 0x5c3317;
const COCOA_LIGHT = 0x7a4b2a;
const COFFEE_STAIN = 0x3c1a00;
const GLASS_LIGHT = 0xd0e8f0;
const GLASS_DARK = 0x607880;

// Layout
const DISH_MARGIN_X = 40;
const DISH_BOTTOM_Y = 580;
const DISH_TOP_Y = 120;
const LAYER_COUNT = 8;
const MAX_COCOA_PARTICLES = 40;
const MAX_DRIP_LINES = 6;

interface Layer {
  y: number;
  height: number;
  color: number;
  slideFrom: number; // -1 = left, 1 = right
  progress: number;  // 0..1 ease-out animation
  triggerTime: number;
  started: boolean;
}

interface CocoaParticle {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  size: number;
  alpha: number;
  drift: number;
}

interface DripLine {
  x: number;
  topY: number;
  bottomY: number;
  width: number;
  alpha: number;
}

let canvasW = 0;
let canvasH = 0;
let layers: Layer[] = [];
let cocoaParticles: CocoaParticle[] = [];
let dripLines: DripLine[] = [];
let dishLeft = 0;
let dishRight = 0;
let dishWidth = 0;
let cocoaDustingStartTime = 0;

function easeOutCubic(t: number): number {
  const t1 = t - 1;
  return t1 * t1 * t1 + 1;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    dishLeft = DISH_MARGIN_X;
    dishRight = canvasW - DISH_MARGIN_X;
    dishWidth = dishRight - dishLeft;

    // Build layers from bottom to top
    const totalLayerSpace = DISH_BOTTOM_Y - DISH_TOP_Y - 30; // leave room for cocoa
    const layerHeight = totalLayerSpace / LAYER_COUNT;

    layers = [];
    for (let i = 0; i < LAYER_COUNT; i++) {
      const y = DISH_BOTTOM_Y - (i + 1) * layerHeight;
      const isLadyfinger = i % 2 === 0;
      layers.push({
        y,
        height: layerHeight,
        color: isLadyfinger ? LADYFINGER : MASCARPONE,
        slideFrom: i % 2 === 0 ? -1 : 1,
        progress: 0,
        triggerTime: 1000 + i * 600, // stagger each layer
        started: false,
      });
    }

    cocoaDustingStartTime = 1000 + LAYER_COUNT * 600 + 500;

    // Pre-allocate cocoa particles
    cocoaParticles = [];
    for (let i = 0; i < MAX_COCOA_PARTICLES; i++) {
      cocoaParticles.push({
        active: false,
        x: 0,
        y: 0,
        vy: 0,
        size: 0,
        alpha: 0,
        drift: 0,
      });
    }

    // Pre-allocate drip lines on the dish sides
    dripLines = [];
    for (let i = 0; i < MAX_DRIP_LINES; i++) {
      const onLeft = i % 2 === 0;
      const x = onLeft
        ? dishLeft + Math.random() * 3 - 1
        : dishRight + Math.random() * 3 - 1;
      dripLines.push({
        x,
        topY: DISH_TOP_Y + 40 + Math.random() * 100,
        bottomY: DISH_BOTTOM_Y - Math.random() * 80,
        width: 1.5 + Math.random() * 2,
        alpha: 0.3 + Math.random() * 0.3,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const dt = Math.min(frame.deltaTime, 32) / 16;
    const isDark = api.context.display.isDarkMode();

    const glassColor = isDark ? GLASS_DARK : GLASS_LIGHT;
    const glassAlpha = isDark ? 0.7 : 0.6;

    // -- Draw glass dish outline (back side) --
    // Left wall
    api.brush.rect(dishLeft - 4, DISH_TOP_Y, 4, DISH_BOTTOM_Y - DISH_TOP_Y + 4, {
      fill: glassColor,
      alpha: glassAlpha * 0.5,
      blendMode: 'normal',
    });
    // Right wall
    api.brush.rect(dishRight, DISH_TOP_Y, 4, DISH_BOTTOM_Y - DISH_TOP_Y + 4, {
      fill: glassColor,
      alpha: glassAlpha * 0.5,
      blendMode: 'normal',
    });
    // Bottom
    api.brush.rect(dishLeft - 4, DISH_BOTTOM_Y, dishWidth + 8, 4, {
      fill: glassColor,
      alpha: glassAlpha * 0.6,
      blendMode: 'normal',
    });
    // Rounded top corners (small circles)
    api.brush.circle(dishLeft, DISH_TOP_Y + 8, 8, {
      fill: glassColor,
      alpha: glassAlpha * 0.4,
      blendMode: 'normal',
    });
    api.brush.circle(dishRight, DISH_TOP_Y + 8, 8, {
      fill: glassColor,
      alpha: glassAlpha * 0.4,
      blendMode: 'normal',
    });

    // -- Coffee drip stains on dish sides --
    for (let i = 0; i < MAX_DRIP_LINES; i++) {
      const drip = dripLines[i];
      // Fade in drip stains over time
      const dripFadeIn = Math.min(1, t / 3000);
      api.brush.rect(drip.x - drip.width / 2, drip.topY, drip.width, drip.bottomY - drip.topY, {
        fill: COFFEE_STAIN,
        alpha: drip.alpha * dripFadeIn * 0.7,
        blendMode: 'normal',
      });
      // Small drip blob at bottom
      api.brush.circle(drip.x, drip.bottomY, drip.width * 1.2, {
        fill: COFFEE_STAIN,
        alpha: drip.alpha * dripFadeIn * 0.6,
        blendMode: 'normal',
      });
    }

    // -- Animate and draw layers --
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];

      // Start the layer animation when its trigger time is reached
      if (!layer.started && t >= layer.triggerTime) {
        layer.started = true;
      }

      if (!layer.started) continue;

      // Animate progress with ease-out
      const elapsed = t - layer.triggerTime;
      const rawProgress = Math.min(1, elapsed / 800);
      layer.progress = easeOutCubic(rawProgress);

      // Calculate X offset: slides from off-screen to final position
      const slideOffset = (1 - layer.progress) * (dishWidth + 20) * layer.slideFrom;

      // Clip drawing to dish interior
      const layerX = dishLeft + slideOffset;
      const clippedLeft = Math.max(dishLeft, layerX);
      const clippedRight = Math.min(dishRight, layerX + dishWidth);
      const clippedWidth = clippedRight - clippedLeft;

      if (clippedWidth <= 0) continue;

      // Main layer fill
      api.brush.rect(clippedLeft, layer.y, clippedWidth, layer.height, {
        fill: layer.color,
        alpha: 0.85,
        blendMode: 'normal',
      });

      // Subtle texture lines within ladyfinger layers
      if (layer.color === LADYFINGER && layer.progress > 0.5) {
        const lineAlpha = (layer.progress - 0.5) * 0.4;
        for (let li = 0; li < 3; li++) {
          const lineY = layer.y + layer.height * (0.25 + li * 0.25);
          api.brush.rect(clippedLeft + 8, lineY, clippedWidth - 16, 1, {
            fill: isDark ? 0x8a5a30 : 0xc08858,
            alpha: lineAlpha,
            blendMode: 'normal',
          });
        }
      }

      // Subtle highlight on mascarpone layers
      if (layer.color === MASCARPONE && layer.progress > 0.5) {
        const hlAlpha = (layer.progress - 0.5) * 0.3;
        api.brush.rect(clippedLeft + 4, layer.y + 2, clippedWidth - 8, layer.height * 0.3, {
          fill: 0xffffff,
          alpha: hlAlpha,
          blendMode: 'normal',
        });
      }
    }

    // -- Cocoa powder dusting at the top --
    if (t > cocoaDustingStartTime) {
      const cocoaElapsed = t - cocoaDustingStartTime;

      // Spawn new particles
      if (cocoaElapsed < 8000) {
        for (let i = 0; i < MAX_COCOA_PARTICLES; i++) {
          if (!cocoaParticles[i].active) {
            // Spawn rate: ~1 every 80ms
            if (Math.random() < 0.3 * dt) {
              const p = cocoaParticles[i];
              p.active = true;
              p.x = dishLeft + 20 + Math.random() * (dishWidth - 40);
              p.y = DISH_TOP_Y - 10 - Math.random() * 30;
              p.vy = 0.3 + Math.random() * 0.5;
              p.size = 1 + Math.random() * 2.5;
              p.alpha = 0.6 + Math.random() * 0.3;
              p.drift = (Math.random() - 0.5) * 0.3;
            }
            break;
          }
        }
      }

      // Update and draw particles
      for (let i = 0; i < MAX_COCOA_PARTICLES; i++) {
        const p = cocoaParticles[i];
        if (!p.active) continue;

        p.y += p.vy * dt;
        p.x += p.drift * dt;

        // Top layer of the tiramisu
        const topLayerY = layers.length > 0 ? layers[layers.length - 1].y : DISH_TOP_Y + 30;

        // Particle settles on top
        if (p.y >= topLayerY) {
          p.y = topLayerY - Math.random() * 3;
          p.vy = 0;
          p.drift = 0;
          // Slowly fade settled particles
          p.alpha -= 0.001 * dt;
          if (p.alpha <= 0) {
            p.active = false;
            continue;
          }
        }

        api.brush.circle(p.x, p.y, p.size, {
          fill: isDark ? COCOA_LIGHT : COCOA,
          alpha: p.alpha,
          blendMode: 'normal',
        });
      }

      // Draw accumulated cocoa powder layer on top
      const cocoaProgress = Math.min(1, cocoaElapsed / 5000);
      if (layers.length > 0 && layers[layers.length - 1].progress > 0.8) {
        const topY = layers[layers.length - 1].y;
        api.brush.rect(dishLeft + 2, topY - 3, dishWidth - 4, 4, {
          fill: COCOA,
          alpha: cocoaProgress * 0.7,
          blendMode: 'normal',
        });
        // Uneven cocoa texture dots
        for (let d = 0; d < 8; d++) {
          const dx = dishLeft + 15 + d * (dishWidth - 30) / 7;
          const dy = topY - 2 + Math.sin(d * 1.7) * 1.5;
          api.brush.circle(dx, dy, 2 + Math.sin(d * 2.3) * 1, {
            fill: COCOA_LIGHT,
            alpha: cocoaProgress * 0.5,
            blendMode: 'normal',
          });
        }
      }
    }

    // -- Glass dish outline (front side, drawn last for overlap) --
    // Left wall highlight
    api.brush.rect(dishLeft - 2, DISH_TOP_Y + 8, 2, DISH_BOTTOM_Y - DISH_TOP_Y - 4, {
      fill: glassColor,
      alpha: glassAlpha,
      blendMode: 'normal',
    });
    // Right wall highlight
    api.brush.rect(dishRight, DISH_TOP_Y + 8, 2, DISH_BOTTOM_Y - DISH_TOP_Y - 4, {
      fill: glassColor,
      alpha: glassAlpha,
      blendMode: 'normal',
    });
    // Glass shine line (left)
    api.brush.rect(dishLeft + 3, DISH_TOP_Y + 30, 1.5, (DISH_BOTTOM_Y - DISH_TOP_Y) * 0.6, {
      fill: 0xffffff,
      alpha: isDark ? 0.12 : 0.2,
      blendMode: 'normal',
    });
  },

  async teardown(): Promise<void> {
    layers = [];
    cocoaParticles = [];
    dripLines = [];
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
