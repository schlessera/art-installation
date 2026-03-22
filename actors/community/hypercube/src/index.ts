import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'hypercube',
  name: 'Tesseract 4D',
  description: 'A genuine 4-Dimensional hypercube mathematical simulation. Watch as the tesseract dynamically rotates along the XW, YW, and ZW planes, folding and inverting through physical space before projecting down into our 3D observable universe.',
  author: { name: 'Antigravity AI Reality', github: 'artificial' },
  version: '1.0.0',
  tags: ['4d', 'math', 'geometry', 'tesseract', 'cyberpunk', 'neon'],
  createdAt: new Date(),
  preferredDuration: 180,
  requiredContexts: ['time'],
};

// 4D Vector class
class Vector4 {
  constructor(public x: number, public y: number, public z: number, public w: number) {}
}

const VERTICES: Vector4[] = [];
// Generate the 16 vertices of a tesseract (all [-1, 1] permutations)
for (let x = -1; x <= 1; x += 2) {
  for (let y = -1; y <= 1; y += 2) {
    for (let z = -1; z <= 1; z += 2) {
      for (let w = -1; w <= 1; w += 2) {
        VERTICES.push(new Vector4(x, y, z, w));
      }
    }
  }
}

// Generate the 32 edges (connect vertices that differ by exactly 1 coordinate)
const EDGES: [number, number][] = [];
for (let i = 0; i < 16; i++) {
  for (let j = i + 1; j < 16; j++) {
    const v1 = VERTICES[i];
    const v2 = VERTICES[j];
    let diffs = 0;
    if (v1.x !== v2.x) diffs++;
    if (v1.y !== v2.y) diffs++;
    if (v1.z !== v2.z) diffs++;
    if (v1.w !== v2.w) diffs++;
    if (diffs === 1) {
      EDGES.push([i, j]);
    }
  }
}

interface ActorState {
  particles: {x: number, y: number, z: number, w: number}[];
}

let state: ActorState = {
  particles: [],
};

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    state.particles = Array.from({ length: 50 }, () => ({
      x: (Math.random() - 0.5) * 4,
      y: (Math.random() - 0.5) * 4,
      z: (Math.random() - 0.5) * 4,
      w: (Math.random() - 0.5) * 4,
    }));
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const time = frame.time / 1000;

    // Background sweep
    const bgGrad = { type: 'radial' as const, cx: 0.5, cy: 0.5, radius: 1, stops: [
      { offset: 0, color: 'rgba(20, 0, 40, 1)' },
      { offset: 1, color: 'rgba(0, 0, 0, 1)' }
    ]};
    api.brush.rect(0, width, height, height, { fill: bgGrad }); // wait width and height reversed in parameters but brush.rect(x, y, w, h)
    // Actually brushing full screen:
    api.brush.rect(0, 0, width, height, { fill: bgGrad });

    // 4D Rotation Angles (Slowly evolving over time)
    const angleXY = time * 0.3;
    const angleXZ = time * 0.4;
    const angleXW = time * 0.5; // Inverts inner/outer cube
    const angleYW = time * 0.2;
    const angleZW = time * 0.6; // Inverts Z depth into W depth

    // Transformation Function
    function transform4D(v: Vector4 | {x: number, y: number, z: number, w: number}): {x: number, y: number, z: number, scale1: number, scale2: number} {
        let x = v.x; let y = v.y; let z = v.z; let w = v.w;

        // XY Rotation
        let cx = Math.cos(angleXY); let sx = Math.sin(angleXY);
        let tx = x * cx - y * sx;
        let ty = x * sx + y * cx;
        x = tx; y = ty;

        // XZ Rotation
        cx = Math.cos(angleXZ); sx = Math.sin(angleXZ);
        tx = x * cx - z * sx;
        let tz = x * sx + z * cx;
        x = tx; z = tz;

        // ZW Rotation (Swaps depth across 4D)
        cx = Math.cos(angleZW); sx = Math.sin(angleZW);
        tz = z * cx - w * sx;
        let tw = z * sx + w * cx;
        z = tz; w = tw;

        // XW Rotation (Folds the shape through itself)
        cx = Math.cos(angleXW); sx = Math.sin(angleXW);
        tx = x * cx - w * sx;
        tw = x * sx + w * cx;
        x = tx; w = tw;

        // YW Rotation
        cx = Math.cos(angleYW); sx = Math.sin(angleYW);
        ty = y * cx - w * sx;
        tw = y * sx + w * cx;
        y = ty; w = tw;

        // Stereographic Projection 4D -> 3D
        const distance4D = 2.5; 
        const wScale = 1.0 / (distance4D - w);

        const px3d = x * wScale;
        const py3d = y * wScale;
        const pz3d = z * wScale;

        // Perspective Projection 3D -> 2D
        const distance3D = 3.5;
        const zScale = 1.0 / (distance3D - pz3d);

        return {
            x: px3d * zScale * (width * 0.4) + width / 2, // scale 0.4 of screen max width
            y: py3d * zScale * (width * 0.4) + height / 2, // square projection based on width purely to prevent stretch
            z: pz3d,
            scale1: wScale,
            scale2: zScale
        };
    }

    // Transform all 16 vertices
    const projected = VERTICES.map(v => transform4D(v));

    // Sort edges by Z-depth average so occluded lines draw first
    const sortedEdges = EDGES.map(edge => {
      const p1 = projected[edge[0]];
      const p2 = projected[edge[1]];
      return { edge, p1, p2, depth: (p1.z + p2.z) / 2 };
    }).sort((a, b) => a.depth - b.depth);

    // Draw Tesseract Edges
    for (const { p1, p2 } of sortedEdges) {
      // Calculate depth metrics for glowing styling
      const avgScale2 = (p1.scale2 + p2.scale2) / 2;
      const alpha = Math.max(0.05, Math.min(1, avgScale2 * 0.9));
      const thickness = Math.max(1, avgScale2 * 8);

      // Deep cyan glow
      api.brush.line(p1.x, p1.y, p2.x, p2.y, { 
          color: 'rgba(0, 200, 255, ' + alpha.toFixed(3) + ')', 
          width: thickness, 
          blendMode: 'screen',
          cap: 'round' 
      });

      // Bright white inner core for thick lines closer to camera
      if (thickness > 2) {
          api.brush.line(p1.x, p1.y, p2.x, p2.y, { 
              color: 'rgba(255, 255, 255, ' + (alpha * 0.8).toFixed(3) + ')', 
              width: thickness * 0.3, 
              blendMode: 'add',
              cap: 'round'
          });
      }
    }

    // Draw vertices (Nodes)
    for (const p of projected) {
      const r = Math.max(1, p.scale1 * p.scale2 * 6);
      const alpha = Math.max(0.1, Math.min(1, p.scale2));
      api.brush.circle(p.x, p.y, r, { fill: 'rgba(255, 255, 255, ' + alpha.toFixed(3) + ')', blendMode: 'add' });
      api.brush.circle(p.x, p.y, r * 2.5, { fill: 'rgba(255, 0, 255, ' + (alpha * 0.3).toFixed(3) + ')', blendMode: 'screen' });
    }

    // Draw ambient 4D particles swirling through the tesseract
    for (const p of state.particles) {
        // Simple 4D orbital drift
        p.x = Math.sin(time + p.w) * 2;
        p.y = Math.cos(time * 1.5 + p.z) * 2;
        
        const pt = transform4D(p);
        const r = Math.max(0.5, pt.scale2 * 2);
        const alpha = Math.max(0.05, Math.min(1, pt.scale2 * 0.5));
        api.brush.circle(pt.x, pt.y, r, { fill: 'rgba(255, 150, 0, ' + alpha.toFixed(3) + ')', blendMode: 'add' });
    }
  },

  async teardown(): Promise<void> {
    state.particles = [];
  },
};

registerActor(actor);
export default actor;
