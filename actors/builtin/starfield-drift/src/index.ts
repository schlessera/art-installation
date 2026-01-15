/**
 * Starfield Drift Background Actor
 *
 * Simple dots with gentle parallax movement creating a star field effect.
 * Multiple depth layers drift at different speeds.
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
  id: 'starfield-drift',
  name: 'Starfield Drift',
  description: 'Simple dots with gentle parallax movement',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['background', 'stars', 'ambient', 'space'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  role: 'background',
};

// Color palettes - dark mode (original)
interface StarPalette {
  name: string;
  background: number;
  starColors: number[];
}

const DARK_PALETTES: StarPalette[] = [
  {
    name: 'Night Sky',
    background: 0x050510,
    starColors: [0xffffff, 0xaaccff, 0xffccaa],
  },
  {
    name: 'Deep Space',
    background: 0x000005,
    starColors: [0xffffff, 0x8888ff, 0xff8888],
  },
  {
    name: 'Nebula',
    background: 0x0a0515,
    starColors: [0xffffff, 0xff88ff, 0x88ffff],
  },
  {
    name: 'Warm',
    background: 0x100805,
    starColors: [0xffffff, 0xffcc88, 0xffaa66],
  },
];

// Color palettes - light mode (inverted)
const LIGHT_PALETTES: StarPalette[] = [
  {
    name: 'Day Sky',
    background: 0xf0f0f8,
    starColors: [0x202030, 0x334488, 0x553322],
  },
  {
    name: 'Bright Space',
    background: 0xf5f5fa,
    starColors: [0x101020, 0x333388, 0x883333],
  },
  {
    name: 'Light Nebula',
    background: 0xf5f0f8,
    starColors: [0x201520, 0x663366, 0x226666],
  },
  {
    name: 'Cool',
    background: 0xf8f5f0,
    starColors: [0x201510, 0x664422, 0x553311],
  },
];

const STAR_COUNTS = [40, 50, 60];
const DEPTH_LAYERS = 3;
const BASE_SPEED = 0.008; // Pixels per ms
const TWINKLE_SPEED = 0.003; // Radians per ms

interface Star {
  x: number;
  y: number;
  size: number;
  color: number;
  layer: number; // 0 = far (slow), 2 = near (fast)
  twinklePhase: number;
  twinkleAmount: number; // 0 = no twinkle
}

interface State {
  darkPalette: StarPalette;
  lightPalette: StarPalette;
  paletteIndex: number;
  stars: Star[];
  driftAngle: number;
  canvasWidth: number;
  canvasHeight: number;
}

let state: State;

function initStar(star: Star, width: number, height: number, colorIndex: number): void {
  star.x = Math.random() * width;
  star.y = Math.random() * height;
  star.layer = Math.floor(Math.random() * DEPTH_LAYERS);

  // Size and brightness based on layer (far stars are smaller/dimmer)
  const layerScale = (star.layer + 1) / DEPTH_LAYERS;
  star.size = 1 + layerScale * 2;
  // Store color index rather than actual color (will be looked up at render time)
  star.color = colorIndex;
  star.twinklePhase = Math.random() * Math.PI * 2;
  star.twinkleAmount = Math.random() > 0.6 ? 0.3 + Math.random() * 0.4 : 0;
}

const actor: Actor = {
  metadata,

  setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();
    const paletteIndex = Math.floor(Math.random() * DARK_PALETTES.length);
    const starCount = STAR_COUNTS[Math.floor(Math.random() * STAR_COUNTS.length)];

    // Pick random drift direction
    const directions = [
      0, // right
      Math.PI / 2, // down
      Math.PI, // left
      -Math.PI / 2, // up
      Math.PI / 4, // diagonal down-right
      -Math.PI / 4, // diagonal up-right
    ];
    const driftAngle = directions[Math.floor(Math.random() * directions.length)];

    // Pre-allocate stars
    const stars: Star[] = [];
    const numColors = DARK_PALETTES[paletteIndex].starColors.length;
    for (let i = 0; i < starCount; i++) {
      const star: Star = {
        x: 0,
        y: 0,
        size: 0,
        color: 0,
        layer: 0,
        twinklePhase: 0,
        twinkleAmount: 0,
      };
      // Pass color index instead of palette
      const colorIndex = Math.floor(Math.random() * numColors);
      initStar(star, width, height, colorIndex);
      stars.push(star);
    }

    state = {
      darkPalette: DARK_PALETTES[paletteIndex],
      lightPalette: LIGHT_PALETTES[paletteIndex],
      paletteIndex,
      stars,
      driftAngle,
      canvasWidth: width,
      canvasHeight: height,
    };

    return Promise.resolve();
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;

    state.canvasWidth = width;
    state.canvasHeight = height;

    // Select palette based on display mode
    const isDark = api.context.display.isDarkMode();
    const palette = isDark ? state.darkPalette : state.lightPalette;

    // Draw background
    api.brush.rect(0, 0, width, height, {
      fill: palette.background,
    });

    // Calculate drift direction
    const driftX = Math.cos(state.driftAngle);
    const driftY = Math.sin(state.driftAngle);

    // Update and draw stars
    for (const star of state.stars) {
      // Move star based on layer (near stars move faster)
      const layerSpeed = BASE_SPEED * (star.layer + 1);
      star.x += driftX * layerSpeed * dt;
      star.y += driftY * layerSpeed * dt;

      // Wrap around edges
      if (star.x < -star.size) star.x = width + star.size;
      if (star.x > width + star.size) star.x = -star.size;
      if (star.y < -star.size) star.y = height + star.size;
      if (star.y > height + star.size) star.y = -star.size;

      // Calculate twinkle
      star.twinklePhase += TWINKLE_SPEED * dt;
      const twinkle = star.twinkleAmount > 0
        ? 1 - star.twinkleAmount * (Math.sin(star.twinklePhase) + 1) / 2
        : 1;

      // Calculate alpha based on layer
      // Light mode uses slightly lower alpha for similar visual weight
      const baseAlpha = isDark ? 0.4 : 0.35;
      const maxAlpha = isDark ? 1.0 : 0.9;
      const layerAlpha = baseAlpha + (star.layer / DEPTH_LAYERS) * (maxAlpha - baseAlpha);
      const alpha = layerAlpha * twinkle;

      // Get actual color from palette using stored color index
      const starColor = palette.starColors[star.color];

      // Draw star as small circle
      api.brush.circle(star.x, star.y, star.size, {
        fill: starColor,
        alpha,
      });
    }
  },
};

registerActor(actor);

export default actor;
