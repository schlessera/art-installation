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
const MAX_FEATURE_PARTICLES = 30;

type Emotion = 'neutral' | 'happy' | 'sad' | 'surprised' | 'angry';

// Emotion to color mapping (hue values) - lightness adjusted per display mode
const EMOTION_COLORS_DARK: Record<Emotion, { hue: number; saturation: number; lightness: number }> = {
  neutral: { hue: 0, saturation: 0, lightness: 80 },      // White/gray
  happy: { hue: 45, saturation: 90, lightness: 60 },      // Warm yellow/orange
  sad: { hue: 220, saturation: 70, lightness: 50 },       // Cool blue
  surprised: { hue: 300, saturation: 80, lightness: 65 }, // Magenta/pink
  angry: { hue: 0, saturation: 85, lightness: 50 },       // Red
};

const EMOTION_COLORS_LIGHT: Record<Emotion, { hue: number; saturation: number; lightness: number }> = {
  neutral: { hue: 0, saturation: 0, lightness: 30 },      // Dark gray
  happy: { hue: 45, saturation: 90, lightness: 35 },      // Warm yellow/orange (darker)
  sad: { hue: 220, saturation: 70, lightness: 30 },       // Cool blue (darker)
  surprised: { hue: 300, saturation: 80, lightness: 35 }, // Magenta/pink (darker)
  angry: { hue: 0, saturation: 85, lightness: 30 },       // Red (darker)
};

// Helper to get emotion colors based on display mode
function getEmotionColors(isDarkMode: boolean): Record<Emotion, { hue: number; saturation: number; lightness: number }> {
  return isDarkMode ? EMOTION_COLORS_DARK : EMOTION_COLORS_LIGHT;
}

// ============================================================
// State interfaces
// ============================================================

interface TrackedLandmarks {
  leftEye: Point;
  rightEye: Point;
  nose: Point;
  mouth: Point;
  leftEar: Point;
  rightEar: Point;
}

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
  // Feature effects (randomly selected on face init, 0 = none)
  eyeEffect: number;
  noseEffect: number;
  mouthEffect: number;
  earEffect: number;
  // Animation phases for feature effects
  eyePhase: number;
  nosePhase: number;
  mouthPhase: number;
  earPhase: number;
  // Cached landmark positions (smoothed, normalized 0-1)
  landmarks: TrackedLandmarks | null;
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

interface FeatureParticle {
  active: boolean;
  faceId: number;
  featureType: 'eye' | 'mouth';
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
  featureParticles: FeatureParticle[];
  simulatedFaces: SimulatedFace[];
  nextFaceId: number;
  globalPhase: number;
  videoAvailable: boolean;
  videoDimensions: { width: number; height: number } | null;
  // Pre-allocated orbit points
  orbitPoints: Point[];
  // Pre-allocated array for active faces (avoid allocation in update loop)
  activeFacesCache: TrackedFace[];
}

// ============================================================
// State
// ============================================================

let state: FaceReactorState = {
  trackedFaces: [],
  auraParticles: [],
  featureParticles: [],
  simulatedFaces: [],
  nextFaceId: 0,
  globalPhase: 0,
  videoAvailable: false,
  videoDimensions: null,
  orbitPoints: [],
  activeFacesCache: [],
};

// ============================================================
// Helper functions
// ============================================================

function hslToNumeric(h: number, s: number, l: number): number {
  // Defensive: ensure valid inputs
  if (!Number.isFinite(h)) h = 0;
  if (!Number.isFinite(s)) s = 50;
  if (!Number.isFinite(l)) l = 50;

  const sNorm = Math.max(0, Math.min(1, s / 100));
  const lNorm = Math.max(0, Math.min(1, l / 100));
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
  // Ensure RGB values are clamped to valid range and result is positive
  const rVal = Math.max(0, Math.min(255, Math.round((r + m) * 255)));
  const gVal = Math.max(0, Math.min(255, Math.round((g + m) * 255)));
  const bVal = Math.max(0, Math.min(255, Math.round((b + m) * 255)));
  return (rVal << 16) | (gVal << 8) | bVal;
}

function hslToRgba(h: number, s: number, l: number, a: number): string {
  // Defensive: ensure valid inputs
  if (!Number.isFinite(h)) h = 0;
  if (!Number.isFinite(s)) s = 50;
  if (!Number.isFinite(l)) l = 50;
  if (!Number.isFinite(a)) a = 1;

  const sNorm = Math.max(0, Math.min(1, s / 100));
  const lNorm = Math.max(0, Math.min(1, l / 100));
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
  // Ensure RGB values are clamped to valid range
  const rVal = Math.max(0, Math.min(255, Math.round((r + m) * 255)));
  const gVal = Math.max(0, Math.min(255, Math.round((g + m) * 255)));
  const bVal = Math.max(0, Math.min(255, Math.round((b + m) * 255)));
  const aVal = Math.max(0, Math.min(1, a));
  return `rgba(${rVal}, ${gVal}, ${bVal}, ${aVal})`;
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
  // Use EMOTION_COLORS_DARK for initial hue (hue is same in both modes, only lightness differs)
  face.auraHue = EMOTION_COLORS_DARK[emotion].hue;
  face.auraIntensity = 1;
  face.trailHead = 0;
  face.trailLength = 0;
  face.orbitPhase = Math.random() * Math.PI * 2;
  face.lastSeen = 0;
  face.fadeProgress = 0;

  // Random feature effects (0 = none, allowing variability)
  face.eyeEffect = Math.floor(Math.random() * 4);   // 0-3
  face.noseEffect = Math.floor(Math.random() * 4);  // 0-3
  face.mouthEffect = Math.floor(Math.random() * 4); // 0-3
  face.earEffect = Math.floor(Math.random() * 4);   // 0-3

  console.log(`[face-reactor] Face ${id} feature effects: eye=${face.eyeEffect}, nose=${face.noseEffect}, mouth=${face.mouthEffect}, ear=${face.earEffect}`);

  // Animation phases for feature effects
  face.eyePhase = Math.random() * Math.PI * 2;
  face.nosePhase = Math.random() * Math.PI * 2;
  face.mouthPhase = Math.random() * Math.PI * 2;
  face.earPhase = Math.random() * Math.PI * 2;

  // Reset landmarks
  face.landmarks = null;

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
  // Normalize hue to [0, 360) range
  const rawHue = hue + (Math.random() - 0.5) * 30;
  particle.hue = ((rawHue % 360) + 360) % 360;
  particle.lifetime = 0;
  particle.maxLifetime = 1000 + Math.random() * 2000;
}

function initFeatureParticle(
  particle: FeatureParticle,
  faceId: number,
  featureType: 'eye' | 'mouth',
  x: number,
  y: number,
  hue: number,
  vx: number,
  vy: number
): void {
  particle.active = true;
  particle.faceId = faceId;
  particle.featureType = featureType;
  particle.x = x;
  particle.y = y;
  particle.vx = vx;
  particle.vy = vy;
  particle.size = 0.005 + Math.random() * 0.008;
  particle.alpha = 0.4 + Math.random() * 0.3;
  // Normalize hue to [0, 360) range
  const rawHue = hue + (Math.random() - 0.5) * 20;
  particle.hue = ((rawHue % 360) + 360) % 360;
  particle.lifetime = 0;
  particle.maxLifetime = 800 + Math.random() * 1200;
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

/**
 * Infer emotion from face landmarks and movement.
 * Since MediaPipe doesn't provide emotion detection, we derive it from:
 * - Face movement speed (happy = more animated)
 * - Face size changes (approaching = surprised, retreating = sad)
 * - Head tilt (playful = happy)
 *
 * Note: All coordinates are in normalized 0-1 space (face bounds already normalized by caller)
 */
function inferEmotionFromLandmarks(
  centerX: number,
  centerY: number,
  faceSize: number,
  detection: FaceData,
  prevTracked: TrackedFace | undefined,
  _canvasWidth: number,
  canvasHeight: number
): Emotion {
  // Use movement to infer emotion (all values are normalized 0-1)
  if (prevTracked && prevTracked.active) {
    // Calculate movement magnitude in normalized space
    const dx = centerX - prevTracked.x;
    const dy = centerY - prevTracked.y;
    const movement = Math.hypot(dx, dy);

    // High movement = happy/excited (threshold ~2% of screen)
    if (movement > 0.02) return 'happy';

    // Check size change (approaching vs retreating)
    const sizeChange = faceSize - prevTracked.size;
    if (sizeChange > 0.02) return 'surprised'; // Face getting bigger = approaching
    if (sizeChange < -0.02) return 'sad'; // Face getting smaller = retreating
  }

  // Use landmarks for head tilt detection (landmarks are in canvas pixels)
  const landmarks = detection.landmarks;
  if (landmarks) {
    // Check head tilt based on ear positions (in pixel space, so compare directly)
    if (landmarks.leftEarTragion && landmarks.rightEarTragion) {
      const earTilt = Math.abs(landmarks.leftEarTragion.y - landmarks.rightEarTragion.y);
      // Significant tilt (>3% of canvas height) = playful/happy
      if (earTilt > canvasHeight * 0.03) return 'happy';
    }

    // Check vertical eye-to-mouth ratio for surprise (mouth open)
    const eyeY = (landmarks.leftEye.y + landmarks.rightEye.y) / 2;
    const mouthY = landmarks.mouth.y;
    const noseY = landmarks.noseTip.y;
    const faceHeight = mouthY - eyeY;
    if (faceHeight > 10) { // Minimum face height in pixels
      const mouthOpenness = (mouthY - noseY) / faceHeight;
      if (mouthOpenness > 0.45) return 'surprised';
    }
  }

  // Default to neutral
  return 'neutral';
}

// ============================================================
// Feature effect drawing functions
// ============================================================

// Fixed vibrant hues for each feature type (independent of auraHue)
const EYE_HUE = 200;    // Cyan/blue
const NOSE_HUE = 30;    // Orange
const MOUTH_HUE = 330;  // Magenta/pink
const EAR_HUE = 120;    // Green

// Lightness values for feature effects based on display mode
function getFeatureLightness(isDarkMode: boolean): { fill: number; stroke: number } {
  return isDarkMode
    ? { fill: 65, stroke: 55 }   // Bright colors for dark backgrounds
    : { fill: 35, stroke: 30 };  // Dark colors for light backgrounds
}

// Alpha multiplier for light mode (colors need to be less intense)
function getAlphaMultiplier(isDarkMode: boolean): number {
  return isDarkMode ? 1.0 : 0.75;
}

/**
 * Draw eye effects - always in pairs
 * Effect 0: None
 * Effect 1: Soft Glow - filled circles with stroke at eye positions
 * Effect 2: Orbiting Sparks - colorful circles orbiting each eye
 * Effect 3: Connecting Line - curved line between eyes with dots
 */
function drawEyeEffects(
  api: ActorUpdateAPI,
  face: TrackedFace,
  width: number,
  height: number,
  fadeAlpha: number,
  isDarkMode: boolean
): void {
  if (!face.landmarks || face.eyeEffect === 0) return;

  const leftX = face.landmarks.leftEye.x * width;
  const leftY = face.landmarks.leftEye.y * height;
  const rightX = face.landmarks.rightEye.x * width;
  const rightY = face.landmarks.rightEye.y * height;
  const eyeSize = face.size * Math.min(width, height) * 0.15;
  const lightness = getFeatureLightness(isDarkMode);
  const alphaMult = getAlphaMultiplier(isDarkMode);

  switch (face.eyeEffect) {
    case 1: {
      // Soft Glow - filled circles with contrasting stroke
      const innerSize = eyeSize * 0.6;
      const pulseScale = 0.9 + 0.2 * Math.sin(face.eyePhase);

      // Left eye - outer ring then inner fill
      api.brush.circle(leftX, leftY, eyeSize * pulseScale, {
        stroke: hslToNumeric(EYE_HUE, 100, lightness.stroke),
        strokeWidth: 4,
        alpha: 0.85 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });
      api.brush.circle(leftX, leftY, innerSize * pulseScale, {
        fill: hslToNumeric(EYE_HUE + 30, 100, lightness.fill),
        alpha: 0.7 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });

      // Right eye - same styling
      api.brush.circle(rightX, rightY, eyeSize * pulseScale, {
        stroke: hslToNumeric(EYE_HUE, 100, lightness.stroke),
        strokeWidth: 4,
        alpha: 0.85 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });
      api.brush.circle(rightX, rightY, innerSize * pulseScale, {
        fill: hslToNumeric(EYE_HUE + 30, 100, lightness.fill),
        alpha: 0.7 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });
      break;
    }

    case 2: {
      // Orbiting Sparks - 4 colorful circles orbiting each eye
      const sparkCount = 4;
      const orbitRadius = eyeSize * 1.4;

      for (let i = 0; i < sparkCount; i++) {
        const sparkAngle = face.eyePhase + (i * Math.PI * 2) / sparkCount;
        const sparkSize = eyeSize * 0.4;
        const sparkHue = EYE_HUE + i * 30; // Each spark slightly different color

        // Left eye sparks
        const lSparkX = leftX + Math.cos(sparkAngle) * orbitRadius;
        const lSparkY = leftY + Math.sin(sparkAngle) * orbitRadius;

        // Right eye sparks (opposite direction)
        const rSparkX = rightX + Math.cos(-sparkAngle) * orbitRadius;
        const rSparkY = rightY + Math.sin(-sparkAngle) * orbitRadius;

        api.brush.circle(lSparkX, lSparkY, sparkSize, {
          fill: hslToNumeric(sparkHue, 100, lightness.fill),
          alpha: 0.9 * fadeAlpha * alphaMult,
          blendMode: 'normal',
        });

        api.brush.circle(rSparkX, rSparkY, sparkSize, {
          fill: hslToNumeric(sparkHue, 100, lightness.fill),
          alpha: 0.9 * fadeAlpha * alphaMult,
          blendMode: 'normal',
        });
      }
      break;
    }

    case 3: {
      // Connecting Line - curved line between eyes with endpoint dots
      const midX = (leftX + rightX) / 2;
      const waveOffset = eyeSize * 0.8 * Math.sin(face.eyePhase * 0.5);
      const midY = (leftY + rightY) / 2 - waveOffset;

      // Draw dots at eyes first
      api.brush.circle(leftX, leftY, eyeSize * 0.5, {
        fill: hslToNumeric(EYE_HUE + 40, 100, lightness.fill),
        alpha: 0.9 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });
      api.brush.circle(rightX, rightY, eyeSize * 0.5, {
        fill: hslToNumeric(EYE_HUE + 40, 100, lightness.fill),
        alpha: 0.9 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });

      // Connecting curve
      api.brush.quadratic(
        { x: leftX, y: leftY },
        { x: midX, y: midY },
        { x: rightX, y: rightY },
        {
          color: hslToNumeric(EYE_HUE, 100, lightness.stroke),
          alpha: 0.85 * fadeAlpha * alphaMult,
          width: 5,
          cap: 'round',
        }
      );
      break;
    }
  }
}

/**
 * Draw nose effects
 * Effect 0: None
 * Effect 1: Soft Point - filled circle with ring at nose tip
 * Effect 2: Breathing Ring - double ring that expands/contracts
 * Effect 3: Radial Lines - colorful lines emanating from nose tip
 */
function drawNoseEffects(
  api: ActorUpdateAPI,
  face: TrackedFace,
  width: number,
  height: number,
  fadeAlpha: number,
  isDarkMode: boolean
): void {
  if (!face.landmarks || face.noseEffect === 0) return;

  const nx = face.landmarks.nose.x * width;
  const ny = face.landmarks.nose.y * height;
  const noseSize = face.size * Math.min(width, height) * 0.12;
  const lightness = getFeatureLightness(isDarkMode);
  const alphaMult = getAlphaMultiplier(isDarkMode);

  switch (face.noseEffect) {
    case 1: {
      // Soft Point - filled circle with ring
      const pulseScale = 0.9 + 0.15 * Math.sin(face.nosePhase);

      api.brush.circle(nx, ny, noseSize * 1.2 * pulseScale, {
        stroke: hslToNumeric(NOSE_HUE, 100, lightness.stroke),
        strokeWidth: 4,
        alpha: 0.8 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });
      api.brush.circle(nx, ny, noseSize * 0.7 * pulseScale, {
        fill: hslToNumeric(NOSE_HUE + 20, 100, lightness.fill),
        alpha: 0.85 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });
      break;
    }

    case 2: {
      // Breathing Ring - double ring that expands/contracts
      const ringScale = 0.5 + 0.7 * Math.sin(face.nosePhase);
      const ringRadius1 = noseSize * (0.8 + ringScale);
      const ringRadius2 = noseSize * (1.4 + ringScale * 0.7);
      const ringAlpha = (0.85 - 0.15 * Math.abs(Math.sin(face.nosePhase))) * fadeAlpha * alphaMult;

      api.brush.circle(nx, ny, ringRadius1, {
        stroke: hslToNumeric(NOSE_HUE, 100, lightness.stroke + 5),
        strokeWidth: 4,
        alpha: ringAlpha,
        blendMode: 'normal',
      });
      api.brush.circle(nx, ny, ringRadius2, {
        stroke: hslToNumeric(NOSE_HUE + 30, 100, lightness.stroke),
        strokeWidth: 3,
        alpha: ringAlpha * 0.7,
        blendMode: 'normal',
      });
      break;
    }

    case 3: {
      // Radial Lines - 8 colorful lines emanating from nose tip
      const lineCount = 8;
      const lineLength = noseSize * 2.8;

      // Center dot
      api.brush.circle(nx, ny, noseSize * 0.5, {
        fill: hslToNumeric(NOSE_HUE, 100, lightness.fill),
        alpha: 0.9 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });

      for (let i = 0; i < lineCount; i++) {
        const angle = face.nosePhase * 0.3 + (i * Math.PI * 2) / lineCount;
        const endX = nx + Math.cos(angle) * lineLength;
        const endY = ny + Math.sin(angle) * lineLength;
        const lineHue = NOSE_HUE + (i * 15) % 60; // Varying warm tones

        api.brush.line(nx, ny, endX, endY, {
          color: hslToNumeric(lineHue, 100, lightness.stroke),
          alpha: 0.85 * fadeAlpha * alphaMult,
          width: 4,
          cap: 'round',
        });
      }
      break;
    }
  }
}

/**
 * Draw mouth effects
 * Effect 0: None
 * Effect 1: Breath Pulse - expanding colorful rings that fade
 * Effect 2: Soft Glow - filled ellipse with ring at mouth
 * Effect 3: Particle Whisper - colorful drifting particles + base indicator
 */
function drawMouthEffects(
  api: ActorUpdateAPI,
  face: TrackedFace,
  width: number,
  height: number,
  fadeAlpha: number,
  isDarkMode: boolean
): void {
  if (!face.landmarks || face.mouthEffect === 0) return;

  const mx = face.landmarks.mouth.x * width;
  const my = face.landmarks.mouth.y * height;
  const mouthSize = face.size * Math.min(width, height) * 0.14;
  const lightness = getFeatureLightness(isDarkMode);
  const alphaMult = getAlphaMultiplier(isDarkMode);

  switch (face.mouthEffect) {
    case 1: {
      // Breath Pulse - multiple expanding rings that fade
      const numRings = 3;
      for (let r = 0; r < numRings; r++) {
        const phaseOffset = (r * Math.PI * 2) / numRings;
        const pulsePhase = ((face.mouthPhase + phaseOffset) % (Math.PI * 2)) / (Math.PI * 2);
        const pulseRadius = mouthSize * (0.5 + pulsePhase * 3);
        const pulseAlpha = (1 - pulsePhase) * 0.8 * fadeAlpha * alphaMult;
        const ringHue = MOUTH_HUE + r * 20;

        if (pulseRadius >= 2 && pulseAlpha > 0.08) {
          api.brush.circle(mx, my, pulseRadius, {
            stroke: hslToNumeric(ringHue, 100, lightness.stroke + 5),
            strokeWidth: 4,
            alpha: pulseAlpha,
            blendMode: 'normal',
          });
        }
      }
      break;
    }

    case 2: {
      // Soft Glow - wide ellipse (horizontal) with ring
      const pulseScale = 0.9 + 0.12 * Math.sin(face.mouthPhase * 1.5);

      // Outer ring
      api.brush.ellipse(mx, my, mouthSize * 1.6 * pulseScale, mouthSize * 0.9 * pulseScale, {
        stroke: hslToNumeric(MOUTH_HUE, 100, lightness.stroke),
        strokeWidth: 4,
        alpha: 0.8 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });
      // Inner fill
      api.brush.ellipse(mx, my, mouthSize * 1.1 * pulseScale, mouthSize * 0.6 * pulseScale, {
        fill: hslToNumeric(MOUTH_HUE + 25, 100, lightness.fill),
        alpha: 0.75 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });
      break;
    }

    case 3: {
      // Particle Whisper - colorful drifting particles + base dot
      // Draw base indicator at mouth
      api.brush.circle(mx, my, mouthSize * 0.5, {
        fill: hslToNumeric(MOUTH_HUE, 100, lightness.stroke + 5),
        alpha: 0.7 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });

      // Spawn drifting particles
      const spawnChance = 0.12 * fadeAlpha;
      if (Math.random() < spawnChance) {
        const particle = state.featureParticles.find(p => !p.active);
        if (particle) {
          // Particles drift upward and outward
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.7;
          const speed = 0.0015 + Math.random() * 0.002;
          initFeatureParticle(
            particle,
            face.id,
            'mouth',
            face.landmarks.mouth.x,
            face.landmarks.mouth.y,
            MOUTH_HUE + Math.random() * 40,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed
          );
        }
      }
      break;
    }
  }
}

/**
 * Draw ear effects - always in pairs
 * Effect 0: None
 * Effect 1: Small Accents - decorative rings at ear positions
 * Effect 2: Connecting Arc - curved line behind head with end dots
 * Effect 3: Pulsing Dots - colorful circles that pulse in sync
 */
function drawEarEffects(
  api: ActorUpdateAPI,
  face: TrackedFace,
  width: number,
  height: number,
  fadeAlpha: number,
  isDarkMode: boolean
): void {
  if (!face.landmarks || face.earEffect === 0) return;

  const leftX = face.landmarks.leftEar.x * width;
  const leftY = face.landmarks.leftEar.y * height;
  const rightX = face.landmarks.rightEar.x * width;
  const rightY = face.landmarks.rightEar.y * height;
  const earSize = face.size * Math.min(width, height) * 0.1;
  const lightness = getFeatureLightness(isDarkMode);
  const alphaMult = getAlphaMultiplier(isDarkMode);

  switch (face.earEffect) {
    case 1: {
      // Small Accents - decorative rings with inner fill
      const pulseScale = 0.9 + 0.15 * Math.sin(face.earPhase * 1.5);

      // Left ear
      api.brush.circle(leftX, leftY, earSize * 1.2 * pulseScale, {
        stroke: hslToNumeric(EAR_HUE, 100, lightness.stroke),
        strokeWidth: 4,
        alpha: 0.8 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });
      api.brush.circle(leftX, leftY, earSize * 0.6 * pulseScale, {
        fill: hslToNumeric(EAR_HUE + 30, 100, lightness.fill),
        alpha: 0.85 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });

      // Right ear
      api.brush.circle(rightX, rightY, earSize * 1.2 * pulseScale, {
        stroke: hslToNumeric(EAR_HUE, 100, lightness.stroke),
        strokeWidth: 4,
        alpha: 0.8 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });
      api.brush.circle(rightX, rightY, earSize * 0.6 * pulseScale, {
        fill: hslToNumeric(EAR_HUE + 30, 100, lightness.fill),
        alpha: 0.85 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });
      break;
    }

    case 2: {
      // Connecting Arc - curved line behind head with end dots
      const midX = (leftX + rightX) / 2;
      const waveOffset = earSize * 3 * (1 + 0.3 * Math.sin(face.earPhase * 0.5));
      const midY = (leftY + rightY) / 2 - waveOffset;

      // End dots at ears
      api.brush.circle(leftX, leftY, earSize * 0.7, {
        fill: hslToNumeric(EAR_HUE + 40, 100, lightness.stroke + 5),
        alpha: 0.9 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });
      api.brush.circle(rightX, rightY, earSize * 0.7, {
        fill: hslToNumeric(EAR_HUE + 40, 100, lightness.stroke + 5),
        alpha: 0.9 * fadeAlpha * alphaMult,
        blendMode: 'normal',
      });

      // Connecting arc
      api.brush.quadratic(
        { x: leftX, y: leftY },
        { x: midX, y: midY },
        { x: rightX, y: rightY },
        {
          color: hslToNumeric(EAR_HUE, 100, lightness.stroke - 5),
          alpha: 0.85 * fadeAlpha * alphaMult,
          width: 5,
          cap: 'round',
        }
      );
      break;
    }

    case 3: {
      // Pulsing Dots - colorful circles that pulse in sync (alternating sizes)
      const pulseScale1 = 0.6 + 0.5 * Math.sin(face.earPhase);
      const pulseScale2 = 0.6 + 0.5 * Math.sin(face.earPhase + Math.PI); // Opposite phase
      const dotSize1 = earSize * (0.8 + pulseScale1 * 0.6);
      const dotSize2 = earSize * (0.8 + pulseScale2 * 0.6);
      const pulseAlpha = (0.75 + 0.2 * Math.sin(face.earPhase)) * fadeAlpha * alphaMult;

      if (dotSize1 >= 2 && dotSize2 >= 2) {
        api.brush.circle(leftX, leftY, dotSize1, {
          fill: hslToNumeric(EAR_HUE, 100, lightness.stroke),
          alpha: pulseAlpha,
          blendMode: 'normal',
        });
        api.brush.circle(leftX, leftY, dotSize1 * 0.4, {
          fill: hslToNumeric(EAR_HUE + 60, 100, lightness.fill + 5),
          alpha: pulseAlpha,
          blendMode: 'normal',
        });

        api.brush.circle(rightX, rightY, dotSize2, {
          fill: hslToNumeric(EAR_HUE, 100, lightness.stroke),
          alpha: pulseAlpha,
          blendMode: 'normal',
        });
        api.brush.circle(rightX, rightY, dotSize2 * 0.4, {
          fill: hslToNumeric(EAR_HUE + 60, 100, lightness.fill + 5),
          alpha: pulseAlpha,
          blendMode: 'normal',
        });
      }
      break;
    }
  }
}

/**
 * Update and draw feature particles
 */
function updateAndDrawFeatureParticles(
  api: ActorUpdateAPI,
  width: number,
  height: number,
  dt: number,
  isDarkMode: boolean
): void {
  const lightness = getFeatureLightness(isDarkMode);
  const alphaMult = getAlphaMultiplier(isDarkMode);

  for (let i = 0; i < state.featureParticles.length; i++) {
    const particle = state.featureParticles[i];
    if (!particle.active) continue;

    particle.lifetime += dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;

    // Fade out with higher base alpha for visibility
    const lifeProgress = particle.lifetime / particle.maxLifetime;
    particle.alpha = (1 - lifeProgress) * 0.85 * alphaMult;

    // Skip drawing if too faint
    if (particle.alpha < 0.1) {
      particle.active = false;
      continue;
    }

    // Draw particle with larger size for visibility
    const px = particle.x * width;
    const py = particle.y * height;
    const pSize = particle.size * Math.min(width, height) * 1.5;

    // Use vibrant colors based on feature type
    api.brush.circle(px, py, pSize, {
      fill: hslToNumeric(particle.hue, 100, lightness.stroke + 5),
      alpha: particle.alpha,
      blendMode: 'normal',
    });

    // Deactivate when done
    if (particle.lifetime >= particle.maxLifetime) {
      particle.active = false;
    }
  }
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
        // Feature effects
        eyeEffect: 0,
        noseEffect: 0,
        mouthEffect: 0,
        earEffect: 0,
        eyePhase: 0,
        nosePhase: 0,
        mouthPhase: 0,
        earPhase: 0,
        landmarks: null,
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

    // Pre-allocate feature particles pool
    state.featureParticles = new Array(MAX_FEATURE_PARTICLES);
    for (let i = 0; i < MAX_FEATURE_PARTICLES; i++) {
      state.featureParticles[i] = {
        active: false,
        faceId: 0,
        featureType: 'eye',
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

    // Pre-allocate active faces cache (reused each frame to avoid allocation)
    state.activeFacesCache = new Array(MAX_TRACKED_FACES);

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

    // Get display mode for color/alpha adjustments
    const isDarkMode = api.context.display.isDarkMode();
    const EMOTION_COLORS = getEmotionColors(isDarkMode);
    const alphaMult = getAlphaMultiplier(isDarkMode);

    state.globalPhase += dt * 0.002;

    // ============ Check video availability ============

    state.videoAvailable = api.context.video.isAvailable();
    state.videoDimensions = api.context.video.getDimensions();

    let detectedFaces: FaceData[] = [];

    if (state.videoAvailable) {
      detectedFaces = api.context.video.getFaces();
    }

    // ============ Update tracked faces from detections ============

    // Face bounds from VideoProvider are already mapped to canvas coordinates
    // (like motion regions in motion-ghost), so normalize using canvas dimensions
    if (detectedFaces.length > 0) {
      for (const detection of detectedFaces) {
        // Calculate face center (normalized 0-1 using canvas dimensions)
        // Face bounds are already in canvas space from VideoProvider
        const centerX = (detection.bounds.x + detection.bounds.width / 2) / width;
        const centerY = (detection.bounds.y + detection.bounds.height / 2) / height;
        const faceSize = Math.max(detection.bounds.width, detection.bounds.height) / Math.min(width, height);

        // Try to match with existing tracked face
        let matched = false;
        let matchedTracked: TrackedFace | undefined;
        for (const tracked of state.trackedFaces) {
          if (!tracked.active) continue;

          const dist = Math.hypot(tracked.x - centerX, tracked.y - centerY);
          if (dist < 0.2) {
            matchedTracked = tracked;
            matched = true;
            break;
          }
        }

        // Infer emotion from landmarks and movement (MediaPipe doesn't provide emotions)
        const emotion = inferEmotionFromLandmarks(
          centerX, centerY, faceSize, detection, matchedTracked, width, height
        );

        if (matched && matchedTracked) {
          // Update existing face
          matchedTracked.targetX = centerX;
          matchedTracked.targetY = centerY;
          matchedTracked.targetSize = faceSize;
          matchedTracked.emotion = emotion;
          matchedTracked.lastSeen = time;
          matchedTracked.fadeProgress = 0;

          // Update landmarks (smoothed)
          if (detection.landmarks) {
            const lm = detection.landmarks;
            if (!matchedTracked.landmarks) {
              console.log(`[face-reactor] Face ${matchedTracked.id} received landmarks - feature effects will now render`);
              matchedTracked.landmarks = {
                leftEye: { x: lm.leftEye.x / width, y: lm.leftEye.y / height },
                rightEye: { x: lm.rightEye.x / width, y: lm.rightEye.y / height },
                nose: { x: lm.noseTip.x / width, y: lm.noseTip.y / height },
                mouth: { x: lm.mouth.x / width, y: lm.mouth.y / height },
                leftEar: { x: lm.leftEarTragion.x / width, y: lm.leftEarTragion.y / height },
                rightEar: { x: lm.rightEarTragion.x / width, y: lm.rightEarTragion.y / height },
              };
            } else {
              // Smooth landmark positions (lerp factor 0.15)
              const lerp = 0.15;
              matchedTracked.landmarks.leftEye.x += (lm.leftEye.x / width - matchedTracked.landmarks.leftEye.x) * lerp;
              matchedTracked.landmarks.leftEye.y += (lm.leftEye.y / height - matchedTracked.landmarks.leftEye.y) * lerp;
              matchedTracked.landmarks.rightEye.x += (lm.rightEye.x / width - matchedTracked.landmarks.rightEye.x) * lerp;
              matchedTracked.landmarks.rightEye.y += (lm.rightEye.y / height - matchedTracked.landmarks.rightEye.y) * lerp;
              matchedTracked.landmarks.nose.x += (lm.noseTip.x / width - matchedTracked.landmarks.nose.x) * lerp;
              matchedTracked.landmarks.nose.y += (lm.noseTip.y / height - matchedTracked.landmarks.nose.y) * lerp;
              matchedTracked.landmarks.mouth.x += (lm.mouth.x / width - matchedTracked.landmarks.mouth.x) * lerp;
              matchedTracked.landmarks.mouth.y += (lm.mouth.y / height - matchedTracked.landmarks.mouth.y) * lerp;
              matchedTracked.landmarks.leftEar.x += (lm.leftEarTragion.x / width - matchedTracked.landmarks.leftEar.x) * lerp;
              matchedTracked.landmarks.leftEar.y += (lm.leftEarTragion.y / height - matchedTracked.landmarks.leftEar.y) * lerp;
              matchedTracked.landmarks.rightEar.x += (lm.rightEarTragion.x / width - matchedTracked.landmarks.rightEar.x) * lerp;
              matchedTracked.landmarks.rightEar.y += (lm.rightEarTragion.y / height - matchedTracked.landmarks.rightEar.y) * lerp;
            }
          }
        } else {
          // Create new tracked face
          const newFace = state.trackedFaces.find(f => !f.active);
          if (newFace) {
            initTrackedFace(newFace, state.nextFaceId++, centerX, centerY, faceSize, emotion);
            newFace.lastSeen = time;

            // Initialize landmarks if available
            if (detection.landmarks) {
              const lm = detection.landmarks;
              newFace.landmarks = {
                leftEye: { x: lm.leftEye.x / width, y: lm.leftEye.y / height },
                rightEye: { x: lm.rightEye.x / width, y: lm.rightEye.y / height },
                nose: { x: lm.noseTip.x / width, y: lm.noseTip.y / height },
                mouth: { x: lm.mouth.x / width, y: lm.mouth.y / height },
                leftEar: { x: lm.leftEarTragion.x / width, y: lm.leftEarTragion.y / height },
                rightEar: { x: lm.rightEarTragion.x / width, y: lm.rightEarTragion.y / height },
              };
            }
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

      // Update emotion color (with defensive fallback)
      const targetColor = EMOTION_COLORS[face.emotion] || EMOTION_COLORS.neutral;
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

      // ============ Draw face trail ============
      // Mode-aware lightness for trail
      const trailLightness = isDarkMode ? 55 : 35;

      if (face.trailLength > 2) {
        for (let t = 0; t < face.trailLength - 1; t++) {
          const idx = (face.trailHead - face.trailLength + t + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS;
          const nextIdx = (idx + 1) % MAX_TRAIL_POINTS;

          const p1 = face.trail[idx];
          const p2 = face.trail[nextIdx];

          const trailAlpha = (t / face.trailLength) * 0.4 * fadeAlpha * alphaMult;

          api.brush.line(
            p1.x * width, p1.y * height,
            p2.x * width, p2.y * height,
            {
              color: hslToNumeric(face.auraHue, 90, trailLightness),
              alpha: trailAlpha,
              width: 3 + (t / face.trailLength) * 5,
              cap: 'round',
              blendMode: 'normal',
            }
          );
        }
      }

      // ============ Draw aura glow layers ============
      // Mode-aware lightness for aura glow
      const auraLightnessInner = isDarkMode ? 65 : 40;
      const auraLightnessMid = isDarkMode ? 55 : 35;
      const auraLightnessOuter = isDarkMode ? 50 : 30;

      const glowLayers = 3;
      for (let g = glowLayers - 1; g >= 0; g--) {
        const glowRadius = faceRadius * (1.3 + g * 0.35);
        const glowAlpha = (0.25 - g * 0.06) * fadeAlpha * alphaMult;

        // Gradient coordinates must be relative (0-1 range), not absolute pixels
        const glowGradient: Gradient = {
          type: 'radial',
          cx: 0.5,
          cy: 0.5,
          radius: 0.5,
          stops: [
            { offset: 0, color: hslToRgba(face.auraHue, 90, auraLightnessInner, glowAlpha) },
            { offset: 0.5, color: hslToRgba(face.auraHue, 85, auraLightnessMid, glowAlpha * 0.5) },
            { offset: 1, color: hslToRgba(face.auraHue, 80, auraLightnessOuter, 0) },
          ],
        };

        api.brush.circle(cx, cy, glowRadius, {
          fill: glowGradient,
          blendMode: 'normal',
        });
      }

      // ============ Draw orbiting curves using quadratic bezier ============
      const orbitRadius = faceRadius * 1.3;
      const curveCount = 5;
      const curveLightness = isDarkMode ? 55 : 35;

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

        const curveHue = face.auraHue + c * 20;
        const curveAlpha = 0.55 * fadeAlpha * alphaMult;

        api.brush.quadratic(
          { x: startX, y: startY },
          { x: controlX, y: controlY },
          { x: endX, y: endY },
          {
            color: hslToNumeric(curveHue, 90, curveLightness),
            alpha: curveAlpha,
            width: 4,
            cap: 'round',
          }
        );
      }

      // ============ Draw inner glow circle ============
      // Mode-aware lightness for inner glow
      const innerLightnessCore = isDarkMode ? 75 : 45;
      const innerLightnessMid = isDarkMode ? 60 : 40;
      const innerLightnessEdge = isDarkMode ? 55 : 35;

      // Gradient coordinates must be relative (0-1 range), not absolute pixels
      const innerGradient: Gradient = {
        type: 'radial',
        cx: 0.5,
        cy: 0.5,
        radius: 0.5,
        stops: [
          { offset: 0, color: hslToRgba(face.auraHue, 95, innerLightnessCore, 0.6 * fadeAlpha * alphaMult) },
          { offset: 0.6, color: hslToRgba(face.auraHue, 90, innerLightnessMid, 0.35 * fadeAlpha * alphaMult) },
          { offset: 1, color: hslToRgba(face.auraHue, 85, innerLightnessEdge, 0) },
        ],
      };

      // Only draw inner gradient if radius is large enough to avoid texture matrix errors
      const innerRadius = faceRadius * 0.7;
      if (innerRadius >= 5) {
        api.brush.circle(cx, cy, innerRadius, {
          fill: innerGradient,
          blendMode: 'normal',
        });
      }

      // ============ Spawn aura particles ============
      const spawnChance = 0.1 * fadeAlpha;
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
    const particleLightness = isDarkMode ? 60 : 35;

    for (let i = 0; i < state.auraParticles.length; i++) {
      const particle = state.auraParticles[i];
      if (!particle.active) continue;

      particle.lifetime += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

      // Fade out
      const lifeProgress = particle.lifetime / particle.maxLifetime;
      particle.alpha = (1 - lifeProgress) * 0.6 * alphaMult;

      // Draw particle
      const px = particle.x * width;
      const py = particle.y * height;
      const pSize = particle.size * Math.min(width, height);

      api.brush.circle(px, py, pSize, {
        fill: hslToNumeric(particle.hue, 100, particleLightness),
        alpha: particle.alpha,
        blendMode: 'normal',
      });

      // Deactivate when done
      if (particle.lifetime >= particle.maxLifetime) {
        particle.active = false;
      }
    }

    // ============ Draw facial feature effects ============

    for (const face of state.trackedFaces) {
      if (!face.active) continue;
      const fadeAlpha = 1 - face.fadeProgress;

      // Update feature phases
      face.eyePhase += dt * 0.003;
      face.nosePhase += dt * 0.002;  // Slower for breathing effect
      face.mouthPhase += dt * 0.0025;
      face.earPhase += dt * 0.002;

      // Draw feature effects
      drawEyeEffects(api, face, width, height, fadeAlpha, isDarkMode);
      drawNoseEffects(api, face, width, height, fadeAlpha, isDarkMode);
      drawMouthEffects(api, face, width, height, fadeAlpha, isDarkMode);
      drawEarEffects(api, face, width, height, fadeAlpha, isDarkMode);
    }

    // Update and draw feature particles
    updateAndDrawFeatureParticles(api, width, height, dt, isDarkMode);

    // ============ Draw connecting lines between faces ============

    // Build active faces list without allocation (reuse pre-allocated cache)
    let activeFaceCount = 0;
    for (let i = 0; i < state.trackedFaces.length && activeFaceCount < state.activeFacesCache.length; i++) {
      if (state.trackedFaces[i].active) {
        state.activeFacesCache[activeFaceCount++] = state.trackedFaces[i];
      }
    }

    if (activeFaceCount >= 2) {
      const connectLightness = isDarkMode ? 60 : 35;

      for (let i = 0; i < activeFaceCount - 1; i++) {
        const f1 = state.activeFacesCache[i];
        const f2 = state.activeFacesCache[i + 1];

        const x1 = f1.x * width;
        const y1 = f1.y * height;
        const x2 = f2.x * width;
        const y2 = f2.y * height;

        const dist = Math.hypot(x2 - x1, y2 - y1);
        if (dist < width * 0.5) {
          const connectAlpha = 0.2 * (1 - dist / (width * 0.5)) * alphaMult;
          const avgHue = (f1.auraHue + f2.auraHue) / 2;

          // Draw connecting curve
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2 - 30 * Math.sin(state.globalPhase);

          api.brush.quadratic(
            { x: x1, y: y1 },
            { x: midX, y: midY },
            { x: x2, y: y2 },
            {
              color: hslToNumeric(avgHue, 60, connectLightness),
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
    // Use very low intensity to avoid edge clipping and white blowout
    // In light mode, use a darker glow for contrast
    const activeHue = state.trackedFaces.find(f => f.active)?.auraHue || 0;
    const glowLightness = isDarkMode ? 50 : 30;
    const glowAlpha = isDarkMode ? 0.1 : 0.08;
    api.filter.glow(
      hslToRgba(activeHue, 50, glowLightness, glowAlpha),
      0.05,  // Very subtle outer strength
      4      // Small distance
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

    // Deactivate all feature particles
    for (const particle of state.featureParticles) {
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
