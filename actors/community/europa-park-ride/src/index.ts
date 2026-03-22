import { registerActor } from '@art/actor-sdk';
import type { Actor, ActorSetupAPI, ActorUpdateAPI, FrameContext, ActorMetadata } from '@art/types';

interface Point3D { x: number; y: number; z: number; projX?: number; projY?: number; scale?: number; }
interface Point { x: number; y: number; }

type RenderItemType = 'track-line' | 'sphere' | 'cube' | 'pillar' | 'tree' | 'particle' | 'ferris-spoke' | 'ferris-cart';

interface RenderItem {
  type: RenderItemType;
  z: number;
  x1: number; y1: number; s1: number;
  x2: number; y2: number; s2: number;
  id1: number; id2: number;
  angle: number;
}

const metadata: ActorMetadata = {
  id: 'europa-park-ride',
  name: 'Europa Park Ride: The Ultimate 3D Park',
  description: 'A masterpiece 3D theme park featuring true camera projection, massive coaster tracks, a Ferris wheel, pine trees, and trains.',
  author: { name: 'Antigravity AI Master', github: 'artificial' },
  version: '5.1.0',
  tags: ['3d', 'coaster', 'theme-park', 'masterpiece', 'geometry', 'epic'],
  createdAt: new Date(),
  preferredDuration: 120,
  requiredContexts: ['display'],
};

const NUM_TRACK_POINTS = 140; 
const NUM_TRAINS = 3;
const CARS_PER_TRAIN = 5;
const NUM_TREES = 300;
const NUM_PARTICLES = 300;
const NUM_SPOKES = 12;

const items: RenderItem[] = [];
const tempP1: Point3D = {x:0, y:0, z:0};
const tempP2: Point3D = {x:0, y:0, z:0};
const gridP1: Point3D = {x:0, y:0, z:0};
const gridP2: Point3D = {x:0, y:0, z:0};

const s = 14; 
const topFace: Point[] = [{x:0, y:-s}, {x:s, y:-s/2}, {x:0, y:0}, {x:-s, y:-s/2}];
const rightFace: Point[] = [{x:0, y:0}, {x:s, y:-s/2}, {x:s, y:s/2}, {x:0, y:s}];
const leftFace: Point[] = [{x:0, y:0}, {x:0, y:s}, {x:-s, y:s/2}, {x:-s, y:-s/2}];

interface Tree { x: number; z: number; h: number; }
const trees: Tree[] = [];
interface Particle { x: number; y: number; z: number; phase: number; speed: number; }
const particles: Particle[] = [];

let width = 0;
let height = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    width = size.width;
    height = size.height;

    // Allocate Tracks & Pillars
    for(let t=1; t<=2; t++) {
      for(let i=0; i<NUM_TRACK_POINTS; i++) {
        items.push({type: 'track-line', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: t, id2: i, angle: 0});
        if (i % 5 === 0) {
            items.push({type: 'pillar', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: t, id2: i, angle: 0});
        }
      }
    }
    
    // Allocate Trains
    for(let tr=0; tr<NUM_TRAINS; tr++) {
        for(let c=0; c<CARS_PER_TRAIN; c++) {
            items.push({type: 'sphere', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: 1, id2: c, angle: tr});
            items.push({type: 'cube', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: 2, id2: c, angle: tr});
        }
    }

    // Allocate Ferris Wheel
    for(let i=0; i<NUM_SPOKES; i++) {
        items.push({type: 'ferris-spoke', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: i, id2: 0, angle: 0});
        items.push({type: 'ferris-cart', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: i, id2: 0, angle: 0});
    }

    // Allocate Trees (Spread far and wide)
    for(let i=0; i<NUM_TREES; i++) {
        trees.push({
            x: (Math.random() - 0.5) * 5000,
            z: (Math.random() - 0.5) * 5000,
            h: 80 + Math.random() * 120
        });
        items.push({type: 'tree', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: i, id2: 0, angle: 0});
    }

    // Allocate Particles
    for(let i=0; i<NUM_PARTICLES; i++) {
        particles.push({
            x: (Math.random() - 0.5) * 4000,
            y: (Math.random() - 0.5) * 2000 - 500,
            z: (Math.random() - 0.5) * 4000,
            phase: Math.random() * Math.PI * 2,
            speed: Math.random() * 2 + 0.5
        });
        items.push({type: 'particle', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: i, id2: 0, angle: 0});
    }
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const time = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    
    const bgPulse = isDark ? 0x05050a : 0x0a1122;
    api.brush.background(bgPulse);

    // Sky horizon
    const skyH = isDark ? 0x050a1a : 0xaa22bb;
    const skyM = isDark ? 0x111122 : 0x551155;
    const skyL = isDark ? 0x010204 : 0x110022;
    api.brush.rect(0, 0, width, height, {
      fill: {
        type: 'linear', x0: 0, y0: 0, x1: 0, y1: 1,
        stops: [
          {offset: 0, color: skyH},
          {offset: 0.6, color: skyM},
          {offset: 1, color: skyL}
        ]
      },
      alpha: 0.8
    });

    const camAngle = time * 0.1; 
    
    // SAFE CAMERA CONFIG: 
    // Dist pushes everything further away, focal length zooms it back in.
    const CAM_DIST = 5000;
    const CAM_FOCAL = 3500;

    function rotateY(p: Point3D, ang: number) {
      const sA = Math.sin(ang); const cA = Math.cos(ang);
      const tx = p.x * cA - p.z * sA;
      const tz = p.x * sA + p.z * cA;
      p.x = tx; p.z = tz;
    }
    function projectInPlace(p: Point3D) {
      // Safe divisor check
      const zDepth = CAM_DIST + p.z;
      if (zDepth <= 10) { p.scale = -1; return; } // Behind camera
      const scale = CAM_FOCAL / zDepth;
      p.scale = scale;
      p.projX = width / 2 + p.x * scale;
      p.projY = height * 0.65 + p.y * scale; 
    }

    const floorY = 400;

    // --- TRACK PATH FUNCTIONS ---
    function getTrack1(norm: number, out: Point3D) {
      const ang = norm * Math.PI * 6; 
      const r = width * 0.35 + Math.sin(norm * Math.PI * 4) * (width * 0.15);
      out.x = Math.sin(ang) * r;
      out.z = Math.cos(ang) * r;
      out.y = Math.cos(norm * Math.PI * 2) * (height * 0.4) - height * 0.15; 
    }
    function getTrack2(norm: number, out: Point3D) {
      const ang = norm * Math.PI * 10; 
      const r = width * 0.20;
      out.x = Math.cos(ang) * r;
      out.z = Math.sin(ang) * r;
      out.y = Math.sin(norm * Math.PI * 4) * (height * 0.5); 
    }

    let itemIdx = 0;

    // --- POPULATE ITEMS ---
    // Tracks & Pillars
    for(let t=1; t<=2; t++) {
      for(let i=0; i<NUM_TRACK_POINTS; i++) {
         const getTrack = t===1 ? getTrack1 : getTrack2;
         getTrack(i / NUM_TRACK_POINTS, tempP1); rotateY(tempP1, camAngle); projectInPlace(tempP1);
         getTrack((i+1) / NUM_TRACK_POINTS, tempP2); rotateY(tempP2, camAngle); projectInPlace(tempP2);
         
         const item = items[itemIdx++];
         item.x1 = tempP1.projX!; item.y1 = tempP1.projY!; item.s1 = tempP1.scale!;
         item.x2 = tempP2.projX!; item.y2 = tempP2.projY!; item.s2 = tempP2.scale!;
         item.z = (tempP1.z + tempP2.z) / 2;
         item.angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);

         // Pillar
         if (i % 5 === 0) {
            const pitem = items[itemIdx++];
            pitem.x1 = item.x1; pitem.y1 = item.y1; pitem.s1 = item.s1; pitem.z = item.z; pitem.angle = item.angle;
         }
      }
    }

    // Trains
    for(let tr=0; tr<NUM_TRAINS; tr++) {
      const gOffset = tr * 0.333; 
      const tSpeed1 = time * 0.08 + gOffset;
      for(let c=0; c<CARS_PER_TRAIN; c++) {
        const tt1 = (tSpeed1 - c * 0.012) % 1.0;
        const tt2 = (tSpeed1 - c * 0.012 + 0.005) % 1.0;
        getTrack1(tt1 < 0 ? tt1 + 1 : tt1, tempP1); rotateY(tempP1, camAngle); projectInPlace(tempP1);
        getTrack1(tt2 < 0 ? tt2 + 1 : tt2, tempP2); rotateY(tempP2, camAngle); projectInPlace(tempP2);
        const item = items[itemIdx++];
        item.x1 = tempP1.projX!; item.y1 = tempP1.projY!; item.s1 = tempP1.scale!; item.z = tempP1.z;
        item.angle = Math.atan2(tempP2.projY! - tempP1.projY!, tempP2.projX! - tempP1.projX!);
      }

      const tSpeed2 = time * 0.06 + gOffset;
      for(let c=0; c<CARS_PER_TRAIN; c++) {
        const tt1 = (tSpeed2 - c * 0.012) % 1.0;
        const tt2 = (tSpeed2 - c * 0.012 + 0.005) % 1.0;
        getTrack2(tt1 < 0 ? tt1 + 1 : tt1, tempP1); rotateY(tempP1, camAngle); projectInPlace(tempP1);
        getTrack2(tt2 < 0 ? tt2 + 1 : tt2, tempP2); rotateY(tempP2, camAngle); projectInPlace(tempP2);
        const item = items[itemIdx++];
        item.x1 = tempP1.projX!; item.y1 = tempP1.projY!; item.s1 = tempP1.scale!; item.z = tempP1.z;
        item.angle = Math.atan2(tempP2.projY! - tempP1.projY!, tempP2.projX! - tempP1.projX!);
      }
    }

    // Ferris Wheel
    const wheelX = -1200;
    const wheelZ = 1600;
    const wheelY = -400;
    const wheelR = 600;
    const wheelRot = time * 0.3;
    for(let i=0; i<NUM_SPOKES; i++) {
        const ang = wheelRot + (i/NUM_SPOKES)*Math.PI*2;
        tempP1.x = wheelX; tempP1.y = wheelY; tempP1.z = wheelZ;
        rotateY(tempP1, camAngle); projectInPlace(tempP1);
        
        tempP2.x = wheelX + Math.cos(ang)*wheelR; tempP2.y = wheelY + Math.sin(ang)*wheelR; tempP2.z = wheelZ;
        rotateY(tempP2, camAngle); projectInPlace(tempP2);

        const sItem = items[itemIdx++];
        sItem.x1 = tempP1.projX!; sItem.y1 = tempP1.projY!; sItem.s1 = tempP1.scale!;
        sItem.x2 = tempP2.projX!; sItem.y2 = tempP2.projY!; sItem.s2 = tempP2.scale!;
        sItem.z = tempP1.z;

        const cItem = items[itemIdx++];
        cItem.x1 = tempP2.projX!; cItem.y1 = tempP2.projY!; cItem.s1 = tempP2.scale!; cItem.z = tempP2.z;
    }

    // Trees
    for(let i=0; i<NUM_TREES; i++) {
        const tr = trees[i];
        tempP1.x = tr.x; tempP1.y = floorY; tempP1.z = tr.z;
        rotateY(tempP1, camAngle); projectInPlace(tempP1);
        const item = items[itemIdx++];
        item.x1 = tempP1.projX!; item.y1 = tempP1.projY!; item.s1 = tempP1.scale!; item.z = tempP1.z;
    }

    // Particles
    for(let i=0; i<NUM_PARTICLES; i++) {
        const p = particles[i];
        tempP1.x = p.x; tempP1.y = p.y + Math.sin(time * p.speed + p.phase) * 150; tempP1.z = p.z;
        rotateY(tempP1, camAngle); projectInPlace(tempP1);
        const item = items[itemIdx++];
        item.x1 = tempP1.projX!; item.y1 = tempP1.projY!; item.s1 = tempP1.scale!; item.z = tempP1.z;
    }

    // --- SORTING ---
    for (let i = 1; i < itemIdx; i++) {
      let current = items[i];
      let j = i - 1;
      while (j >= 0 && items[j].z < current.z) {
        items[j + 1] = items[j];
        j--;
      }
      items[j + 1] = current;
    }

    // --- DRAW 3D FLOOR GRID ---
    const gridSize = 2500;
    const gridStep = 400;
    const gridCol = isDark ? 0x223344 : 0xaa00aa;
    for(let z=-gridSize; z<=gridSize; z+=gridStep) {
      gridP1.x = -gridSize; gridP1.y = floorY; gridP1.z = z;
      gridP2.x = gridSize; gridP2.y = floorY; gridP2.z = z;
      rotateY(gridP1, camAngle); projectInPlace(gridP1);
      rotateY(gridP2, camAngle); projectInPlace(gridP2);
      if(gridP1.scale! > 0 && gridP2.scale! > 0) {
         api.brush.line(gridP1.projX!, gridP1.projY!, gridP2.projX!, gridP2.projY!, { color: gridCol, width: Math.max(0.5, 3*gridP1.scale!), alpha: 0.25 * Math.min(1, gridP1.scale!) });
      }
    }
    for(let x=-gridSize; x<=gridSize; x+=gridStep) {
      gridP1.x = x; gridP1.y = floorY; gridP1.z = -gridSize;
      gridP2.x = x; gridP2.y = floorY; gridP2.z = gridSize;
      rotateY(gridP1, camAngle); projectInPlace(gridP1);
      rotateY(gridP2, camAngle); projectInPlace(gridP2);
      if(gridP1.scale! > 0 && gridP2.scale! > 0) {
         api.brush.line(gridP1.projX!, gridP1.projY!, gridP2.projX!, gridP2.projY!, { color: gridCol, width: Math.max(0.5, 3*gridP1.scale!), alpha: 0.25 * Math.min(1, gridP1.scale!) });
      }
    }

    // --- MAIN DRAWING LOOP --- //
    const shadowColor = isDark ? 0x000000 : 0x000000;
    for(let i = 0; i < itemIdx; i++) {
      const item = items[i];

      if(item.s1 <= 0 || item.s1 > 50) continue; 

      if(item.type === 'track-line') {
        const thickness = 10 * item.s1;
        const color = isDark ? (item.id1 === 1 ? 0x662222 : 0x224466) : (item.id1 === 1 ? 0xffcccc : 0xccddee);
        api.brush.line(item.x1, item.y1, item.x2, item.y2, { color, width: thickness, alpha: 0.9, cap: 'round' });
        
        const glowC = item.id1 === 1 ? 0xff4444 : 0x44bbff;
        api.brush.line(item.x1, item.y1, item.x2, item.y2, { color: glowC, width: thickness * 0.25, alpha: 0.8, blendMode: 'add', cap: 'round' });
        
        if (item.id2 % 2 === 0) {
            const nx = -Math.sin(item.angle); const ny = Math.cos(item.angle);
            const tieW = 16 * item.s1;
            api.brush.line(item.x1 + nx*tieW, item.y1 + ny*tieW, item.x1 - nx*tieW, item.y1 - ny*tieW, { color: isDark ? 0x555566 : 0x888899, width: 3 * item.s1, alpha: 0.8 });
        }
      }
      else if (item.type === 'pillar') {
         const groundScale = CAM_FOCAL / (CAM_DIST + item.z); 
         const gridFloorY = height * 0.65 + floorY * groundScale;
         
         const pw = 12 * item.s1;
         const pCol = isDark ? 0x22222a : 0xaabbcc;
         api.brush.line(item.x1, item.y1, item.x1, gridFloorY, { color: pCol, width: pw, alpha: 0.8 });
         if(gridFloorY - item.y1 > 100 * item.s1) {
            const steps = Math.floor((gridFloorY - item.y1) / (80 * item.s1));
            for(let k=1; k<=steps; k++) {
                const ky = item.y1 + k * 80 * item.s1;
                api.brush.line(item.x1 - pw*1.5, ky, item.x1 + pw*1.5, ky, { color: isDark? 0x333333 : 0xaaaaaa, width: 2*item.s1 });
            }
         }
      }
      else if (item.type === 'sphere') {
        const rad = 28 * item.s1;
        const gridFloorY = height * 0.65 + floorY * item.s1;
        api.brush.ellipse(item.x1, gridFloorY, rad * 2, rad * 0.6, { fill: shadowColor, alpha: shadowAlpha });
        
        api.brush.pushMatrix();
        api.brush.translate(item.x1, item.y1);
        api.brush.rotate(item.angle); 
        api.brush.scale(item.s1, item.s1);

        const leadAlpha = item.id2 === 0 ? 1 : Math.max(0.4, 1 - item.id2 * 0.12);
        api.brush.ellipse(0, 18, 24, 10, { fill: 0x222222, alpha: leadAlpha * 0.9 });
        
        api.brush.circle(0, 0, 28, {
          fill: {
            type: 'radial', cx: 0.3, cy: 0.3, radius: 0.6,
            stops: [
               {offset: 0, color: item.id2===0 ? 0xffffff : 0xff4444},
               {offset: 0.5, color: 0xcc0000},
               {offset: 1, color: 0x440000}
            ]
          },
          alpha: leadAlpha
        });
        if(item.id2 === 0) api.brush.circle(15, -5, 8, { fill: 0xffffee, blendMode: 'add' });
        api.brush.popMatrix();
      }
      else if (item.type === 'cube') {
        const rad = 32 * item.s1;
        const gridFloorY = height * 0.65 + floorY * item.s1;
        api.brush.ellipse(item.x1, gridFloorY, rad * 2, rad * 0.6, { fill: shadowColor, alpha: shadowAlpha });
        
        const leadAlpha = item.id2 === 0 ? 1 : Math.max(0.4, 1 - item.id2 * 0.12);
        api.brush.pushMatrix();
        api.brush.translate(item.x1, item.y1);
        api.brush.rotate(item.angle);
        api.brush.scale(item.s1, item.s1);
        
        api.brush.ellipse(0, 18, 24, 10, { fill: 0x222222, alpha: leadAlpha * 0.9 });

        const tColor = item.id2 === 0 ? 0xffffff : 0x4488ff;
        const rColor = item.id2 === 0 ? 0x88ccff : 0x0044cc;
        const lColor = item.id2 === 0 ? 0x4488ff : 0x002288;
        
        api.brush.polygon(topFace, { fill: tColor, alpha: leadAlpha });
        api.brush.polygon(rightFace, { fill: rColor, alpha: leadAlpha });
        api.brush.polygon(leftFace, { fill: lColor, alpha: leadAlpha });
        if(item.id2 === 0) api.brush.circle(15, -5, 8, { fill: 0xffffee, blendMode: 'add' });
        api.brush.popMatrix();
      }
      else if (item.type === 'ferris-spoke') {
         api.brush.line(item.x1, item.y1, item.x2, item.y2, { color: isDark ? 0x444455 : 0x9999aa, width: 4*item.s1 });
      }
      else if (item.type === 'ferris-cart') {
         api.brush.rect(item.x1 - 15*item.s1, item.y1, 30*item.s1, 40*item.s1, { fill: isDark ? 0xff2255 : 0xff4466 });
      }
      else if (item.type === 'tree') {
         const th = trees[item.id1].h * item.s1;
         const tw = th * 0.35;
         const points: Point[] = [
            {x: item.x1, y: item.y1 - th},
            {x: item.x1 + tw, y: item.y1},
            {x: item.x1 - tw, y: item.y1}
         ];
         api.brush.polygon(points, { fill: isDark ? 0x0a3311 : 0x11aa44, alpha: Math.min(1, item.s1 * 0.8) });
      }
      else if (item.type === 'particle') {
         const p = particles[item.id1];
         const alpha = (Math.sin(time*2 + p.phase) * 0.5 + 0.5) * Math.min(1, item.s1);
         if (alpha > 0.05) {
             const c = item.id1 % 3 === 0 ? 0xffffff : (item.id1 % 2 === 0 ? 0x44ffff : 0xffaa44);
             api.brush.circle(item.x1, item.y1, 2.5 * item.s1, { fill: c, alpha, blendMode: 'add' });
         }
      }
    }
  },

  async teardown(): Promise<void> {
    items.length = 0;
    dusts.length = 0;
  },
};

registerActor(actor);
export default actor;
