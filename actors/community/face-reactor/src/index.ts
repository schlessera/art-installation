/**
 * Face Reactor Actor
 *
 * Detects faces in video feed and creates artistic effects around them.
 * Emotion-based colors create colorful auras emanating from detected faces.
 * Gracefully falls back to simulated points of interest when no faces detected.
 *
 * Showcases unused Video APIs:
 * - video.getFaces() - Face detection with emotion
 * - video.getColorAt() - Sample video colors
 * - video.getDimensions() - Coordinate mapping
 *
 * Also uses: quadratic() curves, bulge() filter, radial gradients
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  FaceData,
  Gradient,
  Point,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'face-reactor',
  name: 'Face Reactor',
  description: 'Detects faces and creates artistic effects with emotion-based auras',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['face-detection', 'interactive', 'video', 'aura', 'emotional'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['video'],
};

// ============================================================
// Constants
// ============================================================

const MAX_TRACKED_FACES = 5;
const MAX_TRAIL_POINTS = 30;
const MAX_AURA_PARTICLES = 40;
const MAX_ORBIT_POINTS = 12;

type Emotion = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry';

// Emotion to color mapping (hue values)
const EMOTION_COLORS: Record<Emotion, { hue: number; saturation: number; lightness: number }> = {
  neutral: { hue: 0, saturation: 0, lightness: 80 },      // White/gray
  happy: { hue: 45, saturation: 90, lightness: 60 },      // Warm yellow/orange
  sad: { hue: 220, saturation: 70, lightness: 50 },       // Cool blue
  surprised: { hue: 300, saturation: 80, lightness: 65 }, // Magenta/pink
  angry: { hue: 0, saturation: 85, lightness: 50 },       // Red
};

// ============================================================
// State interfaces
// ============================================================

interface TrackedFace {
  active: boolean;
  id: number;
  // Smoothed position (normalized 0-1)
  x: number;
  y: number;
  // Target position from detection
  targetX: number;
  targetY: number;
  // Size (normalized)
  size: number;
  targetSize: number;
  // Emotion
  emotion: Emotion;
  // Aura properties
  auraHue: number;
  auraIntensity: number;
  // Trail (circular buffer)
  trail: Point[];
  trailHead: number;
  trailLength: number;
  // Orbit phase
  orbitPhase: number;
  // Lifetime
  lastSeen: number;
  fadeProgress: number;
}

interface AuraParticle {
  active: boolean;
  faceId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  hue: number;
  lifetime: number;
  maxLifetime: number;
}

interface SimulatedFace {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  emotion: Emotion;
  changeTimer: number;
}

interface FaceReactorState {
  trackedFaces: TrackedFace[];
  auraParticles: AuraParticle[];
  simulatedFaces: SimulatedFace[];
  nextFaceId: number;
  globalPhase: number;
  videoAvailable: boolean;
  videoDimensions: { width: number; height: number } | null;
  // Pre-allocated orbit points
  orbitPoints: Point[];
}

// ============================================================
// State
// ============================================================

let state: FaceReactorState = {
  trackedFaces: [],
  auraParticles: [],
  simulatedFaces: [],
  nextFaceId: 0,
  globalPhase: 0,
  videoAvailable: false,
  videoDimensions: null,
  orbitPoints: [],
};

// ============================================================
// Helper functions
// ============================================================

function hslToNumeric(h: number, s: number, l: number): number {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0, g = 0, b = 0;
  const hMod = ((h % 360) + 360) % 360;
  if (hMod < 60) { r = c; g = x; b = 0; }
  else if (hMod < 120) { r = x; g = c; b = 0; }
  else if (hMod < 180) { r = 0; g = c; b = x; }
  else if (hMod < 240) { r = 0; g = x; b = c; }
  else if (hMod < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
}

function hslToRgba(h: number, s: number, l: number, a: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0, g = 0, b = 0;
  const hMod = ((h % 360) + 360) % 360;
  if (hMod < 60) { r = c; g = x; b = 0; }
  else if (hMod < 120) { r = x; g = c; b = 0; }
  else if (hMod < 180) { r = 0; g = c; b = x; }
  else if (hMod < 240) { r = 0; g = x; b = c; }
  else if (hMod < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return `rgba(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((b + m) * 255)}, ${a})`;
}

function initTrackedFace(face: TrackedFace, id: number, x: number, y: number, size: number, emotion: Emotion): void {
  face.active = true;
  face.id = id;
  face.x = x;
  face.y = y;
  face.targetX = x;
  face.targetY = y;
  face.size = size;
  face.targetSize = size;
  face.emotion = emotion;
  face.auraHue = EMOTION_COLORS[emotion].hue;
  face.auraIntensity = 1;
  face.trailHead = 0;
  face.trailLength = 0;
  face.orbitPhase = Math.random() * Math.PI * 2;
  face.lastSeen = 0;
  face.fadeProgress = 0;

  // Reset trail
  for (let i = 0; i < MAX_TRAIL_POINTS; i++) {
    face.trail[i].x = x;
    face.trail[i].y = y;
  }
}

function initAuraParticle(particle: AuraParticle, faceId: number, x: number, y: number, hue: number): void {
  particle.active = true;
  particle.faceId = faceId;
  particle.x = x;
  particle.y = y;

  // Radial velocity outward
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.001 + Math.random() * 0.002;
  particle.vx = Math.cos(angle) * speed;
  particle.vy = Math.sin(angle) * speed;

  particle.size = 0.01 + Math.random() * 0.02;
  particle.alpha = 0.6 + Math.random() * 0.4;
  particle.hue = hue + (Math.random() - 0.5) * 30;
  particle.lifetime = 0;
  particle.maxLifetime = 1000 + Math.random() * 2000;
}

function initSimulatedFace(face: SimulatedFace): void {
  face.x = 0.2 + Math.random() * 0.6;
  face.y = 0.2 + Math.random() * 0.6;
  face.vx = (Math.random() - 0.5) * 0.0003;
  face.vy = (Math.random() - 0.5) * 0.0003;
  face.size = 0.08 + Math.random() * 0.05;

  const emotions: Emotion[] = ['neutral', 'happy', 'sad', 'surprised', 'angry'];
  face.emotion = emotions[Math.floor(Math.random() * emotions.length)];
  face.changeTimer = 5000 + Math.random() * 10000;
}

// ============================================================
// Actor implementation
// ============================================================

const actor: Actor = {
  metadata,

  async setup(_api: ActorSetupAPI): Promise<void> {

    // Pre-allocate tracked faces pool
    state.trackedFaces = new Array(MAX_TRACKED_FACES);
    for (let i = 0; i < MAX_TRACKED_FACES; i++) {
      state.trackedFaces[i] = {
        active: false,
        id: 0,
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        size: 0,
        targetSize: 0,
        emotion: 'neutral',
        auraHue: 0,
        auraIntensity: 1,
        trail: new Array(MAX_TRAIL_POINTS),
        trailHead: 0,
        trailLength: 0,
        orbitPhase: 0,
        lastSeen: 0,
        fadeProgress: 0,
      };

      // Pre-allocate trail points
      for (let j = 0; j < MAX_TRAIL_POINTS; j++) {
        state.trackedFaces[i].trail[j] = { x: 0, y: 0 };
      }
    }

    // Pre-allocate aura particles pool
    state.auraParticles = new Array(MAX_AURA_PARTICLES);
    for (let i = 0; i < MAX_AURA_PARTICLES; i++) {
      state.auraParticles[i] = {
        active: false,
        faceId: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 0,
        alpha: 0,
        hue: 0,
        lifetime: 0,
        maxLifetime: 0,
      };
    }

    // Pre-allocate simulated faces for fallback
    state.simulatedFaces = new Array(2);
    for (let i = 0; i < 2; i++) {
      state.simulatedFaces[i] = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 0,
        emotion: 'neutral',
        changeTimer: 0,
      };
      initSimulatedFace(state.simulatedFaces[i]);
    }

    // Pre-allocate orbit points
    state.orbitPoints = new Array(MAX_ORBIT_POINTS);
    for (let i = 0; i < MAX_ORBIT_POINTS; i++) {
      state.orbitPoints[i] = { x: 0, y: 0 };
    }

    state.nextFaceId = 0;
    state.globalPhase = 0;
    state.videoAvailable = false;
    state.videoDimensions = null;

    console.log('[face-reactor] Setup complete');
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;
    const time = frame.time;

    state.globalPhase += dt * 0.002;

    // ============ Check video availability ============

    state.videoAvailable = api.context.video.isAvailable();
    state.videoDimensions = api.context.video.getDimensions();

    let detectedFaces: FaceData[] = [];

    if (state.videoAvailable) {
      detectedFaces = api.context.video.getFaces();
    }

    // ============ Update tracked faces from detections ============

    if (detectedFaces.length > 0 && state.videoDimensions) {
      const vw = state.videoDimensions.width;
      const vh = state.videoDimensions.height;

      for (const detection of detectedFaces) {
        // Calculate face center (normalized 0-1)
        const centerX = (detection.bounds.x + detection.bounds.width / 2) / vw;
        const centerY = (detection.bounds.y + detection.bounds.height / 2) / vh;
        const faceSize = Math.max(detection.bounds.width, detection.bounds.height) / Math.max(vw, vh);
        const emotion = detection.emotion || 'neutral';

        // Try to match with existing tracked face
        let matched = false;
        for (const tracked of state.trackedFaces) {
          if (!tracked.active) continue;

          const dist = Math.hypot(tracked.x - centerX, tracked.y - centerY);
          if (dist < 0.2) {
            // Update existing face
            tracked.targetX = centerX;
            tracked.targetY = centerY;
            tracked.targetSize = faceSize;
            tracked.emotion = emotion;
            tracked.lastSeen = time;
            tracked.fadeProgress = 0;
            matched = true;
            break;
          }
        }

        if (!matched) {
          // Create new tracked face
          const newFace = state.trackedFaces.find(f => !f.active);
          if (newFace) {
            initTrackedFace(newFace, state.nextFaceId++, centerX, centerY, faceSize, emotion);
            newFace.lastSeen = time;
          }
        }
      }
    } else {
      // Use simulated faces as fallback
      for (let i = 0; i < state.simulatedFaces.length; i++) {
        const sim = state.simulatedFaces[i];

        // Update simulated face movement
        sim.x += sim.vx * dt;
        sim.y += sim.vy * dt;

        // Bounce off edges
        if (sim.x < 0.15 || sim.x > 0.85) sim.vx *= -1;
        if (sim.y < 0.15 || sim.y > 0.85) sim.vy *= -1;

        // Keep in bounds
        sim.x = Math.max(0.1, Math.min(0.9, sim.x));
        sim.y = Math.max(0.1, Math.min(0.9, sim.y));

        // Change emotion periodically
        sim.changeTimer -= dt;
        if (sim.changeTimer <= 0) {
          const emotions: Emotion[] = ['neutral', 'happy', 'sad', 'surprised', 'angry'];
          sim.emotion = emotions[Math.floor(Math.random() * emotions.length)];
          sim.changeTimer = 5000 + Math.random() * 10000;
        }

        // Update or create tracked face from simulation
        let tracked = state.trackedFaces.find(f => f.active && f.id === 1000 + i);
        if (!tracked) {
          tracked = state.trackedFaces.find(f => !f.active);
          if (tracked) {
            initTrackedFace(tracked, 1000 + i, sim.x, sim.y, sim.size, sim.emotion);
            tracked.lastSeen = time;
          }
        }

        if (tracked) {
          tracked.targetX = sim.x;
          tracked.targetY = sim.y;
          tracked.targetSize = sim.size;
          tracked.emotion = sim.emotion;
          tracked.lastSeen = time;
          tracked.fadeProgress = 0;
        }
      }
    }

    // ============ Update and draw tracked faces ============

    for (let i = 0; i < state.trackedFaces.length; i++) {
      const face = state.trackedFaces[i];
      if (!face.active) continue;

      // Smooth position tracking
      face.x += (face.targetX - face.x) * 0.1;
      face.y += (face.targetY - face.y) * 0.1;
      face.size += (face.targetSize - face.size) * 0.1;

      // Update emotion color
      const targetColor = EMOTION_COLORS[face.emotion];
      face.auraHue += (targetColor.hue - face.auraHue) * 0.05;

      // Update orbit phase
      face.orbitPhase += dt * 0.003;

      // Update trail (circular buffer)
      if (frame.frameCount % 2 === 0) {
        face.trail[face.trailHead].x = face.x;
        face.trail[face.trailHead].y = face.y;
        face.trailHead = (face.trailHead + 1) % MAX_TRAIL_POINTS;
        if (face.trailLength < MAX_TRAIL_POINTS) face.trailLength++;
      }

      // Check if face is stale
      const timeSinceSeen = time - face.lastSeen;
      if (timeSinceSeen > 2000) {
        face.fadeProgress += dt / 1000;
        if (face.fadeProgress >= 1) {
          face.active = false;
          continue;
        }
      }

      // Calculate canvas coordinates
      const cx = face.x * width;
      const cy = face.y * height;
      const faceRadius = face.size * Math.min(width, height) * 0.5;

      // Skip drawing if face radius is too small (prevents gradient calculation errors)
      if (faceRadius < 5) continue;

      const fadeAlpha = 1 - face.fadeProgress;
      const emotionColor = EMOTION_COLORS[face.emotion];

      // ============ Draw face trail ============

      if (face.trailLength > 2) {
        for (let t = 0; t < face.trailLength - 1; t++) {
          const idx = (face.trailHead - face.trailLength + t + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS;
          const nextIdx = (idx + 1) % MAX_TRAIL_POINTS;

          const p1 = face.trail[idx];
          const p2 = face.trail[nextIdx];

          const trailAlpha = (t / face.trailLength) * 0.3 * fadeAlpha;

          api.brush.line(
            p1.x * width, p1.y * height,
            p2.x * width, p2.y * height,
            {
              color: hslToNumeric(face.auraHue, emotionColor.saturation, emotionColor.lightness),
              alpha: trailAlpha,
              width: 3 + (t / face.trailLength) * 5,
              cap: 'round',
            }
          );
        }
      }

      // ============ Draw aura glow layers ============

      const glowLayers = 4;
      for (let g = glowLayers - 1; g >= 0; g--) {
        const glowRadius = faceRadius * (1.5 + g * 0.4);
        const glowAlpha = (0.15 - g * 0.03) * fadeAlpha;

        // Gradient coordinates must be relative (0-1 range), not absolute pixels
        const glowGradient: Gradient = {
          type: 'radial',
          cx: 0.5,
          cy: 0.5,
          radius: 0.5,
          stops: [
            { offset: 0, color: hslToRgba(face.auraHue, emotionColor.saturation, emotionColor.lightness + 20, glowAlpha) },
            { offset: 0.5, color: hslToRgba(face.auraHue, emotionColor.saturation, emotionColor.lightness, glowAlpha * 0.5) },
            { offset: 1, color: hslToRgba(face.auraHue, emotionColor.saturation, emotionColor.lightness, 0) },
          ],
        };

        api.brush.circle(cx, cy, glowRadius, {
          fill: glowGradient,
          blendMode: 'add',
        });
      }

      // ============ Draw orbiting curves using quadratic bezier ============

      const orbitRadius = faceRadius * 1.3;
      const curveCount = 5;

      for (let c = 0; c < curveCount; c++) {
        const curveAngle = face.orbitPhase + (c * Math.PI * 2) / curveCount;
        const curveStartAngle = curveAngle - Math.PI / 4;
        const curveEndAngle = curveAngle + Math.PI / 4;

        const startX = cx + Math.cos(curveStartAngle) * orbitRadius;
        const startY = cy + Math.sin(curveStartAngle) * orbitRadius;
        const endX = cx + Math.cos(curveEndAngle) * orbitRadius;
        const endY = cy + Math.sin(curveEndAngle) * orbitRadius;

        // Control point extends outward
        const controlAngle = curveAngle;
        const controlRadius = orbitRadius * 1.4;
        const controlX = cx + Math.cos(controlAngle) * controlRadius;
        const controlY = cy + Math.sin(controlAngle) * controlRadius;

        const curveHue = face.auraHue + c * 15;
        const curveAlpha = 0.4 * fadeAlpha;

        api.brush.quadratic(
          { x: startX, y: startY },
          { x: controlX, y: controlY },
          { x: endX, y: endY },
          {
            color: hslToNumeric(curveHue, emotionColor.saturation, emotionColor.lightness),
            alpha: curveAlpha,
            width: 3,
            cap: 'round',
          }
        );
      }

      // ============ Draw inner glow circle ============

      // Gradient coordinates must be relative (0-1 range), not absolute pixels
      const innerGradient: Gradient = {
        type: 'radial',
        cx: 0.5,
        cy: 0.5,
        radius: 0.5,
        stops: [
          { offset: 0, color: hslToRgba(face.auraHue, emotionColor.saturation, 90, 0.5 * fadeAlpha) },
          { offset: 0.7, color: hslToRgba(face.auraHue, emotionColor.saturation, emotionColor.lightness, 0.3 * fadeAlpha) },
          { offset: 1, color: hslToRgba(face.auraHue, emotionColor.saturation, emotionColor.lightness, 0) },
        ],
      };

      api.brush.circle(cx, cy, faceRadius * 0.8, {
        fill: innerGradient,
        blendMode: 'screen',
      });

      // ============ Spawn aura particles ============

      const spawnChance = 0.08 * fadeAlpha;
      if (Math.random() < spawnChance) {
        const particle = state.auraParticles.find(p => !p.active);
        if (particle) {
          // Spawn on the edge of the aura
          const spawnAngle = Math.random() * Math.PI * 2;
          const spawnDist = faceRadius * (0.8 + Math.random() * 0.5);
          const spawnX = face.x + (Math.cos(spawnAngle) * spawnDist) / width;
          const spawnY = face.y + (Math.sin(spawnAngle) * spawnDist) / height;

          initAuraParticle(particle, face.id, spawnX, spawnY, face.auraHue);
        }
      }
    }

    // ============ Update and draw aura particles ============

    for (let i = 0; i < state.auraParticles.length; i++) {
      const particle = state.auraParticles[i];
      if (!particle.active) continue;

      particle.lifetime += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

      // Fade out
      const lifeProgress = particle.lifetime / particle.maxLifetime;
      particle.alpha = (1 - lifeProgress) * 0.6;

      // Draw particle
      const px = particle.x * width;
      const py = particle.y * height;
      const pSize = particle.size * Math.min(width, height);

      api.brush.circle(px, py, pSize, {
        fill: hslToNumeric(particle.hue, 70, 65),
        alpha: particle.alpha,
        blendMode: 'add',
      });

      // Deactivate when done
      if (particle.lifetime >= particle.maxLifetime) {
        particle.active = false;
      }
    }

    // ============ Draw connecting lines between faces ============

    const activeFaces = state.trackedFaces.filter(f => f.active);
    if (activeFaces.length >= 2) {
      for (let i = 0; i < activeFaces.length - 1; i++) {
        const f1 = activeFaces[i];
        const f2 = activeFaces[i + 1];

        const x1 = f1.x * width;
        const y1 = f1.y * height;
        const x2 = f2.x * width;
        const y2 = f2.y * height;

        const dist = Math.hypot(x2 - x1, y2 - y1);
        if (dist < width * 0.5) {
          const connectAlpha = 0.2 * (1 - dist / (width * 0.5));
          const avgHue = (f1.auraHue + f2.auraHue) / 2;

          // Draw connecting curve
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2 - 30 * Math.sin(state.globalPhase);

          api.brush.quadratic(
            { x: x1, y: y1 },
            { x: midX, y: midY },
            { x: x2, y: y2 },
            {
              color: hslToNumeric(avgHue, 60, 60),
              alpha: connectAlpha,
              width: 2,
              cap: 'round',
            }
          );
        }
      }
    }

    // ============ Apply subtle bulge distortion at face centers ============
    // Limit to 2 strongest faces to stay within 3-5 filters budget (bulge + glow = 3 total)

    let bulgeCount = 0;
    const maxBulges = 2;
    for (const face of state.trackedFaces) {
      if (!face.active || face.fadeProgress > 0.5) continue;
      if (bulgeCount >= maxBulges) break;

      const bulgeStrength = 0.15 * (1 - face.fadeProgress);
      api.filter.bulge(face.x, face.y, face.size * 1.5, bulgeStrength);
      bulgeCount++;
    }

    // ============ Apply subtle global glow ============

    api.filter.glow(
      hslToRgba(state.trackedFaces[0]?.auraHue || 0, 50, 60, 0.3),
      0.2,
      10
    );
  },

  async teardown(): Promise<void> {
    // Reset state
    state.nextFaceId = 0;
    state.globalPhase = 0;
    state.videoAvailable = false;
    state.videoDimensions = null;

    // Deactivate all tracked faces
    for (const face of state.trackedFaces) {
      face.active = false;
    }

    // Deactivate all particles
    for (const particle of state.auraParticles) {
      particle.active = false;
    }

    // Reset simulated faces
    for (const sim of state.simulatedFaces) {
      initSimulatedFace(sim);
    }

    console.log('[face-reactor] Teardown complete');
  },
};

// Self-register with the runtime
registerActor(actor);

export default actor;
