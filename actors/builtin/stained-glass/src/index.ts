/**
 * Stained Glass Filter Actor
 *
 * Transforms the canvas into a stained glass window with:
 * - Voronoi cell divisions (computed per-pixel in shader)
 * - Lead lines between cells (dark on dark mode, light on light mode)
 * - Color sampling at cell centers
 * - Light transmission effect (brightness pulsing)
 * - Subtle cell center drift (Brownian motion)
 * - Lead line shimmer
 *
 * Adapts to light/dark mode:
 * - Dark mode: Traditional dark lead lines, saturated cells, darkening vignette
 * - Light mode: Light/silver lead lines, adjusted saturation, lightening vignette
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'stained-glass',
  name: 'Stained Glass',
  description: 'Stained glass window effect with Voronoi cells and lead lines',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'stained-glass', 'voronoi', 'traditional', 'craft'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  requiredContexts: ['display'],
  role: 'filter',
};

// Number of Voronoi cells (reduced for performance)
const CELL_COUNT = 25;

// Pre-generate cell centers with fixed seed for consistency
function generateCellCenters(): { x: number; y: number }[] {
  const centers: { x: number; y: number }[] = [];
  let s = 42; // seed

  const random = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  for (let i = 0; i < CELL_COUNT; i++) {
    centers.push({ x: random(), y: random() });
  }

  return centers;
}

// Generate shader with embedded cell centers
// isDarkMode: true = dark lead lines, false = light/silver lead lines
function generateShader(centers: { x: number; y: number }[], isDarkMode: boolean): string {
  // Generate cell center lookup function (unrolled for GLSL compatibility)
  const getCenterCases = centers
    .map((c, i) => `    if (idx == ${i}) return vec2(${c.x.toFixed(6)}, ${c.y.toFixed(6)});`)
    .join('\n');

  // Mode-specific values for lead color and saturation
  const leadColorBase = isDarkMode
    ? 'vec3(0.08, 0.07, 0.06)' // Dark metallic lead
    : 'vec3(0.85, 0.87, 0.90)'; // Light silver lead
  const highlightAmount = isDarkMode ? '0.15' : '-0.12'; // Darken highlight for light mode
  const saturationBoost = isDarkMode ? '1.4' : '1.25'; // Less saturation boost on light backgrounds
  const lightPulseAmount = isDarkMode ? '0.15' : '0.10'; // Subtler pulse on light backgrounds
  const glowMultiplier = isDarkMode ? '0.1' : '0.05'; // Less glow on light backgrounds
  const blackLift = isDarkMode
    ? 'result = result * 0.95 + 0.05;' // Lift blacks on dark mode
    : 'result = result * 0.92 + 0.02;'; // Slight adjustment for light mode

  return `
  // Hash for drift animation
  float hash(float n) {
    return fract(sin(n) * 43758.5453);
  }

  // Get cell center by index (embedded for GLSL compatibility)
  vec2 getCellCenter(int idx) {
${getCenterCases}
    return vec2(0.5, 0.5);
  }

  void main() {
    vec2 uv = vTextureCoord;
    vec2 pixelCoord = uv * uResolution;

    // Find nearest and second-nearest cell centers
    float minDist = 10000.0;
    float secondMinDist = 10000.0;
    int nearestCell = 0;
    vec2 nearestCenter = vec2(0.0);

    for (int i = 0; i < ${CELL_COUNT}; i++) {
      // Apply Brownian motion drift to cell centers
      float driftX = sin(uTime * 0.3 + hash(float(i)) * 6.28) * 0.01;
      float driftY = cos(uTime * 0.25 + hash(float(i) + 100.0) * 6.28) * 0.01;

      vec2 center = getCellCenter(i) + vec2(driftX, driftY);
      center = center * uResolution;

      float dist = length(pixelCoord - center);

      if (dist < minDist) {
        secondMinDist = minDist;
        minDist = dist;
        nearestCell = i;
        nearestCenter = center;
      } else if (dist < secondMinDist) {
        secondMinDist = dist;
      }
    }

    // Sample color at cell center
    vec2 sampleUV = nearestCenter / uResolution;
    sampleUV = clamp(sampleUV, 0.0, 1.0);
    vec4 cellColor = texture(uTexture, sampleUV);

    // Boost saturation for stained glass vibrancy (adjusted for display mode)
    float lum = dot(cellColor.rgb, vec3(0.299, 0.587, 0.114));
    cellColor.rgb = mix(vec3(lum), cellColor.rgb, ${saturationBoost});

    // Light transmission pulse (each cell has different phase)
    float cellPhase = hash(float(nearestCell)) * 6.28;
    float lightPulse = 1.0 + sin(uTime * 2.0 + cellPhase) * ${lightPulseAmount};
    cellColor.rgb *= lightPulse;

    // Lead line detection (edge between cells)
    float edgeDist = secondMinDist - minDist;

    // Lead width with shimmer
    float leadWidth = 6.0;
    float shimmer = 1.0 + sin(uTime * 4.0 + minDist * 0.1) * 0.1;
    float leadThreshold = leadWidth * shimmer;

    float leadMask = smoothstep(leadThreshold, leadThreshold * 0.5, edgeDist);

    // Lead color (mode-dependent: dark metallic or light silver)
    vec3 leadColor = ${leadColorBase};

    // Add subtle metallic highlight to lead
    float highlight = smoothstep(leadThreshold * 0.8, leadThreshold * 0.3, edgeDist);
    highlight *= smoothstep(leadThreshold * 0.2, leadThreshold * 0.5, edgeDist);
    leadColor += highlight * ${highlightAmount};

    // Combine glass and lead
    vec3 result = mix(cellColor.rgb, leadColor, leadMask);

    // Add slight glow at cell edges (light bleeding through glass edge)
    float glowDist = smoothstep(leadThreshold * 2.0, leadThreshold, edgeDist);
    result += cellColor.rgb * glowDist * ${glowMultiplier};

    // Overall light transmission effect
    ${blackLift}

    finalColor = vec4(result, 1.0);
  }
`;
}

interface GlassState {
  shaderDark: string;
  shaderLight: string;
  filterOpacity: number;
}

let state: GlassState = {
  shaderDark: '',
  shaderLight: '',
  filterOpacity: 1.0,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Generate cell centers and create shaders for both modes
    const centers = generateCellCenters();
    state.shaderDark = generateShader(centers, true);
    state.shaderLight = generateShader(centers, false);
    state.filterOpacity = 0.5 + Math.pow(Math.random(), 0.5) * 0.5;

    console.log(`[stained-glass] Setup: ${CELL_COUNT} cells, opacity: ${state.filterOpacity.toFixed(2)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    const isDarkMode = api.context.display.isDarkMode();

    // Apply the mode-appropriate stained glass shader
    if (isDarkMode) {
      api.filter.customShader(state.shaderDark);
      // Darkening vignette for depth on dark backgrounds
      api.filter.vignette(0.25, 0.5);
    } else {
      api.filter.customShader(state.shaderLight);
      // Lightening vignette for light backgrounds (negative strength)
      api.filter.vignette(-0.2, 0.5);
    }

    // Apply overall filter opacity
    if (state.filterOpacity < 1.0) {
      api.filter.colorMatrix([
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, state.filterOpacity, 0,
      ]);
    }
  },

  async teardown(): Promise<void> {
    state.shaderDark = '';
    state.shaderLight = '';
    console.log('[stained-glass] Teardown complete');
  },
};

registerActor(actor);

export default actor;
