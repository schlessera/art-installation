import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'dutch-windmill',
  name: 'Dutch Windmill',
  description: 'Dutch windmills with windmill at the end of the blades, making windmill inception.',
  author: { name: 'Jan-Willem', github: 'janw-me' },
  version: '1.0.0',
  tags: ['windmill', 'inception', 'netherlands'],
  createdAt: new Date(),
  preferredDuration: 30,
  requiredContexts: ['display'],
};

const MAX_DEPTH = 2;
const BLADE_COUNT = 4;
const BLADE_ANGLE_STEP = (Math.PI * 2) / BLADE_COUNT;
const TULIP_COLORS = [0xff3366, 0xffaa00, 0xff6633, 0xff2244, 0xffcc00];
const TULIP_COUNT = 8;

let canvasW = 0;
let canvasH = 0;

function drawWindmillBlades(
  api: ActorUpdateAPI,
  hubX: number,
  hubY: number,
  bladeLength: number,
  depth: number,
  time: number,
  isDark: boolean,
): void {
  const bladeColor = isDark ? 0xccbb99 : 0x5a4a3a;
  const sailColor = isDark ? 0xeeddcc : 0xd4c4a8;
  const hubColor = isDark ? 0xaa9977 : 0x6b5b4b;
  const hubRadius = Math.max(bladeLength * 0.08, 2);
  const bladeWidth = Math.max(bladeLength * 0.04, 2.5);

  // Each depth level rotates at different speed and alternating direction
  const rotSpeed = 0.6 * Math.pow(1.7, depth);
  const direction = depth % 2 === 0 ? 1 : -1;
  const rotation = time * rotSpeed * direction;

  const drawSails = bladeLength > 10;

  for (let i = 0; i < BLADE_COUNT; i++) {
    const angle = rotation + i * BLADE_ANGLE_STEP;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const tipX = hubX + cosA * bladeLength;
    const tipY = hubY + sinA * bladeLength;

    // Blade spine
    api.brush.line(hubX, hubY, tipX, tipY, {
      color: bladeColor,
      width: bladeWidth,
      alpha: 0.9,
    });

    // Sail lattice — thin parallelogram along the blade
    if (drawSails) {
      const perpX = -sinA;
      const perpY = cosA;
      const sailW = bladeLength * 0.15;
      const startX = hubX + cosA * bladeLength * 0.15;
      const startY = hubY + sinA * bladeLength * 0.15;

      api.brush.polygon(
        [
          { x: startX, y: startY },
          { x: startX + perpX * sailW, y: startY + perpY * sailW },
          { x: tipX + perpX * sailW * 0.3, y: tipY + perpY * sailW * 0.3 },
          { x: tipX, y: tipY },
        ],
        { fill: sailColor, alpha: 0.6 },
      );
    }

    // Recurse: smaller windmill at each blade tip
    if (depth < MAX_DEPTH) {
      drawWindmillBlades(
        api,
        tipX,
        tipY,
        bladeLength * 0.38,
        depth + 1,
        time,
        isDark,
      );
    }
  }

  // Hub circle drawn on top of blades
  api.brush.circle(hubX, hubY, hubRadius, {
    fill: hubColor,
    alpha: 0.9,
  });
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    const time = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();

    // --- Ground ---
    const groundY = canvasH * 0.72;
    api.brush.rect(0, groundY, canvasW, canvasH - groundY, {
      fill: isDark ? 0x2a4a2a : 0x4a8a3a,
      alpha: 0.7,
    });

    // Gentle hill beneath the windmill
    api.brush.ellipse(canvasW * 0.5, groundY + 10, canvasW * 0.6, 40, {
      fill: isDark ? 0x336633 : 0x5a9a4a,
      alpha: 0.6,
    });

    // --- Windmill tower ---
    const baseX = canvasW * 0.5;
    const baseY = groundY;
    const mainSize = Math.min(canvasW, canvasH) * 0.32;
    const towerH = mainSize * 0.55;
    const towerTopW = mainSize * 0.08;
    const towerBotW = mainSize * 0.18;

    // Tower body (trapezoid)
    api.brush.polygon(
      [
        { x: baseX - towerBotW, y: baseY },
        { x: baseX + towerBotW, y: baseY },
        { x: baseX + towerTopW, y: baseY - towerH },
        { x: baseX - towerTopW, y: baseY - towerH },
      ],
      { fill: isDark ? 0xccbbaa : 0x8b7355, alpha: 0.85 },
    );

    // Tower cap (triangle roof)
    const capH = mainSize * 0.1;
    api.brush.polygon(
      [
        { x: baseX - towerTopW * 1.3, y: baseY - towerH },
        { x: baseX + towerTopW * 1.3, y: baseY - towerH },
        { x: baseX, y: baseY - towerH - capH },
      ],
      { fill: isDark ? 0x887766 : 0x5a4a3a, alpha: 0.85 },
    );

    // --- Recursive windmill blades ---
    const hubX = baseX;
    const hubY = baseY - towerH;
    const bladeLength = mainSize * 0.5;

    drawWindmillBlades(api, hubX, hubY, bladeLength, 0, time, isDark);

    // --- Tulips for Dutch flavor ---
    for (let i = 0; i < TULIP_COUNT; i++) {
      const tx = canvasW * 0.1 + (canvasW * 0.8 / (TULIP_COUNT - 1)) * i;
      const ty = groundY + 15 + Math.sin(i * 1.3) * 8;

      // Stem
      api.brush.line(tx, ty, tx, ty - 12, {
        color: 0x336633,
        width: 2.5,
        alpha: 0.7,
      });
      // Flower head
      api.brush.circle(tx, ty - 14, 5, {
        fill: TULIP_COLORS[i % TULIP_COLORS.length],
        alpha: 0.75,
      });
    }
  },

  async teardown(): Promise<void> {
    canvasW = 0;
    canvasH = 0;
  },
};

registerActor(actor);
export default actor;
