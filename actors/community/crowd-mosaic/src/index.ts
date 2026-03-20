/**
 * Crowd Mosaic — Foreground Actor
 *
 * Detects faces from the camera and frames them in ornate
 * Renaissance-style portrait frames. Each face gets a golden
 * frame with decorative corners and a nameplate.
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
  id: 'crowd-mosaic',
  name: 'Crowd Mosaic',
  description: 'Detected faces get framed in ornate Renaissance portrait frames with emotion-based auras',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'video', 'faces', 'renaissance', 'interactive'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 60,
  requiredContexts: ['video', 'display'],
};

const MAX_PORTRAITS = 6;
const GOLD = 0xc9a84c;
const GOLD_LIGHT = 0xdab85c;
const GOLD_DARK = 0xa08030;
const FRAME_DARK = 0x4a3520;

// Emotion to color mapping
const EMOTION_COLORS: Record<string, number> = {
  happy: 0xffd700,
  sad: 0x4488cc,
  angry: 0xff4444,
  surprised: 0xff88ff,
  neutral: 0xcccccc,
  fearful: 0x8844cc,
  disgusted: 0x44aa44,
};

// Renaissance-style titles for emotions
const EMOTION_TITLES: Record<string, string> = {
  happy: 'La Gioia',
  sad: 'La Malinconia',
  angry: 'La Furia',
  surprised: 'Lo Stupore',
  neutral: 'La Serenità',
  fearful: 'Il Timore',
  disgusted: 'Il Disgusto',
};

interface Portrait {
  active: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  targetX: number;
  targetY: number;
  targetW: number;
  targetH: number;
  emotion: string;
  alpha: number;
  age: number;
  slot: number;
}

let canvasW = 0;
let canvasH = 0;
let portraits: Portrait[] = [];
let glowDataUrl = '';
let lastFaceCheck = 0;

// Pre-compute portrait slots (grid positions)
const SLOTS_X = [0.25, 0.75, 0.25, 0.75, 0.5, 0.5];
const SLOTS_Y = [0.2, 0.2, 0.55, 0.55, 0.38, 0.72];

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;
    lastFaceCheck = 0;

    portraits = [];
    for (let i = 0; i < MAX_PORTRAITS; i++) {
      portraits.push({
        active: false,
        x: 0, y: 0, width: 0, height: 0,
        targetX: 0, targetY: 0, targetW: 0, targetH: 0,
        emotion: 'neutral', alpha: 0, age: 0, slot: i,
      });
    }

    // Pre-render glow for aura
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.2)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    glowDataUrl = c.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const tSec = t / 1000;
    const dt = Math.min(frame.deltaTime, 32) / 16;
    const isDark = api.context.display.isDarkMode();
    const video = api.context.video;
    const hasVideo = video.isAvailable();

    const goldColor = isDark ? GOLD_LIGHT : GOLD;
    const frameAccent = isDark ? GOLD : GOLD_DARK;

    // Check for faces periodically
    if (hasVideo && t - lastFaceCheck > 500) {
      lastFaceCheck = t;
      const faces = video.getFaces();

      // Update portraits with detected faces
      for (let f = 0; f < faces.length && f < MAX_PORTRAITS; f++) {
        const face = faces[f];
        const p = portraits[f];

        // Map face bounds from video to canvas positions in a gallery layout
        const slotX = SLOTS_X[f] * canvasW;
        const slotY = SLOTS_Y[f] * canvasH;
        const frameSize = Math.min(canvasW * 0.35, canvasH * 0.22);

        p.active = true;
        p.targetX = slotX;
        p.targetY = slotY;
        p.targetW = frameSize;
        p.targetH = frameSize * 1.2;
        p.emotion = face.emotion || 'neutral';
        p.age = 0;
      }

      // Deactivate portraits for faces that left
      for (let i = faces.length; i < MAX_PORTRAITS; i++) {
        if (portraits[i].active && portraits[i].age > 120) {
          portraits[i].alpha -= 0.02 * dt;
          if (portraits[i].alpha < 0.05) {
            portraits[i].active = false;
          }
        }
      }
    }

    // If no video, show decorative empty frames
    if (!hasVideo) {
      const emotions = ['happy', 'sad', 'neutral', 'surprised'];
      for (let i = 0; i < 4; i++) {
        const p = portraits[i];
        if (!p.active) {
          p.active = true;
          p.targetX = SLOTS_X[i] * canvasW;
          p.targetY = SLOTS_Y[i] * canvasH;
          p.targetW = canvasW * 0.32;
          p.targetH = canvasW * 0.32 * 1.2;
          p.emotion = emotions[i];
        }
      }
    }

    // Draw each portrait frame
    for (let i = 0; i < MAX_PORTRAITS; i++) {
      const p = portraits[i];
      if (!p.active) continue;

      p.age += dt;

      // Smooth interpolation to target position
      p.x += (p.targetX - p.x) * 0.05 * dt;
      p.y += (p.targetY - p.y) * 0.05 * dt;
      p.width += (p.targetW - p.width) * 0.05 * dt;
      p.height += (p.targetH - p.height) * 0.05 * dt;

      // Fade in
      if (p.alpha < 0.9) {
        p.alpha = Math.min(0.9, p.alpha + 0.02 * dt);
      }

      if (p.alpha < 0.05) continue;

      const cx = p.x;
      const cy = p.y;
      const hw = p.width / 2;
      const hh = p.height / 2;
      const frameW = 5;

      const emotionColor = EMOTION_COLORS[p.emotion] || 0xcccccc;
      const title = EMOTION_TITLES[p.emotion] || 'Ritratto';

      // Emotion aura glow behind frame
      api.brush.image(glowDataUrl, cx, cy, {
        width: p.width * 1.8,
        height: p.height * 1.8,
        tint: emotionColor,
        alpha: p.alpha * 0.2,
        blendMode: 'add',
      });

      // Dark inner fill (painting area)
      api.brush.rect(cx - hw + frameW, cy - hh + frameW, p.width - frameW * 2, p.height - frameW * 2, {
        fill: isDark ? 0x1a1510 : 0x2a2520,
        alpha: p.alpha * 0.7,
      });

      // Outer frame — 4 sides
      // Top
      api.brush.rect(cx - hw, cy - hh, p.width, frameW, {
        fill: goldColor,
        alpha: p.alpha,
      });
      // Bottom
      api.brush.rect(cx - hw, cy + hh - frameW, p.width, frameW, {
        fill: goldColor,
        alpha: p.alpha,
      });
      // Left
      api.brush.rect(cx - hw, cy - hh, frameW, p.height, {
        fill: goldColor,
        alpha: p.alpha,
      });
      // Right
      api.brush.rect(cx + hw - frameW, cy - hh, frameW, p.height, {
        fill: goldColor,
        alpha: p.alpha,
      });

      // Inner frame line
      api.brush.rect(cx - hw + frameW, cy - hh + frameW, p.width - frameW * 2, 1.5, {
        fill: frameAccent,
        alpha: p.alpha * 0.6,
      });
      api.brush.rect(cx - hw + frameW, cy + hh - frameW - 1.5, p.width - frameW * 2, 1.5, {
        fill: frameAccent,
        alpha: p.alpha * 0.6,
      });

      // Corner decorations — small circles at each corner
      const corners = [
        { x: cx - hw, y: cy - hh },
        { x: cx + hw, y: cy - hh },
        { x: cx - hw, y: cy + hh },
        { x: cx + hw, y: cy + hh },
      ];
      for (let c2 = 0; c2 < 4; c2++) {
        api.brush.circle(corners[c2].x, corners[c2].y, 4, {
          fill: GOLD_LIGHT,
          alpha: p.alpha * 0.9,
        });
        api.brush.circle(corners[c2].x, corners[c2].y, 2, {
          fill: 0xffffff,
          alpha: p.alpha * 0.4,
          blendMode: 'add',
        });
      }

      // Emotion-colored accent line at top of painting area
      api.brush.rect(cx - hw + frameW + 3, cy - hh + frameW + 3, p.width - frameW * 2 - 6, 2, {
        fill: emotionColor,
        alpha: p.alpha * 0.5,
      });

      // Renaissance silhouette placeholder (oval head + shoulders)
      if (!hasVideo) {
        const headY = cy - hh * 0.15;
        const headR = Math.min(hw, hh) * 0.25;

        // Head
        api.brush.ellipse(cx, headY, headR, headR * 1.1, {
          fill: emotionColor,
          alpha: p.alpha * 0.15,
        });

        // Shoulders
        api.brush.ellipse(cx, headY + headR * 1.8, headR * 1.8, headR * 0.8, {
          fill: emotionColor,
          alpha: p.alpha * 0.1,
        });
      }

      // Nameplate at bottom
      const plateY = cy + hh + 8;
      const plateW = p.width * 0.6;
      api.brush.rect(cx - plateW / 2, plateY - 5, plateW, 14, {
        fill: goldColor,
        alpha: p.alpha * 0.7,
      });

      api.brush.text(title, cx, plateY + 2, {
        fontSize: 7,
        fill: isDark ? 0x1a1510 : 0x2a2015,
        align: 'center',
        baseline: 'middle',
        alpha: p.alpha * 0.9,
      });
    }
  },

  async teardown(): Promise<void> {
    portraits = [];
    canvasW = 0;
    canvasH = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
