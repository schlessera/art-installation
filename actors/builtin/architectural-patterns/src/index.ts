/**
 * Architectural Patterns Actor
 *
 * Creates intricate geometric patterns inspired by:
 * - Islamic geometric art (stars, tessellations)
 * - Art Deco (fans, sunbursts, stepped forms)
 * - Bauhaus (clean geometry, primary colors)
 * - Japanese patterns (waves, circles, lattices)
 * - Gothic (pointed arches, rose windows, tracery)
 * - Celtic (knotwork, spirals, interlace)
 * - Moorish/Zellige (tile mosaics, arabesques)
 * - Greek/Roman (meander, acanthus, columns)
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
  description: 'Geometric patterns inspired by Islamic art, Art Deco, Gothic, Celtic, and modernist design',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '2.0.0',
  tags: ['geometric', 'architecture', 'patterns', 'islamic', 'art-deco', 'gothic', 'celtic'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 60,
  requiredContexts: ['time'],
};

// ============================================================
// Constants
// ============================================================

type PatternStyle = 'islamic' | 'artDeco' | 'bauhaus' | 'japanese' | 'gothic' | 'celtic' | 'moorish' | 'greek';

const PATTERN_STYLES: PatternStyle[] = ['islamic', 'artDeco', 'bauhaus', 'japanese', 'gothic', 'celtic', 'moorish', 'greek'];

// Pre-defined metallic gradient colors - these represent REAL MATERIALS
// and should look the same in both dark and light modes!
const METALLIC_PALETTES = {
  gold: ['#ffd700', '#ffb347', '#cd853f', '#8b6914'],
  silver: ['#c0c0c0', '#a8a8a8', '#808080', '#606060'],
  bronze: ['#cd7f32', '#b87333', '#8b4513', '#654321'],
  copper: ['#b87333', '#da8a67', '#c19a6b', '#8b4513'],
  rose: ['#b76e79', '#e8b4b8', '#c9a0dc', '#9966cc'],
  platinum: ['#e5e4e2', '#d4d4d4', '#a9a9a9', '#808080'],
  brass: ['#b5a642', '#cd9b1d', '#8b7500', '#6b5900'],
  pewter: ['#96a8a1', '#7a8b8b', '#5c6b6b', '#4a5959'],
  verdigris: ['#43b3ae', '#3a9d98', '#2d7a76', '#1f5754'],
  rust: ['#b7410e', '#a0522d', '#8b4513', '#5c3317'],
};

type MetallicPalette = keyof typeof METALLIC_PALETTES;

const ALL_PALETTES: MetallicPalette[] = ['gold', 'silver', 'bronze', 'copper', 'rose', 'platinum', 'brass', 'pewter', 'verdigris', 'rust'];

// Helper to get metallic palette - same colors regardless of display mode
function getMetallicPalette(palette: MetallicPalette): string[] {
  return METALLIC_PALETTES[palette];
}

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
  gothicArchCount: number;
  celticSpiralCount: number;
  moorishTileRows: number;
  greekMeanderDepth: number;

  // Timing
  styleChangeTimer: number;
  styleChangeDuration: number;

  // === Variability settings (randomized in setup) ===
  bgAlphaMultiplier: number;
  strokeWidthBase: number;
  strokeWidthVariation: number;
  layerCount: number;
  animationSpeed: number;
  pulseAmplitude: number;
  pulseSpeed: number;
  innerRadiusRatio: number;
  ornamentDensity: number;
  lineAlphaBase: number;
  fillAlphaBase: number;
  shadowBlur: number;
  shadowOffset: number;
  cornerElementSize: number;
  showCornerElements: boolean;
  patternOffsetX: number;
  patternOffsetY: number;
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
  gothicArchCount: 5,
  celticSpiralCount: 3,
  moorishTileRows: 4,
  greekMeanderDepth: 3,
  styleChangeTimer: 0,
  styleChangeDuration: 20000,
  bgAlphaMultiplier: 1.0,
  strokeWidthBase: 2,
  strokeWidthVariation: 0.5,
  layerCount: 4,
  animationSpeed: 1.0,
  pulseAmplitude: 0.02,
  pulseSpeed: 0.5,
  innerRadiusRatio: 0.4,
  ornamentDensity: 1.0,
  lineAlphaBase: 0.5,
  fillAlphaBase: 0.8,
  shadowBlur: 15,
  shadowOffset: 5,
  cornerElementSize: 0.15,
  showCornerElements: true,
  patternOffsetX: 0,
  patternOffsetY: 0,
};

// ============================================================
// Helper functions
// ============================================================

function createMetallicGradient(
  palette: MetallicPalette,
  direction: 'horizontal' | 'vertical' | 'diagonal' = 'horizontal'
): Gradient {
  const colors = getMetallicPalette(palette);
  let x0 = 0, y0 = 0, x1 = 1, y1 = 0;
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
  const colors = getMetallicPalette(palette);
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

function hexToNumeric(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

// Variable stroke width helper
function getStrokeWidth(base: number = 1): number {
  return state.strokeWidthBase * base * (1 + (Math.random() - 0.5) * state.strokeWidthVariation);
}

// ============================================================
// Pattern drawing functions
// ============================================================

function drawIslamicPattern(api: ActorUpdateAPI, cx: number, cy: number, size: number, isDarkMode: boolean): void {
  const points = state.islamicStarPoints;
  const layers = Math.min(state.layerCount + 2, 8);
  const colors = getMetallicPalette(state.palette);
  const alphaMultiplier = isDarkMode ? 1.0 : 0.85;

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);
  api.brush.rotate(state.rotation);

  // Draw multiple nested star patterns
  for (let layer = 0; layer < layers; layer++) {
    const layerSize = size * (1 - layer * (0.1 + state.ornamentDensity * 0.05));
    const layerRotation = layer * (Math.PI / points);

    api.brush.pushMatrix();
    api.brush.rotate(layerRotation);

    const path = api.brush.beginPath();
    const outerRadius = layerSize * 0.5;
    const innerRadius = outerRadius * state.innerRadiusRatio;

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

    const gradient = createRadialMetallicGradient(state.palette);

    if (layer % 2 === 0) {
      path.fill({ fill: gradient, alpha: (state.fillAlphaBase - layer * 0.1) * alphaMultiplier });
    } else {
      path.stroke({
        color: colors[1],
        width: getStrokeWidth(1.5),
        alpha: state.lineAlphaBase * alphaMultiplier,
      });
    }

    // Draw connecting lines between star points
    if (layer < 3 && state.ornamentDensity > 0.5) {
      for (let i = 0; i < points; i++) {
        const angle1 = (i * 2 * Math.PI) / points - Math.PI / 2;
        const angle2 = ((i + 2) * 2 * Math.PI) / points - Math.PI / 2;

        api.brush.line(
          Math.cos(angle1) * outerRadius * 0.8,
          Math.sin(angle1) * outerRadius * 0.8,
          Math.cos(angle2) * outerRadius * 0.8,
          Math.sin(angle2) * outerRadius * 0.8,
          {
            color: colors[2],
            width: getStrokeWidth(0.8),
            alpha: state.lineAlphaBase * 0.6 * alphaMultiplier,
          }
        );
      }
    }

    api.brush.popMatrix();
  }

  // Central ornament
  api.brush.circle(0, 0, size * 0.08 * state.ornamentDensity, {
    fill: createRadialMetallicGradient(state.palette),
  });

  api.brush.popMatrix();
}

function drawArtDecoPattern(api: ActorUpdateAPI, cx: number, cy: number, size: number, isDarkMode: boolean): void {
  const fanCount = state.artDecoFanCount;
  const colors = getMetallicPalette(state.palette);
  const alphaMultiplier = isDarkMode ? 1.0 : 0.85;

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);
  api.brush.rotate(state.rotation);

  const fanAngle = (Math.PI * 2) / fanCount;

  for (let i = 0; i < fanCount; i++) {
    api.brush.pushMatrix();
    api.brush.rotate(i * fanAngle);

    const bladeWidth = size * (0.1 + state.ornamentDensity * 0.08);
    const bladeHeight = size * (0.35 + state.ornamentDensity * 0.15);

    const path = api.brush.beginPath();
    const steps = 3 + Math.floor(state.complexity);

    path.moveTo(-bladeWidth / 2, 0);

    for (let s = 0; s < steps; s++) {
      const stepY = (bladeHeight / steps) * s;
      const stepWidth = bladeWidth * (1 - s * (0.15 + state.innerRadiusRatio * 0.1));
      const nextStepY = (bladeHeight / steps) * (s + 1);

      path.lineTo(-stepWidth / 2, stepY);
      path.lineTo(-stepWidth / 2, nextStepY);
    }

    path.lineTo(0, bladeHeight);

    for (let s = steps - 1; s >= 0; s--) {
      const stepY = (bladeHeight / steps) * (s + 1);
      const stepWidth = bladeWidth * (1 - s * (0.15 + state.innerRadiusRatio * 0.1));
      const prevStepY = (bladeHeight / steps) * s;

      path.lineTo(stepWidth / 2, stepY);
      path.lineTo(stepWidth / 2, prevStepY);
    }

    path.closePath();

    const gradient = createMetallicGradient(state.palette, 'horizontal');
    path.fill({ fill: gradient, alpha: state.fillAlphaBase * alphaMultiplier });

    // Decorative line
    api.brush.line(0, bladeHeight * 0.1, 0, bladeHeight * 0.9, {
      color: colors[0],
      width: getStrokeWidth(0.8),
      alpha: state.lineAlphaBase * alphaMultiplier,
    });

    api.brush.popMatrix();
  }

  // Art Deco frame
  const frameCount = Math.max(2, Math.floor(state.layerCount / 2));
  for (let r = 0; r < frameCount; r++) {
    const frameSize = size * (0.12 + r * 0.04);
    api.brush.roundRect(
      -frameSize / 2, -frameSize / 2,
      frameSize, frameSize,
      frameSize * 0.15,
      {
        stroke: colors[r % colors.length],
        strokeWidth: getStrokeWidth(2 - r * 0.5),
        alpha: (0.7 - r * 0.15) * alphaMultiplier,
      }
    );
  }

  api.brush.circle(0, 0, size * 0.1, {
    fill: createRadialMetallicGradient(state.palette),
  });

  api.brush.popMatrix();
}

function drawBauhausPattern(api: ActorUpdateAPI, cx: number, cy: number, size: number, isDarkMode: boolean): void {
  const bauhaus_colors = isDarkMode
    ? [0xe53935, 0x1e88e5, 0xfdd835, 0xfafafa, 0x212121]
    : [0xc62828, 0x1565c0, 0xf9a825, 0x212121, 0xfafafa];
  const alphaMultiplier = isDarkMode ? 1.0 : 0.85;

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);
  api.brush.rotate(state.rotation * 0.5);

  const gridSize = size / (3 + state.complexity);

  // Primary circle - variable size
  api.brush.circle(0, 0, size * (0.25 + state.ornamentDensity * 0.15), {
    fill: bauhaus_colors[0],
    alpha: state.fillAlphaBase * alphaMultiplier,
  });

  // Overlapping square (rotated)
  api.brush.pushMatrix();
  api.brush.rotate(Math.PI / 4);
  const squareSize = size * (0.2 + state.ornamentDensity * 0.1);
  api.brush.rect(-squareSize, -squareSize, squareSize * 2, squareSize * 2, {
    fill: bauhaus_colors[1],
    alpha: (state.fillAlphaBase - 0.1) * alphaMultiplier,
  });
  api.brush.popMatrix();

  // Triangle
  const triSize = size * (0.2 + state.ornamentDensity * 0.12);
  const path = api.brush.beginPath();
  path.moveTo(0, -triSize);
  path.lineTo(triSize * 0.866, triSize * 0.5);
  path.lineTo(-triSize * 0.866, triSize * 0.5);
  path.closePath();
  path.fill({ fill: bauhaus_colors[2], alpha: state.fillAlphaBase * alphaMultiplier });

  // Grid lines - variable count
  const gridLines = 2 + Math.floor(state.layerCount / 2);
  for (let i = -gridLines; i <= gridLines; i++) {
    api.brush.line(-size * 0.45, i * gridSize, size * 0.45, i * gridSize, {
      color: bauhaus_colors[3],
      width: getStrokeWidth(0.8),
      alpha: state.lineAlphaBase * 0.5 * alphaMultiplier,
    });
    api.brush.line(i * gridSize, -size * 0.45, i * gridSize, size * 0.45, {
      color: bauhaus_colors[3],
      width: getStrokeWidth(0.8),
      alpha: state.lineAlphaBase * 0.5 * alphaMultiplier,
    });
  }

  // Accent circles - variable count based on density
  const accentCount = Math.floor(3 * state.ornamentDensity);
  for (let i = 0; i < accentCount; i++) {
    const angle = (i / accentCount) * Math.PI * 2 - Math.PI / 2;
    const dist = gridSize * 1.5;
    api.brush.circle(
      Math.cos(angle) * dist,
      Math.sin(angle) * dist,
      gridSize * 0.3,
      {
        fill: bauhaus_colors[i % 3],
        alpha: state.lineAlphaBase * alphaMultiplier,
      }
    );
  }

  // Concentric circles
  const circleCount = Math.max(2, Math.floor(state.layerCount / 2));
  for (let r = 0; r < circleCount; r++) {
    api.brush.circle(0, 0, size * (0.35 + r * 0.06), {
      stroke: bauhaus_colors[3],
      strokeWidth: getStrokeWidth(1.5 - r * 0.3),
      alpha: (state.lineAlphaBase - r * 0.1) * alphaMultiplier,
    });
  }

  api.brush.popMatrix();
}

function drawJapanesePattern(api: ActorUpdateAPI, cx: number, cy: number, size: number, isDarkMode: boolean): void {
  const alphaMultiplier = isDarkMode ? 1.0 : 0.85;

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);

  // Seigaiha waves - variable density
  const waveRows = 3 + Math.floor(state.ornamentDensity * 4);
  const wavesPerRow = 5 + Math.floor(state.ornamentDensity * 4);
  const waveRadius = size / wavesPerRow;

  for (let row = 0; row < waveRows; row++) {
    const rowY = -size * 0.4 + row * waveRadius * 0.7;
    const offset = row % 2 === 0 ? 0 : waveRadius * 0.5;

    for (let col = 0; col < wavesPerRow; col++) {
      const waveX = -size * 0.4 + col * waveRadius + offset;

      const arcCount = 2 + Math.floor(state.layerCount / 2);
      for (let arc = 0; arc < arcCount; arc++) {
        const arcRadius = waveRadius * (0.4 - arc * (0.1 / arcCount));
        const hue = 200 + row * 10 + state.japaneseWavePhase * 30;
        const saturation = 60 - arc * 15;
        const baseLightness = isDarkMode ? 60 : 25;
        const lightnessVariation = isDarkMode ? 15 : 10;
        const lightness = baseLightness + arc * lightnessVariation;

        api.brush.arc(
          waveX, rowY,
          arcRadius,
          Math.PI, Math.PI * 2,
          {
            color: hslToNumeric(hue, saturation, lightness),
            width: getStrokeWidth(1.5),
            alpha: (0.7 - arc * 0.15) * alphaMultiplier,
          }
        );
      }
    }
  }

  // Cherry blossom - variable petal count
  const petalCount = 4 + Math.floor(state.ornamentDensity * 3);
  const petalLength = size * (0.1 + state.ornamentDensity * 0.08);

  for (let i = 0; i < petalCount; i++) {
    const angle = (i * Math.PI * 2) / petalCount - Math.PI / 2 + state.rotation;

    api.brush.pushMatrix();
    api.brush.rotate(angle);

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

    const petalGradient: Gradient = {
      type: 'linear',
      x0: 0.5, y0: 1,
      x1: 0.5, y1: 0,
      stops: [
        { offset: 0, color: '#ffffff' },
        { offset: 0.5, color: '#ffb7c5' },
        { offset: 1, color: '#ff69b4' },
      ],
    };

    path.fill({ fill: petalGradient, alpha: state.fillAlphaBase * alphaMultiplier });

    api.brush.popMatrix();
  }

  api.brush.circle(0, 0, size * 0.03, {
    fill: 0xffeb3b,
    alpha: 0.9 * alphaMultiplier,
  });

  const dotCount = Math.floor(6 + state.ornamentDensity * 4);
  for (let i = 0; i < dotCount; i++) {
    const dotAngle = (i * Math.PI * 2) / dotCount;
    const dotDist = size * 0.05;
    api.brush.circle(
      Math.cos(dotAngle) * dotDist,
      Math.sin(dotAngle) * dotDist,
      size * 0.01,
      { fill: 0xff9800, alpha: state.fillAlphaBase * alphaMultiplier }
    );
  }

  api.brush.popMatrix();
}

function drawGothicPattern(api: ActorUpdateAPI, cx: number, cy: number, size: number, isDarkMode: boolean): void {
  const colors = getMetallicPalette(state.palette);
  const alphaMultiplier = isDarkMode ? 1.0 : 0.85;

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);
  api.brush.rotate(state.rotation * 0.3);

  // Rose window - central circular pattern with radial divisions
  const petalCount = state.gothicArchCount * 2;
  const outerRadius = size * 0.45;
  const innerRadius = outerRadius * state.innerRadiusRatio;

  // Outer ring
  api.brush.circle(0, 0, outerRadius, {
    stroke: colors[0],
    strokeWidth: getStrokeWidth(3),
    alpha: state.fillAlphaBase * alphaMultiplier,
  });

  // Inner decorative rings
  const ringCount = state.layerCount;
  for (let r = 1; r <= ringCount; r++) {
    const ringRadius = outerRadius * (1 - r * 0.15);
    api.brush.circle(0, 0, ringRadius, {
      stroke: colors[r % colors.length],
      strokeWidth: getStrokeWidth(2 - r * 0.3),
      alpha: (state.lineAlphaBase - r * 0.1) * alphaMultiplier,
    });
  }

  // Radial divisions - pointed Gothic arches
  for (let i = 0; i < petalCount; i++) {
    const angle = (i * Math.PI * 2) / petalCount;

    api.brush.pushMatrix();
    api.brush.rotate(angle);

    // Gothic pointed arch shape
    const archHeight = outerRadius * 0.8;
    const archWidth = (outerRadius * Math.PI) / petalCount * 0.7;

    const path = api.brush.beginPath();
    path.moveTo(0, innerRadius * 0.5);

    // Left side of arch with pointed top
    path.quadraticCurveTo(
      -archWidth * 0.6, archHeight * 0.5,
      -archWidth * 0.3, archHeight * 0.8
    );
    path.quadraticCurveTo(
      0, archHeight * 1.1,  // Pointed peak
      archWidth * 0.3, archHeight * 0.8
    );
    path.quadraticCurveTo(
      archWidth * 0.6, archHeight * 0.5,
      0, innerRadius * 0.5
    );
    path.closePath();

    if (i % 2 === 0) {
      path.fill({
        fill: createMetallicGradient(state.palette, 'vertical'),
        alpha: state.fillAlphaBase * 0.7 * alphaMultiplier,
      });
    } else {
      path.stroke({
        color: colors[1],
        width: getStrokeWidth(1.5),
        alpha: state.lineAlphaBase * alphaMultiplier,
      });
    }

    // Tracery lines within arch
    if (state.ornamentDensity > 0.6) {
      api.brush.line(0, innerRadius * 0.5, 0, archHeight * 0.9, {
        color: colors[2],
        width: getStrokeWidth(0.8),
        alpha: state.lineAlphaBase * 0.5 * alphaMultiplier,
      });
    }

    api.brush.popMatrix();
  }

  // Central medallion
  api.brush.circle(0, 0, innerRadius * 0.6, {
    fill: createRadialMetallicGradient(state.palette),
    alpha: state.fillAlphaBase * alphaMultiplier,
  });

  // Trefoil ornaments around center
  if (state.ornamentDensity > 0.4) {
    const trefoilCount = Math.floor(state.gothicArchCount * 0.6);
    for (let i = 0; i < trefoilCount; i++) {
      const angle = (i * Math.PI * 2) / trefoilCount;
      const dist = innerRadius * 0.35;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist;

      // Three-lobed trefoil
      for (let lobe = 0; lobe < 3; lobe++) {
        const lobeAngle = angle + (lobe * Math.PI * 2) / 3;
        const lobeX = tx + Math.cos(lobeAngle) * innerRadius * 0.08;
        const lobeY = ty + Math.sin(lobeAngle) * innerRadius * 0.08;
        api.brush.circle(lobeX, lobeY, innerRadius * 0.06, {
          stroke: colors[0],
          strokeWidth: getStrokeWidth(1),
          alpha: state.lineAlphaBase * 0.6 * alphaMultiplier,
        });
      }
    }
  }

  api.brush.popMatrix();
}

function drawCelticPattern(api: ActorUpdateAPI, cx: number, cy: number, size: number, isDarkMode: boolean): void {
  const colors = getMetallicPalette(state.palette);
  const alphaMultiplier = isDarkMode ? 1.0 : 0.85;

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);
  api.brush.rotate(state.rotation);

  const spiralCount = state.celticSpiralCount;
  const outerRadius = size * 0.4;

  // Triple spiral (triskelion) base pattern
  for (let s = 0; s < spiralCount; s++) {
    const startAngle = (s * Math.PI * 2) / spiralCount;

    api.brush.pushMatrix();
    api.brush.rotate(startAngle);

    // Draw spiral arm using arcs
    const spiralTurns = 2 + state.complexity * 0.5;
    const segments = Math.floor(12 * spiralTurns);

    let lastX = 0;
    let lastY = 0;

    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const angle = t * spiralTurns * Math.PI * 2;
      const radius = outerRadius * (0.1 + t * 0.7);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      if (i > 0) {
        const colorIndex = Math.floor(t * colors.length) % colors.length;
        api.brush.line(lastX, lastY, x, y, {
          color: hexToNumeric(colors[colorIndex]),
          width: getStrokeWidth(3 - t * 1.5),
          alpha: (state.lineAlphaBase + t * 0.3) * alphaMultiplier,
          cap: 'round',
        });
      }

      lastX = x;
      lastY = y;
    }

    api.brush.popMatrix();
  }

  // Interlace knot pattern in center
  const knotRadius = outerRadius * 0.3;
  const knotSegments = 4 + Math.floor(state.ornamentDensity * 4);

  for (let k = 0; k < knotSegments; k++) {
    const angle1 = (k * Math.PI * 2) / knotSegments;
    const angle2 = ((k + 2) * Math.PI * 2) / knotSegments;

    const x1 = Math.cos(angle1) * knotRadius;
    const y1 = Math.sin(angle1) * knotRadius;
    const x2 = Math.cos(angle2) * knotRadius;
    const y2 = Math.sin(angle2) * knotRadius;

    // Draw interlacing lines with over/under effect
    api.brush.line(x1, y1, x2, y2, {
      color: hexToNumeric(colors[k % 2 === 0 ? 0 : 2]),
      width: getStrokeWidth(2.5),
      alpha: state.lineAlphaBase * alphaMultiplier,
      cap: 'round',
    });
  }

  // Central knot
  api.brush.circle(0, 0, knotRadius * 0.3, {
    fill: createRadialMetallicGradient(state.palette),
    alpha: state.fillAlphaBase * alphaMultiplier,
  });

  // Outer border with Celtic key pattern
  const borderSegments = 8 + Math.floor(state.complexity * 4);
  for (let b = 0; b < borderSegments; b++) {
    const angle = (b * Math.PI * 2) / borderSegments;
    const nextAngle = ((b + 1) * Math.PI * 2) / borderSegments;

    const x1 = Math.cos(angle) * outerRadius;
    const y1 = Math.sin(angle) * outerRadius;
    const x2 = Math.cos(nextAngle) * outerRadius;
    const y2 = Math.sin(nextAngle) * outerRadius;

    api.brush.line(x1, y1, x2, y2, {
      color: hexToNumeric(colors[0]),
      width: getStrokeWidth(2),
      alpha: state.lineAlphaBase * alphaMultiplier,
    });

    // Key pattern notches
    if (b % 2 === 0 && state.ornamentDensity > 0.5) {
      const midAngle = (angle + nextAngle) / 2;
      const outerX = Math.cos(midAngle) * (outerRadius + size * 0.03);
      const outerY = Math.sin(midAngle) * (outerRadius + size * 0.03);
      const innerX = Math.cos(midAngle) * (outerRadius - size * 0.03);
      const innerY = Math.sin(midAngle) * (outerRadius - size * 0.03);

      api.brush.line(innerX, innerY, outerX, outerY, {
        color: hexToNumeric(colors[1]),
        width: getStrokeWidth(1.5),
        alpha: state.lineAlphaBase * 0.7 * alphaMultiplier,
      });
    }
  }

  api.brush.popMatrix();
}

function drawMoorishPattern(api: ActorUpdateAPI, cx: number, cy: number, size: number, isDarkMode: boolean): void {
  const colors = getMetallicPalette(state.palette);
  const alphaMultiplier = isDarkMode ? 1.0 : 0.85;

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);

  // Zellige tile mosaic - geometric star pattern
  const tileRows = state.moorishTileRows;
  const tileSize = size / tileRows;

  for (let row = -tileRows; row <= tileRows; row++) {
    for (let col = -tileRows; col <= tileRows; col++) {
      const tileX = col * tileSize * 0.85;
      const tileY = row * tileSize * 0.85;

      // Skip tiles outside circular boundary
      const dist = Math.sqrt(tileX * tileX + tileY * tileY);
      if (dist > size * 0.45) continue;

      api.brush.pushMatrix();
      api.brush.translate(tileX, tileY);

      // Alternating tile patterns
      const tileType = (row + col) % 3;

      if (tileType === 0) {
        // 8-pointed star tile
        const starPath = api.brush.beginPath();
        const starPoints = 8;
        const starOuter = tileSize * 0.4;
        const starInner = starOuter * 0.5;

        for (let i = 0; i < starPoints * 2; i++) {
          const angle = (i * Math.PI) / starPoints;
          const r = i % 2 === 0 ? starOuter : starInner;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          if (i === 0) starPath.moveTo(x, y);
          else starPath.lineTo(x, y);
        }
        starPath.closePath();
        starPath.fill({
          fill: createRadialMetallicGradient(state.palette),
          alpha: state.fillAlphaBase * alphaMultiplier,
        });
      } else if (tileType === 1) {
        // Diamond tile
        const diamondSize = tileSize * 0.35;
        const diamondPath = api.brush.beginPath();
        diamondPath.moveTo(0, -diamondSize);
        diamondPath.lineTo(diamondSize, 0);
        diamondPath.lineTo(0, diamondSize);
        diamondPath.lineTo(-diamondSize, 0);
        diamondPath.closePath();
        diamondPath.fill({
          fill: hexToNumeric(colors[2]),
          alpha: state.fillAlphaBase * 0.8 * alphaMultiplier,
        });
      } else {
        // Hexagon tile
        const hexPath = api.brush.beginPath();
        const hexRadius = tileSize * 0.3;
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          const x = Math.cos(angle) * hexRadius;
          const y = Math.sin(angle) * hexRadius;
          if (i === 0) hexPath.moveTo(x, y);
          else hexPath.lineTo(x, y);
        }
        hexPath.closePath();
        hexPath.stroke({
          color: hexToNumeric(colors[1]),
          width: getStrokeWidth(1.5),
          alpha: state.lineAlphaBase * alphaMultiplier,
        });
      }

      api.brush.popMatrix();
    }
  }

  // Arabesque border
  const borderRadius = size * 0.48;
  const arabesqueCount = 12 + Math.floor(state.complexity * 6);

  for (let a = 0; a < arabesqueCount; a++) {
    const angle = (a * Math.PI * 2) / arabesqueCount;
    const nextAngle = ((a + 1) * Math.PI * 2) / arabesqueCount;

    // Curved arabesque segments
    const x1 = Math.cos(angle) * borderRadius;
    const y1 = Math.sin(angle) * borderRadius;
    const x2 = Math.cos(nextAngle) * borderRadius;
    const y2 = Math.sin(nextAngle) * borderRadius;

    const midAngle = (angle + nextAngle) / 2;
    const controlDist = borderRadius * (1.1 + Math.sin(a * 2) * 0.1);
    const cpX = Math.cos(midAngle) * controlDist;
    const cpY = Math.sin(midAngle) * controlDist;

    api.brush.quadratic(
      { x: x1, y: y1 },
      { x: cpX, y: cpY },
      { x: x2, y: y2 },
      {
        color: hexToNumeric(colors[0]),
        width: getStrokeWidth(2),
        alpha: state.lineAlphaBase * alphaMultiplier,
      }
    );
  }

  // Central medallion with horseshoe arch motif
  api.brush.circle(0, 0, tileSize * 0.8, {
    fill: createRadialMetallicGradient(state.palette),
    alpha: state.fillAlphaBase * alphaMultiplier,
  });

  api.brush.popMatrix();
}

function drawGreekPattern(api: ActorUpdateAPI, cx: number, cy: number, size: number, isDarkMode: boolean): void {
  const colors = getMetallicPalette(state.palette);
  const alphaMultiplier = isDarkMode ? 1.0 : 0.85;

  api.brush.pushMatrix();
  api.brush.translate(cx, cy);
  api.brush.rotate(state.rotation * 0.2);

  const outerRadius = size * 0.45;
  const meanderDepth = state.greekMeanderDepth;

  // Greek key (meander) border
  const segments = 16 + Math.floor(state.complexity * 8);
  const segmentAngle = (Math.PI * 2) / segments;
  const meanderWidth = (outerRadius * segmentAngle) * 0.6;
  const stepSize = meanderWidth / (meanderDepth * 2);

  for (let s = 0; s < segments; s++) {
    const angle = s * segmentAngle;

    api.brush.pushMatrix();
    api.brush.rotate(angle);
    api.brush.translate(0, -outerRadius);

    // Draw meander key pattern
    const path = api.brush.beginPath();
    let x = -meanderWidth / 2;
    let y = 0;
    path.moveTo(x, y);

    // Meander steps
    for (let d = 0; d < meanderDepth; d++) {
      path.lineTo(x, y + stepSize);
      y += stepSize;
      path.lineTo(x + stepSize * 2, y);
      x += stepSize * 2;
      if (d < meanderDepth - 1) {
        path.lineTo(x, y - stepSize);
        y -= stepSize;
      }
    }

    path.lineTo(meanderWidth / 2, y);

    path.stroke({
      color: hexToNumeric(colors[0]),
      width: getStrokeWidth(2),
      alpha: state.lineAlphaBase * alphaMultiplier,
    });

    api.brush.popMatrix();
  }

  // Inner decorative rings
  const ringCount = state.layerCount;
  for (let r = 1; r <= ringCount; r++) {
    const ringRadius = outerRadius * (0.85 - r * 0.15);
    api.brush.circle(0, 0, ringRadius, {
      stroke: hexToNumeric(colors[r % colors.length]),
      strokeWidth: getStrokeWidth(1.5),
      alpha: (state.lineAlphaBase - r * 0.1) * alphaMultiplier,
    });
  }

  // Acanthus-inspired leaf motifs
  if (state.ornamentDensity > 0.5) {
    const leafCount = 6 + Math.floor(state.complexity * 2);
    const leafRadius = outerRadius * 0.6;

    for (let l = 0; l < leafCount; l++) {
      const angle = (l * Math.PI * 2) / leafCount;

      api.brush.pushMatrix();
      api.brush.rotate(angle);

      // Stylized acanthus leaf
      const leafPath = api.brush.beginPath();
      leafPath.moveTo(0, -leafRadius * 0.3);
      leafPath.quadraticCurveTo(
        leafRadius * 0.15, -leafRadius * 0.5,
        0, -leafRadius * 0.7
      );
      leafPath.quadraticCurveTo(
        -leafRadius * 0.15, -leafRadius * 0.5,
        0, -leafRadius * 0.3
      );
      leafPath.closePath();

      leafPath.fill({
        fill: createMetallicGradient(state.palette, 'vertical'),
        alpha: state.fillAlphaBase * 0.7 * alphaMultiplier,
      });

      api.brush.popMatrix();
    }
  }

  // Central medallion - Greek column capital motif
  api.brush.circle(0, 0, outerRadius * 0.25, {
    fill: createRadialMetallicGradient(state.palette),
    alpha: state.fillAlphaBase * alphaMultiplier,
  });

  // Egg and dart pattern around center
  if (state.ornamentDensity > 0.3) {
    const eggCount = 8 + Math.floor(state.complexity * 4);
    const eggRadius = outerRadius * 0.35;

    for (let e = 0; e < eggCount; e++) {
      const angle = (e * Math.PI * 2) / eggCount;
      const ex = Math.cos(angle) * eggRadius;
      const ey = Math.sin(angle) * eggRadius;

      if (e % 2 === 0) {
        // Egg (ellipse) - use transform for rotation
        api.brush.pushMatrix();
        api.brush.translate(ex, ey);
        api.brush.rotate(angle);
        api.brush.ellipse(0, 0, outerRadius * 0.04, outerRadius * 0.06, {
          fill: hexToNumeric(colors[0]),
          alpha: state.fillAlphaBase * 0.6 * alphaMultiplier,
        });
        api.brush.popMatrix();
      } else {
        // Dart (small triangle pointing outward)
        const dartSize = outerRadius * 0.03;
        const dartPath = api.brush.beginPath();
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        dartPath.moveTo(ex + dx * dartSize, ey + dy * dartSize);
        dartPath.lineTo(ex - dy * dartSize * 0.5, ey + dx * dartSize * 0.5);
        dartPath.lineTo(ex + dy * dartSize * 0.5, ey - dx * dartSize * 0.5);
        dartPath.closePath();
        dartPath.fill({
          fill: hexToNumeric(colors[2]),
          alpha: state.lineAlphaBase * alphaMultiplier,
        });
      }
    }
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

    // Initialize style and palette
    state.style = PATTERN_STYLES[Math.floor(Math.random() * PATTERN_STYLES.length)];
    state.palette = ALL_PALETTES[Math.floor(Math.random() * ALL_PALETTES.length)];

    // === Randomize all variability settings ===
    state.rotation = 0;
    state.rotationSpeed = 0.00005 + Math.random() * 0.0004;  // 0.00005 - 0.00045
    state.scale = 0.1;
    state.targetScale = 1;
    state.growthProgress = 0;
    state.complexity = 1 + Math.random() * 4;  // 1-5

    // Center position with slight offset variability
    state.centerX = width / 2 + (Math.random() - 0.5) * width * 0.1;
    state.centerY = height / 2 + (Math.random() - 0.5) * height * 0.1;
    state.patternOffsetX = (Math.random() - 0.5) * 0.1;
    state.patternOffsetY = (Math.random() - 0.5) * 0.1;

    // Style-specific parameters with high variability
    state.islamicStarPoints = 5 + Math.floor(Math.random() * 10);  // 5-14 points
    state.artDecoFanCount = 6 + Math.floor(Math.random() * 14);   // 6-20 fans
    state.bauhausShapeIndex = 0;
    state.japaneseWavePhase = 0;
    state.gothicArchCount = 4 + Math.floor(Math.random() * 8);    // 4-12 arches
    state.celticSpiralCount = 2 + Math.floor(Math.random() * 4);  // 2-5 spirals
    state.moorishTileRows = 3 + Math.floor(Math.random() * 5);    // 3-7 rows
    state.greekMeanderDepth = 2 + Math.floor(Math.random() * 4);  // 2-5 depth

    // Timing variability
    state.styleChangeTimer = 0;
    state.styleChangeDuration = 10000 + Math.random() * 20000;  // 10-30 seconds

    // Visual variability
    state.bgAlphaMultiplier = 0.1 + Math.random() * 0.9;        // 0.1-1.0
    state.strokeWidthBase = 1 + Math.random() * 3;              // 1-4
    state.strokeWidthVariation = 0.2 + Math.random() * 0.6;     // 0.2-0.8
    state.layerCount = 2 + Math.floor(Math.random() * 6);       // 2-7 layers
    state.animationSpeed = 0.5 + Math.random() * 1.5;           // 0.5-2.0
    state.pulseAmplitude = 0.01 + Math.random() * 0.04;         // 0.01-0.05
    state.pulseSpeed = 0.3 + Math.random() * 0.7;               // 0.3-1.0
    state.innerRadiusRatio = 0.25 + Math.random() * 0.35;       // 0.25-0.6
    state.ornamentDensity = 0.3 + Math.random() * 0.7;          // 0.3-1.0
    state.lineAlphaBase = 0.3 + Math.random() * 0.5;            // 0.3-0.8
    state.fillAlphaBase = 0.5 + Math.random() * 0.4;            // 0.5-0.9
    state.shadowBlur = 8 + Math.random() * 20;                  // 8-28
    state.shadowOffset = 2 + Math.random() * 8;                 // 2-10
    state.cornerElementSize = 0.08 + Math.random() * 0.12;      // 0.08-0.2
    state.showCornerElements = Math.random() > 0.3;             // 70% chance

    console.log(
      `[architectural-patterns] Setup: style=${state.style}, palette=${state.palette}, ` +
      `complexity=${state.complexity.toFixed(1)}, layers=${state.layerCount}, ` +
      `ornamentDensity=${state.ornamentDensity.toFixed(2)}, bgAlpha=${state.bgAlphaMultiplier.toFixed(2)}`
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;
    const time = frame.time * 0.001;

    const isDarkMode = api.context.display.isDarkMode();
    const alphaMultiplier = isDarkMode ? 1.0 : 0.8;

    // ============ Update timers and state ============

    state.styleChangeTimer += dt;
    state.rotation += state.rotationSpeed * state.animationSpeed * dt;
    state.japaneseWavePhase = Math.sin(time * 0.3 * state.animationSpeed);

    // Change style periodically
    if (state.styleChangeTimer >= state.styleChangeDuration) {
      state.styleChangeTimer = 0;
      const currentIndex = PATTERN_STYLES.indexOf(state.style);
      state.style = PATTERN_STYLES[(currentIndex + 1) % PATTERN_STYLES.length];
      state.styleChangeDuration = 10000 + Math.random() * 20000;

      // Also change palette with some randomization
      state.palette = ALL_PALETTES[Math.floor(Math.random() * ALL_PALETTES.length)];

      // Slightly randomize some parameters on style change
      state.ornamentDensity = 0.3 + Math.random() * 0.7;
      state.innerRadiusRatio = 0.25 + Math.random() * 0.35;

      // Reset scale for growth animation
      state.scale = 0.3;
      state.targetScale = 1;
    }

    // Animate scale (growth effect)
    state.scale += (state.targetScale - state.scale) * 0.02;

    // Pulse scale with variable amplitude and speed
    const scalePulse = 1 + Math.sin(time * state.pulseSpeed) * state.pulseAmplitude;
    const currentScale = state.scale * scalePulse;

    // ============ Draw background ============

    const bam = state.bgAlphaMultiplier;

    const bgGradient: Gradient = isDarkMode
      ? {
          type: 'radial',
          cx: 0.5,
          cy: 0.5,
          radius: 0.7,
          stops: [
            { offset: 0, color: `rgba(26, 26, 46, ${Math.max(0.1, 0.85 * bam)})` },
            { offset: 0.6, color: `rgba(18, 18, 35, ${Math.max(0.1, 0.6 * bam)})` },
            { offset: 0.85, color: `rgba(10, 10, 21, ${Math.max(0.1, 0.3 * bam)})` },
            { offset: 1, color: `rgba(10, 10, 21, ${0.1 * bam})` },
          ],
        }
      : {
          type: 'radial',
          cx: 0.5,
          cy: 0.5,
          radius: 0.7,
          stops: [
            { offset: 0, color: `rgba(255, 255, 250, ${Math.max(0.1, 0.85 * bam)})` },
            { offset: 0.6, color: `rgba(248, 248, 245, ${Math.max(0.1, 0.6 * bam)})` },
            { offset: 0.85, color: `rgba(240, 240, 235, ${Math.max(0.1, 0.3 * bam)})` },
            { offset: 1, color: `rgba(240, 240, 235, ${0.1 * bam})` },
          ],
        };

    api.brush.rect(0, 0, width, height, {
      fill: bgGradient,
    });

    // ============ Apply drop shadow for depth ============

    const shadowColor = isDarkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.25)';
    api.filter.dropShadow(shadowColor, state.shadowBlur, state.shadowOffset, state.shadowOffset);

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
        drawIslamicPattern(api, state.centerX, state.centerY, patternSize, isDarkMode);
        break;
      case 'artDeco':
        drawArtDecoPattern(api, state.centerX, state.centerY, patternSize, isDarkMode);
        break;
      case 'bauhaus':
        drawBauhausPattern(api, state.centerX, state.centerY, patternSize, isDarkMode);
        break;
      case 'japanese':
        drawJapanesePattern(api, state.centerX, state.centerY, patternSize, isDarkMode);
        break;
      case 'gothic':
        drawGothicPattern(api, state.centerX, state.centerY, patternSize, isDarkMode);
        break;
      case 'celtic':
        drawCelticPattern(api, state.centerX, state.centerY, patternSize, isDarkMode);
        break;
      case 'moorish':
        drawMoorishPattern(api, state.centerX, state.centerY, patternSize, isDarkMode);
        break;
      case 'greek':
        drawGreekPattern(api, state.centerX, state.centerY, patternSize, isDarkMode);
        break;
    }

    api.brush.popMatrix();

    // ============ Add decorative corner elements (conditionally) ============

    if (state.showCornerElements) {
      const cornerSize = Math.min(width, height) * state.cornerElementSize;
      const cornerMargin = cornerSize * 0.3;

      const corners = [
        { x: cornerMargin, y: cornerMargin },
        { x: width - cornerMargin - cornerSize, y: cornerMargin },
        { x: cornerMargin, y: height - cornerMargin - cornerSize },
        { x: width - cornerMargin - cornerSize, y: height - cornerMargin - cornerSize },
      ];

      const cornerGradient = createMetallicGradient(state.palette, 'diagonal');

      for (let i = 0; i < corners.length; i++) {
        const corner = corners[i];

        api.brush.roundRect(
          corner.x, corner.y,
          cornerSize, cornerSize * 0.3,
          5,
          {
            fill: cornerGradient,
            alpha: state.lineAlphaBase * alphaMultiplier,
          }
        );
      }
    }

    // ============ Subtle vignette ============

    const vignetteStrength = isDarkMode ? 0.3 : 0.4;
    api.filter.vignette(vignetteStrength, 0.6);
  },

  async teardown(): Promise<void> {
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
