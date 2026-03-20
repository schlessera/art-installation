/**
 * EP Eurosat Dome Actor
 *
 * Renders the iconic Eurosat CanCan Coaster geodesic sphere from Europa-Park.
 * The dome is a large silver/blue geodesic sphere illuminated at night with
 * colorful light projections that slowly shift across its surface.
 *
 * Features:
 * - Geodesic sphere with triangular panel grid lines
 * - Slowly shifting color projections (blues, purples, teals)
 * - Ambient glow around the dome
 * - Stars in the background
 * - Animated light projections flowing across the dome surface
 * - Dark/light mode support
 *
 * Performance:
 * - All state pre-allocated in setup()
 * - Object pools with MAX constants
 * - Numeric colors with separate alpha
 * - Pre-rendered glow texture
 * - ~200 draw calls per frame
 */

import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorMetadata,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';

// ============================================================
// METADATA
// ============================================================

const metadata: ActorMetadata = {
  id: 'ep-eurosat-dome',
  name: 'EP Eurosat Dome',
  description:
    'The iconic Eurosat geodesic sphere from Europa-Park, illuminated with colorful shifting light projections',
  author: {
    name: 'Taco Verdonschot',
    github: 'tacoverdonschot',
  },
  version: '1.0.0',
  tags: ['europapark', 'eurosat', 'dome', 'geodesic', 'coaster', 'sphere'],
  createdAt: new Date(),
  role: 'foreground',
  preferredDuration: 45,
  requiredContexts: ['time', 'display'],
};

// ============================================================
// CONSTANTS
// ============================================================

const MAX_STARS = 60;
const MAX_PANELS = 120;
const MAX_EDGES = 200;
const MAX_PROJECTIONS = 5;

const CANVAS_W = 360;
const CANVAS_H = 640;

// Dome geometry
const DOME_CX = CANVAS_W * 0.5;
const DOME_CY = CANVAS_H * 0.42;
const DOME_RADIUS = 110;

// Projection colors — blues, purples, teals
const PROJECTION_COLORS: number[] = [
  0x3366ff, // blue
  0x6633cc, // purple
  0x00cccc, // teal
  0x4488ff, // light blue
  0x9933ff, // violet
  0x00aaff, // sky blue
  0x7744ee, // blue-violet
  0x22ddbb, // aqua
];

// ============================================================
// INTERFACES
// ============================================================

interface Star {
  x: number;
  y: number;
  radius: number;
  twinklePhase: number;
  twinkleSpeed: number;
  brightness: number;
}

interface DomePanel {
  cx: number; // center x relative to dome
  cy: number; // center y relative to dome
  screenX: number; // absolute screen x
  screenY: number; // absolute screen y
  depth: number; // 0-1, for shading (how "forward" facing)
  hueOffset: number; // unique phase offset
  size: number; // panel size for rendering
}

interface DomeEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  depth: number; // average depth of the two endpoints
}

interface Projection {
  angle: number; // rotation angle on dome surface
  speed: number; // radians per second
  colorIndex: number;
  intensity: number;
  spread: number; // how wide the projection cone is
}

interface EurosatState {
  stars: Star[];
  starCount: number;
  panels: DomePanel[];
  panelCount: number;
  edges: DomeEdge[];
  edgeCount: number;
  projections: Projection[];
  projectionCount: number;
  glowDataUrl: string;
  glowDarkDataUrl: string;
  time: number;
  width: number;
  height: number;
}

// ============================================================
// STATE (module-level, pre-allocated in setup)
// ============================================================

let state: EurosatState = {
  stars: [],
  starCount: 0,
  panels: [],
  panelCount: 0,
  edges: [],
  edgeCount: 0,
  projections: [],
  projectionCount: 0,
  glowDataUrl: '',
  glowDarkDataUrl: '',
  time: 0,
  width: CANVAS_W,
  height: CANVAS_H,
};

// ============================================================
// HELPERS
// ============================================================

/**
 * Convert HSL to numeric 0xRRGGBB. Used in setup only.
 */
function hslToHex(h: number, s: number, l: number): number {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return (Math.round((r + m) * 255) << 16) |
    (Math.round((g + m) * 255) << 8) |
    Math.round((b + m) * 255);
}

/**
 * Blend two hex colors with a ratio (0 = c1, 1 = c2).
 */
function lerpColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return (r << 16) | (g << 8) | b;
}

/**
 * Create pre-rendered soft glow texture. Called once in setup().
 */
function createGlowTexture(isDark: boolean): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  if (isDark) {
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.3, 'rgba(0,0,0,0.5)');
    gradient.addColorStop(0.7, 'rgba(0,0,0,0.1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(0.7, 'rgba(255,255,255,0.1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const url = canvas.toDataURL();
  canvas.width = 0;
  canvas.height = 0;
  return url;
}

/**
 * Generate geodesic dome panels and edges by subdividing an icosphere
 * and projecting the front-facing triangles onto 2D.
 * Only generates the front hemisphere (visible from viewer).
 */
function generateGeodesicGeometry(): void {
  // Icosahedron vertices
  const phi = (1 + Math.sqrt(5)) / 2;
  const verts: number[][] = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ];
  // Normalize
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    v[0] /= len; v[1] /= len; v[2] /= len;
  }

  // Icosahedron faces (20 triangles)
  const faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  // Subdivide once for more detail
  const midpointCache: Map<string, number> = new Map();
  function getMidpoint(a: number, b: number): number {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const cached = midpointCache.get(key);
    if (cached !== undefined) return cached;
    const va = verts[a], vb = verts[b];
    const mx = (va[0] + vb[0]) / 2;
    const my = (va[1] + vb[1]) / 2;
    const mz = (va[2] + vb[2]) / 2;
    const len = Math.sqrt(mx * mx + my * my + mz * mz);
    const idx = verts.length;
    verts.push([mx / len, my / len, mz / len]);
    midpointCache.set(key, idx);
    return idx;
  }

  let subdividedFaces: number[][] = [];
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    const a = f[0], b = f[1], c = f[2];
    const ab = getMidpoint(a, b);
    const bc = getMidpoint(b, c);
    const ca = getMidpoint(c, a);
    subdividedFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }

  // Project front-facing triangles (z > threshold) onto 2D
  let panelIdx = 0;
  let edgeIdx = 0;
  const edgeSet: Set<string> = new Set();

  for (let fi = 0; fi < subdividedFaces.length; fi++) {
    if (panelIdx >= MAX_PANELS) break;
    const f = subdividedFaces[fi];
    const va = verts[f[0]], vb = verts[f[1]], vc = verts[f[2]];

    // Average z for depth (forward-facing check)
    const avgZ = (va[2] + vb[2] + vc[2]) / 3;
    if (avgZ < -0.15) continue; // skip back-facing panels

    const depth = (avgZ + 1) / 2; // 0 = back, 1 = front

    // Project to 2D (orthographic-ish with slight perspective)
    const perspScale = 1.0 + avgZ * 0.15;
    const cx = (va[0] + vb[0] + vc[0]) / 3 * DOME_RADIUS * perspScale;
    const cy = -(va[1] + vb[1] + vc[1]) / 3 * DOME_RADIUS * perspScale;

    const panel = state.panels[panelIdx];
    panel.cx = cx;
    panel.cy = cy;
    panel.screenX = DOME_CX + cx;
    panel.screenY = DOME_CY + cy;
    panel.depth = depth;
    panel.hueOffset = Math.atan2(cy, cx) + avgZ * 2.0;
    panel.size = DOME_RADIUS * 0.12 * perspScale;
    panelIdx++;

    // Add edges (deduplicated)
    const triVerts = [f[0], f[1], f[2]];
    for (let e = 0; e < 3; e++) {
      if (edgeIdx >= MAX_EDGES) break;
      const ei1 = triVerts[e], ei2 = triVerts[(e + 1) % 3];
      const ek = ei1 < ei2 ? `${ei1}_${ei2}` : `${ei2}_${ei1}`;
      if (edgeSet.has(ek)) continue;
      edgeSet.add(ek);

      const v1 = verts[ei1], v2 = verts[ei2];
      // Skip edges with back-facing vertices
      if (v1[2] < -0.25 || v2[2] < -0.25) continue;

      const p1 = 1.0 + v1[2] * 0.15;
      const p2 = 1.0 + v2[2] * 0.15;

      const edge = state.edges[edgeIdx];
      edge.x1 = DOME_CX + v1[0] * DOME_RADIUS * p1;
      edge.y1 = DOME_CY - v1[1] * DOME_RADIUS * p1;
      edge.x2 = DOME_CX + v2[0] * DOME_RADIUS * p2;
      edge.y2 = DOME_CY - v2[1] * DOME_RADIUS * p2;
      edge.depth = ((v1[2] + v2[2]) / 2 + 1) / 2;
      edgeIdx++;
    }
  }

  state.panelCount = panelIdx;
  state.edgeCount = edgeIdx;
}

// ============================================================
// ACTOR
// ============================================================

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    state.width = size.width;
    state.height = size.height;
    state.time = 0;

    // Pre-render glow textures
    state.glowDataUrl = createGlowTexture(false);
    state.glowDarkDataUrl = createGlowTexture(true);

    // Pre-allocate stars
    state.stars = [];
    state.starCount = MAX_STARS;
    for (let i = 0; i < MAX_STARS; i++) {
      state.stars.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H * 0.7,
        radius: 0.8 + Math.random() * 1.5,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 1.0 + Math.random() * 2.0,
        brightness: 0.4 + Math.random() * 0.6,
      });
    }

    // Pre-allocate panels
    state.panels = [];
    for (let i = 0; i < MAX_PANELS; i++) {
      state.panels.push({
        cx: 0, cy: 0, screenX: 0, screenY: 0,
        depth: 0, hueOffset: 0, size: 0,
      });
    }

    // Pre-allocate edges
    state.edges = [];
    for (let i = 0; i < MAX_EDGES; i++) {
      state.edges.push({ x1: 0, y1: 0, x2: 0, y2: 0, depth: 0 });
    }

    // Generate geodesic geometry (fills panels and edges)
    generateGeodesicGeometry();

    // Pre-allocate projections
    state.projections = [];
    state.projectionCount = MAX_PROJECTIONS;
    for (let i = 0; i < MAX_PROJECTIONS; i++) {
      state.projections.push({
        angle: (Math.PI * 2 * i) / MAX_PROJECTIONS + Math.random() * 0.5,
        speed: 0.15 + Math.random() * 0.25,
        colorIndex: Math.floor(Math.random() * PROJECTION_COLORS.length),
        intensity: 0.6 + Math.random() * 0.4,
        spread: 0.8 + Math.random() * 0.6,
      });
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const dt = frame.deltaTime / 1000;
    const t = frame.time / 1000;
    state.time = t;

    const isDark = api.context.display.isDarkMode();
    const glowTex = isDark ? state.glowDataUrl : state.glowDarkDataUrl;
    const glowBlend = isDark ? 'add' as const : 'multiply' as const;

    // ---- Background stars ----
    const starColor = isDark ? 0xccddff : 0x334466;
    for (let i = 0; i < state.starCount; i++) {
      const star = state.stars[i];
      const twinkle = 0.5 + 0.5 * Math.sin(t * star.twinkleSpeed + star.twinklePhase);
      const alpha = star.brightness * twinkle;
      if (alpha < 0.05) continue;
      api.brush.circle(star.x, star.y, star.radius, {
        fill: starColor,
        alpha: alpha,
        blendMode: glowBlend,
      });
    }

    // ---- Dome ambient glow (outer halo) ----
    const glowPulse = 0.85 + 0.15 * Math.sin(t * 0.4);
    const glowColor = isDark ? 0x3355cc : 0x223388;
    api.brush.image(glowTex, DOME_CX, DOME_CY, {
      width: DOME_RADIUS * 3.6 * glowPulse,
      height: DOME_RADIUS * 3.6 * glowPulse,
      tint: glowColor,
      alpha: isDark ? 0.35 : 0.25,
      blendMode: glowBlend,
    });

    // ---- Inner dome glow ----
    const innerGlowColor = isDark ? 0x4466dd : 0x2244aa;
    api.brush.image(glowTex, DOME_CX, DOME_CY, {
      width: DOME_RADIUS * 2.4,
      height: DOME_RADIUS * 2.4,
      tint: innerGlowColor,
      alpha: isDark ? 0.5 : 0.35,
      blendMode: glowBlend,
    });

    // ---- Dome base sphere fill ----
    const baseFill = isDark ? 0x1a2244 : 0xb0bdd8;
    api.brush.circle(DOME_CX, DOME_CY, DOME_RADIUS, {
      fill: baseFill,
      alpha: isDark ? 0.85 : 0.75,
      blendMode: 'normal',
    });

    // ---- Dome sphere gradient overlay ----
    api.brush.circle(DOME_CX, DOME_CY, DOME_RADIUS, {
      fill: {
        type: 'radial',
        cx: 0.4,
        cy: 0.35,
        radius: 0.6,
        stops: [
          { offset: 0, color: isDark ? 0x334488 : 0xc8d4ee },
          { offset: 0.6, color: isDark ? 0x1a2244 : 0x8899bb },
          { offset: 1, color: isDark ? 0x0a1122 : 0x556688 },
        ],
      },
      alpha: 0.7,
      blendMode: 'normal',
    });

    // ---- Color projections on panels ----
    // Update projection angles
    for (let p = 0; p < state.projectionCount; p++) {
      const proj = state.projections[p];
      proj.angle += proj.speed * dt;
    }

    // Draw illuminated panels
    for (let i = 0; i < state.panelCount; i++) {
      const panel = state.panels[i];

      // Calculate illumination from all projections
      let totalIllum = 0;
      let blendR = 0, blendG = 0, blendB = 0;

      for (let p = 0; p < state.projectionCount; p++) {
        const proj = state.projections[p];

        // How close is this panel to the projection beam?
        const panelAngle = panel.hueOffset;
        let angleDiff = panelAngle - proj.angle;
        // Normalize to -PI..PI
        angleDiff = angleDiff - Math.floor((angleDiff + Math.PI) / (Math.PI * 2)) * Math.PI * 2;
        const dist = Math.abs(angleDiff);

        if (dist < proj.spread) {
          const falloff = 1.0 - dist / proj.spread;
          const illum = falloff * falloff * proj.intensity * panel.depth;
          totalIllum += illum;

          const col = PROJECTION_COLORS[proj.colorIndex];
          blendR += ((col >> 16) & 0xff) * illum;
          blendG += ((col >> 8) & 0xff) * illum;
          blendB += (col & 0xff) * illum;
        }
      }

      if (totalIllum < 0.05) continue;

      // Normalize color
      if (totalIllum > 0) {
        blendR = Math.min(255, Math.round(blendR / totalIllum));
        blendG = Math.min(255, Math.round(blendG / totalIllum));
        blendB = Math.min(255, Math.round(blendB / totalIllum));
      }

      const panelColor = (blendR << 16) | (blendG << 8) | blendB;
      const panelAlpha = Math.min(1.0, totalIllum * 0.8) * (isDark ? 0.7 : 0.5);

      if (panelAlpha < 0.05) continue;

      // Draw panel as small glowing circle
      api.brush.circle(panel.screenX, panel.screenY, panel.size, {
        fill: panelColor,
        alpha: panelAlpha,
        blendMode: glowBlend,
      });
    }

    // ---- Geodesic grid lines (structural frame) ----
    const edgeColor = isDark ? 0x6688bb : 0x445577;
    for (let i = 0; i < state.edgeCount; i++) {
      const edge = state.edges[i];
      const edgeAlpha = 0.25 + edge.depth * 0.35;
      if (edgeAlpha < 0.05) continue;

      api.brush.line(edge.x1, edge.y1, edge.x2, edge.y2, {
        color: edgeColor,
        alpha: isDark ? edgeAlpha : edgeAlpha * 0.7,
        width: 1.0 + edge.depth * 1.0,
        blendMode: 'normal',
      });
    }

    // ---- Dome outline / rim ----
    const rimColor = isDark ? 0x7799cc : 0x556688;
    api.brush.circle(DOME_CX, DOME_CY, DOME_RADIUS, {
      stroke: rimColor,
      strokeWidth: 2.5,
      alpha: isDark ? 0.8 : 0.6,
      blendMode: 'normal',
    });

    // ---- Specular highlight on dome ----
    const specColor = isDark ? 0xaabbee : 0xddeeff;
    api.brush.image(glowTex, DOME_CX - DOME_RADIUS * 0.25, DOME_CY - DOME_RADIUS * 0.3, {
      width: DOME_RADIUS * 1.0,
      height: DOME_RADIUS * 0.8,
      tint: specColor,
      alpha: isDark ? 0.2 : 0.15,
      blendMode: glowBlend,
    });

    // ---- Base / pedestal ----
    const baseColor = isDark ? 0x222244 : 0x667799;
    api.brush.rect(
      DOME_CX - DOME_RADIUS * 0.6,
      DOME_CY + DOME_RADIUS * 0.85,
      DOME_RADIUS * 1.2,
      DOME_RADIUS * 0.35,
      {
        fill: baseColor,
        alpha: 0.7,
        blendMode: 'normal',
      },
    );

    // Base rim highlight
    api.brush.line(
      DOME_CX - DOME_RADIUS * 0.6,
      DOME_CY + DOME_RADIUS * 0.85,
      DOME_CX + DOME_RADIUS * 0.6,
      DOME_CY + DOME_RADIUS * 0.85,
      {
        color: isDark ? 0x5577aa : 0x8899bb,
        alpha: 0.6,
        width: 2.5,
        blendMode: 'normal',
      },
    );

    // ---- Bright projection spots (accent glows) ----
    for (let p = 0; p < state.projectionCount; p++) {
      const proj = state.projections[p];
      const spotAngle = proj.angle;
      const spotR = DOME_RADIUS * 0.6;
      const spotX = DOME_CX + Math.cos(spotAngle) * spotR * 0.7;
      const spotY = DOME_CY + Math.sin(spotAngle) * spotR * 0.5;

      const spotPulse = 0.6 + 0.4 * Math.sin(t * 1.5 + p * 1.2);
      const spotAlpha = proj.intensity * spotPulse * (isDark ? 0.4 : 0.25);
      if (spotAlpha < 0.05) continue;

      api.brush.image(glowTex, spotX, spotY, {
        width: DOME_RADIUS * 0.7,
        height: DOME_RADIUS * 0.7,
        tint: PROJECTION_COLORS[proj.colorIndex],
        alpha: spotAlpha,
        blendMode: glowBlend,
      });
    }

    // ---- Ground reflection glow ----
    const reflColor = isDark ? 0x2244aa : 0x334488;
    api.brush.image(glowTex, DOME_CX, DOME_CY + DOME_RADIUS * 1.3, {
      width: DOME_RADIUS * 2.5,
      height: DOME_RADIUS * 0.8,
      tint: reflColor,
      alpha: isDark ? 0.2 : 0.12,
      blendMode: glowBlend,
    });
  },

  async teardown(): Promise<void> {
    state.stars = [];
    state.starCount = 0;
    state.panels = [];
    state.panelCount = 0;
    state.edges = [];
    state.edgeCount = 0;
    state.projections = [];
    state.projectionCount = 0;
    state.glowDataUrl = '';
    state.glowDarkDataUrl = '';
    state.time = 0;
  },
};

registerActor(actor);
export default actor;
