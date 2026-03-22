import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'bitcoin-miner',
  name: 'Bitcoin Miner',
  description: 'A fake bitcoin miner with scrolling hashes, nonce counter, and block-found celebrations',
  author: { name: 'Jan Willem', github: 'janw-me' },
  version: '1.0.0',
  tags: ['bitcoin', 'hacker', 'terminal', 'retro'],
  createdAt: new Date(),
  preferredDuration: 45,
  requiredContexts: ['display'],
};

// --- Constants ---
const MAX_HASH_LINES = 18;
const MAX_COINS = 8;
const HEX = '0123456789abcdef';
const HASH_LEN = 40;
const BLOCK_INTERVAL_MIN = 6; // seconds between block finds (min)
const BLOCK_INTERVAL_MAX = 14;

// --- Pre-allocated state ---
interface HashLine {
  active: boolean;
  text: string;
  y: number;
  alpha: number;
  speed: number;
}

interface Coin {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  alpha: number;
  scale: number;
  age: number;
}

let hashLines: HashLine[] = [];
let coins: Coin[] = [];
let canvasW = 0;
let canvasH = 0;
let nonce = 0;
let blocksFound = 0;
let nextBlockAt = 0;
let blockFlash = 0;
let hashPool: string[] = [];
let hashPoolIdx = 0;
let lineSpawnTimer = 0;

// Pre-generate a pool of hash strings to avoid allocation in update()
const HASH_POOL_SIZE = 64;

function generateHash(): string {
  let h = '';
  for (let i = 0; i < HASH_LEN; i++) {
    h += HEX[(Math.random() * 16) | 0];
  }
  return h;
}

function generateLeadingZeroHash(): string {
  const zeros = 4 + ((Math.random() * 4) | 0);
  let h = '';
  for (let i = 0; i < zeros; i++) h += '0';
  for (let i = zeros; i < HASH_LEN; i++) h += HEX[(Math.random() * 16) | 0];
  return h;
}

function nextHash(): string {
  const h = hashPool[hashPoolIdx];
  hashPoolIdx = (hashPoolIdx + 1) % HASH_POOL_SIZE;
  return h;
}

function resetCoin(c: Coin, x: number, baseY: number) {
  c.active = true;
  c.x = x + (Math.random() - 0.5) * 60;
  c.y = baseY;
  c.vy = -0.4 - Math.random() * 0.3;
  c.alpha = 1.0;
  c.scale = 0.3 + Math.random() * 0.4;
  c.age = 0;
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI) {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    // Pre-generate hash pool
    hashPool = [];
    for (let i = 0; i < HASH_POOL_SIZE; i++) {
      hashPool[i] = generateHash();
    }
    hashPoolIdx = 0;

    // Pre-allocate hash lines
    hashLines = [];
    for (let i = 0; i < MAX_HASH_LINES; i++) {
      hashLines[i] = {
        active: false,
        text: '',
        y: 0,
        alpha: 0,
        speed: 0,
      };
    }

    // Pre-allocate coins
    coins = [];
    for (let i = 0; i < MAX_COINS; i++) {
      coins[i] = { active: false, x: 0, y: 0, vy: 0, alpha: 0, scale: 0, age: 0 };
    }

    nonce = (Math.random() * 1000000) | 0;
    blocksFound = 0;
    nextBlockAt = BLOCK_INTERVAL_MIN + Math.random() * (BLOCK_INTERVAL_MAX - BLOCK_INTERVAL_MIN);
    blockFlash = 0;
    lineSpawnTimer = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext) {
    const t = frame.time / 1000;
    const dt = frame.deltaTime / 1000;
    const isDark = api.context.display.isDarkMode();

    const greenColor = isDark ? 0x00ff88 : 0x00aa44;
    const dimGreen = isDark ? 0x007744 : 0x005522;
    const goldColor = 0xffaa00;
    const brightGold = 0xffdd44;
    const textBg = isDark ? 0x0a0a0a : 0x111a11;
    const headerColor = isDark ? 0x44ffaa : 0x22aa66;

    // Nonce increments rapidly
    nonce += ((Math.random() * 50000) | 0) + 10000;

    // --- Spawn new hash lines ---
    lineSpawnTimer += dt;
    if (lineSpawnTimer > 0.08) {
      lineSpawnTimer = 0;
      for (let i = 0; i < MAX_HASH_LINES; i++) {
        if (!hashLines[i].active) {
          hashLines[i].active = true;
          hashLines[i].text = nextHash();
          hashLines[i].y = canvasH * 0.38;
          hashLines[i].alpha = 1.0;
          hashLines[i].speed = 20 + Math.random() * 15;
          break;
        }
      }
    }

    // --- Update hash lines ---
    for (let i = 0; i < MAX_HASH_LINES; i++) {
      const line = hashLines[i];
      if (!line.active) continue;
      line.y += line.speed * dt;
      line.alpha -= dt * 0.35;
      if (line.alpha < 0.05 || line.y > canvasH) {
        line.active = false;
      }
    }

    // --- Check for block found ---
    if (t > nextBlockAt) {
      blocksFound++;
      blockFlash = 1.0;
      nextBlockAt = t + BLOCK_INTERVAL_MIN + Math.random() * (BLOCK_INTERVAL_MAX - BLOCK_INTERVAL_MIN);

      // Replace one hash in the pool with a leading-zero hash for visual flair
      hashPool[hashPoolIdx] = generateLeadingZeroHash();

      // Spawn celebration coins
      for (let i = 0; i < MAX_COINS; i++) {
        if (!coins[i].active) {
          resetCoin(coins[i], canvasW / 2, canvasH * 0.25);
          if (i >= 3) break; // spawn 3-4 coins per block
        }
      }
    }

    // --- Update block flash ---
    if (blockFlash > 0) {
      blockFlash -= dt * 1.5;
      if (blockFlash < 0) blockFlash = 0;
    }

    // --- Update coins ---
    for (let i = 0; i < MAX_COINS; i++) {
      const c = coins[i];
      if (!c.active) continue;
      c.age += dt;
      c.y += c.vy * frame.deltaTime * 0.06;
      c.alpha = Math.max(0, 1.0 - c.age / 3.0);
      c.scale += dt * 0.05;
      if (c.alpha < 0.05) c.active = false;
    }

    // === DRAWING ===

    // Semi-transparent terminal background
    api.brush.rect(canvasW * 0.03, canvasH * 0.02, canvasW * 0.94, canvasH * 0.96, {
      fill: textBg,
      alpha: isDark ? 0.7 : 0.5,
    });

    // Header
    api.brush.text('[ BITCOIN MINER v3.7.1 ]', canvasW * 0.08, canvasH * 0.05, {
      fontSize: Math.max(10, canvasW * 0.038),
      fill: headerColor,
      alpha: 0.9,
    });

    // Hashrate display with fake fluctuation
    const hashrate = (142.7 + Math.sin(t * 3) * 12.3 + Math.sin(t * 7.1) * 5.1).toFixed(1);
    api.brush.text(`Hashrate: ${hashrate} MH/s`, canvasW * 0.08, canvasH * 0.10, {
      fontSize: Math.max(8, canvasW * 0.032),
      fill: greenColor,
      alpha: 0.8,
    });

    // Nonce counter
    const nonceStr = `Nonce: ${nonce.toString(16).padStart(10, '0')}`;
    api.brush.text(nonceStr, canvasW * 0.08, canvasH * 0.14, {
      fontSize: Math.max(8, canvasW * 0.032),
      fill: dimGreen,
      alpha: 0.8,
    });

    // Blocks found
    api.brush.text(`Blocks: ${blocksFound}`, canvasW * 0.08, canvasH * 0.18, {
      fontSize: Math.max(8, canvasW * 0.032),
      fill: blocksFound > 0 ? goldColor : dimGreen,
      alpha: 0.8,
    });

    // Progress bar background
    const barX = canvasW * 0.08;
    const barY = canvasH * 0.23;
    const barW = canvasW * 0.84;
    const barH = canvasH * 0.025;
    api.brush.rect(barX, barY, barW, barH, {
      fill: isDark ? 0x1a1a2a : 0x223322,
      alpha: 0.8,
    });

    // Progress bar fill — cycles to create sense of ongoing work
    const progress = (t * 0.15) % 1.0;
    api.brush.rect(barX, barY, barW * progress, barH, {
      fill: greenColor,
      alpha: 0.7,
    });

    // Scanning label
    api.brush.text('Scanning block...', canvasW * 0.08, canvasH * 0.27, {
      fontSize: Math.max(7, canvasW * 0.026),
      fill: dimGreen,
      alpha: 0.6,
    });

    // Divider line
    api.brush.line(canvasW * 0.05, canvasH * 0.32, canvasW * 0.95, canvasH * 0.32, {
      color: dimGreen,
      width: 1,
      alpha: 0.4,
    });

    // Label for hash output
    api.brush.text('> Mining output:', canvasW * 0.08, canvasH * 0.34, {
      fontSize: Math.max(7, canvasW * 0.026),
      fill: greenColor,
      alpha: 0.7,
    });

    // --- Draw hash lines ---
    for (let i = 0; i < MAX_HASH_LINES; i++) {
      const line = hashLines[i];
      if (!line.active || line.alpha < 0.05) continue;
      api.brush.text(line.text, canvasW * 0.06, line.y, {
        fontSize: Math.max(6, canvasW * 0.025),
        fill: dimGreen,
        alpha: line.alpha * 0.7,
      });
    }

    // --- Block found flash ---
    if (blockFlash > 0.05) {
      api.brush.rect(canvasW * 0.05, canvasH * 0.88, canvasW * 0.9, canvasH * 0.07, {
        fill: goldColor,
        alpha: blockFlash * 0.3,
      });
      api.brush.text('*** BLOCK FOUND! ***', canvasW * 0.15, canvasH * 0.90, {
        fontSize: Math.max(11, canvasW * 0.042),
        fill: brightGold,
        alpha: Math.min(blockFlash * 1.5, 1.0),
      });
    }

    // --- Draw celebration coins (₿ symbol) ---
    for (let i = 0; i < MAX_COINS; i++) {
      const c = coins[i];
      if (!c.active || c.alpha < 0.05) continue;
      const size = Math.max(12, canvasW * 0.06) * c.scale;
      api.brush.text('\u20BF', c.x, c.y, {
        fontSize: size,
        fill: brightGold,
        alpha: c.alpha * 0.9,
      });
    }

    // Blinking cursor at bottom
    const blink = Math.sin(t * 4) > 0;
    if (blink) {
      api.brush.rect(canvasW * 0.06, canvasH * 0.84, canvasW * 0.025, canvasH * 0.02, {
        fill: greenColor,
        alpha: 0.8,
      });
    }
  },

  async teardown() {
    hashLines = [];
    coins = [];
    hashPool = [];
    nonce = 0;
    blocksFound = 0;
    blockFlash = 0;
    lineSpawnTimer = 0;
  },
};

registerActor(actor);
export default actor;
