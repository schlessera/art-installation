/**
 * Hacking Wapuu
 *
 * A hooded Wapuu (WordPress mascot) sitting at a laptop in a theme park,
 * with scrolling "matrix" code raining down from the screen glow.
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
  id: 'hacking-wapuu',
  name: 'Hacking Wapuu',
  description: 'A hooded Wapuu hacking on a laptop in a theme park scene',
  author: {
    name: 'Matthias Pfefferle',
    github: 'pfefferle',
  },
  version: '1.0.0',
  tags: ['wapuu', 'wordpress', 'hacker', 'character', 'theme-park'],
  createdAt: new Date(),
  preferredDuration: 45,
  requiredContexts: ['display', 'audio'],
};

// ============================================================
// Constants
// ============================================================

const MAX_CODE_DROPS = 40;
const MAX_PARK_LIGHTS = 12;
const CODE_CHARS = '01{}[]<>/=;:()#@$%^&*WP';

// ============================================================
// State
// ============================================================

interface CodeDrop {
  active: boolean;
  x: number;
  y: number;
  speed: number;
  char: number; // index into CODE_CHARS
  alpha: number;
  maxY: number;
}

interface ParkLight {
  x: number;
  y: number;
  phase: number;
  color: number;
  radius: number;
}

let cW = 0;
let cH = 0;
let codeDrops: CodeDrop[] = [];
let parkLights: ParkLight[] = [];
let glowDataUrl = '';
let breathPhase = 0;
let typingPhase = 0;

// ============================================================
// Helpers
// ============================================================

function initCodeDrop(d: CodeDrop, fromTop: boolean): void {
  // Code drops fall in the laptop screen area
  const screenLeft = cW * 0.28;
  const screenRight = cW * 0.72;
  d.active = true;
  d.x = screenLeft + Math.random() * (screenRight - screenLeft);
  d.y = fromTop ? cH * 0.22 + Math.random() * 10 : cH * 0.22 + Math.random() * (cH * 0.2);
  d.speed = 0.3 + Math.random() * 0.6;
  d.char = Math.floor(Math.random() * CODE_CHARS.length);
  d.alpha = 0.5 + Math.random() * 0.5;
  d.maxY = cH * 0.48;
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
    breathPhase = 0;
    typingPhase = 0;

    // Pre-allocate code drops
    codeDrops = [];
    for (let i = 0; i < MAX_CODE_DROPS; i++) {
      const d: CodeDrop = { active: false, x: 0, y: 0, speed: 0, char: 0, alpha: 0, maxY: 0 };
      initCodeDrop(d, false);
      codeDrops.push(d);
    }

    // Pre-allocate park lights
    parkLights = [];
    const lightColors = [0xff4466, 0x44ff88, 0x4488ff, 0xffaa22, 0xff66cc, 0x66ffcc];
    for (let i = 0; i < MAX_PARK_LIGHTS; i++) {
      parkLights.push({
        x: Math.random() * cW,
        y: cH * 0.02 + Math.random() * cH * 0.35,
        phase: Math.random() * Math.PI * 2,
        color: lightColors[i % lightColors.length],
        radius: 3 + Math.random() * 4,
      });
    }

    // Pre-render glow texture
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = canvas.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    const dt = frame.deltaTime;

    breathPhase += dt * 0.002;
    typingPhase += dt * 0.015;

    const breathOffset = Math.sin(breathPhase) * 2;

    // ── Theme Park Background Elements ──────────────────────

    // Ferris wheel (back right)
    const fwX = cW * 0.82;
    const fwY = cH * 0.18;
    const fwR = cW * 0.15;
    const fwColor = isDark ? 0x445566 : 0x667788;
    // Wheel rim
    api.brush.arc(fwX, fwY, fwR, 0, Math.PI * 2, { color: fwColor, width: 2.5, alpha: 0.6 });
    // Spokes that rotate
    for (let i = 0; i < 8; i++) {
      const angle = t * 0.3 + (i * Math.PI) / 4;
      const sx = fwX + Math.cos(angle) * fwR;
      const sy = fwY + Math.sin(angle) * fwR;
      api.brush.line(fwX, fwY, sx, sy, { color: fwColor, width: 1.5, alpha: 0.4 });
      // Gondola lights
      api.brush.circle(sx, sy, 3, {
        fill: parkLights[i % MAX_PARK_LIGHTS].color,
        alpha: 0.6 + Math.sin(t * 2 + i) * 0.3,
        blendMode: 'add',
      });
    }
    // Ferris wheel support
    api.brush.line(fwX - fwR * 0.5, fwY + fwR + 10, fwX, fwY, { color: fwColor, width: 3, alpha: 0.5 });
    api.brush.line(fwX + fwR * 0.5, fwY + fwR + 10, fwX, fwY, { color: fwColor, width: 3, alpha: 0.5 });

    // Roller coaster track (back left)
    const rcPoints = [];
    for (let i = 0; i <= 20; i++) {
      const px = cW * 0.02 + (i / 20) * cW * 0.45;
      const py = cH * 0.12 + Math.sin(i * 0.8) * cH * 0.06 - (i < 5 ? (5 - i) * cH * 0.02 : 0);
      rcPoints.push({ x: px, y: py });
    }
    api.brush.stroke(rcPoints, { color: isDark ? 0x556677 : 0x778899, width: 2.5, alpha: 0.5 });

    // Park lights twinkling
    for (let i = 0; i < MAX_PARK_LIGHTS; i++) {
      const light = parkLights[i];
      const flicker = 0.5 + Math.sin(t * 3 + light.phase) * 0.4;
      if (flicker < 0.15) continue;
      api.brush.image(glowDataUrl, light.x, light.y, {
        width: light.radius * 4,
        height: light.radius * 4,
        tint: light.color,
        alpha: flicker,
        blendMode: 'add',
      });
    }

    // ── Ground / bench area ─────────────────────────────────

    const groundY = cH * 0.72;
    // Park bench
    const benchX = cW * 0.25;
    const benchW = cW * 0.5;
    const benchY = groundY - 5;
    // Bench seat
    api.brush.roundRect(benchX, benchY, benchW, 8, 3, {
      fill: isDark ? 0x5a3a1a : 0x8b5e3c,
      alpha: 0.85,
    });
    // Bench legs
    api.brush.rect(benchX + 10, benchY + 8, 6, 18, { fill: isDark ? 0x3a2a10 : 0x6b4e2c, alpha: 0.8 });
    api.brush.rect(benchX + benchW - 16, benchY + 8, 6, 18, { fill: isDark ? 0x3a2a10 : 0x6b4e2c, alpha: 0.8 });
    // Bench back
    api.brush.roundRect(benchX - 2, benchY - 22, benchW + 4, 6, 2, {
      fill: isDark ? 0x5a3a1a : 0x8b5e3c,
      alpha: 0.8,
    });
    // Bench back slats
    api.brush.roundRect(benchX - 2, benchY - 14, benchW + 4, 5, 2, {
      fill: isDark ? 0x4a2a10 : 0x7b4e2c,
      alpha: 0.75,
    });

    // ── Laptop ──────────────────────────────────────────────

    const laptopX = cW * 0.38;
    const laptopY = benchY - 18;
    const laptopW = cW * 0.24;
    const laptopH = 14;

    // Laptop base
    api.brush.roundRect(laptopX, laptopY, laptopW, laptopH, 2, {
      fill: isDark ? 0x2a2a2a : 0x444444,
      alpha: 0.9,
    });

    // Laptop screen (angled back)
    const screenH = cH * 0.18;
    const screenY = laptopY - screenH;
    api.brush.roundRect(laptopX - 2, screenY, laptopW + 4, screenH, 3, {
      fill: isDark ? 0x1a1a2a : 0x222233,
      alpha: 0.9,
    });

    // Screen content glow
    api.brush.rect(laptopX + 3, screenY + 3, laptopW - 2, screenH - 6, {
      fill: 0x0a2a0a,
      alpha: 0.85,
    });

    // Screen glow effect
    api.brush.image(glowDataUrl, laptopX + laptopW / 2, screenY + screenH / 2, {
      width: laptopW * 2.5,
      height: screenH * 3,
      tint: 0x00ff44,
      alpha: 0.15 + Math.sin(t * 1.5) * 0.05,
      blendMode: 'add',
    });

    // ── Matrix code rain on screen ──────────────────────────

    for (let i = 0; i < MAX_CODE_DROPS; i++) {
      const d = codeDrops[i];
      if (!d.active) {
        if (Math.random() < 0.03) initCodeDrop(d, true);
        continue;
      }

      d.y += d.speed * dt * 0.06;

      if (d.y > d.maxY) {
        d.active = false;
        continue;
      }

      // Fade as it falls
      const progress = (d.y - cH * 0.22) / (d.maxY - cH * 0.22);
      const fadeAlpha = d.alpha * (1 - progress * 0.7);
      if (fadeAlpha < 0.05) continue;

      // Occasionally change character
      if (Math.random() < 0.02) {
        d.char = Math.floor(Math.random() * CODE_CHARS.length);
      }

      api.brush.text(CODE_CHARS[d.char], d.x, d.y, {
        fontSize: 7,
        fill: 0x00ff44,
        alpha: fadeAlpha,
      });
    }

    // ── Wapuu Body (sitting on bench) ───────────────────────

    const wX = cW * 0.5;  // Center of Wapuu
    const wY = benchY - 20 + breathOffset; // Sitting position

    // -- Hoodie body --
    const hoodieColor = isDark ? 0x1a1a3a : 0x2a2a5a;
    const hoodieHighlight = isDark ? 0x2a2a5a : 0x3a3a7a;

    // Torso
    api.brush.roundRect(wX - 28, wY - 10, 56, 38, 8, {
      fill: hoodieColor,
      alpha: 0.9,
    });
    // Hoodie front zipper line
    api.brush.line(wX, wY - 8, wX, wY + 26, {
      color: isDark ? 0x333366 : 0x444488,
      width: 1.5,
      alpha: 0.5,
    });

    // -- Arms reaching toward laptop --
    // Left arm
    const armWave = Math.sin(typingPhase) * 1.5;
    api.brush.roundRect(wX - 30, wY + 2 + armWave, 18, 12, 5, {
      fill: hoodieColor,
      alpha: 0.85,
    });
    // Left hand/paw
    api.brush.circle(wX - 18, wY + 8 + armWave, 6, {
      fill: 0xf5f5f0,
      alpha: 0.85,
    });

    // Right arm
    const armWave2 = Math.sin(typingPhase + 1.5) * 1.5;
    api.brush.roundRect(wX + 12, wY + 2 + armWave2, 18, 12, 5, {
      fill: hoodieColor,
      alpha: 0.85,
    });
    // Right hand/paw
    api.brush.circle(wX + 18, wY + 8 + armWave2, 6, {
      fill: 0xf5f5f0,
      alpha: 0.85,
    });

    // -- Wapuu Head --
    const headY = wY - 32 + breathOffset * 0.5;
    const headR = 24;

    // Hood (behind head)
    api.brush.circle(wX, headY + 2, headR + 8, {
      fill: hoodieColor,
      alpha: 0.9,
    });
    // Hood top point
    api.brush.polygon([
      { x: wX - 16, y: headY - 22 },
      { x: wX, y: headY - 34 },
      { x: wX + 16, y: headY - 22 },
    ], {
      fill: hoodieColor,
      alpha: 0.9,
    });

    // Hood highlight edge
    api.brush.arc(wX, headY + 2, headR + 6, -Math.PI * 0.8, -Math.PI * 0.2, {
      color: hoodieHighlight,
      width: 2,
      alpha: 0.5,
    });

    // Wapuu face (white/cream)
    api.brush.circle(wX, headY, headR, {
      fill: 0xf5f5f0,
      alpha: 0.92,
    });

    // Rosy cheeks
    api.brush.circle(wX - 14, headY + 6, 5, {
      fill: 0xff8888,
      alpha: 0.3,
    });
    api.brush.circle(wX + 14, headY + 6, 5, {
      fill: 0xff8888,
      alpha: 0.3,
    });

    // Eyes - looking at screen (angled down-left)
    const blinkCycle = t % 4;
    const eyeH = blinkCycle > 3.8 ? 1 : 5; // Blink every ~4 seconds

    // Left eye
    api.brush.ellipse(wX - 9, headY - 2, 5, eyeH, {
      fill: 0x222222,
      alpha: 0.9,
    });
    // Eye highlight
    if (eyeH > 1) {
      api.brush.circle(wX - 10, headY - 4, 1.5, { fill: 0xffffff, alpha: 0.8 });
    }

    // Right eye
    api.brush.ellipse(wX + 9, headY - 2, 5, eyeH, {
      fill: 0x222222,
      alpha: 0.9,
    });
    if (eyeH > 1) {
      api.brush.circle(wX + 8, headY - 4, 1.5, { fill: 0xffffff, alpha: 0.8 });
    }

    // Green screen reflection in eyes
    if (eyeH > 1) {
      api.brush.circle(wX - 8, headY - 1, 1, { fill: 0x00ff44, alpha: 0.4 });
      api.brush.circle(wX + 10, headY - 1, 1, { fill: 0x00ff44, alpha: 0.4 });
    }

    // Small smile
    api.brush.arc(wX, headY + 5, 7, 0.2, Math.PI - 0.2, {
      color: 0x444444,
      width: 1.5,
      alpha: 0.7,
    });

    // Nose
    api.brush.circle(wX, headY + 2, 2, {
      fill: 0xeeddcc,
      alpha: 0.6,
    });

    // -- Wapuu Ears (poking through hood) --
    // Left ear
    api.brush.polygon([
      { x: wX - 20, y: headY - 18 },
      { x: wX - 28, y: headY - 38 },
      { x: wX - 12, y: headY - 24 },
    ], {
      fill: 0xf5f5f0,
      alpha: 0.85,
    });
    // Inner ear
    api.brush.polygon([
      { x: wX - 20, y: headY - 20 },
      { x: wX - 26, y: headY - 34 },
      { x: wX - 14, y: headY - 24 },
    ], {
      fill: 0xffaaaa,
      alpha: 0.5,
    });

    // Right ear
    api.brush.polygon([
      { x: wX + 20, y: headY - 18 },
      { x: wX + 28, y: headY - 38 },
      { x: wX + 12, y: headY - 24 },
    ], {
      fill: 0xf5f5f0,
      alpha: 0.85,
    });
    // Inner ear
    api.brush.polygon([
      { x: wX + 20, y: headY - 20 },
      { x: wX + 26, y: headY - 34 },
      { x: wX + 14, y: headY - 24 },
    ], {
      fill: 0xffaaaa,
      alpha: 0.5,
    });

    // -- Legs (dangling off bench) --
    api.brush.roundRect(wX - 18, wY + 26, 14, 20, 5, {
      fill: isDark ? 0x222244 : 0x333366,
      alpha: 0.85,
    });
    api.brush.roundRect(wX + 4, wY + 26, 14, 20, 5, {
      fill: isDark ? 0x222244 : 0x333366,
      alpha: 0.85,
    });

    // Shoes
    api.brush.roundRect(wX - 20, wY + 44, 18, 8, 4, {
      fill: isDark ? 0x1a1a1a : 0x333333,
      alpha: 0.85,
    });
    api.brush.roundRect(wX + 2, wY + 44, 18, 8, 4, {
      fill: isDark ? 0x1a1a1a : 0x333333,
      alpha: 0.85,
    });

    // ── WordPress logo on hoodie (small W) ──────────────────

    api.brush.text('W', wX - 5, wY + 6, {
      fontSize: 12,
      fill: isDark ? 0x4466aa : 0x5588cc,
      alpha: 0.6,
    });

    // ── Ground line ─────────────────────────────────────────

    api.brush.line(0, groundY + 22, cW, groundY + 22, {
      color: isDark ? 0x334444 : 0x558866,
      width: 2,
      alpha: 0.4,
    });

    // A few blades of grass
    for (let i = 0; i < 8; i++) {
      const gx = cW * 0.05 + i * cW * 0.13;
      const gy = groundY + 22;
      const sway = Math.sin(t * 1.2 + i * 0.7) * 3;
      api.brush.line(gx, gy, gx + sway, gy - 8 - Math.random() * 4, {
        color: isDark ? 0x225533 : 0x44aa55,
        width: 1.5,
        alpha: 0.5,
      });
    }

    // ── Ambient audio reactivity ────────────────────────────

    if (api.context.audio.isAvailable() && api.context.audio.isBeat()) {
      // Flash screen slightly brighter on beat
      api.brush.image(glowDataUrl, laptopX + laptopW / 2, screenY + screenH / 2, {
        width: laptopW * 3,
        height: screenH * 4,
        tint: 0x00ff44,
        alpha: 0.2,
        blendMode: 'add',
      });
    }
  },

  async teardown(): Promise<void> {
    codeDrops = [];
    parkLights = [];
    glowDataUrl = '';
    breathPhase = 0;
    typingPhase = 0;
    cW = 0;
    cH = 0;
  },
};

registerActor(actor);
export default actor;
