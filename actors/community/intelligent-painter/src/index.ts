/**
 * Intelligent Painter Actor
 *
 * An "AI" painter that reads the canvas to understand what's already painted,
 * finds empty regions, and intelligently adds complementary content.
 * Acts like a collaborative artist that enhances the existing composition.
 *
 * Showcases unused Canvas Read APIs:
 * - getPixel() - Sample existing colors
 * - isEmpty() - Find unpainted areas
 * - findEmptyRegions() - Locate larger empty spaces
 * - getBrightness() - Analyze light/dark areas
 * - getHistogram() - Understand color distribution
 * - getRegionAverage() - Sample regional colors
 *
 * Also uses: scale(), dropShadow()
 */

import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  Rectangle,
  RGBA,
} from '@art/types';
import { registerActor } from '@art/actor-sdk';

const metadata: ActorMetadata = {
  id: 'intelligent-painter',
  name: 'Intelligent Painter',
  description: 'AI that analyzes canvas and paints complementary content in empty spaces',
  author: {
    name: 'Art Installation Team',
    github: 'cloudfest',
  },
  version: '1.0.0',
  tags: ['intelligent', 'adaptive', 'collaborative', 'complementary', 'canvas-aware'],
  createdAt: new Date('2026-01-10'),
  preferredDuration: 45,
  requiredContexts: ['time'],
};

// ============================================================
// Constants
// ============================================================

const MAX_PAINT_JOBS = 8;
const MAX_ELEMENTS_PER_JOB = 20;
const ANALYSIS_INTERVAL = 400; // Re-analyze canvas every 400ms (5x per 2 seconds)

type PaintStyle = 'organic' | 'geometric' | 'dots' | 'lines' | 'spirals';

const PAINT_STYLES: PaintStyle[] = ['organic', 'geometric', 'dots', 'lines', 'spirals'];

// ============================================================
// Shape Sets - different combinations of element types
// ============================================================

type ElementType = 'circle' | 'rect' | 'triangle' | 'line' | 'spiral' | 'diamond' | 'star' | 'cross' | 'dot' | 'arc';

interface ShapeSet {
  name: string;
  types: ElementType[];
}

const SHAPE_SETS: ShapeSet[] = [
  { name: 'Geometric', types: ['circle', 'rect', 'triangle', 'diamond'] },
  { name: 'Organic', types: ['circle', 'spiral', 'line', 'arc'] },
  { name: 'Minimal', types: ['circle', 'line', 'dot'] },
  { name: 'Angular', types: ['rect', 'triangle', 'diamond', 'cross'] },
  { name: 'Flowing', types: ['spiral', 'circle', 'arc', 'line'] },
  { name: 'Celestial', types: ['star', 'circle', 'dot', 'spiral'] },
  { name: 'Dots & Lines', types: ['dot', 'line', 'cross'] },
  { name: 'Stars & Shapes', types: ['star', 'diamond', 'triangle'] },
  { name: 'Soft', types: ['circle', 'arc', 'dot', 'spiral'] },
  { name: 'Sharp', types: ['triangle', 'diamond', 'cross', 'star'] },
  { name: 'Complete', types: ['circle', 'rect', 'triangle', 'line', 'spiral', 'diamond', 'star', 'cross', 'dot', 'arc'] },
];

// ============================================================
// Color Palettes - different color schemes
// ============================================================

interface ColorPalette {
  name: string;
  colors: { h: number; s: number; l: number }[]; // HSL values
}

const COLOR_PALETTES: ColorPalette[] = [
  {
    name: 'Sunset',
    colors: [
      { h: 15, s: 85, l: 55 },   // Orange
      { h: 35, s: 90, l: 50 },   // Gold
      { h: 350, s: 75, l: 50 },  // Coral
      { h: 280, s: 60, l: 45 },  // Purple
    ],
  },
  {
    name: 'Ocean',
    colors: [
      { h: 195, s: 80, l: 50 },  // Cyan
      { h: 210, s: 70, l: 45 },  // Blue
      { h: 175, s: 65, l: 55 },  // Teal
      { h: 230, s: 60, l: 60 },  // Periwinkle
    ],
  },
  {
    name: 'Forest',
    colors: [
      { h: 120, s: 50, l: 40 },  // Green
      { h: 85, s: 55, l: 50 },   // Lime
      { h: 45, s: 60, l: 45 },   // Olive
      { h: 150, s: 45, l: 55 },  // Sage
    ],
  },
  {
    name: 'Neon',
    colors: [
      { h: 300, s: 100, l: 50 }, // Magenta
      { h: 180, s: 100, l: 50 }, // Cyan
      { h: 60, s: 100, l: 50 },  // Yellow
      { h: 120, s: 100, l: 50 }, // Green
    ],
  },
  {
    name: 'Pastel',
    colors: [
      { h: 340, s: 60, l: 75 },  // Pink
      { h: 200, s: 55, l: 75 },  // Light blue
      { h: 280, s: 50, l: 75 },  // Lavender
      { h: 160, s: 45, l: 75 },  // Mint
    ],
  },
  {
    name: 'Warm',
    colors: [
      { h: 0, s: 70, l: 50 },    // Red
      { h: 25, s: 80, l: 50 },   // Orange
      { h: 45, s: 85, l: 50 },   // Yellow-orange
      { h: 340, s: 65, l: 45 },  // Crimson
    ],
  },
  {
    name: 'Cool',
    colors: [
      { h: 240, s: 60, l: 55 },  // Blue
      { h: 270, s: 55, l: 50 },  // Violet
      { h: 190, s: 65, l: 50 },  // Cyan-blue
      { h: 220, s: 50, l: 60 },  // Steel blue
    ],
  },
  {
    name: 'Earth',
    colors: [
      { h: 25, s: 50, l: 40 },   // Brown
      { h: 35, s: 45, l: 50 },   // Tan
      { h: 80, s: 35, l: 45 },   // Olive
      { h: 15, s: 55, l: 35 },   // Sienna
    ],
  },
];

// ============================================================
// State interfaces
// ============================================================

interface PaintElement {
  active: boolean;
  x: number;
  y: number;
  size: number;
  rotation: number;
  color: number;
  alpha: number;
  type: ElementType;
  progress: number;
  maxProgress: number;
}

interface PaintJob {
  active: boolean;
  region: Rectangle;
  style: PaintStyle;
  baseColor: number;
  complementColor: number;
  progress: number;
  maxProgress: number;
  elements: PaintElement[];
  scale: number;
}

interface CanvasAnalysis {
  averageBrightness: number;
  dominantHue: number;
  emptyRegions: Rectangle[];
  complexity: number;
  lastAnalysisTime: number;
}

/**
 * Region analysis with activity score.
 * Lower activityScore = emptier = better painting target.
 */
interface RegionAnalysis {
  x: number;
  y: number;
  width: number;
  height: number;
  activityScore: number;  // 0-1, lower = emptier
  // Debug metrics (mean-based)
  luminanceVariance: number;
  gradientMagnitude: number;
  meanSaturation: number;
  bgDistance: number;
  // Debug metrics (max-based, for sparse pattern detection)
  maxBgDistance: number;
  maxLuminance: number;
  nonBgRatio: number;
}

interface IntelligentPainterState {
  paintJobs: PaintJob[];
  analysis: CanvasAnalysis;
  analysisTimer: number;
  globalPhase: number;
  // Async snapshot state
  snapshotPending: boolean;
  snapshot: { data: Uint8Array; width: number; height: number } | null;
  // Current cycle's random selections
  currentShapeSet: ShapeSet;
  currentPalette: ColorPalette;
}

// ============================================================
// State
// ============================================================

let state: IntelligentPainterState = {
  paintJobs: [],
  analysis: {
    averageBrightness: 0.5,
    dominantHue: 0,
    emptyRegions: [],
    complexity: 0,
    lastAnalysisTime: 0,
  },
  analysisTimer: 0,
  globalPhase: 0,
  snapshotPending: false,
  snapshot: null,
  currentShapeSet: SHAPE_SETS[0],
  currentPalette: COLOR_PALETTES[0],
};

// ============================================================
// Helper functions
// ============================================================

function rgbaToHsl(rgba: RGBA): { h: number; s: number; l: number } {
  const r = rgba.r / 255;
  const g = rgba.g / 255;
  const b = rgba.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
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

// Background color for analysis (matches 0x0a0a0f)
const BG_COLOR = { r: 10, g: 10, b: 15 };

// Grid configuration for region analysis
// Use ODD numbers so the center of the canvas falls in the CENTER of a region,
// not at the intersection of 4 regions (which splits centered content awkwardly)
const GRID_COLS = 5;  // Center column is index 2
const GRID_ROWS = 9;  // Center row is index 4
const SAMPLES_PER_REGION = 6; // 6x6 grid = 36 samples per region (better coverage for sparse patterns)

// Threshold for considering a cell "empty" (activity score below this)
const EMPTY_THRESHOLD = 0.12;

// Thresholds for max-based detection (catches sparse patterns like geometric lines)
const BG_DISTANCE_THRESHOLD = 0.08; // ~35 RGB units from background = clearly non-background
const NON_BG_RATIO_THRESHOLD = 0.15; // If >15% of samples are non-background, region has content

/**
 * Analyze a region of the canvas to compute an activity score.
 * Uses multi-pixel sampling to detect edges, colors, and content presence.
 *
 * @param snap - Canvas snapshot data
 * @param canvasW - Full canvas width
 * @param canvasH - Full canvas height
 * @param regionX - Region X position (canvas coords)
 * @param regionY - Region Y position (canvas coords)
 * @param regionW - Region width (canvas coords)
 * @param regionH - Region height (canvas coords)
 * @returns RegionAnalysis with activity score and debug metrics
 */
function analyzeRegion(
  snap: { data: Uint8Array; width: number; height: number },
  canvasW: number,
  canvasH: number,
  regionX: number,
  regionY: number,
  regionW: number,
  regionH: number
): RegionAnalysis {
  // Sample grid within region
  const pixels: { l: number; s: number; bgDist: number }[] = [];

  // Track max values for sparse pattern detection
  let maxBgDist = 0;
  let maxLuminance = 0;
  let nonBgCount = 0;

  for (let sy = 0; sy < SAMPLES_PER_REGION; sy++) {
    for (let sx = 0; sx < SAMPLES_PER_REGION; sx++) {
      // Sample point in canvas coordinates
      const canvasX = regionX + (sx + 0.5) * (regionW / SAMPLES_PER_REGION);
      const canvasY = regionY + (sy + 0.5) * (regionH / SAMPLES_PER_REGION);

      // Convert to snapshot coordinates (WebGL Y is flipped)
      const snapX = Math.floor(canvasX * snap.width / canvasW);
      const snapY = snap.height - 1 - Math.floor(canvasY * snap.height / canvasH);
      const i = (snapY * snap.width + snapX) * 4;

      const r = snap.data[i] ?? 0;
      const g = snap.data[i + 1] ?? 0;
      const b = snap.data[i + 2] ?? 0;

      // Luminance (perceived brightness, 0-255)
      const l = 0.299 * r + 0.587 * g + 0.114 * b;

      // Saturation (color intensity, 0-1)
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const s = max === 0 ? 0 : (max - min) / max;

      // Background distance (0-1 normalized)
      const bgDist = Math.sqrt(
        Math.pow(r - BG_COLOR.r, 2) +
        Math.pow(g - BG_COLOR.g, 2) +
        Math.pow(b - BG_COLOR.b, 2)
      ) / 441.67;

      pixels.push({ l, s, bgDist });

      // Track max values for sparse pattern detection
      maxBgDist = Math.max(maxBgDist, bgDist);
      maxLuminance = Math.max(maxLuminance, l);

      // Count pixels that are clearly not background
      if (bgDist > BG_DISTANCE_THRESHOLD) {
        nonBgCount++;
      }
    }
  }

  // Compute luminance variance (high = edges/details)
  const meanL = pixels.reduce((sum, p) => sum + p.l, 0) / pixels.length;
  const lumVariance = pixels.reduce((sum, p) =>
    sum + Math.pow(p.l - meanL, 2), 0) / pixels.length;
  const normLumVar = Math.min(1, lumVariance / (128 * 128));

  // Compute gradient magnitude (sum of neighbor differences)
  let gradientSum = 0;
  const S = SAMPLES_PER_REGION;

  // Horizontal gradients
  for (let row = 0; row < S; row++) {
    for (let col = 0; col < S - 1; col++) {
      const idx1 = row * S + col;
      const idx2 = row * S + col + 1;
      gradientSum += Math.abs(pixels[idx1].l - pixels[idx2].l);
    }
  }

  // Vertical gradients
  for (let row = 0; row < S - 1; row++) {
    for (let col = 0; col < S; col++) {
      const idx1 = row * S + col;
      const idx2 = (row + 1) * S + col;
      gradientSum += Math.abs(pixels[idx1].l - pixels[idx2].l);
    }
  }

  const normGradient = Math.min(1, gradientSum / (S * S * 128));

  // Compute mean saturation and bg distance
  const meanSat = pixels.reduce((sum, p) => sum + p.s, 0) / pixels.length;
  const meanBgDist = pixels.reduce((sum, p) => sum + p.bgDist, 0) / pixels.length;

  // Non-background pixel ratio
  const nonBgRatio = nonBgCount / pixels.length;

  // Mean-based activity score (original approach - good for filled areas)
  const meanBasedActivity =
    normLumVar * 0.35 +
    normGradient * 0.35 +
    meanSat * 0.20 +
    meanBgDist * 0.10;

  // Max-based activity score (catches sparse patterns like geometric lines)
  // A single bright or non-background pixel flags the region
  const normMaxLum = maxLuminance / 255;
  const maxBasedActivity = Math.max(
    maxBgDist * 0.8,           // Strong non-background pixel
    normMaxLum * 0.6           // Bright pixel (content tends to be brighter than bg)
  );

  // Combined score: busy if EITHER mean OR max indicates activity
  let activityScore = Math.max(
    meanBasedActivity,
    maxBasedActivity * 0.7      // Weighted to avoid noise false positives
  );

  // If significant portion of samples are non-background, ensure high score
  // This catches sparse patterns that mean/max might miss
  if (nonBgRatio > NON_BG_RATIO_THRESHOLD) {
    activityScore = Math.max(activityScore, 0.25);
  }

  return {
    x: regionX,
    y: regionY,
    width: regionW,
    height: regionH,
    activityScore,
    luminanceVariance: normLumVar,
    gradientMagnitude: normGradient,
    meanSaturation: meanSat,
    bgDistance: meanBgDist,
    maxBgDistance: maxBgDist,
    maxLuminance: normMaxLum,
    nonBgRatio,
  };
}

/**
 * Merge adjacent empty cells into larger rectangular regions.
 * Uses a greedy algorithm to find maximal rectangles of empty cells.
 *
 * @param regionAnalyses - Array of region analyses (must be in row-major order)
 * @param cellW - Width of each cell in canvas coordinates
 * @param cellH - Height of each cell in canvas coordinates
 * @returns Array of merged rectangles covering empty areas
 */
function mergeEmptyRegions(
  regionAnalyses: RegionAnalysis[],
  cellW: number,
  cellH: number
): Rectangle[] {
  // Create 2D grid marking cells as empty or not
  const cellEmpty: boolean[][] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    cellEmpty[row] = [];
    for (let col = 0; col < GRID_COLS; col++) {
      const idx = row * GRID_COLS + col;
      cellEmpty[row][col] = regionAnalyses[idx].activityScore < EMPTY_THRESHOLD;
    }
  }

  // Track which cells have been assigned to a region
  const used: boolean[][] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    used[row] = [];
    for (let col = 0; col < GRID_COLS; col++) {
      used[row][col] = false;
    }
  }

  /**
   * Find maximal rectangle starting from a given cell.
   * Expands right first, then down (greedy).
   */
  function findMaxRectangle(
    startRow: number,
    startCol: number
  ): { r1: number; c1: number; r2: number; c2: number } | null {
    if (used[startRow][startCol] || !cellEmpty[startRow][startCol]) {
      return null;
    }

    // Start with 1x1 rectangle
    let r1 = startRow, c1 = startCol, r2 = startRow, c2 = startCol;

    // Expand right while cells are empty and unused
    while (c2 + 1 < GRID_COLS && cellEmpty[r1][c2 + 1] && !used[r1][c2 + 1]) {
      c2++;
    }

    // Expand down while entire row is empty and unused
    while (r2 + 1 < GRID_ROWS) {
      let canExpand = true;
      for (let c = c1; c <= c2; c++) {
        if (!cellEmpty[r2 + 1][c] || used[r2 + 1][c]) {
          canExpand = false;
          break;
        }
      }
      if (!canExpand) break;
      r2++;
    }

    return { r1, c1, r2, c2 };
  }

  const mergedRegions: Rectangle[] = [];

  // Scan grid to find maximal rectangles
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const rect = findMaxRectangle(row, col);
      if (rect) {
        // Mark cells as used
        for (let r = rect.r1; r <= rect.r2; r++) {
          for (let c = rect.c1; c <= rect.c2; c++) {
            used[r][c] = true;
          }
        }

        // Convert grid coordinates to canvas coordinates
        mergedRegions.push({
          x: rect.c1 * cellW,
          y: rect.r1 * cellH,
          width: (rect.c2 - rect.c1 + 1) * cellW,
          height: (rect.r2 - rect.r1 + 1) * cellH,
        });
      }
    }
  }

  // Sort by area (largest first) for better coverage
  mergedRegions.sort((a, b) => (b.width * b.height) - (a.width * a.height));

  return mergedRegions;
}

function initPaintElement(element: PaintElement, region: Rectangle, color: number): void {
  element.active = true;
  element.x = region.x + Math.random() * region.width;
  element.y = region.y + Math.random() * region.height;
  element.size = Math.min(region.width, region.height) * (0.05 + Math.random() * 0.15);
  element.rotation = Math.random() * Math.PI * 2;
  element.color = color;
  element.alpha = 0;
  element.progress = 0;
  element.maxProgress = 500 + Math.random() * 1000;

  // Use shape types from current shape set
  const types = state.currentShapeSet.types;
  element.type = types[Math.floor(Math.random() * types.length)];
}

function initPaintJob(
  job: PaintJob,
  region: Rectangle,
  style: PaintStyle,
  baseColor: number,
  complementColor: number
): void {
  job.active = true;
  job.region = { ...region };
  job.style = style;
  job.baseColor = baseColor;
  job.complementColor = complementColor;
  job.progress = 0;
  job.maxProgress = 3000 + Math.random() * 5000;
  job.scale = 0.1;

  // Initialize elements
  for (let i = 0; i < MAX_ELEMENTS_PER_JOB; i++) {
    job.elements[i].active = false;
  }
}

// ============================================================
// Actor implementation
// ============================================================

const actor: Actor = {
  metadata,

  async setup(_api: ActorSetupAPI): Promise<void> {
    // Pre-allocate paint jobs pool
    state.paintJobs = new Array(MAX_PAINT_JOBS);
    for (let i = 0; i < MAX_PAINT_JOBS; i++) {
      state.paintJobs[i] = {
        active: false,
        region: { x: 0, y: 0, width: 0, height: 0 },
        style: 'organic',
        baseColor: 0xffffff,
        complementColor: 0x000000,
        progress: 0,
        maxProgress: 0,
        elements: new Array(MAX_ELEMENTS_PER_JOB),
        scale: 1,
      };

      // Pre-allocate elements for each job
      for (let j = 0; j < MAX_ELEMENTS_PER_JOB; j++) {
        state.paintJobs[i].elements[j] = {
          active: false,
          x: 0,
          y: 0,
          size: 0,
          rotation: 0,
          color: 0xffffff,
          alpha: 0,
          type: 'circle',
          progress: 0,
          maxProgress: 0,
        };
      }
    }

    // Initialize analysis state
    state.analysis = {
      averageBrightness: 0.5,
      dominantHue: 0,
      emptyRegions: [],
      complexity: 0,
      lastAnalysisTime: 0,
    };

    state.analysisTimer = ANALYSIS_INTERVAL; // Trigger immediate analysis
    state.globalPhase = 0;

    // Randomly select shape set and color palette for this cycle
    state.currentShapeSet = SHAPE_SETS[Math.floor(Math.random() * SHAPE_SETS.length)];
    state.currentPalette = COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)];

    console.log(`[intelligent-painter] Setup complete - Shapes: ${state.currentShapeSet.name}, Palette: ${state.currentPalette.name}`);
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const dt = frame.deltaTime;

    state.globalPhase += dt * 0.001;
    state.analysisTimer += dt;

    // ============ Periodic canvas analysis (async) ============

    // Process snapshot when available (check this FIRST before requesting new one)
    if (state.snapshot && !state.snapshotPending) {
      const snap = state.snapshot;

      // Analyze all regions using activity score
      const cellW = width / GRID_COLS;
      const cellH = height / GRID_ROWS;
      const regionAnalyses: RegionAnalysis[] = [];

      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const analysis = analyzeRegion(
            snap,
            width,
            height,
            col * cellW,
            row * cellH,
            cellW,
            cellH
          );
          regionAnalyses.push(analysis);
        }
      }

      // Merge adjacent empty cells into larger regions
      const mergedRegions = mergeEmptyRegions(regionAnalyses, cellW, cellH);

      // Limit to reasonable number of regions (largest first since sorted by area)
      const targetRegions = mergedRegions.slice(0, 6);
      state.analysis.emptyRegions = targetRegions;

      // Log analysis results
      const avgActivity = regionAnalyses.reduce((s, r) => s + r.activityScore, 0) / regionAnalyses.length;
      const emptyCells = regionAnalyses.filter(r => r.activityScore < EMPTY_THRESHOLD).length;
      const totalArea = targetRegions.reduce((sum, r) => sum + r.width * r.height, 0);
      const canvasArea = width * height;

      // Max-based metrics for debugging sparse pattern detection
      const maxBgDistAcrossAll = Math.max(...regionAnalyses.map(r => r.maxBgDistance));
      const maxLumAcrossAll = Math.max(...regionAnalyses.map(r => r.maxLuminance));
      const avgNonBgRatio = regionAnalyses.reduce((s, r) => s + r.nonBgRatio, 0) / regionAnalyses.length;

      console.log(
        `[intelligent-painter] Activity: avg=${(avgActivity * 100).toFixed(1)}%, ` +
        `empty=${emptyCells}/${GRID_COLS * GRID_ROWS}, ` +
        `maxBgDist=${maxBgDistAcrossAll.toFixed(2)}, maxLum=${maxLumAcrossAll.toFixed(2)}, ` +
        `avgNonBgRatio=${(avgNonBgRatio * 100).toFixed(1)}%, ` +
        `merged=${mergedRegions.length}→${targetRegions.length} (${((totalArea / canvasArea) * 100).toFixed(0)}%)`
      );

      // Sample colors from non-empty regions to determine dominant hue
      // Sort by activity and take the busiest regions
      const sortedByActivity = [...regionAnalyses].sort((a, b) => b.activityScore - a.activityScore);
      const busyRegions = sortedByActivity.slice(0, 9); // Top 9 busiest
      let totalHue = 0;
      let hueCount = 0;
      let totalBrightness = 0;

      for (const region of busyRegions) {
        // Sample center of each busy region
        const canvasX = region.x + region.width / 2;
        const canvasY = region.y + region.height / 2;

        const snapX = Math.floor(canvasX * snap.width / width);
        const snapY = snap.height - 1 - Math.floor(canvasY * snap.height / height);
        const i = (snapY * snap.width + snapX) * 4;

        const pixel: RGBA = {
          r: snap.data[i] ?? 0,
          g: snap.data[i + 1] ?? 0,
          b: snap.data[i + 2] ?? 0,
          a: (snap.data[i + 3] ?? 0) / 255,
        };

        const brightness = (0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b) / 255;
        totalBrightness += brightness;

        // Only count hue if region has significant activity
        if (region.activityScore > 0.05) {
          const hsl = rgbaToHsl(pixel);
          if (hsl.s > 10) { // Only count if saturated
            totalHue += hsl.h;
            hueCount++;
          }
        }
      }

      state.analysis.averageBrightness = totalBrightness / busyRegions.length;
      if (hueCount > 0) {
        state.analysis.dominantHue = totalHue / hueCount;
      }

      // Try to spawn new paint jobs in the emptiest regions
      const availableJobs = state.paintJobs.filter(j => !j.active).length;
      const regionsToFill = Math.min(availableJobs, targetRegions.length, 4);

      for (let i = 0; i < regionsToFill; i++) {
        const region = targetRegions[i];
        const job = state.paintJobs.find(j => !j.active);

        if (job && region) {
          // Pick colors from current palette
          const palette = state.currentPalette.colors;
          const colorIdx1 = Math.floor(Math.random() * palette.length);
          let colorIdx2 = Math.floor(Math.random() * palette.length);
          if (colorIdx2 === colorIdx1) colorIdx2 = (colorIdx2 + 1) % palette.length;

          // Adjust lightness based on canvas brightness
          const brightnessAdjust = state.analysis.averageBrightness > 0.5 ? -10 : 10;

          const c1 = palette[colorIdx1];
          const c2 = palette[colorIdx2];
          const baseColor = hslToNumeric(c1.h, c1.s, Math.max(20, Math.min(80, c1.l + brightnessAdjust)));
          const complementColor = hslToNumeric(c2.h, c2.s, Math.max(20, Math.min(80, c2.l + brightnessAdjust)));

          const style = PAINT_STYLES[Math.floor(Math.random() * PAINT_STYLES.length)];

          initPaintJob(job, region, style, baseColor, complementColor);
        }
      }

      state.analysis.lastAnalysisTime = frame.time;

      // Clear snapshot after processing and reset timer
      state.snapshot = null;
      state.analysisTimer = 0;
    }

    // Request new snapshot when timer triggers (AFTER processing existing one)
    if (state.analysisTimer >= ANALYSIS_INTERVAL && !state.snapshotPending && !state.snapshot) {
      state.snapshotPending = true;
      // Request full resolution snapshot (scale < 1 is broken in CanvasManager - it crops instead of scaling)
      api.canvas.getCanvasSnapshotAsync(1.0).then(snapshot => {
        state.snapshot = snapshot;
        state.snapshotPending = false;
      }).catch(err => {
        console.warn('[intelligent-painter] Snapshot failed:', err);
        state.snapshotPending = false;
      });
    }

    // ============ Update and render paint jobs ============

    for (let i = 0; i < state.paintJobs.length; i++) {
      const job = state.paintJobs[i];
      if (!job.active) continue;

      job.progress += dt;

      // Spawn new elements during active phase
      const lifeProgress = job.progress / job.maxProgress;
      if (lifeProgress < 0.7) {
        const spawnChance = 0.05;
        const element = job.elements.find(e => !e.active);

        if (element && Math.random() < spawnChance) {
          // Determine color (alternate between base and complement)
          const useComplement = Math.random() < 0.3;
          const color = useComplement ? job.complementColor : job.baseColor;
          initPaintElement(element, job.region, color);
        }
      }

      // Update and draw elements
      let elementsDrawn = 0;
      for (let j = 0; j < job.elements.length; j++) {
        const element = job.elements[j];
        if (!element.active) continue;

        element.progress += dt;

        // Fade in and out
        const elemLifeProgress = element.progress / element.maxProgress;
        if (elemLifeProgress < 0.2) {
          element.alpha = elemLifeProgress / 0.2;
        } else if (elemLifeProgress > 0.8) {
          element.alpha = (1 - elemLifeProgress) / 0.2;
        } else {
          element.alpha = 1;
        }

        // Scale: grow in during fade-in, stay at full size after
        let scale = 1;
        if (elemLifeProgress < 0.2) {
          // Ease out cubic for smooth grow-in: starts fast, slows down
          const t = elemLifeProgress / 0.2;
          scale = 0.3 + 0.7 * (1 - Math.pow(1 - t, 3));
        }

        // Gentle rotation
        element.rotation += 0.005;

        // Draw element based on type and job style
        const alpha = element.alpha * 0.7;
        const scaledSize = element.size * scale;

        // Skip rendering at very low alpha to prevent flicker during fade-out
        if (alpha < 0.05) {
          if (element.progress >= element.maxProgress) {
            element.active = false;
          }
          continue;
        }

        switch (element.type) {
          case 'circle':
            api.brush.circle(element.x, element.y, scaledSize, {
              fill: element.color,
              alpha,
              blendMode: 'screen',
            });
            break;

          case 'rect':
            api.brush.pushMatrix();
            api.brush.translate(element.x, element.y);
            api.brush.rotate(element.rotation);
            api.brush.rect(
              -scaledSize / 2, -scaledSize / 2,
              scaledSize, scaledSize,
              {
                fill: element.color,
                alpha,
                blendMode: 'screen',
              }
            );
            api.brush.popMatrix();
            break;

          case 'triangle':
            api.brush.pushMatrix();
            api.brush.translate(element.x, element.y);
            api.brush.rotate(element.rotation);
            api.brush.regularPolygon(0, 0, scaledSize, 3, {
              fill: element.color,
              alpha,
              blendMode: 'screen',
            });
            api.brush.popMatrix();
            break;

          case 'line':
            api.brush.pushMatrix();
            api.brush.translate(element.x, element.y);
            api.brush.rotate(element.rotation);
            const lineLen = scaledSize * 2;
            api.brush.line(
              -lineLen / 2, 0,
              lineLen / 2, 0,
              {
                color: element.color,
                width: 2 + scaledSize * 0.1,
                alpha,
                cap: 'round',
              }
            );
            api.brush.popMatrix();
            break;

          case 'spiral':
            api.brush.pushMatrix();
            api.brush.translate(element.x, element.y);
            api.brush.rotate(element.rotation);
            const spiralTurns = 3;
            const spiralPoints = 12;
            for (let s = 0; s < spiralPoints; s++) {
              const t = s / spiralPoints;
              const spiralAngle = t * spiralTurns * Math.PI * 2;
              const spiralRadius = scaledSize * t;
              const sx = Math.cos(spiralAngle) * spiralRadius;
              const sy = Math.sin(spiralAngle) * spiralRadius;
              api.brush.circle(sx, sy, (2 + t * 3) * scale, {
                fill: element.color,
                alpha: alpha * (1 - t * 0.5),
                blendMode: 'add',
              });
            }
            api.brush.popMatrix();
            break;

          case 'diamond':
            api.brush.pushMatrix();
            api.brush.translate(element.x, element.y);
            api.brush.rotate(element.rotation + Math.PI / 4);
            api.brush.rect(
              -scaledSize / 2, -scaledSize / 2,
              scaledSize, scaledSize,
              {
                fill: element.color,
                alpha,
                blendMode: 'screen',
              }
            );
            api.brush.popMatrix();
            break;

          case 'star':
            api.brush.pushMatrix();
            api.brush.translate(element.x, element.y);
            api.brush.rotate(element.rotation);
            api.brush.star(0, 0, scaledSize, scaledSize * 0.4, 5, {
              fill: element.color,
              alpha,
              blendMode: 'screen',
            });
            api.brush.popMatrix();
            break;

          case 'cross':
            api.brush.pushMatrix();
            api.brush.translate(element.x, element.y);
            api.brush.rotate(element.rotation);
            const crossLen = scaledSize * 1.5;
            const crossWidth = 2 + scaledSize * 0.15;
            api.brush.line(
              -crossLen / 2, 0,
              crossLen / 2, 0,
              { color: element.color, width: crossWidth, alpha, cap: 'round' }
            );
            api.brush.line(
              0, -crossLen / 2,
              0, crossLen / 2,
              { color: element.color, width: crossWidth, alpha, cap: 'round' }
            );
            api.brush.popMatrix();
            break;

          case 'dot':
            api.brush.circle(element.x, element.y, scaledSize * 0.3, {
              fill: element.color,
              alpha,
              blendMode: 'add',
            });
            break;

          case 'arc':
            api.brush.pushMatrix();
            api.brush.translate(element.x, element.y);
            api.brush.rotate(element.rotation);
            const arcPoints = 8;
            const arcAngle = Math.PI * 0.8;
            for (let a = 0; a < arcPoints; a++) {
              const t = a / (arcPoints - 1);
              const angle = (t - 0.5) * arcAngle;
              const ax = Math.cos(angle) * scaledSize;
              const ay = Math.sin(angle) * scaledSize;
              const dotSize = (2 + (1 - Math.abs(t - 0.5) * 2) * 3) * scale;
              api.brush.circle(ax, ay, dotSize, {
                fill: element.color,
                alpha: alpha * (0.6 + (1 - Math.abs(t - 0.5) * 2) * 0.4),
                blendMode: 'screen',
              });
            }
            api.brush.popMatrix();
            break;
        }

        // Deactivate when done
        if (element.progress >= element.maxProgress) {
          element.active = false;
        }
      }

      // Deactivate job when done
      if (job.progress >= job.maxProgress) {
        job.active = false;
      }
    }

    // Apply drop shadow for depth when enough elements are active
    let activeElementCount = 0;
    for (const job of state.paintJobs) {
      if (!job.active) continue;
      for (const element of job.elements) {
        if (element.active) activeElementCount++;
      }
    }

    // Apply drop shadow when any elements are active
    if (activeElementCount >= 1) {
      const shadowIntensity = Math.min(0.25, 0.12 + (activeElementCount / 20) * 0.13);
      api.filter.dropShadow(`rgba(0, 0, 0, ${shadowIntensity})`, 5, 2, 2);
    }
  },

  async teardown(): Promise<void> {
    // Reset state
    state.analysis = {
      averageBrightness: 0.5,
      dominantHue: 0,
      emptyRegions: [],
      complexity: 0,
      lastAnalysisTime: 0,
    };
    state.analysisTimer = 0;
    state.globalPhase = 0;

    // Deactivate all jobs and elements
    for (const job of state.paintJobs) {
      job.active = false;
      for (const element of job.elements) {
        element.active = false;
      }
    }

    console.log('[intelligent-painter] Teardown complete');
  },
};

// Self-register with the runtime
registerActor(actor);

export default actor;
