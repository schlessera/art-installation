import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'minecraft-breaker',
  name: 'Minecraft Breaker',
  description: 'Minecraft blocks appear on screen — move your head to swing a pickaxe and break them',
  author: {
    name: 'Lucas Radke',
    github: 'lucasradke',
  },
  version: '1.0.0',
  tags: ['game', 'minecraft', 'camera', 'interactive'],
  createdAt: new Date(),
  preferredDuration: 60,
  requiredContexts: ['video', 'display'],
};

// --- Constants ---
const MAX_BLOCKS = 3;
const BLOCK_SIZE = 48;
const HALF_BLOCK = BLOCK_SIZE / 2;
const HITS_TO_BREAK_MIN = 3;
const HITS_TO_BREAK_MAX = 5;
const SPAWN_INTERVAL_MS = 4000; // new block every 4s
const HIT_COOLDOWN_MS = 300; // min time between hits on same block
const PICKAXE_SIZE = 40;
const HEAD_HIT_RADIUS = 50; // how close head must be to block center to hit

// Block types with Minecraft-ish colors
const BLOCK_TYPES = [
  { name: 'dirt', faceColor: 0x8B6914, topColor: 0x5D8A2D, darkColor: 0x6B4F10 },
  { name: 'stone', faceColor: 0x888888, topColor: 0x999999, darkColor: 0x666666 },
  { name: 'oak', faceColor: 0xBC9456, topColor: 0xC8A76C, darkColor: 0x8A6C3A },
  { name: 'diamond', faceColor: 0x44B8B8, topColor: 0x66DDDD, darkColor: 0x338888 },
  { name: 'gold', faceColor: 0xDDCC44, topColor: 0xEEDD66, darkColor: 0xAA9922 },
];

// Break stage crack colors (overlaid with increasing alpha)
const CRACK_ALPHA = [0, 0.15, 0.30, 0.50, 0.70];

// --- Pre-allocated state ---
interface Block {
  active: boolean;
  x: number;
  y: number;
  typeIdx: number;
  hitsRequired: number;
  hitsTaken: number;
  lastHitTime: number;
  spawnTime: number;
  breakTime: number; // time when broken, for particle effect
  breaking: boolean; // currently in break animation
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  life: number;
  maxLife: number;
  size: number;
}

const MAX_PARTICLES = 24; // 8 per block break max

let blocks: Block[];
let particles: Particle[];
let canvasW = 0;
let canvasH = 0;
let lastSpawnTime = 0;
let pickaxeX = 0;
let pickaxeY = 0;
let pickaxeAngle = 0;
let pickaxeSwing = 0; // 0 = resting, >0 = swinging animation
let prevHeadX = 0;
let prevHeadY = 0;
let headSpeed = 0;
let hasFace = false;

// Pre-allocated style objects
const blockFaceStyle = { fill: 0x000000 as number, alpha: 0.9 };
const blockTopStyle = { fill: 0x000000 as number, alpha: 0.9 };
const blockSideStyle = { fill: 0x000000 as number, alpha: 0.9 };
const crackStyle = { fill: 0x000000 as number, alpha: 0.0 };
const outlineStyle = { color: 0x000000 as number, width: 2.5, alpha: 0.5 };
const particleStyle = { fill: 0x000000 as number, alpha: 1.0 };
const textStyle = { fontSize: 10, fill: 0xffffff as number, alpha: 0.7, font: 'monospace', align: 'center' as const };
const noVideoStyle = { fontSize: 14, fill: 0xffffff as number, alpha: 0.8, font: 'monospace', align: 'center' as const };

function spawnBlock(time: number): void {
  // Find inactive slot
  let slot = -1;
  let activeCount = 0;
  for (let i = 0; i < MAX_BLOCKS; i++) {
    if (blocks[i].active || blocks[i].breaking) {
      activeCount++;
    } else if (slot === -1) {
      slot = i;
    }
  }
  if (slot === -1 || activeCount >= MAX_BLOCKS) return;

  const block = blocks[slot];
  const margin = BLOCK_SIZE + 20;

  // Place blocks in random positions, avoiding overlap with other blocks
  let attempts = 0;
  let x = 0, y = 0;
  let valid = false;
  while (attempts < 20 && !valid) {
    x = margin + Math.random() * (canvasW - margin * 2);
    y = margin + Math.random() * (canvasH - margin * 2);
    valid = true;
    for (let i = 0; i < MAX_BLOCKS; i++) {
      if (!blocks[i].active && !blocks[i].breaking) continue;
      const dx = blocks[i].x - x;
      const dy = blocks[i].y - y;
      if (dx * dx + dy * dy < (BLOCK_SIZE * 2) * (BLOCK_SIZE * 2)) {
        valid = false;
        break;
      }
    }
    attempts++;
  }

  block.active = true;
  block.x = x;
  block.y = y;
  block.typeIdx = Math.floor(Math.random() * BLOCK_TYPES.length);
  block.hitsRequired = HITS_TO_BREAK_MIN + Math.floor(Math.random() * (HITS_TO_BREAK_MAX - HITS_TO_BREAK_MIN + 1));
  block.hitsTaken = 0;
  block.lastHitTime = 0;
  block.spawnTime = time;
  block.breakTime = 0;
  block.breaking = false;
}

function spawnBreakParticles(block: Block, time: number): void {
  const bt = BLOCK_TYPES[block.typeIdx];
  const colors = [bt.faceColor, bt.topColor, bt.darkColor];
  let spawned = 0;
  for (let i = 0; i < MAX_PARTICLES && spawned < 8; i++) {
    if (particles[i].active) continue;
    const p = particles[i];
    p.active = true;
    p.x = block.x + (Math.random() - 0.5) * BLOCK_SIZE;
    p.y = block.y + (Math.random() - 0.5) * BLOCK_SIZE;
    p.vx = (Math.random() - 0.5) * 3;
    p.vy = -Math.random() * 2 - 1;
    p.color = colors[Math.floor(Math.random() * 3)];
    p.life = 0;
    p.maxLife = 400 + Math.random() * 300;
    p.size = 3 + Math.random() * 5;
    spawned++;
  }
}

function drawBlock(api: ActorUpdateAPI, block: Block, time: number): void {
  const bt = BLOCK_TYPES[block.typeIdx];
  const bx = block.x;
  const by = block.y;

  // Grow-in animation
  let scale = 1;
  const age = time - block.spawnTime;
  if (age < 200) {
    const t = age / 200;
    scale = 0.3 + 0.7 * (1 - Math.pow(1 - t, 3));
  }

  const s = HALF_BLOCK * scale;
  const depth = 6 * scale; // isometric depth

  // Front face
  blockFaceStyle.fill = bt.faceColor;
  api.brush.rect(bx - s, by - s + depth, s * 2, s * 2, blockFaceStyle);

  // Top face (slightly lighter)
  blockTopStyle.fill = bt.topColor;
  api.brush.rect(bx - s, by - s, s * 2, depth, blockTopStyle);

  // Right side (darker)
  blockSideStyle.fill = bt.darkColor;
  // Simulate with a narrow rect on the right
  api.brush.rect(bx + s - depth, by - s + depth, depth, s * 2, blockSideStyle);

  // Outline
  outlineStyle.alpha = 0.4;
  api.brush.rect(bx - s, by - s, s * 2, s * 2 + depth, {
    stroke: 0x000000,
    strokeWidth: 2.5,
    alpha: 0.4,
  });

  // Grid lines (Minecraft block texture)
  const gridAlpha = 0.15;
  // Horizontal line
  api.brush.line(bx - s, by, bx + s, by, { color: 0x000000, width: 1, alpha: gridAlpha });
  // Vertical line
  api.brush.line(bx, by - s + depth, bx, by + s + depth, { color: 0x000000, width: 1, alpha: gridAlpha });

  // Crack overlay based on damage
  if (block.hitsTaken > 0) {
    const crackStage = Math.min(block.hitsTaken, CRACK_ALPHA.length - 1);
    const alpha = CRACK_ALPHA[crackStage];
    if (alpha > 0.05) {
      crackStyle.alpha = alpha;
      api.brush.rect(bx - s, by - s, s * 2, s * 2 + depth, crackStyle);

      // Draw crack lines
      const crackAlpha = 0.4 + crackStage * 0.15;
      const numCracks = crackStage + 1;
      for (let c = 0; c < numCracks; c++) {
        const cx1 = bx + (Math.sin(c * 2.7 + block.typeIdx) * s * 0.7);
        const cy1 = by + (Math.cos(c * 3.1 + block.typeIdx) * s * 0.5);
        const cx2 = cx1 + (Math.sin(c * 1.3) * s * 0.6);
        const cy2 = cy1 + (Math.cos(c * 2.1) * s * 0.6);
        api.brush.line(cx1, cy1, cx2, cy2, {
          color: 0x000000,
          width: 2 + crackStage * 0.5,
          alpha: crackAlpha,
        });
      }
    }
  }

  // HP indicator below block
  const barWidth = s * 2;
  const barHeight = 4;
  const barY = by + s + depth + 6;
  const hpFrac = 1 - (block.hitsTaken / block.hitsRequired);
  // Background
  api.brush.rect(bx - s, barY, barWidth, barHeight, { fill: 0x333333, alpha: 0.6 });
  // Fill
  const hpColor = hpFrac > 0.5 ? 0x44cc44 : hpFrac > 0.25 ? 0xcccc44 : 0xcc4444;
  if (hpFrac > 0.01) {
    api.brush.rect(bx - s, barY, barWidth * hpFrac, barHeight, { fill: hpColor, alpha: 0.8 });
  }
}

function drawPickaxe(api: ActorUpdateAPI, x: number, y: number, angle: number): void {
  api.brush.pushMatrix();
  api.brush.translate(x, y);
  api.brush.rotate(angle);

  // Handle (brown stick)
  api.brush.line(0, 0, PICKAXE_SIZE * 0.7, PICKAXE_SIZE * 0.7, {
    color: 0x8B6914,
    width: 4,
    alpha: 0.9,
  });

  // Head (gray/iron pickaxe shape)
  const hx = PICKAXE_SIZE * 0.7;
  const hy = PICKAXE_SIZE * 0.7;
  // Left pick
  api.brush.line(hx - 12, hy - 12, hx + 4, hy - 4, {
    color: 0xAAAAAA,
    width: 5,
    alpha: 0.9,
  });
  // Right pick
  api.brush.line(hx + 4, hy - 4, hx + 12, hy + 8, {
    color: 0xAAAAAA,
    width: 5,
    alpha: 0.9,
  });
  // Pick edge highlight
  api.brush.line(hx - 12, hy - 12, hx + 12, hy + 8, {
    color: 0xCCCCCC,
    width: 2.5,
    alpha: 0.7,
  });

  api.brush.popMatrix();
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-allocate blocks
    blocks = new Array(MAX_BLOCKS);
    for (let i = 0; i < MAX_BLOCKS; i++) {
      blocks[i] = {
        active: false, x: 0, y: 0, typeIdx: 0,
        hitsRequired: 3, hitsTaken: 0, lastHitTime: 0,
        spawnTime: 0, breakTime: 0, breaking: false,
      };
    }

    // Pre-allocate particles
    particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles[i] = {
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        color: 0, life: 0, maxLife: 500, size: 4,
      };
    }

    pickaxeX = canvasW * 0.5;
    pickaxeY = canvasH * 0.5;
    prevHeadX = pickaxeX;
    prevHeadY = pickaxeY;
    pickaxeAngle = -0.5;
    pickaxeSwing = 0;
    headSpeed = 0;
    hasFace = false;
    lastSpawnTime = 0;

    // Spawn initial block
    spawnBlock(0);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const dt = frame.deltaTime;
    const isDark = api.context.display.isDarkMode();

    // --- Face tracking ---
    const faces = api.context.video.getFaces();
    if (faces.length > 0) {
      const face = faces[0];
      // Map face bounds to canvas coordinates
      // Video is typically mirrored, and face bounds are in video-space
      const vidDims = api.context.video.getDimensions();
      let fx = face.bounds.x + face.bounds.width * 0.5;
      let fy = face.bounds.y + face.bounds.height * 0.5;

      if (vidDims) {
        // Normalize to 0-1 then map to canvas
        fx = (fx / vidDims.width) * canvasW;
        fy = (fy / vidDims.height) * canvasH;
      }

      // Mirror X (webcam is typically mirrored)
      fx = canvasW - fx;

      // Smooth the position
      pickaxeX = pickaxeX + (fx - pickaxeX) * 0.3;
      pickaxeY = pickaxeY + (fy - pickaxeY) * 0.3;

      // Calculate head speed
      const dx = pickaxeX - prevHeadX;
      const dy = pickaxeY - prevHeadY;
      headSpeed = Math.sqrt(dx * dx + dy * dy);
      prevHeadX = pickaxeX;
      prevHeadY = pickaxeY;
      hasFace = true;
    } else {
      hasFace = false;
      headSpeed = 0;
    }

    // --- Swing animation ---
    if (pickaxeSwing > 0) {
      pickaxeSwing = Math.max(0, pickaxeSwing - dt * 0.008);
    }

    // Calculate pickaxe angle with swing
    const baseAngle = -0.5;
    const swingOffset = Math.sin(pickaxeSwing * Math.PI * 3) * 0.8;
    pickaxeAngle = baseAngle + swingOffset;

    // --- Spawn blocks ---
    if (t - lastSpawnTime >= SPAWN_INTERVAL_MS) {
      spawnBlock(t);
      lastSpawnTime = t;
    }

    // --- Hit detection ---
    if (hasFace && headSpeed > 1.5) {
      for (let i = 0; i < MAX_BLOCKS; i++) {
        const block = blocks[i];
        if (!block.active) continue;

        const dx = pickaxeX - block.x;
        const dy = pickaxeY - block.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < HEAD_HIT_RADIUS * HEAD_HIT_RADIUS && t - block.lastHitTime > HIT_COOLDOWN_MS) {
          block.hitsTaken++;
          block.lastHitTime = t;
          pickaxeSwing = 1.0;

          if (block.hitsTaken >= block.hitsRequired) {
            // Block broken!
            block.active = false;
            block.breaking = true;
            block.breakTime = t;
            spawnBreakParticles(block, t);
          }
        }
      }
    }

    // --- Update particles ---
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt * 0.1;
      p.y += p.vy * dt * 0.1;
      p.vy += 0.005 * dt; // gravity
    }

    // --- Clear breaking state after animation ---
    for (let i = 0; i < MAX_BLOCKS; i++) {
      if (blocks[i].breaking && t - blocks[i].breakTime > 600) {
        blocks[i].breaking = false;
      }
    }

    // --- Draw ---

    // Draw blocks
    for (let i = 0; i < MAX_BLOCKS; i++) {
      if (!blocks[i].active) continue;
      drawBlock(api, blocks[i], t);
    }

    // Draw particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p.active) continue;
      const progress = p.life / p.maxLife;
      const alpha = progress < 0.1 ? progress / 0.1 : 1 - ((progress - 0.1) / 0.9);
      if (alpha < 0.05) continue;
      particleStyle.fill = p.color;
      particleStyle.alpha = alpha * 0.9;
      api.brush.rect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size, particleStyle);
    }

    // Draw pickaxe at head position
    if (hasFace) {
      drawPickaxe(api, pickaxeX, pickaxeY, pickaxeAngle);
    }

    // HUD text
    const hintColor = isDark ? 0xffffff : 0x222222;
    textStyle.fill = hintColor;
    if (!hasFace) {
      noVideoStyle.fill = hintColor;
      api.brush.text('Move your head in front of the camera!', canvasW * 0.5, canvasH * 0.5, noVideoStyle);
    }
  },

  async teardown(): Promise<void> {
    for (let i = 0; i < MAX_BLOCKS; i++) {
      blocks[i].active = false;
      blocks[i].breaking = false;
    }
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles[i].active = false;
    }
    hasFace = false;
    headSpeed = 0;
  },
};

registerActor(actor);
export default actor;
