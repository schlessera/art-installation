/**
 * Cross-Stitch Embroidery Filter Actor
 *
 * Transforms the canvas into a cross-stitch embroidery pattern with:
 * - X-shaped thread stitches on a grid
 * - Limited color palette (thread colors)
 * - Linen fabric texture underneath
 * - Thread shadow/highlight for 3D depth
 * - Subtle animation: shadow angle rotation, fabric drift
 */

import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'cross-stitch',
  name: 'Cross-Stitch',
  description: 'Cross-stitch embroidery effect with thread texture',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['filter', 'embroidery', 'cross-stitch', 'textile', 'traditional'],
  createdAt: new Date('2026-01-13'),
  preferredDuration: 60,
  requiredContexts: [],
  role: 'filter',
};

// Cross-stitch shader with light/dark mode support
// uDarkMode uniform: 1.0 = dark mode, 0.0 = light mode
// Note: uDarkMode is auto-declared by customShader() from the uniforms object
const CROSS_STITCH_SHADER = `
  // Hash for procedural noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // 2D noise for fabric texture
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Get palette color by index (unrolled for GLSL compatibility)
  // Colors are adjusted based on mode for better visibility
  vec3 getPaletteColor(int idx, float darkMode) {
    // Base palette colors (optimized for dark mode - bright, saturated)
    vec3 darkPalette[16];
    darkPalette[0] = vec3(0.85, 0.12, 0.12);   // Red
    darkPalette[1] = vec3(0.15, 0.55, 0.15);   // Forest Green (slightly brighter)
    darkPalette[2] = vec3(0.20, 0.35, 0.75);   // Royal Blue (brighter)
    darkPalette[3] = vec3(0.95, 0.85, 0.20);   // Golden Yellow
    darkPalette[4] = vec3(0.65, 0.20, 0.65);   // Purple (brighter)
    darkPalette[5] = vec3(0.95, 0.55, 0.15);   // Orange
    darkPalette[6] = vec3(0.25, 0.70, 0.70);   // Teal (brighter)
    darkPalette[7] = vec3(0.85, 0.45, 0.60);   // Rose (brighter)
    darkPalette[8] = vec3(0.50, 0.35, 0.20);   // Brown (lighter)
    darkPalette[9] = vec3(0.20, 0.20, 0.20);   // Dark Gray (not pure black)
    darkPalette[10] = vec3(0.95, 0.95, 0.92);  // Cream/White
    darkPalette[11] = vec3(0.55, 0.80, 0.40);  // Lime Green (brighter)
    darkPalette[12] = vec3(0.80, 0.60, 0.80);  // Lavender (brighter)
    darkPalette[13] = vec3(0.95, 0.75, 0.60);  // Peach
    darkPalette[14] = vec3(0.55, 0.65, 0.85);  // Sky Blue (brighter)
    darkPalette[15] = vec3(0.70, 0.70, 0.65);  // Gray (lighter)

    // Light mode palette (darker, more saturated for contrast against light fabric)
    vec3 lightPalette[16];
    lightPalette[0] = vec3(0.70, 0.08, 0.08);   // Red (darker)
    lightPalette[1] = vec3(0.10, 0.35, 0.10);   // Forest Green (darker)
    lightPalette[2] = vec3(0.08, 0.18, 0.55);   // Royal Blue (darker)
    lightPalette[3] = vec3(0.80, 0.65, 0.10);   // Golden Yellow (darker)
    lightPalette[4] = vec3(0.45, 0.10, 0.45);   // Purple (darker)
    lightPalette[5] = vec3(0.80, 0.40, 0.08);   // Orange (darker)
    lightPalette[6] = vec3(0.12, 0.45, 0.45);   // Teal (darker)
    lightPalette[7] = vec3(0.65, 0.25, 0.40);   // Rose (darker)
    lightPalette[8] = vec3(0.30, 0.20, 0.10);   // Brown (darker)
    lightPalette[9] = vec3(0.08, 0.08, 0.08);   // Black
    lightPalette[10] = vec3(0.85, 0.85, 0.80);  // Cream (slightly darker)
    lightPalette[11] = vec3(0.35, 0.55, 0.25);  // Lime Green (darker)
    lightPalette[12] = vec3(0.55, 0.35, 0.55);  // Lavender (darker)
    lightPalette[13] = vec3(0.75, 0.55, 0.40);  // Peach (darker)
    lightPalette[14] = vec3(0.30, 0.40, 0.60);  // Sky Blue (darker)
    lightPalette[15] = vec3(0.45, 0.45, 0.40);  // Gray (darker)

    // Select color based on mode (unrolled loop for GLSL compatibility)
    vec3 darkColor;
    vec3 lightColor;
    if (idx == 0) { darkColor = darkPalette[0]; lightColor = lightPalette[0]; }
    else if (idx == 1) { darkColor = darkPalette[1]; lightColor = lightPalette[1]; }
    else if (idx == 2) { darkColor = darkPalette[2]; lightColor = lightPalette[2]; }
    else if (idx == 3) { darkColor = darkPalette[3]; lightColor = lightPalette[3]; }
    else if (idx == 4) { darkColor = darkPalette[4]; lightColor = lightPalette[4]; }
    else if (idx == 5) { darkColor = darkPalette[5]; lightColor = lightPalette[5]; }
    else if (idx == 6) { darkColor = darkPalette[6]; lightColor = lightPalette[6]; }
    else if (idx == 7) { darkColor = darkPalette[7]; lightColor = lightPalette[7]; }
    else if (idx == 8) { darkColor = darkPalette[8]; lightColor = lightPalette[8]; }
    else if (idx == 9) { darkColor = darkPalette[9]; lightColor = lightPalette[9]; }
    else if (idx == 10) { darkColor = darkPalette[10]; lightColor = lightPalette[10]; }
    else if (idx == 11) { darkColor = darkPalette[11]; lightColor = lightPalette[11]; }
    else if (idx == 12) { darkColor = darkPalette[12]; lightColor = lightPalette[12]; }
    else if (idx == 13) { darkColor = darkPalette[13]; lightColor = lightPalette[13]; }
    else if (idx == 14) { darkColor = darkPalette[14]; lightColor = lightPalette[14]; }
    else { darkColor = darkPalette[15]; lightColor = lightPalette[15]; }

    return mix(lightColor, darkColor, darkMode);
  }

  // Find closest palette color
  vec3 quantizeColor(vec3 color, float darkMode) {
    float minDist = 1000.0;
    vec3 closest = getPaletteColor(0, darkMode);

    for (int i = 0; i < 16; i++) {
      vec3 palColor = getPaletteColor(i, darkMode);
      vec3 diff = color - palColor;
      float dist = dot(diff, diff);
      if (dist < minDist) {
        minDist = dist;
        closest = palColor;
      }
    }

    return closest;
  }

  // Draw X pattern for a stitch
  float drawStitch(vec2 localUV, float cellSize) {
    // Normalize to 0-1 within cell
    vec2 p = localUV / cellSize;

    // Thread width (relative to cell)
    float threadWidth = 0.2;

    // Diagonal 1: bottom-left to top-right
    float d1 = abs(p.x - p.y);
    float stitch1 = smoothstep(threadWidth, threadWidth * 0.6, d1);

    // Diagonal 2: top-left to bottom-right
    float d2 = abs(p.x - (1.0 - p.y));
    float stitch2 = smoothstep(threadWidth, threadWidth * 0.6, d2);

    // Combine for X shape
    return max(stitch1, stitch2);
  }

  void main() {
    vec2 uv = vTextureCoord;
    vec2 pixelCoord = uv * uResolution;

    // --- Grid Configuration ---
    float cellSize = 12.0; // Stitch size in pixels

    // Get cell coordinates
    vec2 cell = floor(pixelCoord / cellSize);
    vec2 localUV = mod(pixelCoord, cellSize);

    // Sample color at cell center
    vec2 cellCenter = (cell + 0.5) * cellSize / uResolution;
    vec4 sampleColor = texture(uTexture, cellCenter);

    // Quantize to thread palette (mode-aware)
    vec3 threadColor = quantizeColor(sampleColor.rgb, uDarkMode);

    // --- Fabric Background (Linen Texture) ---
    // Slowly drifting fabric texture
    vec2 fabricOffset = vec2(uTime * 0.02, uTime * 0.015);
    float fabricNoise = noise((pixelCoord + fabricOffset) * 0.1);

    // Warp and weft pattern (grid lines in fabric)
    float warp = sin(pixelCoord.x * 0.8) * 0.5 + 0.5;
    float weft = sin(pixelCoord.y * 0.8) * 0.5 + 0.5;
    float weave = warp * weft * 0.3 + 0.7;

    // Fabric base color: light linen (light mode) or dark burlap (dark mode)
    vec3 lightFabric = vec3(0.92, 0.88, 0.80);  // Natural linen
    vec3 darkFabric = vec3(0.12, 0.10, 0.08);   // Dark burlap/canvas
    vec3 fabricColor = mix(lightFabric, darkFabric, uDarkMode);
    fabricColor *= weave;
    fabricColor *= 0.9 + fabricNoise * 0.15;

    // --- Draw the stitch ---
    float stitchMask = drawStitch(localUV, cellSize);

    // --- Thread shadow/highlight for depth ---
    // Animate shadow angle slowly
    float shadowAngle = uTime * 0.1;
    vec2 shadowDir = vec2(cos(shadowAngle), sin(shadowAngle)) * 0.5;

    // Sample stitch at shadow offset
    vec2 shadowLocalUV = localUV - shadowDir;
    float shadowMask = drawStitch(shadowLocalUV, cellSize);

    // Shadow intensity varies by mode (darker shadows in light mode)
    float shadowIntensity = mix(0.4, 0.3, uDarkMode);
    float shadow = max(0.0, shadowMask - stitchMask) * shadowIntensity;

    // Highlight on top of thread (brighter highlights in dark mode)
    vec2 highlightLocalUV = localUV + shadowDir * 0.5;
    float highlightMask = drawStitch(highlightLocalUV, cellSize);
    float highlightIntensity = mix(0.15, 0.25, uDarkMode);
    float highlight = max(0.0, stitchMask - highlightMask) * highlightIntensity;

    // --- Thread texture variation ---
    float threadTex = noise(pixelCoord * 0.5);
    vec3 shadedThread = threadColor * (0.9 + threadTex * 0.2);

    // Add highlight/shadow to thread
    shadedThread = shadedThread * (1.0 - shadow * 0.5);
    shadedThread = shadedThread + highlight;

    // --- Combine fabric and stitch ---
    vec3 result = fabricColor;

    // Apply shadow first (on fabric where thread will go)
    result = result * (1.0 - shadow);

    // Apply thread
    result = mix(result, shadedThread, stitchMask);

    // Subtle gaps at stitch edges (fabric showing through)
    float edgeFade = smoothstep(0.0, 0.15, min(localUV.x, localUV.y) / cellSize);
    edgeFade *= smoothstep(0.0, 0.15, min(cellSize - localUV.x, cellSize - localUV.y) / cellSize);
    result = mix(fabricColor, result, edgeFade);

    finalColor = vec4(result, 1.0);
  }
`;

interface StitchState {
  cellSize: number;
  filterOpacity: number;
}

let state: StitchState = {
  cellSize: 12.0,
  filterOpacity: 1.0,
};

const actor: Actor = {
  metadata,

  async setup(): Promise<void> {
    // Randomize stitch size slightly
    state.cellSize = 10 + Math.random() * 6; // 10-16px
    state.filterOpacity = 0.5 + Math.pow(Math.random(), 0.5) * 0.5;

    console.log(`[cross-stitch] Setup: cellSize=${state.cellSize.toFixed(1)}, opacity=${state.filterOpacity.toFixed(2)}`);
  },

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    // Get display mode
    const isDarkMode = api.context.display.isDarkMode();

    // Apply the cross-stitch shader with mode-aware uniform
    api.filter.customShader(CROSS_STITCH_SHADER, {
      uDarkMode: isDarkMode ? 1.0 : 0.0,
    });

    // Slight warm color grade for handmade feel
    // Reduced in light mode to keep fabric looking natural
    const sepiaAmount = isDarkMode ? 0.1 : 0.05;
    api.filter.sepia(sepiaAmount);

    // Subtle vignette - slightly stronger in dark mode for cozy feel
    const vignetteStrength = isDarkMode ? 0.15 : 0.1;
    api.filter.vignette(vignetteStrength, 0.7);

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
    console.log('[cross-stitch] Teardown complete');
  },
};

registerActor(actor);

export default actor;
