/**
 * Cathedral Rose Window
 *
 * A rotating kaleidoscopic mandala inspired by Italian cathedral
 * stained glass rose windows. Concentric rings of geometric petals,
 * arcs, and circles in deep jewel tones rotate at different speeds,
 * growing outward from center on first appearance.
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
  id: 'cathedral-rose',
  name: 'Cathedral Rose',
  description:
    'Rotating kaleidoscopic mandala inspired by Italian cathedral stained glass rose windows',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'italy', 'cathedral', 'stained-glass', 'mandala'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 45,
  requiredContexts: ['time', 'display'],
};

// -- Stained glass palette (dark mode / light mode variants) --

const DARK_COLORS = [
  0xcc1122, // deep red
  0x1144aa, // royal blue
  0x117744, // emerald green
  0xddaa22, // gold
  0x7722aa, // purple
];

const LIGHT_COLORS = [
  0x991122, // darker red
  0x0e3388, // deeper blue
  0x0e5533, // deeper green
  0xbb8811, // darker gold
  0x551188, // deeper purple
];

const LEAD_DARK = 0x222222;
const LEAD_LIGHT = 0x444444;

// -- Ring configuration (pre-allocated) --

const NUM_RINGS = 5;
const TWO_PI = Math.PI * 2;

interface RingConfig {
  radiusFraction: number; // fraction of maxRadius for this ring
  petalCount: number;
  speedMultiplier: number; // rotation speed relative to base
  direction: number; // 1 or -1
  innerRadiusFraction: number; // inner edge as fraction of ring radius
}

// Pre-allocated ring configs
const RING_CONFIGS: RingConfig[] = [
  { radiusFraction: 0.18, petalCount: 6, speedMultiplier: 1.0, direction: 1, innerRadiusFraction: 0.0 },
  { radiusFraction: 0.34, petalCount: 8, speedMultiplier: -0.7, direction: -1, innerRadiusFraction: 0.53 },
  { radiusFraction: 0.52, petalCount: 12, speedMultiplier: 0.5, direction: 1, innerRadiusFraction: 0.65 },
  { radiusFraction: 0.72, petalCount: 16, speedMultiplier: -0.35, direction: -1, innerRadiusFraction: 0.72 },
  { radiusFraction: 0.92, petalCount: 24, speedMultiplier: 0.2, direction: 1, innerRadiusFraction: 0.78 },
];

// -- State --

let centerX = 0;
let centerY = 0;
let maxRadius = 0;
let growProgress = 0; // 0..1 entrance animation
let baseRotation = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    centerX = width / 2;
    centerY = height / 2;
    // Use the smaller dimension so the window fits the portrait canvas
    maxRadius = Math.min(width, height) * 0.46;
    growProgress = 0;
    baseRotation = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const tSec = frame.time / 1000;
    const dt = frame.deltaTime / 1000;
    const isDark = api.context.display.isDarkMode();

    const palette = isDark ? DARK_COLORS : LIGHT_COLORS;
    const leadColor = isDark ? LEAD_DARK : LEAD_LIGHT;

    // Grow from center over first ~2 seconds
    if (growProgress < 1) {
      growProgress = Math.min(1, growProgress + dt * 0.5);
    }
    // Ease-out for smooth growth
    const growEase = 1 - (1 - growProgress) * (1 - growProgress);

    // Slow base rotation (~6 degrees/sec)
    baseRotation = tSec * 0.105;

    const brush = api.brush;

    // -- Central circle --
    const centralR = maxRadius * 0.08 * growEase;
    if (centralR > 0.5) {
      brush.circle(centerX, centerY, centralR, {
        fill: palette[3], // gold center
        alpha: 0.9,
        blendMode: 'normal',
      });
      // Lead ring around center
      brush.circle(centerX, centerY, centralR, {
        stroke: leadColor,
        strokeWidth: 1.5,
        alpha: 0.7,
        blendMode: 'normal',
      });
    }

    // -- Draw rings from inside out --
    for (let ri = 0; ri < NUM_RINGS; ri++) {
      const cfg = RING_CONFIGS[ri];
      const ringRadius = maxRadius * cfg.radiusFraction * growEase;

      // Skip ring if it hasn't grown enough yet
      if (ringRadius < 2) continue;

      const innerR = ringRadius * cfg.innerRadiusFraction;
      const ringRotation = baseRotation * cfg.speedMultiplier * cfg.direction;
      const petalAngle = TWO_PI / cfg.petalCount;
      const halfPetal = petalAngle * 0.42;
      const colorIdx = ri % palette.length;
      const altColorIdx = (ri + 2) % palette.length;

      brush.pushMatrix();
      brush.translate(centerX, centerY);
      brush.rotate(ringRotation);

      // Draw petals for this ring
      for (let p = 0; p < cfg.petalCount; p++) {
        const angle = p * petalAngle;
        const isAlt = p % 2 === 0;
        const petalColor = isAlt ? palette[colorIdx] : palette[altColorIdx];

        // Petal shape via path: an arc segment (pie wedge)
        const path = brush.beginPath();
        const cosA1 = Math.cos(angle - halfPetal);
        const sinA1 = Math.sin(angle - halfPetal);
        const cosA2 = Math.cos(angle + halfPetal);
        const sinA2 = Math.sin(angle + halfPetal);

        path.moveTo(cosA1 * innerR, sinA1 * innerR);
        path.lineTo(cosA1 * ringRadius, sinA1 * ringRadius);
        path.arc(0, 0, ringRadius, angle - halfPetal, angle + halfPetal, false);
        path.lineTo(cosA2 * innerR, sinA2 * innerR);
        if (innerR > 1) {
          path.arc(0, 0, innerR, angle + halfPetal, angle - halfPetal, true);
        }
        path.closePath();
        path.fill({
          fill: petalColor,
          alpha: 0.75,
          blendMode: 'normal',
        });

        // Lead outline for each petal
        const outline = brush.beginPath();
        outline.moveTo(cosA1 * innerR, sinA1 * innerR);
        outline.lineTo(cosA1 * ringRadius, sinA1 * ringRadius);
        outline.arc(0, 0, ringRadius, angle - halfPetal, angle + halfPetal, false);
        outline.lineTo(cosA2 * innerR, sinA2 * innerR);
        if (innerR > 1) {
          outline.arc(0, 0, innerR, angle + halfPetal, angle - halfPetal, true);
        }
        outline.closePath();
        outline.stroke({
          color: leadColor,
          width: 1,
          alpha: 0.6,
          blendMode: 'normal',
        });

        // Small decorative circle at mid-point of each petal
        if (ri < 4) {
          const midR = (innerR + ringRadius) * 0.5;
          const dotX = Math.cos(angle) * midR;
          const dotY = Math.sin(angle) * midR;
          const dotRadius = (ringRadius - innerR) * 0.15;
          if (dotRadius > 1) {
            brush.circle(dotX, dotY, dotRadius, {
              fill: palette[(colorIdx + 1) % palette.length],
              alpha: 0.8,
              blendMode: 'normal',
            });
          }
        }
      }

      // Lead ring at outer edge
      brush.circle(0, 0, ringRadius, {
        stroke: leadColor,
        strokeWidth: ri === NUM_RINGS - 1 ? 2.5 : 1.5,
        alpha: 0.7,
        blendMode: 'normal',
      });

      // Lead ring at inner edge (if it exists)
      if (innerR > 1) {
        brush.circle(0, 0, innerR, {
          stroke: leadColor,
          strokeWidth: 1,
          alpha: 0.6,
          blendMode: 'normal',
        });
      }

      brush.popMatrix();
    }

    // -- Outer decorative border with small circles --
    const outerBorderR = maxRadius * 0.96 * growEase;
    if (outerBorderR > 10) {
      const numDots = 32;
      const dotAngle = TWO_PI / numDots;
      const borderRotation = baseRotation * -0.15;
      brush.pushMatrix();
      brush.translate(centerX, centerY);
      brush.rotate(borderRotation);
      for (let d = 0; d < numDots; d++) {
        const a = d * dotAngle;
        const dx = Math.cos(a) * outerBorderR;
        const dy = Math.sin(a) * outerBorderR;
        const dotColor = palette[d % palette.length];
        brush.circle(dx, dy, maxRadius * 0.018 * growEase, {
          fill: dotColor,
          alpha: 0.7,
          blendMode: 'normal',
        });
      }
      brush.popMatrix();
    }

    // -- Subtle glow at center (additive) --
    const glowR = maxRadius * 0.12 * growEase;
    if (glowR > 1) {
      brush.circle(centerX, centerY, glowR, {
        fill: {
          type: 'radial',
          cx: 0.5,
          cy: 0.5,
          radius: 0.5,
          stops: [
            { offset: 0, color: isDark ? 0xffffcc : 0xffeeaa },
            { offset: 1, color: isDark ? 0x000000 : 0xffffff },
          ],
        },
        alpha: isDark ? 0.3 : 0.15,
        blendMode: 'add',
      });
    }
  },

  async teardown(): Promise<void> {
    growProgress = 0;
    baseRotation = 0;
  },
};

registerActor(actor);
export default actor;
