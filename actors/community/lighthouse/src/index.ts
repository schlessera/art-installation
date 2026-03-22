import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'lighthouse',
  name: 'Lighthouse',
  description: 'A coastal lighthouse with a sweeping rotating light beam against a starry night sky',
  author: {
    name: 'Jan',
    github: 'janw-ll',
  },
  version: '1.0.0',
  role: 'background',
  tags: ['lighthouse', 'night', 'ocean', 'background'],
  createdAt: new Date(),
  preferredDuration: 60,
  requiredContexts: ['time'],
};

const MAX_STARS = 80;
const MAX_WAVES = 6;

interface Star {
  x: number;
  y: number;
  size: number;
  twinkleOffset: number;
  brightness: number;
}

interface Wave {
  yOffset: number;
  amplitude: number;
  frequency: number;
  speed: number;
  alpha: number;
}

interface LighthouseState {
  stars: Star[];
  waves: Wave[];
  glowDataUrl: string;
  beamAngle: number;
}

let state: LighthouseState = {
  stars: [],
  waves: [],
  glowDataUrl: '',
  beamAngle: 0,
};

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    // Pre-allocate stars
    state.stars = new Array(MAX_STARS);
    for (let i = 0; i < MAX_STARS; i++) {
      state.stars[i] = {
        x: Math.random() * width,
        y: Math.random() * height * 0.45,
        size: 1 + Math.random() * 2,
        twinkleOffset: Math.random() * Math.PI * 2,
        brightness: 0.4 + Math.random() * 0.6,
      };
    }

    // Pre-allocate wave layers
    state.waves = new Array(MAX_WAVES);
    for (let i = 0; i < MAX_WAVES; i++) {
      state.waves[i] = {
        yOffset: i * 8,
        amplitude: 3 + i * 2,
        frequency: 0.015 + i * 0.005,
        speed: 0.3 + i * 0.15,
        alpha: 0.9 - i * 0.1,
      };
    }

    // Pre-render glow texture for the light source
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,200,1)');
    gradient.addColorStop(0.3, 'rgba(255,240,150,0.6)');
    gradient.addColorStop(0.6, 'rgba(255,220,100,0.2)');
    gradient.addColorStop(1, 'rgba(255,200,50,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    state.glowDataUrl = canvas.toDataURL();

    state.beamAngle = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const time = frame.time / 1000;

    // --- Sky gradient background ---
    api.brush.background(0x0a0e1a);

    // Sky gradient overlay (darker at top, slightly lighter at horizon)
    api.brush.rect(0, 0, width, height * 0.6, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0, x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: 0x050810 },
          { offset: 0.7, color: 0x0d1525 },
          { offset: 1, color: 0x1a2540 },
        ],
      },
    });

    // --- Stars ---
    for (let i = 0; i < MAX_STARS; i++) {
      const star = state.stars[i];
      const twinkle = 0.5 + 0.5 * Math.sin(time * 1.5 + star.twinkleOffset);
      const alpha = star.brightness * twinkle;
      if (alpha < 0.05) continue;
      api.brush.circle(star.x, star.y, star.size, {
        fill: 0xffffff,
        alpha: alpha,
      });
    }

    // --- Lighthouse position ---
    const lhBaseX = width * 0.65;
    const lhBaseY = height * 0.62;
    const towerWidth = width * 0.08;
    const towerHeight = height * 0.28;
    const towerTopY = lhBaseY - towerHeight;

    // --- Rocky cliff / island ---
    const rockPoints = [
      { x: width * 0.4, y: height * 0.65 },
      { x: width * 0.45, y: height * 0.6 },
      { x: width * 0.55, y: height * 0.57 },
      { x: width * 0.62, y: height * 0.58 },
      { x: lhBaseX, y: lhBaseY - 2 },
      { x: width * 0.72, y: height * 0.59 },
      { x: width * 0.82, y: height * 0.6 },
      { x: width * 0.9, y: height * 0.63 },
      { x: width, y: height * 0.65 },
      { x: width, y: height * 0.7 },
      { x: width * 0.4, y: height * 0.7 },
    ];
    api.brush.polygon(rockPoints, {
      fill: 0x1a1a2e,
      alpha: 1,
    });

    // Rock highlight
    const rockHighlight = [
      { x: width * 0.5, y: height * 0.59 },
      { x: width * 0.58, y: height * 0.575 },
      { x: width * 0.63, y: height * 0.585 },
      { x: width * 0.55, y: height * 0.6 },
    ];
    api.brush.polygon(rockHighlight, {
      fill: 0x252545,
      alpha: 0.7,
    });

    // --- Lighthouse tower ---
    // Tower body (tapered - wider at base, narrower at top)
    const baseHalfW = towerWidth * 0.6;
    const topHalfW = towerWidth * 0.4;
    const towerPoints = [
      { x: lhBaseX - baseHalfW, y: lhBaseY },
      { x: lhBaseX - topHalfW, y: towerTopY + 12 },
      { x: lhBaseX + topHalfW, y: towerTopY + 12 },
      { x: lhBaseX + baseHalfW, y: lhBaseY },
    ];
    api.brush.polygon(towerPoints, {
      fill: 0xd8d0c0,
      alpha: 1,
    });

    // Red stripe bands on tower
    const stripeCount = 3;
    for (let i = 0; i < stripeCount; i++) {
      const t = (i + 0.5) / (stripeCount + 1);
      const sy = lhBaseY - t * towerHeight;
      const stripeH = towerHeight * 0.08;
      const halfW = baseHalfW + (topHalfW - baseHalfW) * t;
      api.brush.rect(lhBaseX - halfW, sy - stripeH / 2, halfW * 2, stripeH, {
        fill: 0x8b2020,
        alpha: 0.9,
      });
    }

    // --- Lantern room (glass housing at top) ---
    const lanternW = topHalfW * 1.6;
    const lanternH = 14;
    const lanternY = towerTopY;

    // Lantern gallery (railing platform)
    api.brush.rect(lhBaseX - lanternW * 1.3, lanternY + lanternH - 2, lanternW * 2.6, 4, {
      fill: 0x444444,
      alpha: 1,
    });

    // Glass housing
    api.brush.rect(lhBaseX - lanternW, lanternY, lanternW * 2, lanternH, {
      fill: 0x334455,
      alpha: 0.9,
      stroke: 0x555555,
      strokeWidth: 1,
    });

    // --- Rotating light beam ---
    state.beamAngle = (time * 0.8) % (Math.PI * 2);

    const lightCenterX = lhBaseX;
    const lightCenterY = lanternY + lanternH / 2;
    const beamLength = Math.max(width, height) * 1.2;

    // Draw two beams (opposite directions)
    for (let b = 0; b < 2; b++) {
      const angle = state.beamAngle + b * Math.PI;
      const beamSpread = 0.15; // radians half-width

      const tipX1 = lightCenterX + Math.cos(angle - beamSpread) * beamLength;
      const tipY1 = lightCenterY + Math.sin(angle - beamSpread) * beamLength;
      const tipX2 = lightCenterX + Math.cos(angle + beamSpread) * beamLength;
      const tipY2 = lightCenterY + Math.sin(angle + beamSpread) * beamLength;

      // Outer beam glow (wider, more transparent)
      const outerSpread = beamSpread * 1.8;
      const outerX1 = lightCenterX + Math.cos(angle - outerSpread) * beamLength;
      const outerY1 = lightCenterY + Math.sin(angle - outerSpread) * beamLength;
      const outerX2 = lightCenterX + Math.cos(angle + outerSpread) * beamLength;
      const outerY2 = lightCenterY + Math.sin(angle + outerSpread) * beamLength;

      api.brush.polygon(
        [
          { x: lightCenterX, y: lightCenterY },
          { x: outerX1, y: outerY1 },
          { x: outerX2, y: outerY2 },
        ],
        {
          fill: 0xfffde0,
          alpha: 0.06,
          blendMode: 'add',
        },
      );

      // Core beam
      api.brush.polygon(
        [
          { x: lightCenterX, y: lightCenterY },
          { x: tipX1, y: tipY1 },
          { x: tipX2, y: tipY2 },
        ],
        {
          fill: 0xfffde0,
          alpha: 0.12,
          blendMode: 'add',
        },
      );
    }

    // Light source glow
    api.brush.image(state.glowDataUrl, lightCenterX, lightCenterY, {
      width: 50,
      height: 50,
      anchorX: 0.5,
      anchorY: 0.5,
      tint: 0xffeeaa,
      blendMode: 'add',
      alpha: 0.9,
    });

    // Bright center dot
    api.brush.circle(lightCenterX, lightCenterY, 5, {
      fill: 0xfffff0,
      alpha: 1,
      blendMode: 'add',
    });

    // --- Lantern room roof (cap) ---
    const roofPoints = [
      { x: lhBaseX - lanternW * 1.1, y: lanternY },
      { x: lhBaseX, y: lanternY - 10 },
      { x: lhBaseX + lanternW * 1.1, y: lanternY },
    ];
    api.brush.polygon(roofPoints, {
      fill: 0x333333,
      alpha: 1,
    });

    // --- Ocean ---
    // Base ocean color
    api.brush.rect(0, height * 0.62, width, height * 0.38, {
      fill: {
        type: 'linear',
        x0: 0.5, y0: 0, x1: 0.5, y1: 1,
        stops: [
          { offset: 0, color: 0x0a1628 },
          { offset: 0.5, color: 0x081220 },
          { offset: 1, color: 0x060e18 },
        ],
      },
    });

    // Animated waves
    for (let i = 0; i < MAX_WAVES; i++) {
      const wave = state.waves[i];
      const waveY = height * 0.64 + wave.yOffset;
      const points: { x: number; y: number }[] = [];

      // Top wave edge
      const steps = 20;
      for (let s = 0; s <= steps; s++) {
        const wx = (s / steps) * width;
        const wy = waveY + Math.sin(wx * wave.frequency + time * wave.speed) * wave.amplitude;
        points.push({ x: wx, y: wy });
      }

      // Close the shape at the bottom
      points.push({ x: width, y: height });
      points.push({ x: 0, y: height });

      const blue = Math.max(0, Math.min(255, 20 + i * 8));
      const colorVal = (0x05 << 16) | ((0x10 + i * 4) << 8) | blue;
      api.brush.polygon(points, {
        fill: colorVal,
        alpha: wave.alpha,
      });
    }

    // Light reflection on water
    const reflAngle = state.beamAngle;
    // Only show reflection when beam points roughly downward
    const beamDirY = Math.sin(reflAngle);
    if (beamDirY > 0.1) {
      const reflX = lightCenterX + Math.cos(reflAngle) * (height * 0.3);
      const reflAlpha = beamDirY * 0.15;
      for (let r = 0; r < 5; r++) {
        const ry = height * 0.66 + r * 15;
        const rw = 20 + r * 12;
        const ra = reflAlpha * (1 - r * 0.18);
        if (ra < 0.05) continue;
        api.brush.ellipse(
          reflX + Math.sin(time * 0.5 + r) * 5,
          ry,
          rw,
          3 + r,
          {
            fill: 0xfffde0,
            alpha: ra,
            blendMode: 'add',
          },
        );
      }
    }

    // Moonlight shimmer on water far side
    for (let m = 0; m < 8; m++) {
      const mx = width * 0.15 + m * (width * 0.08);
      const my = height * 0.66 + Math.sin(time * 0.3 + m * 1.2) * 4;
      const ma = 0.08 + 0.05 * Math.sin(time + m * 0.8);
      if (ma < 0.05) continue;
      api.brush.ellipse(mx, my, 8 + m * 2, 2, {
        fill: 0xaabbdd,
        alpha: ma,
        blendMode: 'add',
      });
    }
  },

  async teardown(): Promise<void> {
    state = {
      stars: [],
      waves: [],
      glowDataUrl: '',
      beamAngle: 0,
    };
  },
};

registerActor(actor);
export default actor;
