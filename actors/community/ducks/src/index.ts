import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'ducks',
  name: 'Ducks',
  description: 'Mother ducks swimming with trails of little ducklings following behind',
  author: { name: 'Jan', github: 'janw-ll' },
  version: '1.0.0',
  tags: ['animals', 'ducks', 'cute', 'nature'],
  createdAt: new Date(),
  preferredDuration: 45,
  requiredContexts: ['display'],
};

const MAX_MOTHERS = 8;
const MAX_DUCKLINGS_PER_MOTHER = 5;
const MIN_DUCKLINGS = 2;

interface Duckling {
  x: number;
  y: number;
  bobPhase: number;
}

interface MotherDuck {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: number; // angle in radians
  bobPhase: number;
  ducklingCount: number;
  ducklings: Duckling[];
  bodyColor: number;
  headColor: number;
  ducklingColor: number;
}

let mothers: MotherDuck[] = [];
let canvasW = 0;
let canvasH = 0;
let rippleDataUrl = '';

function initMother(m: MotherDuck, w: number, h: number): void {
  m.active = true;
  // Start from edges for a natural entrance
  const side = Math.random();
  if (side < 0.25) {
    m.x = -30;
    m.y = Math.random() * h;
    m.dir = (Math.random() - 0.5) * 0.8;
  } else if (side < 0.5) {
    m.x = w + 30;
    m.y = Math.random() * h;
    m.dir = Math.PI + (Math.random() - 0.5) * 0.8;
  } else if (side < 0.75) {
    m.x = Math.random() * w;
    m.y = -30;
    m.dir = Math.PI / 2 + (Math.random() - 0.5) * 0.8;
  } else {
    m.x = Math.random() * w;
    m.y = h + 30;
    m.dir = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
  }
  const speed = 0.3 + Math.random() * 0.4;
  m.vx = Math.cos(m.dir) * speed;
  m.vy = Math.sin(m.dir) * speed;
  m.bobPhase = Math.random() * Math.PI * 2;
  m.ducklingCount = MIN_DUCKLINGS + Math.floor(Math.random() * (MAX_DUCKLINGS_PER_MOTHER - MIN_DUCKLINGS + 1));

  // Warm duck colors with variety
  const brownVariant = Math.floor(Math.random() * 3);
  if (brownVariant === 0) {
    m.bodyColor = 0x8B6914;
    m.headColor = 0x2E5C1E;
  } else if (brownVariant === 1) {
    m.bodyColor = 0x7A5C1F;
    m.headColor = 0x3A6B28;
  } else {
    m.bodyColor = 0x9C7A30;
    m.headColor = 0x4A7A38;
  }
  m.ducklingColor = 0xF0D060;

  // Position ducklings behind
  for (let d = 0; d < MAX_DUCKLINGS_PER_MOTHER; d++) {
    const dl = m.ducklings[d];
    const behind = (d + 1) * 28;
    dl.x = m.x - Math.cos(m.dir) * behind;
    dl.y = m.y - Math.sin(m.dir) * behind;
    dl.bobPhase = Math.random() * Math.PI * 2;
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-render ripple texture
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255,255,255,0.4)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
    rippleDataUrl = c.toDataURL();

    // Pre-allocate all mothers and ducklings
    mothers = [];
    for (let i = 0; i < MAX_MOTHERS; i++) {
      const ducklings: Duckling[] = [];
      for (let d = 0; d < MAX_DUCKLINGS_PER_MOTHER; d++) {
        ducklings.push({ x: 0, y: 0, bobPhase: 0 });
      }
      const m: MotherDuck = {
        active: false, x: 0, y: 0, vx: 0, vy: 0, dir: 0,
        bobPhase: 0, ducklingCount: 3, ducklings,
        bodyColor: 0x8B6914, headColor: 0x2E5C1E, ducklingColor: 0xF0D060,
      };
      mothers.push(m);
    }

    // Activate all mothers
    for (let i = 0; i < MAX_MOTHERS; i++) {
      initMother(mothers[i], canvasW, canvasH);
      // Spread initial positions across canvas
      mothers[i].x = Math.random() * canvasW;
      mothers[i].y = Math.random() * canvasH;
      // Re-place ducklings behind
      for (let d = 0; d < mothers[i].ducklingCount; d++) {
        const dl = mothers[i].ducklings[d];
        const behind = (d + 1) * 28;
        dl.x = mothers[i].x - Math.cos(mothers[i].dir) * behind;
        dl.y = mothers[i].y - Math.sin(mothers[i].dir) * behind;
      }
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = frame.deltaTime * 0.06;
    const isDark = api.context.display.isDarkMode();
    const waterTint = isDark ? 0x4488aa : 0x88bbdd;
    const margin = 80;

    for (let i = 0; i < MAX_MOTHERS; i++) {
      const m = mothers[i];
      if (!m.active) continue;

      // Gentle wandering: slowly adjust direction
      m.dir += (Math.sin(t * 0.5 + i * 2.3) * 0.003 + (Math.random() - 0.5) * 0.005);

      // Steer back towards center if near edges
      const cx = canvasW / 2;
      const cy = canvasH / 2;
      const dxc = cx - m.x;
      const dyc = cy - m.y;
      if (m.x < margin || m.x > canvasW - margin || m.y < margin || m.y > canvasH - margin) {
        const targetDir = Math.atan2(dyc, dxc);
        let diff = targetDir - m.dir;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        m.dir += diff * 0.02;
      }

      const speed = 0.3 + Math.sin(t * 0.3 + i) * 0.1;
      m.vx = Math.cos(m.dir) * speed;
      m.vy = Math.sin(m.dir) * speed;
      m.x += m.vx * frame.deltaTime * 0.06;
      m.y += m.vy * frame.deltaTime * 0.06;

      // Wrap around if way off screen
      if (m.x < -100) m.x = canvasW + 50;
      if (m.x > canvasW + 100) m.x = -50;
      if (m.y < -100) m.y = canvasH + 50;
      if (m.y > canvasH + 100) m.y = -50;

      const bob = Math.sin(t * 3 + m.bobPhase) * 1.5;

      // Draw water ripple behind mother
      api.brush.image(rippleDataUrl, m.x, m.y + bob, {
        width: 30, height: 14, tint: waterTint, alpha: 0.3, anchorX: 0.5, anchorY: 0.5,
      });

      // Draw mother duck
      drawDuck(api, m.x, m.y + bob, m.dir, 12, 8, m.bodyColor, m.headColor, 0xFF8C00, isDark);

      // Update and draw ducklings
      for (let d = 0; d < m.ducklingCount; d++) {
        const dl = m.ducklings[d];
        // Follow behind with offset and gentle wobble
        const followDist = (d + 1) * 30;
        const wobble = Math.sin(t * 4 + dl.bobPhase + d * 1.2) * 3;
        const targetX = m.x - Math.cos(m.dir) * followDist + Math.sin(m.dir) * wobble;
        const targetY = m.y - Math.sin(m.dir) * followDist - Math.cos(m.dir) * wobble;

        // Smooth follow
        dl.x += (targetX - dl.x) * 0.08;
        dl.y += (targetY - dl.y) * 0.08;

        const dBob = Math.sin(t * 4 + dl.bobPhase) * 1;

        // Tiny ripple for duckling
        api.brush.image(rippleDataUrl, dl.x, dl.y + dBob, {
          width: 14, height: 7, tint: waterTint, alpha: 0.2, anchorX: 0.5, anchorY: 0.5,
        });

        // Draw duckling (smaller, yellow)
        drawDuck(api, dl.x, dl.y + dBob, m.dir, 6, 4, m.ducklingColor, 0xE8C840, 0xDD7700, isDark);
      }
    }
  },

  async teardown(): Promise<void> {
    for (let i = 0; i < mothers.length; i++) {
      mothers[i].active = false;
    }
    mothers = [];
    canvasW = 0;
    canvasH = 0;
    rippleDataUrl = '';
  },
};

function drawDuck(
  api: ActorUpdateAPI,
  x: number, y: number, dir: number,
  bodyR: number, headR: number,
  bodyColor: number, headColor: number, beakColor: number,
  isDark: boolean,
): void {
  const alpha = isDark ? 0.85 : 0.9;

  api.brush.pushMatrix();
  api.brush.translate(x, y);
  api.brush.rotate(dir);

  // Body (oval)
  api.brush.ellipse(0, 0, bodyR * 2, bodyR * 1.3, {
    fill: bodyColor, alpha, blendMode: 'normal',
  });

  // Tail feathers
  const tailX = -bodyR * 0.9;
  api.brush.polygon([
    { x: tailX, y: -bodyR * 0.2 },
    { x: tailX - bodyR * 0.5, y: -bodyR * 0.5 },
    { x: tailX - bodyR * 0.3, y: 0 },
    { x: tailX - bodyR * 0.5, y: bodyR * 0.4 },
    { x: tailX, y: bodyR * 0.15 },
  ], { fill: bodyColor, alpha: alpha * 0.9, blendMode: 'normal' });

  // Head
  const headX = bodyR * 0.85;
  api.brush.circle(headX, -headR * 0.3, headR, {
    fill: headColor, alpha, blendMode: 'normal',
  });

  // Eye
  const eyeR = Math.max(1.2, headR * 0.25);
  api.brush.circle(headX + headR * 0.3, -headR * 0.5, eyeR, {
    fill: 0x111111, alpha: 0.9, blendMode: 'normal',
  });
  // Eye highlight
  api.brush.circle(headX + headR * 0.4, -headR * 0.6, eyeR * 0.4, {
    fill: 0xffffff, alpha: 0.8, blendMode: 'normal',
  });

  // Beak
  const beakX = headX + headR * 0.7;
  api.brush.polygon([
    { x: beakX, y: -headR * 0.15 },
    { x: beakX + headR * 0.9, y: headR * 0.1 },
    { x: beakX, y: headR * 0.3 },
  ], { fill: beakColor, alpha, blendMode: 'normal' });

  // Wing detail on body
  api.brush.ellipse(-bodyR * 0.1, -bodyR * 0.1, bodyR * 1.1, bodyR * 0.7, {
    stroke: isDark ? 0xaa9955 : 0x665522, strokeWidth: 1, alpha: 0.4, blendMode: 'normal',
  });

  api.brush.popMatrix();
}

registerActor(actor);
export default actor;
