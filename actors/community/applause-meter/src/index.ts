/**
 * Applause Meter — Foreground Actor
 *
 * Audio-reactive crowd energy visualizer. A central thermometer bar
 * fills with warm colors based on audio volume. When volume exceeds
 * a threshold, firework particles burst from the top. Side VU-meter
 * circles light up, and "BRAVO!" flashes during sustained peaks.
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
  id: 'applause-meter',
  name: 'Applause Meter',
  description: 'Audio-reactive crowd energy visualizer with thermometer bar, VU meter, and fireworks',
  author: { name: 'Joost de Valk', github: 'jdevalk' },
  version: '1.0.0',
  tags: ['foreground', 'audio', 'interactive', 'crowd', 'fireworks'],
  createdAt: new Date('2026-03-21'),
  preferredDuration: 60,
  requiredContexts: ['audio', 'display'],
};

// --- Constants ---

const BAR_SEGMENTS = 20;
const VU_DOTS = 10;
const MAX_FIREWORKS = 40;
const MAX_BURST_PARTICLES = 60;
const FIREWORK_THRESHOLD = 0.7;
const BRAVO_THRESHOLD = 0.8;
const BRAVO_SUSTAIN_MS = 1500;

// Segment colors: green -> yellow -> orange -> red (numeric)
const SEGMENT_COLORS: number[] = [
  0x22c55e, 0x2dd864, 0x4ade80, 0x6ee77a,
  0x86ef90, 0xa3e635, 0xbef264, 0xd9f99d,
  0xfacc15, 0xfbbf24, 0xf59e0b, 0xf97316,
  0xfb923c, 0xf87171, 0xef4444, 0xdc2626,
  0xb91c1c, 0x991b1b, 0x7f1d1d, 0xff0000,
];

const FIREWORK_COLORS: number[] = [
  0xff4444, 0xff8800, 0xffcc00, 0x44ff44,
  0x4488ff, 0xff44ff, 0xffffff, 0xff6644,
];

// --- State interfaces ---

interface FireworkParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  size: number;
  alpha: number;
  life: number;
}

interface BurstParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

// --- Pre-allocated state ---

let canvasW = 0;
let canvasH = 0;

let fireworks: FireworkParticle[] = [];
let burstParticles: BurstParticle[] = [];

let smoothVolume = 0;
let peakVolume = 0;
let highVolumeStart = 0;
let showBravo = false;
let bravoAlpha = 0;
let bravoStartTime = 0;
let lastFireworkTime = 0;
let glowDataUrl = '';

// Sine-wave simulation state
let simPhase = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    canvasW = size.width;
    canvasH = size.height;

    smoothVolume = 0;
    peakVolume = 0;
    highVolumeStart = 0;
    showBravo = false;
    bravoAlpha = 0;
    bravoStartTime = 0;
    lastFireworkTime = 0;
    simPhase = Math.random() * Math.PI * 2;

    // Pre-allocate firework particles
    fireworks = [];
    for (let i = 0; i < MAX_FIREWORKS; i++) {
      fireworks.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        color: 0xffffff, size: 0, alpha: 0, life: 0,
      });
    }

    // Pre-allocate burst particles
    burstParticles = [];
    for (let i = 0; i < MAX_BURST_PARTICLES; i++) {
      burstParticles.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        color: 0xffffff, size: 0, alpha: 0, life: 0, maxLife: 0,
      });
    }

    // Pre-render glow texture for firework particles
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    glowDataUrl = c.toDataURL();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const t = frame.time;
    const tSec = t / 1000;
    const dt = Math.min(frame.deltaTime, 32) / 16;
    const isDark = api.context.display.isDarkMode();
    const audio = api.context.audio;

    // --- Audio reading (with sine-wave fallback) ---
    const hasAudio = audio.isAvailable();
    let volume: number;
    if (hasAudio) {
      volume = audio.volume();
    } else {
      simPhase += 0.02 * dt;
      // Simulate crowd waves: slow swell with occasional peaks
      volume = 0.3
        + Math.sin(simPhase * 0.7) * 0.15
        + Math.sin(simPhase * 1.9) * 0.1
        + Math.max(0, Math.sin(simPhase * 0.23) - 0.6) * 1.5;
      volume = Math.min(1, Math.max(0, volume));
    }

    // Smooth the volume for the bar (less jittery)
    smoothVolume += (volume - smoothVolume) * 0.12 * dt;
    peakVolume = Math.max(smoothVolume, peakVolume * 0.995);

    // --- Layout ---
    const barWidth = canvasW * 0.12;
    const barHeight = canvasH * 0.6;
    const barX = (canvasW - barWidth) / 2;
    const barY = canvasH * 0.2;
    const segH = barHeight / BAR_SEGMENTS;

    const bgColor = isDark ? 0x1a1a2e : 0xf0e6d3;
    const frameBorder = isDark ? 0x333355 : 0x8b7355;
    const inactiveColor = isDark ? 0x222244 : 0xd4c4a8;

    // --- Bar frame (background) ---
    api.brush.roundRect(barX - 4, barY - 4, barWidth + 8, barHeight + 8, 6, {
      fill: frameBorder,
      alpha: 0.7,
      blendMode: 'normal',
    });
    api.brush.roundRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4, 4, {
      fill: bgColor,
      alpha: 0.85,
      blendMode: 'normal',
    });

    // --- Thermometer segments (bottom-up fill) ---
    const filledSegments = Math.floor(smoothVolume * BAR_SEGMENTS);
    const partialFill = (smoothVolume * BAR_SEGMENTS) - filledSegments;

    for (let i = 0; i < BAR_SEGMENTS; i++) {
      const segIndex = BAR_SEGMENTS - 1 - i; // bottom segment = index 0
      const segY = barY + i * segH;
      const isFilled = segIndex < filledSegments;
      const isPartial = segIndex === filledSegments;

      if (isFilled) {
        api.brush.rect(barX, segY + 1, barWidth, segH - 2, {
          fill: SEGMENT_COLORS[segIndex],
          alpha: 0.85,
          blendMode: 'normal',
        });
      } else if (isPartial && partialFill > 0.05) {
        // Partially filled segment
        const fillH = (segH - 2) * partialFill;
        api.brush.rect(barX, segY + (segH - 2) - fillH + 1, barWidth, fillH, {
          fill: SEGMENT_COLORS[segIndex],
          alpha: 0.6 + partialFill * 0.25,
          blendMode: 'normal',
        });
      } else {
        // Inactive segment
        api.brush.rect(barX, segY + 1, barWidth, segH - 2, {
          fill: inactiveColor,
          alpha: 0.3,
          blendMode: 'normal',
        });
      }
    }

    // --- Peak indicator line ---
    const peakY = barY + barHeight * (1 - peakVolume);
    api.brush.line(barX - 6, peakY, barX + barWidth + 6, peakY, {
      color: 0xff2222,
      width: 2,
      alpha: 0.7,
      blendMode: 'normal',
    });

    // --- Side VU meter dots ---
    const vuDotRadius = canvasW * 0.018;
    const vuSpacing = barHeight / VU_DOTS;
    const vuLeftX = barX - 28;
    const vuRightX = barX + barWidth + 28;

    for (let i = 0; i < VU_DOTS; i++) {
      const dotIndex = VU_DOTS - 1 - i; // bottom = index 0
      const dotY = barY + i * vuSpacing + vuSpacing / 2;
      const isLit = dotIndex < Math.floor(smoothVolume * VU_DOTS);
      const dotColor = dotIndex < 6 ? 0x22c55e : dotIndex < 8 ? 0xfacc15 : 0xef4444;

      // Left side
      api.brush.circle(vuLeftX, dotY, vuDotRadius, {
        fill: isLit ? dotColor : inactiveColor,
        alpha: isLit ? 0.9 : 0.25,
        blendMode: isLit ? 'add' : 'normal',
      });

      // Right side
      api.brush.circle(vuRightX, dotY, vuDotRadius, {
        fill: isLit ? dotColor : inactiveColor,
        alpha: isLit ? 0.9 : 0.25,
        blendMode: isLit ? 'add' : 'normal',
      });

      // Glow on lit dots
      if (isLit) {
        api.brush.circle(vuLeftX, dotY, vuDotRadius * 2.5, {
          fill: dotColor,
          alpha: 0.15,
          blendMode: 'add',
        });
        api.brush.circle(vuRightX, dotY, vuDotRadius * 2.5, {
          fill: dotColor,
          alpha: 0.15,
          blendMode: 'add',
        });
      }
    }

    // --- Fireworks (when volume exceeds threshold) ---
    const barTopY = barY;
    const barTopCenterX = barX + barWidth / 2;

    if (smoothVolume > FIREWORK_THRESHOLD && t - lastFireworkTime > 200) {
      lastFireworkTime = t;

      // Launch a firework rocket upward from bar top
      for (let i = 0; i < MAX_FIREWORKS; i++) {
        if (!fireworks[i].active) {
          fireworks[i].active = true;
          fireworks[i].x = barTopCenterX + (Math.random() - 0.5) * barWidth;
          fireworks[i].y = barTopY;
          fireworks[i].vx = (Math.random() - 0.5) * 2;
          fireworks[i].vy = -3 - Math.random() * 4;
          fireworks[i].color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
          fireworks[i].size = 3 + Math.random() * 2;
          fireworks[i].alpha = 1;
          fireworks[i].life = 40 + Math.random() * 30;
          break;
        }
      }
    }

    // Update and draw firework rockets
    for (let i = 0; i < MAX_FIREWORKS; i++) {
      const fw = fireworks[i];
      if (!fw.active) continue;

      fw.x += fw.vx * dt;
      fw.vy += 0.04 * dt; // light gravity
      fw.y += fw.vy * dt;
      fw.life -= dt;
      fw.alpha = Math.max(0.6, fw.life / 60);

      if (fw.life <= 0 || fw.y < barY - canvasH * 0.3) {
        // Explode into burst particles
        const burstCount = 8 + Math.floor(Math.random() * 8);
        const burstColor = fw.color;
        const cx = fw.x;
        const cy = fw.y;
        for (let b = 0; b < burstCount; b++) {
          for (let j = 0; j < MAX_BURST_PARTICLES; j++) {
            if (!burstParticles[j].active) {
              const angle = (b / burstCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
              const speed = 1.5 + Math.random() * 2.5;
              burstParticles[j].active = true;
              burstParticles[j].x = cx;
              burstParticles[j].y = cy;
              burstParticles[j].vx = Math.cos(angle) * speed;
              burstParticles[j].vy = Math.sin(angle) * speed;
              burstParticles[j].color = burstColor;
              burstParticles[j].size = 1.5 + Math.random() * 2;
              burstParticles[j].alpha = 1;
              burstParticles[j].life = 50 + Math.random() * 40;
              burstParticles[j].maxLife = burstParticles[j].life;
              break;
            }
          }
        }
        fw.active = false;
        continue;
      }

      // Draw rocket trail
      api.brush.image(glowDataUrl, fw.x, fw.y, {
        width: fw.size * 4,
        height: fw.size * 4,
        tint: fw.color,
        alpha: fw.alpha * 0.6,
        blendMode: 'add',
      });
      api.brush.circle(fw.x, fw.y, fw.size, {
        fill: fw.color,
        alpha: fw.alpha,
        blendMode: 'add',
      });
    }

    // Update and draw burst particles
    for (let i = 0; i < MAX_BURST_PARTICLES; i++) {
      const bp = burstParticles[i];
      if (!bp.active) continue;

      bp.x += bp.vx * dt;
      bp.vy += 0.06 * dt; // gravity pull
      bp.y += bp.vy * dt;
      bp.vx *= 0.98;
      bp.life -= dt;
      bp.alpha = Math.max(0, bp.life / bp.maxLife);

      if (bp.life <= 0 || bp.alpha < 0.05) {
        bp.active = false;
        continue;
      }

      api.brush.image(glowDataUrl, bp.x, bp.y, {
        width: bp.size * 3,
        height: bp.size * 3,
        tint: bp.color,
        alpha: bp.alpha * 0.7,
        blendMode: 'add',
      });
      api.brush.circle(bp.x, bp.y, bp.size * bp.alpha, {
        fill: bp.color,
        alpha: Math.max(0.6, bp.alpha),
        blendMode: 'add',
      });
    }

    // --- "BRAVO!" text on sustained high volume ---
    if (smoothVolume > BRAVO_THRESHOLD) {
      if (highVolumeStart === 0) {
        highVolumeStart = t;
      }
      if (t - highVolumeStart > BRAVO_SUSTAIN_MS && !showBravo) {
        showBravo = true;
        bravoStartTime = t;
        bravoAlpha = 1;
      }
    } else {
      highVolumeStart = 0;
    }

    if (showBravo) {
      const bravoAge = t - bravoStartTime;
      if (bravoAge > 2000) {
        bravoAlpha -= 0.03 * dt;
        if (bravoAlpha <= 0) {
          showBravo = false;
          bravoAlpha = 0;
        }
      } else {
        // Pulse effect
        bravoAlpha = 0.8 + Math.sin(bravoAge / 100) * 0.2;
      }

      if (bravoAlpha > 0) {
        const bravoY = barY - 30;
        const textColor = isDark ? 0xffdd44 : 0xcc6600;

        // Glow behind text
        api.brush.ellipse(canvasW / 2, bravoY, 120, 30, {
          fill: textColor,
          alpha: bravoAlpha * 0.15,
          blendMode: 'add',
        });

        api.brush.text('BRAVO!', canvasW / 2, bravoY, {
          font: 'Arial Black',
          fontSize: 36,
          fill: textColor,
          alpha: Math.max(0.6, bravoAlpha),
          align: 'center',
          baseline: 'middle',
        });
      }
    }

    // --- Bottom label ---
    const labelColor = isDark ? 0xaaaacc : 0x665544;
    api.brush.text('APPLAUSE', canvasW / 2, barY + barHeight + 24, {
      font: 'Arial',
      fontSize: 14,
      fill: labelColor,
      alpha: 0.6,
      align: 'center',
      baseline: 'middle',
    });

    // --- Volume percentage ---
    const pct = Math.round(smoothVolume * 100);
    api.brush.text(`${pct}%`, canvasW / 2, barY + barHeight + 44, {
      font: 'Arial Black',
      fontSize: 20,
      fill: SEGMENT_COLORS[Math.min(BAR_SEGMENTS - 1, Math.floor(smoothVolume * BAR_SEGMENTS))],
      alpha: 0.75,
      align: 'center',
      baseline: 'middle',
    });
  },

  async teardown(): Promise<void> {
    fireworks = [];
    burstParticles = [];
    canvasW = 0;
    canvasH = 0;
    smoothVolume = 0;
    peakVolume = 0;
    highVolumeStart = 0;
    showBravo = false;
    bravoAlpha = 0;
    glowDataUrl = '';
  },
};

registerActor(actor);
export default actor;
