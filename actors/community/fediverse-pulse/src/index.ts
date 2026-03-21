/**
 * Fediverse Pulse
 *
 * A comic-style visualization of the Fediverse: cute cartoon server mascots
 * connected by flying ActivityPub messages, with comic action words and
 * bold outlines. Each node represents a different Fediverse platform.
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
  id: 'fediverse-pulse',
  name: 'Fediverse Pulse',
  description: 'Comic-style Fediverse network with mascots exchanging ActivityPub messages',
  author: {
    name: 'Matthias Pfefferle',
    github: 'pfefferle',
  },
  version: '1.0.0',
  tags: ['fediverse', 'activitypub', 'comic', 'network', 'social'],
  createdAt: new Date(),
  preferredDuration: 45,
  requiredContexts: ['display', 'audio'],
};

// ============================================================
// Constants
// ============================================================

const MAX_NODES = 7;
const MAX_MESSAGES = 12;
const MAX_ACTION_WORDS = 4;
const MAX_HALFTONE_DOTS = 30;

const ACTION_WORDS = ['BOOST!', 'TOOT!', 'FEDERATE!', 'FOLLOW!', 'SHARE!', 'LIKE!', 'REPLY!', '@!'];

// Platform definitions: name, primary color, icon character, outline color
const PLATFORMS = [
  { name: 'Mastodon', color: 0x6364ff, icon: 'M', outline: 0x4445cc },
  { name: 'Pixelfed', color: 0xff6b6b, icon: 'P', outline: 0xcc4444 },
  { name: 'WordPress', color: 0x21759b, icon: 'W', outline: 0x185a77 },
  { name: 'Lemmy', color: 0x00bc8c, icon: 'L', outline: 0x008866 },
  { name: 'PeerTube', color: 0xf1680d, icon: 'T', outline: 0xbb5500 },
  { name: 'Misskey', color: 0x96d04a, icon: 'K', outline: 0x6b9933 },
  { name: 'Pleroma', color: 0xfba457, icon: 'R', outline: 0xcc8833 },
];

// ============================================================
// State interfaces
// ============================================================

interface FediNode {
  active: boolean;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  platformIdx: number;
  bobPhase: number;
  squashTimer: number; // for comic squash-stretch on message receive
}

interface FlyingMessage {
  active: boolean;
  fromNode: number;
  toNode: number;
  progress: number;
  speed: number;
  x: number;
  y: number;
}

interface ActionWord {
  active: boolean;
  x: number;
  y: number;
  text: number; // index into ACTION_WORDS
  alpha: number;
  scale: number;
  life: number;
  maxLife: number;
  color: number;
  vy: number;
}

interface HalftoneDot {
  x: number;
  y: number;
  baseRadius: number;
  phase: number;
}

// ============================================================
// State
// ============================================================

let cW = 0;
let cH = 0;
let nodes: FediNode[] = [];
let messages: FlyingMessage[] = [];
let actionWords: ActionWord[] = [];
let halftoneDots: HalftoneDot[] = [];
let nextMsgIdx = 0;
let nextActionIdx = 0;
let messageTimer = 0;
let glowDataUrl = '';

// ============================================================
// Helpers
// ============================================================

function initNode(node: FediNode, idx: number): void {
  const angle = (idx / MAX_NODES) * Math.PI * 2 - Math.PI / 2;
  const rx = cW * 0.28;
  const ry = cH * 0.22;
  const cx = cW * 0.5;
  const cy = cH * 0.45;

  node.active = true;
  node.targetX = cx + Math.cos(angle) * rx;
  node.targetY = cy + Math.sin(angle) * ry;
  node.x = node.targetX;
  node.y = node.targetY;
  node.vx = 0;
  node.vy = 0;
  node.baseRadius = 22 + Math.random() * 8;
  node.radius = node.baseRadius;
  node.platformIdx = idx % PLATFORMS.length;
  node.bobPhase = Math.random() * Math.PI * 2;
  node.squashTimer = 0;
}

function spawnMessage(): void {
  const msg = messages[nextMsgIdx];
  nextMsgIdx = (nextMsgIdx + 1) % MAX_MESSAGES;

  msg.active = true;
  msg.fromNode = Math.floor(Math.random() * MAX_NODES);
  msg.toNode = (msg.fromNode + 1 + Math.floor(Math.random() * (MAX_NODES - 1))) % MAX_NODES;
  msg.progress = 0;
  msg.speed = 0.4 + Math.random() * 0.4;
  msg.x = 0;
  msg.y = 0;
}

function spawnActionWord(x: number, y: number, color: number): void {
  const aw = actionWords[nextActionIdx];
  nextActionIdx = (nextActionIdx + 1) % MAX_ACTION_WORDS;

  aw.active = true;
  aw.x = x + (Math.random() - 0.5) * 30;
  aw.y = y - 20;
  aw.text = Math.floor(Math.random() * ACTION_WORDS.length);
  aw.alpha = 1;
  aw.scale = 0.3;
  aw.life = 0;
  aw.maxLife = 80;
  aw.color = color;
  aw.vy = -0.4 - Math.random() * 0.3;
}

// ============================================================
// Actor
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    cW = size.width;
    cH = size.height;
    nextMsgIdx = 0;
    nextActionIdx = 0;
    messageTimer = 0;

    // Pre-allocate nodes
    nodes = [];
    for (let i = 0; i < MAX_NODES; i++) {
      const node: FediNode = {
        active: false, x: 0, y: 0, targetX: 0, targetY: 0,
        vx: 0, vy: 0, radius: 0, baseRadius: 0,
        platformIdx: 0, bobPhase: 0, squashTimer: 0,
      };
      initNode(node, i);
      nodes.push(node);
    }

    // Pre-allocate messages
    messages = [];
    for (let i = 0; i < MAX_MESSAGES; i++) {
      messages.push({
        active: false, fromNode: 0, toNode: 0,
        progress: 0, speed: 0, x: 0, y: 0,
      });
    }

    // Pre-allocate action words
    actionWords = [];
    for (let i = 0; i < MAX_ACTION_WORDS; i++) {
      actionWords.push({
        active: false, x: 0, y: 0, text: 0,
        alpha: 0, scale: 0, life: 0, maxLife: 0, color: 0, vy: 0,
      });
    }

    // Pre-allocate halftone dots (comic background texture)
    halftoneDots = [];
    for (let i = 0; i < MAX_HALFTONE_DOTS; i++) {
      halftoneDots.push({
        x: Math.random() * cW,
        y: Math.random() * cH,
        baseRadius: 2 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Pre-render glow texture
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = canvas.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const dt = frame.deltaTime;
    const isDark = api.context.display.isDarkMode();

    // ── Halftone dot background (comic texture) ─────────────

    const halftoneColor = isDark ? 0x222244 : 0xddddee;
    for (let i = 0; i < MAX_HALFTONE_DOTS; i++) {
      const dot = halftoneDots[i];
      const r = dot.baseRadius + Math.sin(t * 0.8 + dot.phase) * 1.5;
      if (r < 1) continue;
      api.brush.circle(dot.x, dot.y, r, {
        fill: halftoneColor,
        alpha: 0.25,
      });
    }

    // ── Connection lines between nodes ──────────────────────

    const lineColor = isDark ? 0x445577 : 0x99aabb;
    for (let i = 0; i < MAX_NODES; i++) {
      const a = nodes[i];
      if (!a.active) continue;
      for (let j = i + 1; j < MAX_NODES; j++) {
        const b = nodes[j];
        if (!b.active) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        const maxDist = cW * 0.55;
        if (distSq > maxDist * maxDist) continue;
        const dist = Math.sqrt(distSq);
        const alpha = 0.15 + 0.2 * (1 - dist / maxDist);

        // Dashed comic-style line: draw as series of short segments
        const segments = Math.floor(dist / 12);
        for (let s = 0; s < segments; s += 2) {
          const t0 = s / segments;
          const t1 = Math.min((s + 1) / segments, 1);
          api.brush.line(
            a.x + dx * t0, a.y + dy * t0,
            a.x + dx * t1, a.y + dy * t1,
            { color: lineColor, width: 2, alpha },
          );
        }
      }
    }

    // ── Update and draw nodes ───────────────────────────────

    for (let i = 0; i < MAX_NODES; i++) {
      const node = nodes[i];
      if (!node.active) continue;

      // Gentle bob animation
      node.bobPhase += dt * 0.003;
      const bobY = Math.sin(node.bobPhase) * 5;
      const bobX = Math.cos(node.bobPhase * 0.7) * 3;

      // Soft spring back to target
      node.x += (node.targetX + bobX - node.x) * 0.02;
      node.y += (node.targetY + bobY - node.y) * 0.02;

      // Squash-stretch decay
      if (node.squashTimer > 0) {
        node.squashTimer -= dt * 0.004;
        if (node.squashTimer < 0) node.squashTimer = 0;
      }

      const squash = node.squashTimer > 0 ? 1 + Math.sin(node.squashTimer * 8) * 0.15 : 1;
      const platform = PLATFORMS[node.platformIdx];

      // Comic shadow (offset)
      api.brush.ellipse(node.x + 3, node.y + 4, node.radius * squash + 2, node.radius / squash + 2, {
        fill: 0x000000,
        alpha: 0.2,
      });

      // Bold outline (comic style)
      api.brush.circle(node.x, node.y, node.radius * squash + 3, {
        fill: isDark ? 0x111122 : 0x222233,
        alpha: 0.9,
      });

      // Node body
      api.brush.circle(node.x, node.y, node.radius * squash, {
        fill: platform.color,
        alpha: 0.92,
      });

      // Highlight arc (comic shine)
      api.brush.arc(
        node.x - node.radius * 0.2,
        node.y - node.radius * 0.2,
        node.radius * 0.6,
        -Math.PI * 0.8, -Math.PI * 0.2,
        { color: 0xffffff, width: 2.5, alpha: 0.4 },
      );

      // Platform icon letter
      api.brush.text(platform.icon, node.x - node.radius * 0.35, node.y - node.radius * 0.45, {
        fontSize: node.radius * 0.9,
        fill: 0xffffff,
        alpha: 0.9,
      });

      // Platform name below (small)
      api.brush.text(platform.name, node.x - node.radius * 0.6, node.y + node.radius + 6, {
        fontSize: 7,
        fill: isDark ? 0xaabbcc : 0x556677,
        alpha: 0.7,
      });
    }

    // ── Spawn messages periodically ─────────────────────────

    messageTimer += dt;
    if (messageTimer > 800) {
      messageTimer = 0;
      spawnMessage();
    }

    // On audio beat, spawn extra message + action word
    if (api.context.audio.isAvailable() && api.context.audio.isBeat()) {
      spawnMessage();
      const randNode = nodes[Math.floor(Math.random() * MAX_NODES)];
      if (randNode.active) {
        spawnActionWord(randNode.x, randNode.y, PLATFORMS[randNode.platformIdx].color);
      }
    }

    // ── Update and draw flying messages ─────────────────────

    for (let i = 0; i < MAX_MESSAGES; i++) {
      const msg = messages[i];
      if (!msg.active) continue;

      msg.progress += msg.speed * dt * 0.001;

      if (msg.progress >= 1) {
        msg.active = false;
        // Squash the receiving node
        const receiver = nodes[msg.toNode];
        if (receiver.active) {
          receiver.squashTimer = 1;
          // Chance to spawn action word
          if (Math.random() < 0.4) {
            spawnActionWord(receiver.x, receiver.y, PLATFORMS[receiver.platformIdx].color);
          }
        }
        continue;
      }

      const from = nodes[msg.fromNode];
      const to = nodes[msg.toNode];
      if (!from.active || !to.active) {
        msg.active = false;
        continue;
      }

      // Curved path (arc upward)
      const p = msg.progress;
      const arcHeight = -40 * Math.sin(p * Math.PI);
      msg.x = from.x + (to.x - from.x) * p;
      msg.y = from.y + (to.y - from.y) * p + arcHeight;

      // Envelope icon: small rectangle with triangle flap
      const envW = 10;
      const envH = 7;

      // Envelope body with bold outline
      api.brush.rect(msg.x - envW / 2 - 1, msg.y - envH / 2 - 1, envW + 2, envH + 2, {
        fill: isDark ? 0x111122 : 0x222233,
        alpha: 0.8,
      });
      api.brush.rect(msg.x - envW / 2, msg.y - envH / 2, envW, envH, {
        fill: 0xffeedd,
        alpha: 0.95,
      });

      // Envelope flap (triangle)
      api.brush.polygon([
        { x: msg.x - envW / 2, y: msg.y - envH / 2 },
        { x: msg.x, y: msg.y + 1 },
        { x: msg.x + envW / 2, y: msg.y - envH / 2 },
      ], {
        fill: 0xffddbb,
        alpha: 0.9,
      });

      // ActivityPub "AP" tiny text on envelope
      api.brush.text('AP', msg.x - 4, msg.y - 2, {
        fontSize: 5,
        fill: 0x6364ff,
        alpha: 0.7,
      });

      // Trail glow
      api.brush.image(glowDataUrl, msg.x, msg.y, {
        width: 24,
        height: 24,
        tint: PLATFORMS[from.platformIdx].color,
        alpha: 0.3,
        blendMode: 'add',
      });
    }

    // ── Update and draw action words ────────────────────────

    for (let i = 0; i < MAX_ACTION_WORDS; i++) {
      const aw = actionWords[i];
      if (!aw.active) continue;

      aw.life += 1;
      aw.y += aw.vy * dt * 0.06;

      // Pop-in then fade-out
      const lifeProgress = aw.life / aw.maxLife;
      if (lifeProgress < 0.15) {
        // Pop in with overshoot
        const t2 = lifeProgress / 0.15;
        aw.scale = 0.3 + 1.0 * (1 - Math.pow(1 - t2, 3));
        aw.alpha = t2;
      } else if (lifeProgress > 0.65) {
        aw.alpha = (1 - lifeProgress) / 0.35;
        aw.scale = 1.0 + (lifeProgress - 0.65) * 0.5;
      } else {
        aw.alpha = 1;
        aw.scale = 1.0;
      }

      if (aw.life >= aw.maxLife) {
        aw.active = false;
        continue;
      }

      if (aw.alpha < 0.05) continue;

      const word = ACTION_WORDS[aw.text];
      const fontSize = 11 * aw.scale;

      // Comic text: bold outline then fill
      // Shadow/outline
      api.brush.text(word, aw.x + 1, aw.y + 1, {
        fontSize,
        fill: isDark ? 0x000000 : 0x222233,
        alpha: aw.alpha * 0.6,
      });

      // Main text
      api.brush.text(word, aw.x, aw.y, {
        fontSize,
        fill: aw.color,
        alpha: aw.alpha,
      });
    }

    // ── Central "ActivityPub" hub icon ───────────────────────

    const hubX = cW * 0.5;
    const hubY = cH * 0.45;
    const hubPulse = 1 + Math.sin(t * 2) * 0.08;
    const hubR = 15 * hubPulse;

    // Hub glow
    api.brush.image(glowDataUrl, hubX, hubY, {
      width: hubR * 6,
      height: hubR * 6,
      tint: isDark ? 0x6364ff : 0x4445cc,
      alpha: 0.15 + Math.sin(t * 1.5) * 0.05,
      blendMode: 'add',
    });

    // Hub outline
    api.brush.circle(hubX, hubY, hubR + 3, {
      fill: isDark ? 0x111122 : 0x222233,
      alpha: 0.85,
    });

    // Hub body
    api.brush.circle(hubX, hubY, hubR, {
      fill: isDark ? 0x6364ff : 0x4445cc,
      alpha: 0.9,
    });

    // AP text
    api.brush.text('AP', hubX - 7, hubY - 5, {
      fontSize: 10,
      fill: 0xffffff,
      alpha: 0.9,
    });

    // ── Title banner (comic style) ──────────────────────────

    const bannerY = cH * 0.88;

    // Banner background
    api.brush.roundRect(cW * 0.1, bannerY - 2, cW * 0.8, 22, 4, {
      fill: isDark ? 0x111122 : 0xffffee,
      alpha: 0.7,
      stroke: isDark ? 0x445577 : 0x222233,
      strokeWidth: 2,
    });

    // Banner text
    api.brush.text('THE FEDIVERSE', cW * 0.18, bannerY + 1, {
      fontSize: 13,
      fill: isDark ? 0xeeeeff : 0x222233,
      alpha: 0.85,
    });

    // Subtitle
    api.brush.text('connected through ActivityPub', cW * 0.15, bannerY + 24, {
      fontSize: 7,
      fill: isDark ? 0x8899aa : 0x667788,
      alpha: 0.6,
    });
  },

  async teardown(): Promise<void> {
    nodes = [];
    messages = [];
    actionWords = [];
    halftoneDots = [];
    nextMsgIdx = 0;
    nextActionIdx = 0;
    messageTimer = 0;
    glowDataUrl = '';
    cW = 0;
    cH = 0;
  },
};

registerActor(actor);
export default actor;
