/**
 * Mario Runner Actor
 *
 * Classic NES-style Mario running through a side-scrolling level.
 * Sprites are pre-rendered as pixel art data URLs. Level elements
 * scroll left using object pools. Mario jumps on audio beats.
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

// ============================================================
// METADATA
// ============================================================

const metadata: ActorMetadata = {
  id: 'mario-runner',
  name: 'Mario Runner',
  description:
    'Classic NES-style Mario running through a side-scrolling level with pipes, bricks, and question blocks',
  author: { name: 'Rolf', github: 'flavor' },
  version: '1.0.0',
  tags: ['retro', 'pixel-art', 'game', 'platformer'],
  createdAt: new Date('2026-03-22'),
  preferredDuration: 60,
  requiredContexts: ['audio'],
};

// ============================================================
// CONSTANTS
// ============================================================

const BLOCK = 24;
const GROUND_Y_RATIO = 0.78;
const SCROLL_SPEED = 0.06;
const MARIO_W = 48;
const MARIO_H = 72;
const MARIO_SCREEN_X_RATIO = 0.22;
const GRAVITY = 0.0012;
const JUMP_VY = -0.38;
const WALK_FRAME_MS = 120;
const BEAT_DEBOUNCE_MS = 400;

const MAX_GROUND_COLS = 20;
const MAX_PIPES = 4;
const MAX_QBLOCKS = 6;
const MAX_CLOUDS = 5;
const MAX_HILLS = 4;
const MAX_COINS = 6;

// NES Mario palette
const C_RED = '#B81C1C';
const C_SKIN = '#FCA044';
const C_BROWN = '#5C3A21';
const C_BLUE = '#6B6ECF';
const C_GOLD = '#F8D878';

const C_BRICK_DARK = '#C84C0C';
const C_BRICK_LIGHT = '#E09050';
const C_Q_BODY = '#E09838';
const C_Q_HIGHLIGHT = '#F8D878';
const C_Q_DARK = '#885818';
const C_PIPE_MAIN = '#00A800';
const C_PIPE_DARK = '#005800';
const C_PIPE_LIGHT = '#00D800';
const C_GROUND_LIGHT = '#E09050';
const C_CLOUD = '#FCFCFC';
const C_CLOUD_SHADOW = '#D0D0E0';
const C_HILL_MAIN = '#00A800';
const C_HILL_DARK = '#005800';
const C_COIN_GOLD = '#F8B800';
const C_COIN_LIGHT = '#F8D878';

// ============================================================
// PIXEL ART DATA
// Palette: 0=transparent, 1=red, 2=skin, 3=brown, 4=blue, 5=gold
// ============================================================

// Frame 1: right leg forward, left leg back (wide stride)
const MARIO_RUN1: number[][] = [
  [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0], // 0  hat
  [0,0,0,0,1,1,1,1,1,1,1,1,1,0,0,0], // 1  hat
  [0,0,0,0,3,3,3,2,2,3,2,0,0,0,0,0], // 2  hair+face
  [0,0,0,3,2,3,2,2,2,3,2,2,2,0,0,0], // 3  face
  [0,0,0,3,2,3,3,2,2,2,3,2,2,2,0,0], // 4  face
  [0,0,0,3,3,2,2,2,2,3,3,3,3,0,0,0], // 5  chin
  [0,0,0,0,0,2,2,2,2,2,2,2,0,0,0,0], // 6  neck
  [0,0,0,0,1,1,4,1,1,1,0,0,0,0,0,0], // 7  shirt
  [0,0,2,2,1,1,4,1,1,4,1,1,0,0,0,0], // 8  arms+shirt (arm forward)
  [0,0,0,2,1,1,4,4,4,4,1,1,2,0,0,0], // 9  overalls top
  [0,0,0,0,1,4,4,5,4,4,5,4,2,2,0,0], // 10 overalls
  [0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0], // 11 overalls
  [0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0], // 12 overalls
  [0,0,0,0,4,4,4,0,0,0,4,4,0,0,0,0], // 13 legs apart
  [0,0,0,4,4,4,0,0,0,0,0,4,4,0,0,0], // 14 legs wide
  [0,0,4,4,4,0,0,0,0,0,0,0,4,4,0,0], // 15 legs very wide
  [0,0,4,4,0,0,0,0,0,0,0,0,4,4,0,0], // 16 ankles
  [0,3,3,3,3,0,0,0,0,0,0,0,0,3,3,0], // 17 shoes apart
  [0,3,3,3,3,0,0,0,0,0,0,0,3,3,3,0], // 18 shoes
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 19
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 20
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 21
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 22
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 23
];

// Frame 2: legs passing (close together, one knee up)
const MARIO_RUN2: number[][] = [
  [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0], // 0  hat
  [0,0,0,0,1,1,1,1,1,1,1,1,1,0,0,0], // 1  hat
  [0,0,0,0,3,3,3,2,2,3,2,0,0,0,0,0], // 2  hair+face
  [0,0,0,3,2,3,2,2,2,3,2,2,2,0,0,0], // 3  face
  [0,0,0,3,2,3,3,2,2,2,3,2,2,2,0,0], // 4  face
  [0,0,0,3,3,2,2,2,2,3,3,3,3,0,0,0], // 5  chin
  [0,0,0,0,0,2,2,2,2,2,2,2,0,0,0,0], // 6  neck
  [0,0,0,0,1,1,4,1,1,1,0,0,0,0,0,0], // 7  shirt
  [0,0,0,2,1,1,4,1,1,4,1,1,2,0,0,0], // 8  arms at sides
  [0,0,0,0,1,1,4,4,4,4,1,1,0,0,0,0], // 9  overalls top
  [0,0,0,0,1,4,4,5,4,4,5,4,0,0,0,0], // 10 overalls
  [0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0], // 11 overalls
  [0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0], // 12 overalls
  [0,0,0,0,0,4,4,4,4,4,0,0,0,0,0,0], // 13 legs together
  [0,0,0,0,0,4,4,0,4,4,0,0,0,0,0,0], // 14 one knee bent
  [0,0,0,0,0,4,4,0,4,4,0,0,0,0,0,0], // 15 lower legs
  [0,0,0,0,0,4,4,0,0,3,3,0,0,0,0,0], // 16 ankle + kicked-back shoe
  [0,0,0,0,0,3,3,3,0,3,3,0,0,0,0,0], // 17 shoes
  [0,0,0,0,0,3,3,3,0,0,0,0,0,0,0,0], // 18 front shoe
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 19
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 20
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 21
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 22
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 23
];

// Frame 3: left leg forward, right leg back (mirror of frame 1)
const MARIO_RUN3: number[][] = [
  [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0], // 0  hat
  [0,0,0,0,1,1,1,1,1,1,1,1,1,0,0,0], // 1  hat
  [0,0,0,0,3,3,3,2,2,3,2,0,0,0,0,0], // 2  hair+face
  [0,0,0,3,2,3,2,2,2,3,2,2,2,0,0,0], // 3  face
  [0,0,0,3,2,3,3,2,2,2,3,2,2,2,0,0], // 4  face
  [0,0,0,3,3,2,2,2,2,3,3,3,3,0,0,0], // 5  chin
  [0,0,0,0,0,2,2,2,2,2,2,2,0,0,0,0], // 6  neck
  [0,0,0,0,1,1,4,1,1,1,0,0,0,0,0,0], // 7  shirt
  [0,0,0,0,1,1,4,1,1,4,1,1,2,2,0,0], // 8  arms+shirt (other arm forward)
  [0,0,0,2,1,1,4,4,4,4,1,1,2,0,0,0], // 9  overalls top
  [0,0,2,2,1,4,4,5,4,4,5,4,0,0,0,0], // 10 overalls
  [0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0], // 11 overalls
  [0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0], // 12 overalls
  [0,0,0,0,4,4,0,0,0,4,4,4,0,0,0,0], // 13 legs apart (reversed)
  [0,0,0,4,4,0,0,0,0,0,4,4,4,0,0,0], // 14 legs wide
  [0,0,4,4,0,0,0,0,0,0,0,4,4,4,0,0], // 15 legs very wide
  [0,0,4,4,0,0,0,0,0,0,0,0,4,4,0,0], // 16 ankles
  [0,0,3,3,0,0,0,0,0,0,0,3,3,3,3,0], // 17 shoes apart
  [0,3,3,3,0,0,0,0,0,0,0,0,3,3,3,0], // 18 shoes
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 19
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 20
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 21
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 22
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 23
];

const MARIO_JUMP_DATA: number[][] = [
  [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,3,3,3,2,2,3,2,0,0,0,0,0],
  [0,0,0,3,2,3,2,2,2,3,2,2,2,0,0,0],
  [0,0,0,3,2,3,3,2,2,2,3,2,2,2,0,0],
  [0,0,0,3,3,2,2,2,2,3,3,3,3,0,0,0],
  [0,0,0,0,0,2,2,2,2,2,2,2,0,0,0,0],
  [0,0,2,2,1,1,4,1,1,1,0,0,0,0,0,0],
  [0,2,2,1,1,1,4,1,1,4,1,1,1,2,0,0],
  [0,2,2,1,1,1,4,4,4,4,1,1,1,2,2,0],
  [0,0,0,1,1,4,4,5,4,4,5,4,1,2,2,0],
  [0,0,0,0,4,4,4,4,4,4,4,4,0,0,0,0],
  [0,0,0,0,4,4,4,4,4,4,4,4,0,0,0,0],
  [0,0,0,4,4,4,4,0,0,4,4,0,0,0,0,0],
  [0,0,4,4,4,4,0,0,0,0,3,3,3,0,0,0],
  [0,3,3,3,3,0,0,0,0,0,3,3,3,3,0,0],
  [0,3,3,3,3,3,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

const MARIO_PALETTE = ['', C_RED, C_SKIN, C_BROWN, C_BLUE, C_GOLD];

// ============================================================
// STATE INTERFACES
// ============================================================

interface PipeObj {
  worldX: number;
  heightBlocks: number;
  active: boolean;
}

interface QBlock {
  worldX: number;
  worldY: number;
  hit: boolean;
  bounceTimer: number;
  active: boolean;
}

interface CloudObj {
  worldX: number;
  worldY: number;
  scaleIdx: number;
  active: boolean;
}

interface HillObj {
  worldX: number;
  scaleIdx: number;
  active: boolean;
}

interface CoinObj {
  worldX: number;
  worldY: number;
  active: boolean;
  riseTimer: number;
  alpha: number;
}

// ============================================================
// MODULE STATE
// ============================================================

let canvasW = 360;
let canvasH = 640;
let groundY = 500;
let marioScreenX = 80;

let marioRunTextures: string[] = [];
let marioJumpTex = '';
let questionTex = '';
let questionHitTex = '';
let pipeTopTex = '';
let pipeBodyTex = '';
let cloudTex = '';
let hillTex = '';
let groundTex = '';
let coinTex = '';

let marioY = 0;
let marioVY = 0;
let isJumping = false;
let walkFrame = 0;
let walkTimer = 0;
let lastBeatTime = 0;
let scrollOffset = 0;

let pipes: PipeObj[] = [];
let qblocks: QBlock[] = [];
let clouds: CloudObj[] = [];
let hills: HillObj[] = [];
let coins: CoinObj[] = [];
let groundCols: number[] = [];

const HILL_SCALES = [0.8, 1.0, 1.3];
const CLOUD_SCALES = [0.8, 1.0, 1.3];

let seed = 12345;
function rand(): number {
  seed = (seed * 16807 + 0) % 2147483647;
  return (seed - 1) / 2147483646;
}

// ============================================================
// TEXTURE RENDERING
// ============================================================

function renderPixelArt(
  data: number[][],
  palette: string[],
  w: number,
  h: number,
): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < h && y < data.length; y++) {
    const row = data[y];
    for (let x = 0; x < w && x < row.length; x++) {
      const idx = row[x];
      if (idx > 0 && idx < palette.length) {
        ctx.fillStyle = palette[idx];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return c.toDataURL();
}

function renderQuestionBlock(size: number, hit: boolean): string {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  if (hit) {
    ctx.fillStyle = C_Q_DARK;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#664010';
    ctx.fillRect(2, 2, size - 4, size - 4);
    return c.toDataURL();
  }
  ctx.fillStyle = C_Q_BODY;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = C_Q_DARK;
  ctx.fillRect(0, 0, size, 2);
  ctx.fillRect(0, size - 2, size, 2);
  ctx.fillRect(0, 0, 2, size);
  ctx.fillRect(size - 2, 0, 2, size);
  ctx.fillStyle = C_Q_HIGHLIGHT;
  ctx.fillRect(2, 2, 2, size - 4);
  ctx.fillRect(2, 2, size - 4, 2);
  // Question mark
  ctx.fillStyle = C_Q_DARK;
  const qx = Math.floor(size / 2) - 3;
  const qy = Math.floor(size / 4);
  ctx.fillRect(qx, qy, 6, 2);
  ctx.fillRect(qx + 4, qy + 2, 2, 3);
  ctx.fillRect(qx + 2, qy + 5, 2, 2);
  ctx.fillRect(qx + 2, qy + 9, 2, 2);
  return c.toDataURL();
}

function renderPipeTop(w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = C_PIPE_DARK;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = C_PIPE_MAIN;
  ctx.fillRect(2, 2, w - 4, h - 2);
  ctx.fillStyle = C_PIPE_LIGHT;
  ctx.fillRect(4, 2, 4, h - 2);
  return c.toDataURL();
}

function renderPipeBody(w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = C_PIPE_DARK;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = C_PIPE_MAIN;
  ctx.fillRect(4, 0, w - 8, h);
  ctx.fillStyle = C_PIPE_LIGHT;
  ctx.fillRect(6, 0, 4, h);
  return c.toDataURL();
}

function renderCloud(w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = C_CLOUD;
  const cx = w / 2;
  const cy = h * 0.6;
  const r = h * 0.35;
  ctx.beginPath();
  ctx.arc(cx - r * 0.8, cy, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.3, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + r * 0.8, cy, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - r * 1.5, cy, r * 3, h * 0.3);
  ctx.fillStyle = C_CLOUD_SHADOW;
  ctx.fillRect(cx - r * 1.2, cy + h * 0.2, r * 2.4, 2);
  return c.toDataURL();
}

function renderHill(w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = C_HILL_MAIN;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.quadraticCurveTo(w / 2, -h * 0.2, w, h);
  ctx.fill();
  ctx.fillStyle = C_HILL_DARK;
  ctx.beginPath();
  ctx.arc(w * 0.3, h * 0.7, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.6, h * 0.65, 2, 0, Math.PI * 2);
  ctx.fill();
  return c.toDataURL();
}

function renderGround(size: number): string {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = C_BRICK_DARK;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = C_GROUND_LIGHT;
  ctx.fillRect(1, 1, size - 2, size / 2 - 1);
  ctx.fillRect(size / 2, size / 2 + 1, size / 2 - 1, size / 2 - 2);
  return c.toDataURL();
}

function renderCoin(w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = C_COIN_GOLD;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C_COIN_LIGHT;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 3, h / 3, 0, 0, Math.PI * 2);
  ctx.fill();
  return c.toDataURL();
}

// ============================================================
// POOL INIT
// ============================================================

function initPools(): void {
  groundCols = [];
  for (let i = 0; i < MAX_GROUND_COLS; i++) {
    groundCols.push(i * BLOCK);
  }

  pipes = [];
  let px = canvasW * 0.6;
  for (let i = 0; i < MAX_PIPES; i++) {
    pipes.push({ worldX: px, heightBlocks: 2 + Math.floor(rand() * 3), active: true });
    px += 150 + rand() * 150;
  }
  qblocks = [];
  let qx = canvasW * 0.4;
  for (let i = 0; i < MAX_QBLOCKS; i++) {
    qblocks.push({
      worldX: qx,
      worldY: groundY - BLOCK * (3 + Math.floor(rand() * 2)),
      hit: false,
      bounceTimer: 0,
      active: true,
    });
    qx += 100 + rand() * 120;
  }

  clouds = [];
  let cx = 0;
  for (let i = 0; i < MAX_CLOUDS; i++) {
    clouds.push({
      worldX: cx,
      worldY: 30 + rand() * (groundY * 0.3),
      scaleIdx: Math.floor(rand() * 3),
      active: true,
    });
    cx += 100 + rand() * 150;
  }

  hills = [];
  let hx = 0;
  for (let i = 0; i < MAX_HILLS; i++) {
    hills.push({ worldX: hx, scaleIdx: Math.floor(rand() * 3), active: true });
    hx += 180 + rand() * 120;
  }

  coins = [];
  for (let i = 0; i < MAX_COINS; i++) {
    coins.push({ worldX: 0, worldY: 0, active: false, riseTimer: 0, alpha: 1 });
  }
}

// ============================================================
// ACTOR
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    groundY = Math.floor(canvasH * GROUND_Y_RATIO);
    marioScreenX = Math.floor(canvasW * MARIO_SCREEN_X_RATIO);
    seed = 12345;

    marioRunTextures = [
      renderPixelArt(MARIO_RUN1, MARIO_PALETTE, 16, 24),
      renderPixelArt(MARIO_RUN2, MARIO_PALETTE, 16, 24),
      renderPixelArt(MARIO_RUN3, MARIO_PALETTE, 16, 24),
    ];
    marioJumpTex = renderPixelArt(MARIO_JUMP_DATA, MARIO_PALETTE, 16, 24);
    questionTex = renderQuestionBlock(16, false);
    questionHitTex = renderQuestionBlock(16, true);
    pipeTopTex = renderPipeTop(32, 16);
    pipeBodyTex = renderPipeBody(32, 16);
    cloudTex = renderCloud(48, 24);
    hillTex = renderHill(64, 32);
    groundTex = renderGround(16);
    coinTex = renderCoin(8, 14);

    marioY = groundY;
    marioVY = 0;
    isJumping = false;
    walkFrame = 0;
    walkTimer = 0;
    lastBeatTime = 0;
    scrollOffset = 0;

    initPools();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime;
    const time = frame.time;

    // Scroll
    scrollOffset += SCROLL_SPEED * dt;

    // Audio
    const audio = api.context.audio;
    let beat = false;
    let bass = 0.3;
    try {
      bass = audio.bass();
      beat = audio.isBeat();
    } catch {
      bass = 0.3 + Math.sin(time / 800) * 0.2;
      beat = Math.sin((time / 500) * Math.PI) > 0.98;
    }

    // Jump on beat
    if (beat && !isJumping && time - lastBeatTime > BEAT_DEBOUNCE_MS) {
      isJumping = true;
      marioVY = JUMP_VY;
      lastBeatTime = time;
    }

    // Auto-jump for pipes
    if (!isJumping) {
      for (let i = 0; i < pipes.length; i++) {
        const p = pipes[i];
        if (!p.active) continue;
        const sx = p.worldX - scrollOffset;
        if (sx > marioScreenX + 20 && sx < marioScreenX + 80) {
          isJumping = true;
          marioVY = JUMP_VY;
          lastBeatTime = time;
          break;
        }
      }
    }

    // Mario physics
    if (isJumping) {
      marioVY += GRAVITY * dt;
      marioY += marioVY * dt;
      if (marioY >= groundY) {
        marioY = groundY;
        isJumping = false;
        marioVY = 0;
      }
    }

    // Walk animation
    if (!isJumping) {
      walkTimer += dt;
      if (walkTimer >= WALK_FRAME_MS) {
        walkFrame = (walkFrame + 1) % 3;
        walkTimer -= WALK_FRAME_MS;
      }
    }

    // Recycle ground columns
    for (let i = 0; i < groundCols.length; i++) {
      const sx = groundCols[i] - scrollOffset;
      if (sx < -BLOCK) {
        let maxX = groundCols[0];
        for (let j = 1; j < groundCols.length; j++) {
          if (groundCols[j] > maxX) maxX = groundCols[j];
        }
        groundCols[i] = maxX + BLOCK;
      }
    }

    // Recycle pipes (leading-edge scan)
    for (let i = 0; i < pipes.length; i++) {
      const p = pipes[i];
      if (p.worldX - scrollOffset < -60) {
        let maxX = pipes[0].worldX;
        for (let j = 1; j < pipes.length; j++) {
          if (pipes[j].worldX > maxX) maxX = pipes[j].worldX;
        }
        p.worldX = maxX + 150 + rand() * 150;
        p.heightBlocks = 2 + Math.floor(rand() * 3);
      }
    }

    // Recycle question blocks (leading-edge scan)
    for (let i = 0; i < qblocks.length; i++) {
      const q = qblocks[i];
      if (q.worldX - scrollOffset < -40) {
        let maxX = qblocks[0].worldX;
        for (let j = 1; j < qblocks.length; j++) {
          if (qblocks[j].worldX > maxX) maxX = qblocks[j].worldX;
        }
        q.worldX = maxX + 100 + rand() * 120;
        q.worldY = groundY - BLOCK * (3 + Math.floor(rand() * 2));
        q.hit = false;
        q.bounceTimer = 0;
      }
    }

    // Recycle clouds (leading-edge scan)
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      if (c.worldX - scrollOffset * 0.2 < -80) {
        let maxX = clouds[0].worldX;
        for (let j = 1; j < clouds.length; j++) {
          if (clouds[j].worldX > maxX) maxX = clouds[j].worldX;
        }
        c.worldX = maxX + 100 + rand() * 150;
        c.worldY = 30 + rand() * (groundY * 0.3);
        c.scaleIdx = Math.floor(rand() * 3);
      }
    }

    // Recycle hills (leading-edge scan)
    for (let i = 0; i < hills.length; i++) {
      const h = hills[i];
      if (h.worldX - scrollOffset * 0.3 < -100) {
        let maxX = hills[0].worldX;
        for (let j = 1; j < hills.length; j++) {
          if (hills[j].worldX > maxX) maxX = hills[j].worldX;
        }
        h.worldX = maxX + 180 + rand() * 120;
        h.scaleIdx = Math.floor(rand() * 3);
      }
    }

    // Question block hit detection
    for (let i = 0; i < qblocks.length; i++) {
      const q = qblocks[i];
      if (q.hit) {
        if (q.bounceTimer > 0) q.bounceTimer -= dt;
        continue;
      }
      const sx = q.worldX - scrollOffset;
      if (Math.abs(sx - marioScreenX) < BLOCK && q.worldY < marioY - MARIO_H * 0.5) {
        q.hit = true;
        q.bounceTimer = 300;
        for (let ci = 0; ci < coins.length; ci++) {
          if (!coins[ci].active) {
            coins[ci].active = true;
            coins[ci].worldX = q.worldX + BLOCK / 2;
            coins[ci].worldY = q.worldY - BLOCK;
            coins[ci].riseTimer = 500;
            coins[ci].alpha = 1;
            break;
          }
        }
      }
    }

    // Update coins
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.active) continue;
      c.riseTimer -= dt;
      c.worldY -= 0.08 * dt;
      c.alpha = Math.max(0, c.riseTimer / 500);
      if (c.riseTimer <= 0) c.active = false;
    }

    // ---- DRAW (back to front) ----

    // Hills (parallax 0.3x)

    for (let i = 0; i < hills.length; i++) {
      const h = hills[i];
      const sx = h.worldX - scrollOffset * 0.3;
      if (sx < -100 || sx > canvasW + 50) continue;
      const s = HILL_SCALES[h.scaleIdx];
      api.brush.image(hillTex, sx, groundY - 32 * s, {
        width: 64 * s,
        height: 32 * s,
        alpha: 0.7,
      });
    }

    // Clouds (parallax 0.2x)

    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const sx = c.worldX - scrollOffset * 0.2;
      if (sx < -80 || sx > canvasW + 50) continue;
      const s = CLOUD_SCALES[c.scaleIdx];
      api.brush.image(cloudTex, sx, c.worldY, {
        width: 48 * s,
        height: 24 * s,
        alpha: 0.8,
      });
    }

    // Ground
    const groundRows = Math.ceil((canvasH - groundY) / BLOCK) + 1;
    for (let i = 0; i < groundCols.length; i++) {
      const sx = groundCols[i] - scrollOffset;
      if (sx < -BLOCK || sx > canvasW + BLOCK) continue;
      for (let r = 0; r < groundRows; r++) {
        api.brush.image(groundTex, sx, groundY + r * BLOCK, {
          width: BLOCK,
          height: BLOCK,
        });
      }
    }

    // Pipes
    const pipeW = BLOCK * 1.5;
    for (let i = 0; i < pipes.length; i++) {
      const p = pipes[i];
      const sx = p.worldX - scrollOffset;
      if (sx < -pipeW || sx > canvasW + pipeW) continue;
      const pipeH = p.heightBlocks * BLOCK;
      api.brush.image(pipeTopTex, sx, groundY - pipeH, {
        width: pipeW,
        height: BLOCK,
      });
      for (let r = 1; r < p.heightBlocks; r++) {
        api.brush.image(pipeBodyTex, sx + 2, groundY - pipeH + r * BLOCK, {
          width: pipeW - 4,
          height: BLOCK,
        });
      }
    }

    // Question blocks
    for (let i = 0; i < qblocks.length; i++) {
      const q = qblocks[i];
      const sx = q.worldX - scrollOffset;
      if (sx < -BLOCK || sx > canvasW + BLOCK) continue;
      let bounceY = 0;
      if (q.bounceTimer > 0) {
        bounceY = -Math.sin((q.bounceTimer / 300) * Math.PI) * 6;
      }
      const tex = q.hit ? questionHitTex : questionTex;
      const pulseScale = q.hit ? 1.0 : 1.0 + bass * 0.12;
      const bSize = BLOCK * pulseScale;
      api.brush.image(tex, sx - (bSize - BLOCK) / 2, q.worldY + bounceY, {
        width: bSize,
        height: bSize,
      });
    }

    // Coins
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.active || c.alpha < 0.05) continue;
      const sx = c.worldX - scrollOffset;
      api.brush.image(coinTex, sx - 6, c.worldY, {
        width: 12,
        height: 20,
        alpha: c.alpha,
      });
    }

    // Mario
    const marioTex = isJumping ? marioJumpTex : marioRunTextures[walkFrame];
    api.brush.image(marioTex, marioScreenX - MARIO_W / 2, marioY - MARIO_H, {
      width: MARIO_W,
      height: MARIO_H,
    });
  },

  async teardown(): Promise<void> {
    marioRunTextures = [];
    marioJumpTex = '';
    questionTex = '';
    questionHitTex = '';
    pipeTopTex = '';
    pipeBodyTex = '';
    cloudTex = '';
    hillTex = '';
    groundTex = '';
    coinTex = '';
    pipes = [];
    qblocks = [];
    clouds = [];
    hills = [];
    coins = [];
    groundCols = [];
    scrollOffset = 0;
    marioY = 0;
    marioVY = 0;
    isJumping = false;
    walkFrame = 0;
    walkTimer = 0;
    lastBeatTime = 0;
  },
};

registerActor(actor);
export default actor;
