/**
 * EP Blue Fire — Europa-Park's Blue Fire Megacoaster
 *
 * Stylized visualization of Mack Rides' launched coaster in the Iceland-themed area.
 * Features electric-blue track with inversions, an animated coaster train,
 * blue fire particles rising upward, and drifting ice crystal sparkles.
 *
 * Performance optimized:
 * - Pre-rendered glow texture for fire/ice particles
 * - All state pre-allocated in setup(), object pools with active flags
 * - Numeric colors (0xRRGGBB) with separate alpha, no string allocation
 * - blendMode per shape, never setBlendMode()
 * - Squared-distance checks where applicable
 * - Target < 300 draw calls
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';

// ─── Metadata ────────────────────────────────────────────────────────

const metadata: ActorMetadata = {
  id: 'ep-blue-fire',
  name: 'EP Blue Fire',
  description:
    'Stylized Blue Fire Megacoaster with electric-blue track, inversions, blue flame particles, and drifting ice crystals — inspired by Europa-Park\'s Iceland area',
  author: { name: 'Taco Verdonschot', github: 'tacoverdonschot' },
  version: '1.0.0',
  tags: ['europapark', 'coaster', 'blue-fire', 'iceland'],
  createdAt: new Date('2026-03-20'),
  preferredDuration: 45,
  requiredContexts: ['display'],
  role: 'foreground',
};

// ─── Constants ───────────────────────────────────────────────────────

const MAX_FIRE_PARTICLES = 40;
const MAX_ICE_CRYSTALS = 25;
const MAX_TRACK_POINTS = 200;
const MAX_SPARKS = 15;

// Track layout constants
const TRACK_SEGMENTS = 180;

// Colors — numeric 0xRRGGBB
const COL_TRACK_BRIGHT = 0x00aaff;
const COL_TRACK_MID = 0x0066dd;
const COL_TRACK_DARK = 0x003399;
const COL_FIRE_CORE = 0x33ccff;
const COL_FIRE_MID = 0x0088ff;
const COL_FIRE_TIP = 0x0044aa;
const COL_ICE_BRIGHT = 0xccf0ff;
const COL_ICE_MID = 0x88ddff;
const COL_TRAIN = 0x1155cc;
const COL_TRAIN_ACCENT = 0x00eeff;
const COL_SPARK = 0xffffff;

// Light-mode overrides
const COL_TRACK_BRIGHT_L = 0x0077cc;
const COL_TRACK_MID_L = 0x004499;
const COL_FIRE_CORE_L = 0x0099dd;
const COL_ICE_BRIGHT_L = 0x6699bb;

// ─── Interfaces ──────────────────────────────────────────────────────

interface TrackPoint {
  x: number;
  y: number;
}

interface FireParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  phase: number;
}

interface IceCrystal {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  angle: number;
  rotSpeed: number;
}

interface Spark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface BluFireState {
  width: number;
  height: number;
  trackPoints: TrackPoint[];
  trackCount: number;
  fireParticles: FireParticle[];
  iceCrystals: IceCrystal[];
  sparks: Spark[];
  trainPos: number; // 0-1 position along track
  glowDataUrl: string;
  glowDarkDataUrl: string;
  spawnTimer: number;
  iceSpawnTimer: number;
}

// ─── State ───────────────────────────────────────────────────────────

let s: BluFireState = {
  width: 0,
  height: 0,
  trackPoints: [],
  trackCount: 0,
  fireParticles: [],
  iceCrystals: [],
  sparks: [],
  trainPos: 0,
  glowDataUrl: '',
  glowDarkDataUrl: '',
  spawnTimer: 0,
  iceSpawnTimer: 0,
};

// ─── Helpers ─────────────────────────────────────────────────────────

/** Build the coaster track path: launch section → climb → loop → s-curve → descending turn */
function buildTrack(w: number, h: number, pts: TrackPoint[]): number {
  const cx = w * 0.5;
  const baseY = h * 0.75;
  let count = 0;

  // The track is parameterised by t ∈ [0, 1].
  // Sections: 0-0.12 launch, 0.12-0.30 climb, 0.30-0.62 vertical loop,
  // 0.62-0.80 s-bend, 0.80-1.0 descending helix turn

  for (let i = 0; i < TRACK_SEGMENTS && count < MAX_TRACK_POINTS; i++) {
    const t = i / (TRACK_SEGMENTS - 1);
    let x = 0;
    let y = 0;

    if (t < 0.12) {
      // Launch: horizontal from left
      const p = t / 0.12;
      x = w * 0.08 + p * w * 0.25;
      y = baseY;
    } else if (t < 0.30) {
      // Climb up
      const p = (t - 0.12) / 0.18;
      x = w * 0.33 + p * w * 0.10;
      y = baseY - p * h * 0.45;
    } else if (t < 0.62) {
      // Vertical loop (full circle)
      const p = (t - 0.30) / 0.32;
      const loopAngle = -Math.PI * 0.5 + p * Math.PI * 2;
      const loopR = h * 0.14;
      const loopCx = cx + w * 0.02;
      const loopCy = h * 0.28;
      x = loopCx + Math.cos(loopAngle) * loopR;
      y = loopCy + Math.sin(loopAngle) * loopR;
    } else if (t < 0.80) {
      // S-bend: sinusoidal descent
      const p = (t - 0.62) / 0.18;
      const loopExitX = cx + w * 0.02 + Math.cos(-Math.PI * 0.5) * h * 0.14;
      const loopExitY = h * 0.28 + Math.sin(-Math.PI * 0.5) * h * 0.14;
      x = loopExitX + p * w * 0.22 + Math.sin(p * Math.PI * 2) * w * 0.06;
      y = loopExitY + p * h * 0.25;
    } else {
      // Descending turn back towards start
      const p = (t - 0.80) / 0.20;
      const turnAngle = -Math.PI * 0.3 + p * Math.PI * 0.8;
      const turnR = w * 0.15;
      const turnCx = w * 0.72;
      const turnCy = h * 0.62;
      x = turnCx + Math.cos(turnAngle) * turnR * (1 - p * 0.3);
      y = turnCy + Math.sin(turnAngle) * turnR + p * h * 0.08;
    }

    pts[count].x = x;
    pts[count].y = y;
    count++;
  }
  return count;
}

/** Get interpolated position along track at parameter t ∈ [0, 1] */
function trackPosition(t: number, pts: TrackPoint[], count: number): { x: number; y: number } {
  const idx = t * (count - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, count - 1);
  const frac = idx - i0;
  return {
    x: pts[i0].x + (pts[i1].x - pts[i0].x) * frac,
    y: pts[i0].y + (pts[i1].y - pts[i0].y) * frac,
  };
}

function createGlowTexture(dark: boolean): string {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (dark) {
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.3, 'rgba(0,0,0,0.6)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const url = canvas.toDataURL();
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

function initFireParticle(p: FireParticle, x: number, y: number): void {
  p.active = true;
  p.x = x + (Math.random() - 0.5) * 12;
  p.y = y + (Math.random() - 0.5) * 6;
  p.vx = (Math.random() - 0.5) * 15;
  p.vy = -(30 + Math.random() * 50); // rise upward
  p.maxLife = 0.6 + Math.random() * 0.8;
  p.life = p.maxLife;
  p.size = 4 + Math.random() * 8;
  p.phase = Math.random() * Math.PI * 2;
}

function initIceCrystal(c: IceCrystal, w: number, h: number): void {
  c.active = true;
  c.x = Math.random() * w;
  c.y = Math.random() * h * 0.3 + h * 0.05; // upper portion – Iceland sky
  c.vx = (Math.random() - 0.5) * 20;
  c.vy = 5 + Math.random() * 15; // drift downward slowly
  c.maxLife = 2.0 + Math.random() * 3.0;
  c.life = c.maxLife;
  c.size = 2 + Math.random() * 4;
  c.angle = Math.random() * Math.PI * 2;
  c.rotSpeed = (Math.random() - 0.5) * 3;
}

function initSpark(sp: Spark, x: number, y: number): void {
  sp.active = true;
  sp.x = x;
  sp.y = y;
  sp.vx = (Math.random() - 0.5) * 80;
  sp.vy = (Math.random() - 0.5) * 80;
  sp.maxLife = 0.2 + Math.random() * 0.3;
  sp.life = sp.maxLife;
}

// ─── Actor ───────────────────────────────────────────────────────────

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    s.width = width;
    s.height = height;

    // Pre-allocate track points
    s.trackPoints = [];
    for (let i = 0; i < MAX_TRACK_POINTS; i++) {
      s.trackPoints.push({ x: 0, y: 0 });
    }
    s.trackCount = buildTrack(width, height, s.trackPoints);

    // Pre-allocate fire particles pool
    s.fireParticles = [];
    for (let i = 0; i < MAX_FIRE_PARTICLES; i++) {
      s.fireParticles.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 4, phase: 0,
      });
    }

    // Pre-allocate ice crystals pool
    s.iceCrystals = [];
    for (let i = 0; i < MAX_ICE_CRYSTALS; i++) {
      s.iceCrystals.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 2, angle: 0, rotSpeed: 0,
      });
    }

    // Pre-allocate sparks pool
    s.sparks = [];
    for (let i = 0; i < MAX_SPARKS; i++) {
      s.sparks.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      });
    }

    s.trainPos = 0;
    s.spawnTimer = 0;
    s.iceSpawnTimer = 0;

    // Pre-render glow textures
    s.glowDataUrl = createGlowTexture(false);
    s.glowDarkDataUrl = createGlowTexture(true);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    const t = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    const blendAdd = 'add' as const;
    const blendNormal = 'normal' as const;
    const blendScreen = 'screen' as const;

    const { width, height, trackPoints, trackCount } = s;
    const glowTex = isDark ? s.glowDataUrl : s.glowDarkDataUrl;

    // Palette based on mode
    const trackBright = isDark ? COL_TRACK_BRIGHT : COL_TRACK_BRIGHT_L;
    const trackMid = isDark ? COL_TRACK_MID : COL_TRACK_MID_L;
    const trackDark = isDark ? COL_TRACK_DARK : COL_TRACK_DARK;
    const fireCore = isDark ? COL_FIRE_CORE : COL_FIRE_CORE_L;
    const fireMid = isDark ? COL_FIRE_MID : COL_FIRE_MID;
    const iceBright = isDark ? COL_ICE_BRIGHT : COL_ICE_BRIGHT_L;
    const trainColor = isDark ? COL_TRAIN : COL_TRAIN;
    const trainAccent = isDark ? COL_TRAIN_ACCENT : COL_TRACK_BRIGHT_L;
    const sparkColor = isDark ? COL_SPARK : 0x003366;
    const trackBlend = isDark ? blendAdd : blendNormal;
    const particleBlend = isDark ? blendAdd : blendScreen;

    // ── 1. Draw track supports (vertical lines from track to bottom) ──
    // Draw every 12th point for ~15 supports
    for (let i = 0; i < trackCount; i += 12) {
      const p = trackPoints[i];
      if (p.y < height - 20) {
        api.brush.line(p.x, p.y, p.x, height, {
          color: trackDark, alpha: 0.3, width: 1.5, blendMode: blendNormal,
        });
      }
    }

    // ── 2. Draw track rails (two parallel rails + crossties) ──
    const railOffset = 3;
    // Outer glow
    for (let i = 0; i < trackCount - 1; i++) {
      const p0 = trackPoints[i];
      const p1 = trackPoints[i + 1];
      // Track direction perpendicular for offset
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.01) continue;
      const nx = -dy / len * railOffset;
      const ny = dx / len * railOffset;

      // Glow line (wide, faint)
      const pulseAlpha = 0.25 + 0.1 * Math.sin(t * 3 + i * 0.05);
      api.brush.line(p0.x, p0.y, p1.x, p1.y, {
        color: trackBright, alpha: pulseAlpha, width: 8, blendMode: trackBlend, cap: 'round',
      });

      // Left rail
      api.brush.line(p0.x + nx, p0.y + ny, p1.x + nx, p1.y + ny, {
        color: trackMid, alpha: 0.85, width: 2.5, blendMode: blendNormal, cap: 'round',
      });
      // Right rail
      api.brush.line(p0.x - nx, p0.y - ny, p1.x - nx, p1.y - ny, {
        color: trackMid, alpha: 0.85, width: 2.5, blendMode: blendNormal, cap: 'round',
      });
    }

    // Crossties every 6 segments
    for (let i = 0; i < trackCount - 1; i += 6) {
      const p0 = trackPoints[i];
      const p1 = trackPoints[Math.min(i + 1, trackCount - 1)];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.01) continue;
      const nx = -dy / len * railOffset * 1.3;
      const ny = dx / len * railOffset * 1.3;
      api.brush.line(p0.x + nx, p0.y + ny, p0.x - nx, p0.y - ny, {
        color: trackDark, alpha: 0.6, width: 2, blendMode: blendNormal,
      });
    }

    // ── 3. Animate train position ──
    s.trainPos = (s.trainPos + dt * 0.08) % 1.0;
    const trainT = s.trainPos;
    const trainHead = trackPosition(trainT, trackPoints, trackCount);

    // Train: 4 cars trailing behind head
    const carCount = 4;
    const carSpacing = 0.018;
    for (let c = 0; c < carCount; c++) {
      const carT = ((trainT - c * carSpacing) % 1.0 + 1.0) % 1.0;
      const carPos = trackPosition(carT, trackPoints, trackCount);

      // Car body
      api.brush.roundRect(carPos.x - 8, carPos.y - 5, 16, 10, 3, {
        fill: trainColor, alpha: 0.9, blendMode: blendNormal,
      });
      // Accent stripe
      api.brush.rect(carPos.x - 7, carPos.y - 1, 14, 2, {
        fill: trainAccent, alpha: 0.8, blendMode: trackBlend,
      });
    }

    // Train headlight glow
    api.brush.image(glowTex, trainHead.x, trainHead.y, {
      width: 40, height: 40, tint: trackBright, alpha: 0.7, blendMode: particleBlend,
    });

    // ── 4. Spawn and draw fire particles ──
    // Spawn from base of the launch section and around the loop
    s.spawnTimer += dt;
    if (s.spawnTimer > 0.04) {
      s.spawnTimer = 0;
      // Spawn near launch section base
      for (let i = 0; i < MAX_FIRE_PARTICLES; i++) {
        if (!s.fireParticles[i].active) {
          const spawnX = width * 0.08 + Math.random() * width * 0.28;
          const spawnY = height * 0.75 + Math.random() * 8;
          initFireParticle(s.fireParticles[i], spawnX, spawnY);
          break;
        }
      }
      // Also spawn near train occasionally
      if (Math.random() < 0.5) {
        for (let i = 0; i < MAX_FIRE_PARTICLES; i++) {
          if (!s.fireParticles[i].active) {
            initFireParticle(s.fireParticles[i], trainHead.x, trainHead.y);
            break;
          }
        }
      }
    }

    // Update & draw fire particles
    for (let i = 0; i < MAX_FIRE_PARTICLES; i++) {
      const fp = s.fireParticles[i];
      if (!fp.active) continue;

      fp.life -= dt;
      if (fp.life <= 0) {
        fp.active = false;
        continue;
      }

      fp.x += fp.vx * dt;
      fp.y += fp.vy * dt;
      // Slight horizontal drift
      fp.vx += Math.sin(t * 5 + fp.phase) * 8 * dt;

      const progress = 1 - fp.life / fp.maxLife;
      // Fade: quick in, long out
      let alpha: number;
      if (progress < 0.15) {
        alpha = progress / 0.15;
      } else {
        alpha = 1 - (progress - 0.15) / 0.85;
      }
      alpha *= 0.8;
      if (alpha < 0.05) continue;

      const sz = fp.size * (1 + progress * 0.5);

      // Color shifts from core (bright) to tip (dark) as it ages
      const col = progress < 0.4 ? fireCore : fireMid;

      api.brush.image(glowTex, fp.x, fp.y, {
        width: sz * 3, height: sz * 3, tint: col, alpha: alpha, blendMode: particleBlend,
      });
    }

    // ── 5. Spawn and draw ice crystals ──
    s.iceSpawnTimer += dt;
    if (s.iceSpawnTimer > 0.15) {
      s.iceSpawnTimer = 0;
      for (let i = 0; i < MAX_ICE_CRYSTALS; i++) {
        if (!s.iceCrystals[i].active) {
          initIceCrystal(s.iceCrystals[i], width, height);
          break;
        }
      }
    }

    for (let i = 0; i < MAX_ICE_CRYSTALS; i++) {
      const ic = s.iceCrystals[i];
      if (!ic.active) continue;

      ic.life -= dt;
      if (ic.life <= 0) {
        ic.active = false;
        continue;
      }

      ic.x += ic.vx * dt;
      ic.y += ic.vy * dt;
      ic.angle += ic.rotSpeed * dt;

      const progress = 1 - ic.life / ic.maxLife;
      let alpha: number;
      if (progress < 0.2) {
        alpha = progress / 0.2;
      } else if (progress > 0.8) {
        alpha = (1 - progress) / 0.2;
      } else {
        alpha = 1;
      }
      alpha *= 0.65;
      if (alpha < 0.05) continue;

      // Draw ice crystal as a small rotated star/diamond shape
      api.brush.pushMatrix();
      api.brush.translate(ic.x, ic.y);
      api.brush.rotate(ic.angle);

      // Six-pointed sparkle (star with 6 points)
      api.brush.star(0, 0, ic.size, ic.size * 0.3, 6, {
        fill: iceBright, alpha: alpha, blendMode: particleBlend,
      });

      // Tiny bright core
      api.brush.circle(0, 0, ic.size * 0.3, {
        fill: COL_ICE_MID, alpha: alpha * 0.9, blendMode: particleBlend,
      });

      api.brush.popMatrix();
    }

    // ── 6. Launch sparks (from train occasionally) ──
    if (Math.random() < 0.08) {
      for (let i = 0; i < MAX_SPARKS; i++) {
        if (!s.sparks[i].active) {
          initSpark(s.sparks[i], trainHead.x, trainHead.y);
          break;
        }
      }
    }

    for (let i = 0; i < MAX_SPARKS; i++) {
      const sp = s.sparks[i];
      if (!sp.active) continue;

      sp.life -= dt;
      if (sp.life <= 0) {
        sp.active = false;
        continue;
      }

      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += 120 * dt; // gravity

      const alpha = (sp.life / sp.maxLife) * 0.9;
      if (alpha < 0.05) continue;

      api.brush.circle(sp.x, sp.y, 1.5, {
        fill: sparkColor, alpha: alpha, blendMode: particleBlend,
      });
    }

    // ── 7. Ambient glow at loop apex and launch base ──
    // Loop apex glow
    const loopApexPos = trackPosition(0.46, trackPoints, trackCount);
    const loopGlowAlpha = 0.2 + 0.08 * Math.sin(t * 2);
    api.brush.image(glowTex, loopApexPos.x, loopApexPos.y, {
      width: 100, height: 100, tint: trackBright, alpha: loopGlowAlpha, blendMode: particleBlend,
    });

    // Launch base glow (fire zone)
    const launchGlowX = width * 0.22;
    const launchGlowY = height * 0.74;
    const launchGlowAlpha = 0.25 + 0.1 * Math.sin(t * 4);
    api.brush.image(glowTex, launchGlowX, launchGlowY, {
      width: 120, height: 60, tint: fireCore, alpha: launchGlowAlpha, blendMode: particleBlend,
    });
  },

  async teardown(): Promise<void> {
    s.trackPoints = [];
    s.trackCount = 0;
    s.fireParticles = [];
    s.iceCrystals = [];
    s.sparks = [];
    s.trainPos = 0;
    s.glowDataUrl = '';
    s.glowDarkDataUrl = '';
    s.spawnTimer = 0;
    s.iceSpawnTimer = 0;
  },
};

registerActor(actor);
export default actor;
