/**
 * Social Pulse Actor
 *
 * Visualizes audience engagement and social media activity:
 * - Floating words from trending keywords
 * - Colors shift based on sentiment (-1 to +1)
 * - Particle density scales with viewer count
 * - Explosions on viral moments
 *
 * Falls back to simulated social data when unavailable.
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'social-pulse',
  name: 'Social Pulse',
  description: 'Visualizes social engagement with floating words',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['social', 'text', 'interactive', 'engagement', 'community'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['social'],
};

interface RGB {
  r: number;
  g: number;
  b: number;
}

// Floating word for pre-allocation
interface FloatingWord {
  active: boolean;
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  rotation: number;
  rotationSpeed: number;
  lifetime: number;
  maxLifetime: number;
  pattern: 'float' | 'spiral' | 'wave' | 'explode';
  patternPhase: number;
}

// Explosion particle for viral moments
interface ExplosionParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: RGB;
  lifetime: number;
}

// Animation patterns
type WordPattern = 'float' | 'spiral' | 'wave' | 'explode';

// Simulated keywords for fallback
const SIMULATED_KEYWORDS = [
  'art', 'creative', 'beautiful', 'amazing', 'love',
  'inspire', 'color', 'flow', 'dream', 'magic',
  'wonder', 'peace', 'joy', 'light', 'energy',
  'cosmic', 'ethereal', 'vibrant', 'serene', 'bold',
];

interface SocialState {
  words: FloatingWord[];
  explosionParticles: ExplosionParticle[];
  canvasWidth: number;
  canvasHeight: number;
  currentSentiment: number;
  targetSentiment: number;
  viewerCount: number;
  maxVisibleWords: number;
  explosionParticleCount: number;
  isViralMoment: boolean;
  viralCooldown: number;
  time: number;
  // Simulated data
  simulatedSentiment: number;
  simulatedViewers: number;
  lastKeywordTime: number;
}

const MAX_WORDS = 30;
const MAX_EXPLOSION_PARTICLES = 50;

let state: SocialState = {
  words: [],
  explosionParticles: [],
  canvasWidth: 0,
  canvasHeight: 0,
  currentSentiment: 0,
  targetSentiment: 0,
  viewerCount: 0,
  maxVisibleWords: 20,
  explosionParticleCount: 30,
  isViralMoment: false,
  viralCooldown: 0,
  time: 0,
  simulatedSentiment: 0,
  simulatedViewers: 50,
  lastKeywordTime: 0,
};

function rgbToNumeric(color: RGB): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

// Convert HSL to numeric color for color cycling
function hslToNumeric(h: number, s: number, l: number): number {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

// Helper to convert numeric color to RGB object for lerpColor
function numericToRgb(color: number): RGB {
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
  };
}

// Get color based on sentiment (-1 to +1)
function getSentimentColor(sentiment: number): RGB {
  const negative: RGB = { r: 255, g: 80, b: 80 };   // Red
  const neutral: RGB = { r: 255, g: 255, b: 255 };  // White
  const positive: RGB = { r: 80, g: 220, b: 255 };  // Cyan

  if (sentiment < 0) {
    return lerpColor(negative, neutral, sentiment + 1);
  } else {
    return lerpColor(neutral, positive, sentiment);
  }
}

function createFloatingWord(): FloatingWord {
  return {
    active: false,
    text: '',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 20,
    alpha: 1,
    rotation: 0,
    rotationSpeed: 0,
    lifetime: 0,
    maxLifetime: 5,
    pattern: 'float',
    patternPhase: 0,
  };
}

function createExplosionParticle(): ExplosionParticle {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 5,
    alpha: 1,
    color: { r: 255, g: 255, b: 255 },
    lifetime: 0,
  };
}

function spawnWord(text: string): void {
  // Find inactive word
  let word: FloatingWord | null = null;
  for (let i = 0; i < MAX_WORDS; i++) {
    if (!state.words[i].active) {
      word = state.words[i];
      break;
    }
  }
  if (!word) return;

  // Random pattern
  const patterns: WordPattern[] = ['float', 'spiral', 'wave', 'explode'];
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];

  word.active = true;
  word.text = text;
  word.size = 12 + Math.random() * 36;
  word.alpha = 0; // Fade in
  word.rotation = (Math.random() - 0.5) * 0.3;
  word.rotationSpeed = (Math.random() - 0.5) * 0.5;
  word.lifetime = 0;
  word.maxLifetime = 4 + Math.random() * 4;
  word.pattern = pattern;
  word.patternPhase = Math.random() * Math.PI * 2;

  // Starting position based on pattern
  switch (pattern) {
    case 'float':
      word.x = Math.random() * state.canvasWidth;
      word.y = state.canvasHeight + 50;
      word.vx = (Math.random() - 0.5) * 20;
      word.vy = -30 - Math.random() * 30;
      break;
    case 'spiral':
      word.x = state.canvasWidth / 2;
      word.y = state.canvasHeight / 2;
      word.vx = 0;
      word.vy = 0;
      break;
    case 'wave':
      word.x = -50;
      word.y = state.canvasHeight * (0.3 + Math.random() * 0.4);
      word.vx = 50 + Math.random() * 50;
      word.vy = 0;
      break;
    case 'explode':
      word.x = state.canvasWidth / 2;
      word.y = state.canvasHeight / 2;
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 100;
      word.vx = Math.cos(angle) * speed;
      word.vy = Math.sin(angle) * speed;
      break;
  }
}

function triggerViralExplosion(): void {
  const cx = state.canvasWidth / 2;
  const cy = state.canvasHeight / 2;
  const sentimentColor = getSentimentColor(state.currentSentiment);

  for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) {
    const particle = state.explosionParticles[i];
    particle.active = true;
    particle.x = cx + (Math.random() - 0.5) * 50;
    particle.y = cy + (Math.random() - 0.5) * 50;

    const angle = Math.random() * Math.PI * 2;
    const speed = 100 + Math.random() * 200;
    particle.vx = Math.cos(angle) * speed;
    particle.vy = Math.sin(angle) * speed;

    particle.size = 3 + Math.random() * 8;
    particle.alpha = 1;
    particle.color = sentimentColor;
    particle.lifetime = 0;
  }
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    state.canvasWidth = width;
    state.canvasHeight = height;

    // Random settings
    state.maxVisibleWords = 10 + Math.floor(Math.random() * 20);
    state.explosionParticleCount = 20 + Math.floor(Math.random() * 30);

    // Pre-allocate words
    state.words = [];
    for (let i = 0; i < MAX_WORDS; i++) {
      state.words.push(createFloatingWord());
    }

    // Pre-allocate explosion particles
    state.explosionParticles = [];
    for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) {
      state.explosionParticles.push(createExplosionParticle());
    }

    state.currentSentiment = 0;
    state.targetSentiment = 0;
    state.viewerCount = 0;
    state.isViralMoment = false;
    state.viralCooldown = 0;
    state.time = 0;
    state.simulatedSentiment = 0;
    state.simulatedViewers = 30 + Math.floor(Math.random() * 50);
    state.lastKeywordTime = 0;

    console.log(
      `[social-pulse] Setup: maxWords=${state.maxVisibleWords}, particles=${state.explosionParticleCount}`
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    state.time += dt;
    state.viralCooldown = Math.max(0, state.viralCooldown - dt);

    // Get social data (or simulate)
    let sentiment: number;
    let viewerCount: number;
    let keywords: string[];
    let isViral: boolean;

    try {
      sentiment = api.context.social.sentiment();
      viewerCount = api.context.social.viewerCount();
      keywords = api.context.social.trendingKeywords();
      isViral = api.context.social.isViralMoment();
    } catch {
      // Simulate social data
      state.simulatedSentiment += (Math.random() - 0.5) * 0.1;
      state.simulatedSentiment = Math.max(-1, Math.min(1, state.simulatedSentiment));
      state.simulatedViewers += Math.floor((Math.random() - 0.5) * 10);
      state.simulatedViewers = Math.max(10, Math.min(200, state.simulatedViewers));

      sentiment = state.simulatedSentiment;
      viewerCount = state.simulatedViewers;
      keywords = [];
      isViral = Math.random() < 0.001; // Rare simulated viral moment
    }

    // Smooth sentiment transition
    state.targetSentiment = sentiment;
    state.currentSentiment += (state.targetSentiment - state.currentSentiment) * dt * 2;
    state.viewerCount = viewerCount;

    // Spawn words from keywords or simulated
    if (state.time - state.lastKeywordTime > 0.5) {
      const useKeywords = keywords.length > 0 ? keywords : SIMULATED_KEYWORDS;
      const word = useKeywords[Math.floor(Math.random() * useKeywords.length)];
      spawnWord(word);
      state.lastKeywordTime = state.time;
    }

    // Handle viral moment
    if (isViral && state.viralCooldown <= 0) {
      state.isViralMoment = true;
      state.viralCooldown = 5; // 5 second cooldown
      triggerViralExplosion();
    }

    // Get current sentiment color
    const sentimentColor = getSentimentColor(state.currentSentiment);
    const sentimentColorNumeric = rgbToNumeric(sentimentColor);

    // Draw ambient glow based on sentiment
    const glowRadius = Math.min(state.canvasWidth, state.canvasHeight) * 0.6;
    api.brush.circle(state.canvasWidth / 2, state.canvasHeight / 2, glowRadius, {
      fill: sentimentColorNumeric,
      alpha: 0.05,
      blendMode: 'add',
    });

    // Update and draw floating words
    let activeWordCount = 0;
    for (let i = 0; i < MAX_WORDS; i++) {
      const word = state.words[i];
      if (!word.active) continue;
      activeWordCount++;

      word.lifetime += dt;

      // Check expiration
      if (word.lifetime >= word.maxLifetime) {
        word.active = false;
        continue;
      }

      // Fade in/out
      const lifeProgress = word.lifetime / word.maxLifetime;
      if (lifeProgress < 0.1) {
        word.alpha = lifeProgress / 0.1;
      } else if (lifeProgress > 0.8) {
        word.alpha = (1 - lifeProgress) / 0.2;
      } else {
        word.alpha = 1;
      }

      // Update position based on pattern
      switch (word.pattern) {
        case 'float':
          word.x += word.vx * dt;
          word.y += word.vy * dt;
          break;
        case 'spiral':
          const spiralRadius = word.lifetime * 30;
          const spiralAngle = word.lifetime * 2 + word.patternPhase;
          word.x = state.canvasWidth / 2 + Math.cos(spiralAngle) * spiralRadius;
          word.y = state.canvasHeight / 2 + Math.sin(spiralAngle) * spiralRadius;
          break;
        case 'wave':
          word.x += word.vx * dt;
          word.y += Math.sin(word.x * 0.02 + word.patternPhase) * 2;
          break;
        case 'explode':
          word.vx *= 0.98;
          word.vy *= 0.98;
          word.x += word.vx * dt;
          word.y += word.vy * dt;
          break;
      }

      word.rotation += word.rotationSpeed * dt;

      // Color cycling: hue shifts each frame for vibrant effect
      const hueShift = (frame.frameCount * 3 + i * 30) % 360;
      const cycleColorNumeric = hslToNumeric(hueShift / 360, 0.7, 0.6);
      const cycleColor = numericToRgb(cycleColorNumeric);

      // Blend between sentiment color and cycling color
      const wordColor = lerpColor(sentimentColor, cycleColor, 0.6);
      const wordColorNumeric = rgbToNumeric(wordColor);

      api.brush.pushMatrix();
      api.brush.translate(word.x, word.y);
      api.brush.rotate(word.rotation);

      // Main text only (no ghost/glow)
      api.brush.text(word.text, 0, 0, {
        fontSize: word.size,
        fill: wordColorNumeric,
        alpha: word.alpha,
        align: 'center',
        baseline: 'middle',
      });

      api.brush.popMatrix();
    }

    // Update and draw explosion particles
    for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) {
      const particle = state.explosionParticles[i];
      if (!particle.active) continue;

      particle.lifetime += dt;

      // Expire after 2 seconds
      if (particle.lifetime >= 2) {
        particle.active = false;
        continue;
      }

      // Update
      particle.vy += 100 * dt; // Gravity
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.alpha = 1 - particle.lifetime / 2;

      // Draw
      api.brush.circle(particle.x, particle.y, particle.size * particle.alpha, {
        fill: rgbToNumeric(particle.color),
        alpha: particle.alpha,
        blendMode: 'add',
      });
    }

    // Draw viewer count indicator (subtle bar at bottom)
    const maxViewers = 200;
    const viewerProgress = Math.min(state.viewerCount / maxViewers, 1);
    const barHeight = 4;
    const barWidth = state.canvasWidth * viewerProgress;

    api.brush.rect(0, state.canvasHeight - barHeight, barWidth, barHeight, {
      fill: sentimentColorNumeric,
      alpha: 0.3,
    });

    // Sentiment indicator (subtle arc at top)
    const arcCenterX = state.canvasWidth / 2;
    const arcRadius = 30;
    const arcAngle = (state.currentSentiment + 1) / 2 * Math.PI; // 0 to PI

    api.brush.arc(arcCenterX, 20, arcRadius, Math.PI, Math.PI + arcAngle, {
      color: sentimentColorNumeric,
      alpha: 0.5,
      width: 3,
    });

    // Apply glow filter on viral moments
    if (state.isViralMoment && state.viralCooldown > 4) {
      api.filter.glow(sentimentColorNumeric, 0.5, 30);
    }

    state.isViralMoment = false;
  },

  async teardown(): Promise<void> {
    for (let i = 0; i < MAX_WORDS; i++) {
      state.words[i].active = false;
    }
    for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) {
      state.explosionParticles[i].active = false;
    }
    state.time = 0;
    console.log('[social-pulse] Teardown complete');
  },
};

registerActor(actor);

export default actor;
