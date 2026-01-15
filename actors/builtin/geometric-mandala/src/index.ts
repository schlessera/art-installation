/**
 * Geometric Mandala Actor
 *
 * Creates sacred geometry patterns with rotating polygons and stars.
 * Uses transform APIs, blend modes, and time context for evolving visuals.
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  BlendMode,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'geometric-mandala',
  name: 'Geometric Mandala',
  description: 'Sacred geometry with rotating polygons and stars',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['geometry', 'mandala', 'sacred', 'transforms', 'ambient'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 90,
  requiredContexts: ['time'],
};

interface RGB {
  r: number;
  g: number;
  b: number;
}

// Color palettes for variety
const COLOR_PALETTES: { name: string; colors: RGB[] }[] = [
  {
    name: 'Jewel',
    colors: [
      { r: 155, g: 89, b: 182 },  // Amethyst
      { r: 46, g: 134, b: 193 },  // Sapphire
      { r: 26, g: 188, b: 156 },  // Emerald
      { r: 241, g: 196, b: 15 },  // Topaz
      { r: 231, g: 76, b: 60 },   // Ruby
    ],
  },
  {
    name: 'Earth',
    colors: [
      { r: 139, g: 90, b: 43 },   // Sienna
      { r: 160, g: 120, b: 85 },  // Tan
      { r: 85, g: 107, b: 47 },   // Olive
      { r: 188, g: 152, b: 126 }, // Sandstone
      { r: 101, g: 67, b: 33 },   // Brown
    ],
  },
  {
    name: 'Neon',
    colors: [
      { r: 255, g: 0, b: 255 },   // Magenta
      { r: 0, g: 255, b: 255 },   // Cyan
      { r: 255, g: 255, b: 0 },   // Yellow
      { r: 0, g: 255, b: 128 },   // Spring green
      { r: 255, g: 128, b: 0 },   // Orange
    ],
  },
  {
    name: 'Pastel',
    colors: [
      { r: 255, g: 182, b: 193 }, // Pink
      { r: 173, g: 216, b: 230 }, // Light blue
      { r: 255, g: 218, b: 185 }, // Peach
      { r: 221, g: 160, b: 221 }, // Plum
      { r: 176, g: 224, b: 230 }, // Powder blue
    ],
  },
  {
    name: 'Monochrome',
    colors: [
      { r: 255, g: 255, b: 255 }, // White
      { r: 200, g: 200, b: 200 }, // Light gray
      { r: 150, g: 150, b: 150 }, // Gray
      { r: 100, g: 100, b: 100 }, // Dark gray
      { r: 50, g: 50, b: 50 },    // Charcoal
    ],
  },
];

// Blend modes per display mode
const DARK_BLEND_MODES: BlendMode[] = ['normal', 'add', 'screen'];
const LIGHT_BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'darken'];

// Symmetry options for radial patterns
const SYMMETRY_OPTIONS = [6, 8, 10, 12, 16];

// Rotation behavior modes
type RotationBehavior = 'uniform' | 'alternating' | 'wave' | 'breathing';
const ROTATION_BEHAVIORS: RotationBehavior[] = ['uniform', 'alternating', 'wave', 'breathing'];

// Center ornament styles
type CenterStyle = 'glow' | 'flower' | 'nested' | 'star';
const CENTER_STYLES: CenterStyle[] = ['glow', 'flower', 'nested', 'star'];

// Color animation modes
type ColorMode = 'static' | 'cycling' | 'breathing' | 'offset';
const COLOR_MODES: ColorMode[] = ['static', 'cycling', 'breathing', 'offset'];

// Layer configuration
interface Layer {
  type: 'polygon' | 'star';
  sides: number;        // For polygon, or points for star
  radius: number;       // Base radius
  radiusVariation: number; // Pulsing variation
  rotationSpeed: number;
  rotationDirection: number; // 1 or -1
  colorIndex: number;
  phase: number;        // Rotation phase offset
  innerRatio: number;   // For stars only (inner/outer radius ratio)
}

// Pre-allocated state
interface MandalaState {
  layers: Layer[];
  layerCount: number;
  palette: RGB[];
  paletteName: string;
  blendMode: BlendMode;
  centerX: number;
  centerY: number;
  baseRotation: number;
  pulsePhase: number;
  scaleMultiplier: number; // Random overall scale
  glowTexture: string;     // Pre-rendered glow texture for central ornament
  // Variability options
  symmetryCount: number;
  rotationBehavior: RotationBehavior;
  centerStyle: CenterStyle;
  colorMode: ColorMode;
  colorPhase: number;
}

// Maximum layers is determined dynamically (3-8 range)

let state: MandalaState = {
  layers: [],
  layerCount: 0,
  palette: [],
  paletteName: '',
  blendMode: 'normal',
  centerX: 0,
  centerY: 0,
  baseRotation: 0,
  pulsePhase: 0,
  scaleMultiplier: 1,
  glowTexture: '',
  // Variability defaults
  symmetryCount: 8,
  rotationBehavior: 'uniform',
  centerStyle: 'glow',
  colorMode: 'static',
  colorPhase: 0,
};

/**
 * Create pre-rendered soft glow texture for central ornament.
 * Called once in setup(), reused for the central glow effect.
 * Reduces 4 layered circle calls to 1 image call.
 */
function createGlowTexture(): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.7)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.35)');
  gradient.addColorStop(0.65, 'rgba(255, 255, 255, 0.12)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const dataUrl = canvas.toDataURL();

  // Clean up canvas
  canvas.width = 0;
  canvas.height = 0;

  return dataUrl;
}

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

/**
 * Adjust color lightness for display mode.
 * Dark mode: keeps colors as-is or slightly brighter (high lightness works well)
 * Light mode: darkens colors so they're visible against white background
 */
function adjustColorForMode(color: RGB, isDarkMode: boolean): RGB {
  if (isDarkMode) {
    // Keep original colors for dark mode
    return color;
  }

  // For light mode, reduce brightness to around 30-50% of original
  // This makes vibrant colors visible against white backgrounds
  const factor = 0.4;
  return {
    r: Math.round(color.r * factor),
    g: Math.round(color.g * factor),
    b: Math.round(color.b * factor),
  };
}

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    // Pre-render glow texture once
    state.glowTexture = createGlowTexture();

    // Random palette selection
    const paletteData = COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)];
    state.palette = paletteData.colors;
    state.paletteName = paletteData.name;

    // Random blend mode - will be updated per-frame based on display mode
    state.blendMode = DARK_BLEND_MODES[Math.floor(Math.random() * DARK_BLEND_MODES.length)];

    // Random variability options
    state.symmetryCount = SYMMETRY_OPTIONS[Math.floor(Math.random() * SYMMETRY_OPTIONS.length)];
    state.rotationBehavior = ROTATION_BEHAVIORS[Math.floor(Math.random() * ROTATION_BEHAVIORS.length)];
    state.centerStyle = CENTER_STYLES[Math.floor(Math.random() * CENTER_STYLES.length)];
    state.colorMode = COLOR_MODES[Math.floor(Math.random() * COLOR_MODES.length)];
    state.colorPhase = 0;

    // Center of mandala
    state.centerX = width / 2;
    state.centerY = height / 2;

    // Random scale multiplier (0.6 to 1.2 of base sizing)
    state.scaleMultiplier = 0.6 + Math.random() * 0.6;

    // Random number of layers (3-8)
    state.layerCount = 3 + Math.floor(Math.random() * 6);

    // Calculate max radius based on canvas size
    const maxRadius = Math.min(width, height) * 0.45 * state.scaleMultiplier;

    // Pre-allocate layers
    state.layers = [];
    for (let i = 0; i < state.layerCount; i++) {
      // Alternate between polygons and stars, with some randomness
      const isPolygon = Math.random() > 0.4;

      // Sides/points: relate to symmetry count for cohesive patterns
      const baseSides = Math.floor(state.symmetryCount / 2);
      const sides = isPolygon
        ? Math.max(3, baseSides + Math.floor(Math.random() * 3))
        : Math.max(4, baseSides + Math.floor(Math.random() * 4));

      // Radius decreases as we go outward (inverted layering for depth)
      const layerProgress = i / (state.layerCount - 1);
      const baseRadius = maxRadius * (0.2 + layerProgress * 0.8);

      const layer: Layer = {
        type: isPolygon ? 'polygon' : 'star',
        sides,
        radius: baseRadius,
        radiusVariation: baseRadius * (0.05 + Math.random() * 0.1),
        rotationSpeed: 0.1 + Math.random() * 0.4,
        rotationDirection: Math.random() > 0.5 ? 1 : -1,
        colorIndex: i % state.palette.length,
        phase: (i / state.layerCount) * Math.PI * 2,
        innerRatio: 0.3 + Math.random() * 0.3, // For stars: 0.3-0.6
      };

      state.layers.push(layer);
    }

    state.baseRotation = 0;
    state.pulsePhase = 0;

    console.log(
      `[geometric-mandala] Setup: ${state.layerCount} layers, palette: ${state.paletteName}, blend: ${state.blendMode}, scale: ${state.scaleMultiplier.toFixed(2)}, symmetry: ${state.symmetryCount}, rotation: ${state.rotationBehavior}, center: ${state.centerStyle}, color: ${state.colorMode}`
    );
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000; // Convert to seconds

    // Get display mode for color and blend mode adaptation
    const isDarkMode = api.context.display.isDarkMode();

    // Select appropriate blend mode for display mode
    // Map the index from dark blend modes to equivalent light blend modes
    const darkIndex = DARK_BLEND_MODES.indexOf(state.blendMode);
    const effectiveBlendMode = isDarkMode
      ? state.blendMode
      : LIGHT_BLEND_MODES[darkIndex >= 0 ? darkIndex : 0];

    // Blend mode for additive effects (vertex circles, center ornaments)
    const additiveBlendMode: BlendMode = isDarkMode ? 'add' : 'multiply';

    // Get accent color for center elements (white on dark, black on light)
    const accentColor = api.context.display.accentColor();

    // Get time context for color warmth modulation
    const dayProgress = api.context.time.dayProgress();

    // Day progress affects overall warmth (warmer during day)
    const warmth = Math.sin(dayProgress * Math.PI); // 0 at midnight, 1 at noon

    // Calculate rotation speed multiplier based on behavior
    let rotationMultiplier = 1;
    switch (state.rotationBehavior) {
      case 'uniform':
        rotationMultiplier = 1;
        break;
      case 'alternating':
        // Already handled by rotationDirection per layer
        rotationMultiplier = 1;
        break;
      case 'wave':
        // Rotation speed oscillates over time
        rotationMultiplier = 0.5 + Math.sin(state.pulsePhase * 0.5) * 0.5;
        break;
      case 'breathing':
        // Slow breathing pattern
        rotationMultiplier = 0.3 + Math.sin(state.pulsePhase * 0.2) * 0.7;
        break;
    }

    // Update phases - rotation speed varies slightly with time
    state.baseRotation += dt * (0.08 + dayProgress * 0.04) * rotationMultiplier;
    state.pulsePhase += dt * 2; // Pulse frequency
    state.colorPhase += dt * 0.3; // Color cycle phase

    // Global pulse factor
    const globalPulse = 1 + Math.sin(state.pulsePhase) * 0.05;

    // Draw layers from back to front (largest to smallest)
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const layer = state.layers[i];

      // Calculate current radius with pulsing
      const layerPulse = Math.sin(state.pulsePhase + layer.phase);
      const currentRadius = (layer.radius + layer.radiusVariation * layerPulse) * globalPulse;

      // Calculate rotation for this layer
      const rotation =
        state.baseRotation * layer.rotationSpeed * layer.rotationDirection + layer.phase;

      // Get color based on colorMode
      const baseColor = state.palette[layer.colorIndex];
      const warmColor = { r: 255, g: 200, b: 150 }; // Warm tint
      let modulatedColor: RGB;

      switch (state.colorMode) {
        case 'cycling': {
          // Shift through palette over time
          const cycleIndex = (layer.colorIndex + Math.floor(state.colorPhase)) % state.palette.length;
          modulatedColor = state.palette[cycleIndex];
          break;
        }
        case 'breathing': {
          // Pulse brightness with time
          const breathFactor = 0.7 + Math.sin(state.pulsePhase + layer.phase) * 0.3;
          modulatedColor = {
            r: Math.round(baseColor.r * breathFactor),
            g: Math.round(baseColor.g * breathFactor),
            b: Math.round(baseColor.b * breathFactor),
          };
          break;
        }
        case 'offset': {
          // Interpolate between adjacent palette colors per layer
          const offsetPhase = state.pulsePhase + layer.phase;
          const t = (Math.sin(offsetPhase) + 1) * 0.5;
          const nextColor = state.palette[(layer.colorIndex + 1) % state.palette.length];
          modulatedColor = lerpColor(baseColor, nextColor, t);
          break;
        }
        default: // 'static'
          // Original warmth-based modulation
          modulatedColor = lerpColor(baseColor, warmColor, warmth * 0.2);
      }

      // Adjust color for display mode (darken for light mode)
      modulatedColor = adjustColorForMode(modulatedColor, isDarkMode);

      // Alpha based on layer depth (inner layers more visible)
      // Light mode uses slightly lower alpha for softer appearance
      const layerDepth = i / state.layers.length;
      const baseAlpha = 0.6 + layerDepth * 0.3; // 0.6-0.9 range
      const alpha = isDarkMode ? baseAlpha : baseAlpha * 0.8;

      // Apply transforms
      api.brush.pushMatrix();
      api.brush.translate(state.centerX, state.centerY);
      api.brush.rotate(rotation);

      const colorNumeric = rgbToNumeric(modulatedColor);
      if (layer.type === 'polygon') {
        // Draw regular polygon - use blendMode in style, not globally
        api.brush.regularPolygon(0, 0, currentRadius, layer.sides, {
          stroke: colorNumeric,
          alpha: alpha,
          strokeWidth: 3 + layerDepth * 3,
          blendMode: effectiveBlendMode,
        });

        // Inner filled polygon for depth
        api.brush.regularPolygon(0, 0, currentRadius * 0.6, layer.sides, {
          fill: colorNumeric,
          alpha: alpha * 0.4,
          blendMode: effectiveBlendMode,
        });
      } else {
        // Draw star
        const innerRadius = currentRadius * layer.innerRatio;
        api.brush.star(0, 0, currentRadius, innerRadius, layer.sides, {
          stroke: colorNumeric,
          alpha: alpha,
          strokeWidth: 2.5 + layerDepth * 2.5,
          blendMode: effectiveBlendMode,
        });

        // Inner star for depth
        api.brush.star(0, 0, currentRadius * 0.5, innerRadius * 0.5, layer.sides, {
          fill: colorNumeric,
          alpha: alpha * 0.35,
          blendMode: effectiveBlendMode,
        });
      }

      // Restore transform
      api.brush.popMatrix();

      // Draw connecting circles at vertices for some layers
      if (i % 2 === 0 && layer.type === 'polygon') {
        const vertexCount = layer.sides;
        for (let v = 0; v < vertexCount; v++) {
          const angle = rotation + (v / vertexCount) * Math.PI * 2;
          const vx = state.centerX + Math.cos(angle) * currentRadius;
          const vy = state.centerY + Math.sin(angle) * currentRadius;

          api.brush.circle(vx, vy, 3 + layerDepth * 4, {
            fill: colorNumeric,
            alpha: isDarkMode ? alpha * 0.6 : alpha * 0.5,
            blendMode: additiveBlendMode,
          });
        }
      }
    }

    // Central ornament
    const centerPulse = 1 + Math.sin(state.pulsePhase * 1.5) * 0.15;
    const centerRadius = 15 * state.scaleMultiplier * centerPulse;
    // Adjust center color for display mode
    const centerColor = adjustColorForMode(state.palette[0], isDarkMode);
    const centerColorNumeric = rgbToNumeric(centerColor);

    switch (state.centerStyle) {
      case 'glow': {
        // Original glow implementation with pre-rendered texture
        const glowSize = centerRadius * 5;
        api.brush.image(state.glowTexture, state.centerX, state.centerY, {
          width: glowSize,
          height: glowSize,
          tint: centerColorNumeric,
          alpha: isDarkMode ? 0.6 : 0.4,
          blendMode: additiveBlendMode,
        });
        api.brush.circle(state.centerX, state.centerY, centerRadius * 0.4, {
          fill: accentColor,
          alpha: 0.8,
        });
        break;
      }

      case 'flower': {
        // Flower petals radiating from center
        const petalCount = state.symmetryCount;
        for (let p = 0; p < petalCount; p++) {
          const angle = (p / petalCount) * Math.PI * 2 + state.baseRotation * 0.5;
          const petalX = state.centerX + Math.cos(angle) * centerRadius;
          const petalY = state.centerY + Math.sin(angle) * centerRadius;
          api.brush.circle(petalX, petalY, centerRadius * 0.5, {
            fill: centerColorNumeric,
            alpha: isDarkMode ? 0.5 : 0.4,
            blendMode: additiveBlendMode,
          });
        }
        // Accent color center (white on dark, black on light)
        api.brush.circle(state.centerX, state.centerY, centerRadius * 0.35, {
          fill: accentColor,
          alpha: 0.9,
        });
        break;
      }

      case 'nested': {
        // Concentric stroke-only circles
        for (let n = 3; n > 0; n--) {
          api.brush.circle(state.centerX, state.centerY, centerRadius * (n / 2.5), {
            stroke: centerColorNumeric,
            strokeWidth: 2,
            alpha: 0.4 + (3 - n) * 0.2,
          });
        }
        // Small center dot (accent color)
        api.brush.circle(state.centerX, state.centerY, centerRadius * 0.15, {
          fill: accentColor,
          alpha: 0.9,
        });
        break;
      }

      case 'star': {
        // Central star shape
        const starPoints = Math.max(4, Math.floor(state.symmetryCount / 2));
        api.brush.star(
          state.centerX,
          state.centerY,
          centerRadius,
          centerRadius * 0.4,
          starPoints,
          {
            fill: centerColorNumeric,
            alpha: isDarkMode ? 0.7 : 0.6,
            blendMode: additiveBlendMode,
          }
        );
        // Bright center (accent color)
        api.brush.circle(state.centerX, state.centerY, centerRadius * 0.25, {
          fill: accentColor,
          alpha: 0.85,
        });
        break;
      }
    }
  },

  async teardown(): Promise<void> {
    state.layers = [];
    state.layerCount = 0;
    state.palette = [];
    state.paletteName = '';
    state.glowTexture = '';
    state.baseRotation = 0;
    state.pulsePhase = 0;
    state.colorPhase = 0;
    state.symmetryCount = 8;
    state.rotationBehavior = 'uniform';
    state.centerStyle = 'glow';
    state.colorMode = 'static';
    console.log('[geometric-mandala] Teardown complete');
  },
};

registerActor(actor);

export default actor;
