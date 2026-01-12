/**
 * Architectural Patterns Actor
 *
 * Creates intricate geometric patterns inspired by:
 * - Islamic geometric art (stars, tessellations)
 * - Art Deco (fans, sunbursts, stepped forms)
 * - Bauhaus (clean geometry, primary colors)
 * - Japanese patterns (waves, circles, lattices)
 *
 * Showcases unused APIs: beginPath()/PathBuilder, scale(),
 * gradients (linear/radial), dropShadow(), roundRect()
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  Gradient,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'architectural-patterns',
  name: 'Architectural Patterns',
  description: 'Geometric patterns inspired by Islamic art, Art Deco, and modernist design',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['geometric', 'architecture', 'patterns', 'islamic', 'art-deco'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['time'],
};

// ============================================================
// Constants
// ============================================================

type PatternStyle = 'islamic' | 'artDeco' | 'bauhaus' | 'japanese';

const PATTERN_STYLES: PatternStyle[] = ['islamic', 'artDeco', 'bauhaus', 'japanese'];

// Pre-defined metallic gradient colors
const METALLIC_PALETTES = {
  gold: ['#ffd700', '#ffb347', '#cd853f', '#8b6914'],
  silver: ['#c0c0c0', '#a8a8a8', '#808080', '#606060'],
  bronze: ['#cd7f32', '#b87333', '#8b4513', '#654321'],
  copper: ['#b87333', '#da8a67', '#c19a6b', '#8b4513'],
  rose: ['#b76e79', '#e8b4b8', '#c9a0dc', '#9966cc'],
};

type MetallicPalette = keyof typeof METALLIC_PALETTES;

// ============================================================
// State interfaces
// ============================================================

interface PatternState {
  style: PatternStyle;
  palette: MetallicPalette;
  rotation: number;
  rotationSpeed: number;
  scale: number;
  targetScale: number;
  growthProgress: number;
  complexity: number;
  centerX: number;
  centerY: number;

  // Style-specific state
  islamicStarPoints: number;
  artDecoFanCount: number;
  bauhausShapeIndex: number;
  japaneseWavePhase: number;

  // Timing
  styleChangeTimer: number;
  styleChangeDuration: number;
}

// ============================================================
// State
// ============================================================

let state: PatternState = {
  style: 'islamic',
  palette: 'gold',
  rotation: 0,
  rotationSpeed: 0.0002,
  scale: 1,
  targetScale: 1,
  growthProgress: 0,
  complexity: 3,
  centerX: 0,
  centerY: 0,
  islamicStarPoints: 8,
  artDecoFanCount: 12,
  bauhausShapeIndex: 0,
  japaneseWavePhase: 0,
  styleChangeTimer: 0,
  styleChangeDuration: 20000,
};

// ============================================================
// Helper functions
// ============================================================

function createMetallicGradient(
  palette: MetallicPalette,
  direction: 'horizontal' | 'vertical' | 'diagonal' = 'horizontal'
): Gradient {
  // Linear gradients use relative coordinates (0-1 range) with textureSpace: 'local'
  // 0 = start of shape, 1 = end of shape in that dimension
  const colors = METALLIC_PALETTES[palette];
  let x0 = 0, y0 = 0, x1 = 1, y1 = 0; // horizontal default
  if (direction === 'vertical') {
    x0 = 0; y0 = 0; x1 = 0; y1 = 1;
  } else if (direction === 'diagonal') {
    x0 = 0; y0 = 0; x1 = 1; y1 = 1;
  }
  return {
    type: 'linear',
    x0, y0, x1, y1,
    stops: [
      { offset: 0, color: colors[0] },
      { offset: 0.3, color: colors[1] },
      { offset: 0.7, color: colors[2] },
      { offset: 1, color: colors[3] },
    ],
  };
}

function createRadialMetallicGradient(palette: MetallicPalette): Gradient {
  // Radial gradients use relative coordinates (0-1 range) with textureSpace: 'local'
  // cx/cy: 0.5 = center of shape, radius: 0.5 = 50% of shape size
  const colors = METALLIC_PALETTES[palette];
  return {
    type: 'radial',
    cx: 0.5,
    cy: 0.5,
    radius: 0.5,
    stops: [
      { offset: 0, color: colors[0] },
      { offset: 0.4, color: colors[1] },
      { offset: 0.8, color: colors[2] },
      { offset: 1, color: colors[3] },
    ],
  };
}

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

// ============================================================
// Pattern drawing functions
// ============================================================

function drawIslamicPattern(api: ActorUpdateAPI, cx: number, cy: number, size: number): void {
  const points = state.islamicStarPoints;
  const layers = Math.min(state.complexity + 2, 6);

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);
  api.brush.rotate(state.rotation);

  // Draw multiple nested star patterns
  for (let layer = 0; layer < layers; layer++) {
    const layerSize = size * (1 - layer * 0.15);
    const layerRotation = layer * (Math.PI / points);

    api.brush.pushMatrix();
    api.brush.rotate(layerRotation);

    // Create Islamic star using PathBuilder
    const path = api.brush.beginPath();
    const outerRadius = layerSize * 0.5;
    const innerRadius = outerRadius * 0.4;

    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      if (i === 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    path.closePath();

    // Alternate fill styles
    const gradient = createRadialMetallicGradient(state.palette);

    if (layer % 2 === 0) {
      path.fill({ fill: gradient, alpha: 0.8 - layer * 0.1 });
    } else {
      path.stroke({
        color: METALLIC_PALETTES[state.palette][1],
        width: 2,
        alpha: 0.6,
      });
    }

    // Draw connecting lines between star points
    if (layer < 3) {
      for (let i = 0; i < points; i++) {
        const angle1 = (i * 2 * Math.PI) / points - Math.PI / 2;
        const angle2 = ((i + 2) * 2 * Math.PI) / points - Math.PI / 2;

        api.brush.line(
          Math.cos(angle1) * outerRadius * 0.8,
          Math.sin(angle1) * outerRadius * 0.8,
          Math.cos(angle2) * outerRadius * 0.8,
          Math.sin(angle2) * outerRadius * 0.8,
          {
            color: METALLIC_PALETTES[state.palette][2],
            width: 1,
            alpha: 0.4,
          }
        );
      }
    }

    api.brush.popMatrix();
  }

  // Central ornament
  api.brush.circle(0, 0, size * 0.08, {
    fill: createRadialMetallicGradient(state.palette),
  });

  api.brush.popMatrix();
}

function drawArtDecoPattern(api: ActorUpdateAPI, cx: number, cy: number, size: number): void {
  const fanCount = state.artDecoFanCount;

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);
  api.brush.rotate(state.rotation);

  // Draw Art Deco sunburst/fan pattern
  const fanAngle = (Math.PI * 2) / fanCount;

  for (let i = 0; i < fanCount; i++) {
    api.brush.pushMatrix();
    api.brush.rotate(i * fanAngle);

    // Each fan blade
    const bladeWidth = size * 0.15;
    const bladeHeight = size * 0.45;

    // Create stepped Art Deco blade using PathBuilder
    const path = api.brush.beginPath();
    const steps = 4;

    path.moveTo(-bladeWidth / 2, 0);

    for (let s = 0; s < steps; s++) {
      const stepY = (bladeHeight / steps) * s;
      const stepWidth = bladeWidth * (1 - s * 0.2);
      const nextStepY = (bladeHeight / steps) * (s + 1);

      path.lineTo(-stepWidth / 2, stepY);
      path.lineTo(-stepWidth / 2, nextStepY);
    }

    path.lineTo(0, bladeHeight);

    for (let s = steps - 1; s >= 0; s--) {
      const stepY = (bladeHeight / steps) * (s + 1);
      const stepWidth = bladeWidth * (1 - s * 0.2);
      const prevStepY = (bladeHeight / steps) * s;

      path.lineTo(stepWidth / 2, stepY);
      path.lineTo(stepWidth / 2, prevStepY);
    }

    path.closePath();

    // Gradient for 3D effect (horizontal gradient across the blade)
    const gradient = createMetallicGradient(state.palette, 'horizontal');

    path.fill({ fill: gradient, alpha: 0.8 });

    // Decorative line
    api.brush.line(0, bladeHeight * 0.1, 0, bladeHeight * 0.9, {
      color: METALLIC_PALETTES[state.palette][0],
      width: 1,
      alpha: 0.6,
    });

    api.brush.popMatrix();
  }

  // Art Deco frame using roundRect (concentric)
  for (let r = 0; r < 3; r++) {
    const frameSize = size * (0.15 + r * 0.03);
    api.brush.roundRect(
      -frameSize / 2, -frameSize / 2,
      frameSize, frameSize,
      frameSize * 0.15,
      {
        stroke: METALLIC_PALETTES[state.palette][r],
        strokeWidth: 3 - r,
        alpha: 0.7,
      }
    );
  }

  // Central circular element
  api.brush.circle(0, 0, size * 0.1, {
    fill: createRadialMetallicGradient(state.palette),
  });

  api.brush.popMatrix();
}

function drawBauhausPattern(api: ActorUpdateAPI, cx: number, cy: number, size: number): void {
  const bauhaus_colors = [0xe53935, 0x1e88e5, 0xfdd835, 0x212121, 0xfafafa];

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);
  api.brush.rotate(state.rotation * 0.5);

  // Bauhaus: clean geometric composition
  const gridSize = size / 4;

  // Primary circle
  api.brush.circle(0, 0, size * 0.35, {
    fill: bauhaus_colors[0],
    alpha: 0.9,
  });

  // Overlapping square (rotated)
  api.brush.pushMatrix();
  api.brush.rotate(Math.PI / 4);
  api.brush.rect(-size * 0.25, -size * 0.25, size * 0.5, size * 0.5, {
    fill: bauhaus_colors[1],
    alpha: 0.7,
  });
  api.brush.popMatrix();

  // Triangle using PathBuilder
  const triSize = size * 0.3;
  const path = api.brush.beginPath();
  path.moveTo(0, -triSize);
  path.lineTo(triSize * 0.866, triSize * 0.5);
  path.lineTo(-triSize * 0.866, triSize * 0.5);
  path.closePath();
  path.fill({ fill: bauhaus_colors[2], alpha: 0.8 });

  // Geometric grid lines
  for (let i = -2; i <= 2; i++) {
    // Horizontal
    api.brush.line(-size * 0.45, i * gridSize, size * 0.45, i * gridSize, {
      color: bauhaus_colors[3],
      width: 1,
      alpha: 0.3,
    });
    // Vertical
    api.brush.line(i * gridSize, -size * 0.45, i * gridSize, size * 0.45, {
      color: bauhaus_colors[3],
      width: 1,
      alpha: 0.3,
    });
  }

  // Small accent circles
  const accentPositions = [
    { x: -gridSize, y: -gridSize },
    { x: gridSize, y: -gridSize },
    { x: 0, y: gridSize },
  ];

  for (let i = 0; i < accentPositions.length; i++) {
    const pos = accentPositions[i];
    api.brush.circle(pos.x, pos.y, gridSize * 0.3, {
      fill: bauhaus_colors[i],
      alpha: 0.6,
    });
  }

  // Concentric circles as frame
  for (let r = 0; r < 3; r++) {
    api.brush.circle(0, 0, size * (0.4 + r * 0.05), {
      stroke: bauhaus_colors[3],
      strokeWidth: 2 - r * 0.5,
      alpha: 0.4 - r * 0.1,
    });
  }

  api.brush.popMatrix();
}

function drawJapanesePattern(api: ActorUpdateAPI, cx: number, cy: number, size: number): void {
  api.brush.pushMatrix();
  api.brush.translate(cx, cy);

  // Japanese wave pattern (Seigaiha)
  const waveRows = 5;
  const wavesPerRow = 7;
  const waveRadius = size / wavesPerRow;

  for (let row = 0; row < waveRows; row++) {
    const rowY = -size * 0.4 + row * waveRadius * 0.7;
    const offset = row % 2 === 0 ? 0 : waveRadius * 0.5;

    for (let col = 0; col < wavesPerRow; col++) {
      const waveX = -size * 0.4 + col * waveRadius + offset;

      // Draw concentric arcs
      for (let arc = 0; arc < 3; arc++) {
        const arcRadius = waveRadius * (0.4 - arc * 0.1);
        const hue = 200 + row * 10 + state.japaneseWavePhase * 30;
        const saturation = 60 - arc * 15;
        const lightness = 40 + arc * 15;

        api.brush.arc(
          waveX, rowY,
          arcRadius,
          Math.PI, Math.PI * 2,
          {
            color: hslToNumeric(hue, saturation, lightness),
            width: 2,
            alpha: 0.7 - arc * 0.15,
          }
        );
      }
    }
  }

  // Central cherry blossom using PathBuilder
  const petalCount = 5;
  const petalLength = size * 0.15;

  for (let i = 0; i < petalCount; i++) {
    const angle = (i * Math.PI * 2) / petalCount - Math.PI / 2 + state.rotation;

    api.brush.pushMatrix();
    api.brush.rotate(angle);

    // Each petal as a path
    const path = api.brush.beginPath();
    path.moveTo(0, 0);
    path.quadraticCurveTo(
      petalLength * 0.3, -petalLength * 0.3,
      0, -petalLength
    );
    path.quadraticCurveTo(
      -petalLength * 0.3, -petalLength * 0.3,
      0, 0
    );
    path.closePath();

    // Vertical gradient from bottom (white) to top (pink)
    // Using relative coordinates (0-1 range)
    const petalGradient: Gradient = {
      type: 'linear',
      x0: 0.5, y0: 1,  // bottom center
      x1: 0.5, y1: 0,  // top center
      stops: [
        { offset: 0, color: '#ffffff' },
        { offset: 0.5, color: '#ffb7c5' },
        { offset: 1, color: '#ff69b4' },
      ],
    };

    path.fill({ fill: petalGradient, alpha: 0.85 });

    api.brush.popMatrix();
  }

  // Blossom center
  api.brush.circle(0, 0, size * 0.03, {
    fill: 0xffeb3b,
    alpha: 0.9,
  });

  // Small dots around center
  for (let i = 0; i < 8; i++) {
    const dotAngle = (i * Math.PI * 2) / 8;
    const dotDist = size * 0.05;
    api.brush.circle(
      Math.cos(dotAngle) * dotDist,
      Math.sin(dotAngle) * dotDist,
      size * 0.01,
      { fill: 0xff9800, alpha: 0.8 }
    );
  }

  api.brush.popMatrix();
}

// ============================================================
// Actor implementation
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    // Initialize state
    state.style = PATTERN_STYLES[Math.floor(Math.random() * PATTERN_STYLES.length)];
    state.palette = (['gold', 'silver', 'bronze', 'copper', 'rose'] as MetallicPalette[])[
      Math.floor(Math.random() * 5)
    ];
    state.rotation = 0;
    state.rotationSpeed = 0.0001 + Math.random() * 0.0002;
    state.scale = 0.1;
    state.targetScale = 1;
    state.growthProgress = 0;
    state.complexity = 2 + Math.floor(Math.random() * 3);
    state.centerX = width / 2;
    state.centerY = height / 2;

    state.islamicStarPoints = 6 + Math.floor(Math.random() * 6); // 6-12 points
    state.artDecoFanCount = 8 + Math.floor(Math.random() * 8); // 8-16 fans
    state.bauhausShapeIndex = 0;
    state.japaneseWavePhase = 0;

    state.styleChangeTimer = 0;
    state.styleChangeDuration = 15000 + Math.random() * 10000;

    console.log(`[architectural-patterns] Setup complete with style: ${state.style}, palette: ${state.palette}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;
    const time = frame.time * 0.001;

    // ============ Update timers and state ============

    state.styleChangeTimer += dt;
    state.rotation += state.rotationSpeed * dt;
    state.japaneseWavePhase = Math.sin(time * 0.3);

    // Change style periodically
    if (state.styleChangeTimer >= state.styleChangeDuration) {
      state.styleChangeTimer = 0;
      const currentIndex = PATTERN_STYLES.indexOf(state.style);
      state.style = PATTERN_STYLES[(currentIndex + 1) % PATTERN_STYLES.length];
      state.styleChangeDuration = 15000 + Math.random() * 10000;

      // Also change palette
      const palettes: MetallicPalette[] = ['gold', 'silver', 'bronze', 'copper', 'rose'];
      state.palette = palettes[Math.floor(Math.random() * palettes.length)];

      // Reset scale for growth animation
      state.scale = 0.3;
      state.targetScale = 1;
    }

    // Animate scale (growth effect)
    state.scale += (state.targetScale - state.scale) * 0.02;

    // Pulse scale slightly
    const scalePulse = 1 + Math.sin(time * 0.5) * 0.02;
    const currentScale = state.scale * scalePulse;

    // ============ Draw background ============

    // Dark background with subtle radial gradient (centered)
    // Using relative coordinates (0-1 range)
    const bgGradient: Gradient = {
      type: 'radial',
      cx: 0.5,   // center horizontally
      cy: 0.5,   // center vertically
      radius: 0.7,  // 70% of shape size
      stops: [
        { offset: 0, color: '#1a1a2e' },
        { offset: 1, color: '#0a0a15' },
      ],
    };

    api.brush.rect(0, 0, width, height, {
      fill: bgGradient,
    });

    // ============ Apply drop shadow for depth ============

    api.filter.dropShadow('rgba(0, 0, 0, 0.5)', 15, 5, 5);

    // ============ Draw pattern with scale ============

    const baseSize = Math.min(width, height) * 0.8;
    const patternSize = baseSize * currentScale;

    api.brush.pushMatrix();
    api.brush.translate(state.centerX, state.centerY);
    api.brush.scale(currentScale);
    api.brush.translate(-state.centerX, -state.centerY);

    // Draw the current pattern style
    switch (state.style) {
      case 'islamic':
        drawIslamicPattern(api, state.centerX, state.centerY, patternSize);
        break;
      case 'artDeco':
        drawArtDecoPattern(api, state.centerX, state.centerY, patternSize);
        break;
      case 'bauhaus':
        drawBauhausPattern(api, state.centerX, state.centerY, patternSize);
        break;
      case 'japanese':
        drawJapanesePattern(api, state.centerX, state.centerY, patternSize);
        break;
    }

    api.brush.popMatrix();

    // ============ Add decorative corner elements ============

    const cornerSize = Math.min(width, height) * 0.15;
    const cornerMargin = cornerSize * 0.3;

    // Corner roundRects
    const corners = [
      { x: cornerMargin, y: cornerMargin },
      { x: width - cornerMargin - cornerSize, y: cornerMargin },
      { x: cornerMargin, y: height - cornerMargin - cornerSize },
      { x: width - cornerMargin - cornerSize, y: height - cornerMargin - cornerSize },
    ];

    // Use a single diagonal gradient for all corners (relative coords)
    const cornerGradient = createMetallicGradient(state.palette, 'diagonal');

    for (let i = 0; i < corners.length; i++) {
      const corner = corners[i];

      api.brush.roundRect(
        corner.x, corner.y,
        cornerSize, cornerSize * 0.3,
        5,
        {
          fill: cornerGradient,
          alpha: 0.6,
        }
      );
    }

    // ============ Subtle vignette ============

    api.filter.vignette(0.3, 0.6);
  },

  async teardown(): Promise<void> {
    // Reset state
    state.style = 'islamic';
    state.palette = 'gold';
    state.rotation = 0;
    state.rotationSpeed = 0.0002;
    state.scale = 1;
    state.targetScale = 1;
    state.growthProgress = 0;
    state.complexity = 3;
    state.styleChangeTimer = 0;

    console.log('[architectural-patterns] Teardown complete');
  },
};

// Self-register with the runtime
registerActor(actor);

export default actor;
