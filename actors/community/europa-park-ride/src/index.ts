import { registerActor } from '@art/actor-sdk';
import type { Actor, ActorSetupAPI, ActorUpdateAPI, FrameContext, ActorMetadata } from '@art/types';

interface Point3D { x: number; y: number; z: number; projX?: number; projY?: number; scale?: number; }
interface Point { x: number; y: number; }

type RenderItemType = 'track-line' | 'shuttle-hyper' | 'shuttle-launch' | 'pillar' | 'tower' | 'tree' | 'particle' | 'ferris-spoke' | 'ferris-cart';

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
  name: 'Europa Park Ride: Phase III Reality',
  description: 'A benchmark 3D synthwave masterpiece. Features volumetric headlights, physical structural scaffolding, real spinning wheels, giant Euro-Mir towers, and a living sunset.',
  author: { name: 'Antigravity AI Reality', github: 'artificial' },
  version: '8.0.0',
  tags: ['3d', 'coaster', 'theme-park', 'masterpiece', 'geometry', 'award-winning', 'epic', 'synthwave'],
  createdAt: new Date(),
  preferredDuration: 200,
  requiredContexts: ['display'],
};

// --- SCENE CONFIGURATION ---
const NUM_TRACK_POINTS = 160; 
const NUM_TRAINS = 3;
const CARS_PER_TRAIN = 6;
const NUM_TREES = 150;
const NUM_PARTICLES = 150;
const NUM_SPOKES = 18;

// Buffers
const items: RenderItem[] = [];
let renderQueue: RenderItem[] = [];

// Environment Data
const gridP1: Point3D = {x:0, y:0, z:0};
const gridP2: Point3D = {x:0, y:0, z:0};
const tempP1: Point3D = {x:0, y:0, z:0};
const tempP2: Point3D = {x:0, y:0, z:0};

interface Tree { x: number; z: number; h: number; }
const trees: Tree[] = [];
interface Particle { x: number; y: number; z: number; phase: number; speed: number; }
const particles: Particle[] = [];
interface Tower { x: number; z: number; h: number; r: number; }
const towers: Tower[] = [
  {x: 0, z: 0, h: 400, r: 80},
  {x: 180, z: 120, h: 320, r: 60},
  {x: -160, z: 140, h: 360, r: 60},
  {x: 140, z: -150, h: 340, r: 60},
  {x: -120, z: -120, h: 280, r: 60},
];

let width = 0;
let height = 0;

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    const size = api.canvas.getSize();
    width = size.width;
    height = size.height;

    items.length = 0;
    trees.length = 0;
    particles.length = 0;

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
            items.push({type: 'shuttle-hyper', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: 1, id2: c, angle: tr});
        }
        for(let c=0; c<CARS_PER_TRAIN; c++) {
            items.push({type: 'shuttle-launch', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: 2, id2: c, angle: tr});
        }
    }

    // Allocate Euro-Mir Towers
    for(let i=0; i<towers.length; i++) {
        items.push({type: 'tower', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: i, id2: 0, angle: 0});
    }

    // Allocate Ferris Wheel
    for(let i=0; i<NUM_SPOKES; i++) {
        items.push({type: 'ferris-spoke', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: i, id2: 0, angle: 0});
        items.push({type: 'ferris-cart', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: i, id2: 0, angle: 0});
    }

    // Allocate Trees
    for(let i=0; i<NUM_TREES; i++) {
        trees.push({ x: (Math.random() - 0.5) * 5000, z: (Math.random() - 0.5) * 5000, h: 80 + Math.random() * 120 });
        items.push({type: 'tree', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: i, id2: 0, angle: 0});
    }

    // Allocate Particles
    for(let i=0; i<NUM_PARTICLES; i++) {
        particles.push({ x: (Math.random() - 0.5) * 4000, y: (Math.random() - 0.5) * 2000 - 500, z: (Math.random() - 0.5) * 4000, phase: Math.random() * Math.PI * 2, speed: Math.random() * 2 + 0.5 });
        items.push({type: 'particle', z:0, x1:0, y1:0, s1:0, x2:0, y2:0, s2:0, id1: i, id2: 0, angle: 0});
    }

    // Stable structure
    renderQueue = [...items];
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const time = frame.time / 1000;
    const isDark = api.context.display.isDarkMode();
    
    // Bg
    api.brush.background(isDark ? 0x030308 : 0x0a0515);

    // Dynamic Sunset Sky
    const skyH = isDark ? 0x030410 : 0x050212;
    const skyM = isDark ? 0x110022 : 0x330044;
    const skyL = isDark ? 0x011122 : 0x551133;
    api.brush.rect(0, 0, width, height, {
      fill: {
        type: 'linear', x0: 0, y0: 0, x1: 0, y1: 1,
        stops: [{offset: 0, color: skyH}, {offset: 0.6, color: skyM}, {offset: 1, color: skyL}]
      },
      alpha: 1.0
    });

    // The Neon Horizon Sunset
    const sunY = height * 0.45;
    api.brush.circle(width / 2, sunY, width * 0.35, {
        fill: {
            type: 'radial', cx: 0.5, cy: 0.5, radius: 0.5,
            stops: [
                {offset: 0, color: 0xffffff},
                {offset: 0.2, color: 0xffccaa},
                {offset: 0.5, color: 0xee5522},
                {offset: 1, color: 0x000000}
            ]
        },
        blendMode: 'add', alpha: 0.7
    });

    const camAngle = time * 0.12; 
    const CAM_Z = 4500;
    const FOV_SCALE = 3500;

    function rotateY(p: Point3D, ang: number) {
      const sA = Math.sin(ang); const cA = Math.cos(ang);
      const tx = p.x * cA - p.z * sA;
      const tz = p.x * sA + p.z * cA;
      p.x = tx; p.z = tz;
    }
    function projectInPlace(p: Point3D) {
      const zDepth = CAM_Z + p.z;
      if (zDepth <= 10) { p.scale = -1; return; }
      const scale = FOV_SCALE / zDepth;
      p.scale = scale;
      p.projX = width / 2 + p.x * scale;
      p.projY = height * 0.55 + p.y * scale; 
    }

    const floorY = 450;

    // --- TRACK PATH FUNCTIONS ---
    function getTrack1(norm: number, out: Point3D) {
      const ang = norm * Math.PI * 6; // 3 loops
      const r = width * 0.38 + Math.sin(norm * Math.PI * 4) * (width * 0.1);
      out.x = Math.sin(ang) * r;
      out.z = Math.cos(ang) * r;
      out.y = Math.cos(norm * Math.PI * 2) * (height * 0.35) - height * 0.15; 
    }
    function getTrack2(norm: number, out: Point3D) {
      const ang = norm * Math.PI * 10; 
      const r = width * 0.22;
      out.x = Math.cos(ang) * r;
      out.z = Math.sin(ang) * r;
      out.y = Math.sin(norm * Math.PI * 4) * (height * 0.45); 
    }

    let itemIdx = 0;

    // Build Tracks & Pillars
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

         if (i % 5 === 0) {
            const pitem = items[itemIdx++];
            pitem.x1 = item.x1; pitem.y1 = item.y1; pitem.s1 = item.s1; pitem.z = item.z; pitem.angle = item.angle;
         }
      }
    }

    // Build Trains
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

    // Euro-Mir Towers
    for(let i=0; i<towers.length; i++) {
        const tObj = towers[i];
        tempP1.x = tObj.x; tempP1.y = floorY; tempP1.z = tObj.z;
        rotateY(tempP1, camAngle); projectInPlace(tempP1);
        const item = items[itemIdx++];
        item.x1 = tempP1.projX!; item.y1 = tempP1.projY!; item.s1 = tempP1.scale!; item.z = tempP1.z;
    }

    // Ferris Wheel
    const wheelX = -1000;
    const wheelZ = 1600;
    const wheelY = -200;
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
    for (let i = 1; i < renderQueue.length; i++) {
      let current = renderQueue[i];
      let j = i - 1;
      while (j >= 0 && renderQueue[j].z < current.z) {
        renderQueue[j + 1] = renderQueue[j];
        j--;
      }
      renderQueue[j + 1] = current;
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
    const shadowColor = 0x000000;
    const shadowAlpha = 0.4;
    for(let i = 0; i < renderQueue.length; i++) {
      const item = renderQueue[i];

      if(item.s1 <= 0 || item.s1 > 15) continue; 
      if((item.type === 'track-line' || item.type === 'ferris-spoke') && (item.s2 === undefined || item.s2 <= 0 || item.s2 > 15)) continue;

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
         const groundScale = FOV_SCALE / (CAM_Z + item.z); 
         const gridFloorY = height * 0.55 + floorY * groundScale;
         
         const pw = 6 * item.s1;
         const pCol = isDark ? 0x22222a : 0xaabbcc;
         
         // A-frame scaffolding design!
         const dx = 15 * item.s1;
         api.brush.line(item.x1, item.y1, item.x1 - dx, gridFloorY, { color: pCol, width: pw, alpha: 0.8 });
         api.brush.line(item.x1, item.y1, item.x1 + dx, gridFloorY, { color: pCol, width: pw, alpha: 0.8 });
         
         // Cross bracing
         if(gridFloorY - item.y1 > 100 * item.s1) {
            const steps = Math.floor((gridFloorY - item.y1) / (70 * item.s1));
            for(let k=1; k<=steps; k++) {
                const ky = item.y1 + k * 70 * item.s1;
                // Interpolate width
                const curW = (k / steps) * dx;
                api.brush.line(item.x1 - curW, ky, item.x1 + curW, ky, { color: isDark? 0x333333 : 0xaaaaaa, width: 2*item.s1 });
            }
         }
      }
      else if (item.type === 'tower') {
         const tData = towers[item.id1];
         const baseRad = tData.r * item.s1;
         const th = tData.h * item.s1;
         
         api.brush.line(item.x1, item.y1, item.x1, item.y1 - th, { color: 0x445588, width: baseRad*2, cap: 'butt' });
         api.brush.line(item.x1 - baseRad*0.3, item.y1, item.x1 - baseRad*0.3, item.y1 - th, { color: 0xaaccff, width: baseRad*0.5, blendMode: 'add', alpha: 0.7, cap: 'butt' });
         api.brush.line(item.x1 + baseRad*0.6, item.y1, item.x1 + baseRad*0.6, item.y1 - th, { color: 0x112244, width: baseRad*0.2, alpha: 0.8, cap: 'butt' });
         
         api.brush.ellipse(item.x1, item.y1 - th, baseRad, baseRad*0.3, { fill: 0x112255 });
         api.brush.circle(item.x1, item.y1 - th, 4 * item.s1, { fill: 0xff4444, blendMode: 'add' }); // blinking aviation light
      }
      else if (item.type === 'shuttle-hyper') {
        api.brush.ellipse(item.x1, item.y1 + 10 * item.s1, 40 * item.s1, 15 * item.s1, { fill: shadowColor, alpha: shadowAlpha });
        
        api.brush.pushMatrix();
        api.brush.translate(item.x1, item.y1);
        api.brush.rotate(item.angle); 
        api.brush.scale(item.s1, item.s1);

        const cw = 44; const ch = 18; 
        
        api.brush.rect(-cw/2 - 8, -2, 10, 4, { fill: 0x222222 }); // Hitch

        api.brush.roundRect(-cw/2, -ch/2, cw, ch, 6, { fill: 0x9999aa });
        api.brush.roundRect(-cw/2 + 2, -ch/2 + 2, cw - 4, ch - 4, 4, { fill: 0xee2222 });

        // Seats
        api.brush.roundRect(-cw/2 + 12, -ch/2 + 3, 6, ch - 6, 2, { fill: 0x111111 });
        api.brush.roundRect(-cw/2 + 24, -ch/2 + 3, 6, ch - 6, 2, { fill: 0x111111 });

        // Rolling Wheels!
        const wRot = time * 20;
        for(const wx of [-cw/2 + 8, cw/2 - 8]) {
            for(const wy of [-ch/2 - 2, ch/2 + 2]) {
                api.brush.circle(wx, wy, 4, { fill: 0x111111 });
                api.brush.line(wx, wy, wx+Math.cos(wRot)*3, wy+Math.sin(wRot)*3, { color: 0x888888, width: 1.5 });
            }
        }

        if(item.id2 === 0) { 
           api.brush.polygon([{x: cw/2, y: -ch/2+2}, {x: cw/2+12, y: 0}, {x: cw/2, y: ch/2-2}], { fill: 0xee2222 });
           api.brush.circle(cw/2+2, -ch/2+4, 2.5, { fill: 0xffffee, blendMode: 'add' });
           api.brush.circle(cw/2+2, ch/2-4, 2.5, { fill: 0xffffee, blendMode: 'add' });
           
           // Volumetric Headlights
           api.brush.polygon([{x: cw/2, y: -ch/2+4}, {x: cw/2+150, y: -ch/2-30}, {x: cw/2+150, y: ch/2+30}, {x: cw/2, y: ch/2-4}], {
             fill: { type: 'linear', x0: 0, y0: 0.5, x1: 1, y1: 0.5, stops: [{offset:0, color: 0xffffff}, {offset:1, color: 0x000000}] },
             alpha: 0.15, blendMode: 'add'
           });
        }
        api.brush.popMatrix();
      }
      else if (item.type === 'shuttle-launch') {
        api.brush.ellipse(item.x1, item.y1 + 10 * item.s1, 40 * item.s1, 15 * item.s1, { fill: shadowColor, alpha: shadowAlpha });
        
        api.brush.pushMatrix();
        api.brush.translate(item.x1, item.y1);
        api.brush.rotate(item.angle); 
        api.brush.scale(item.s1, item.s1);

        const cw = 40; const ch = 22; 
        
        api.brush.rect(-cw/2 - 6, -1.5, 8, 3, { fill: 0x222222 }); 
        api.brush.roundRect(-cw/2, -ch/2, cw, ch, 4, { fill: 0x112244 });
        
        api.brush.rect(-cw/2 + 4, -ch/2 - 1, cw - 8, 3, { fill: 0x00aaff, blendMode: 'add' });
        api.brush.rect(-cw/2 + 4, ch/2 - 2, cw - 8, 3, { fill: 0x00aaff, blendMode: 'add' });

        api.brush.roundRect(-cw/2 + 10, -ch/2 + 4, 8, ch - 8, 3, { fill: 0x050505 });
        api.brush.roundRect(-cw/2 + 24, -ch/2 + 4, 8, ch - 8, 3, { fill: 0x050505 });

        const wRot = time * -18;
        for(const wx of [-cw/2 + 8, cw/2 - 8]) {
            for(const wy of [-ch/2 - 2, ch/2 + 2]) {
                api.brush.circle(wx, wy, 4, { fill: 0x111111 });
                api.brush.line(wx, wy, wx+Math.cos(wRot)*3, wy+Math.sin(wRot)*3, { color: 0x00aaff, width: 1.5 });
            }
        }

        if(item.id2 === 0) { 
           api.brush.roundRect(cw/2 - 2, -ch/2 + 2, 8, ch - 4, 4, { fill: 0x112244 });
           api.brush.circle(cw/2+2, -ch/2+6, 3, { fill: 0x88ddff, blendMode: 'add' });
           api.brush.circle(cw/2+2, ch/2-6, 3, { fill: 0x88ddff, blendMode: 'add' });
           
           api.brush.polygon([{x: cw/2, y: -ch/2+6}, {x: cw/2+120, y: -ch/2-40}, {x: cw/2+120, y: ch/2+40}, {x: cw/2, y: ch/2-6}], {
             fill: { type: 'linear', x0: 0, y0: 0.5, x1: 1, y1: 0.5, stops: [{offset:0, color: 0xffffff}, {offset:1, color: 0x000000}] },
             alpha: 0.12, blendMode: 'add'
           });
        }
        api.brush.popMatrix();
      }
      else if (item.type === 'ferris-spoke') {
         api.brush.line(item.x1, item.y1, item.x2, item.y2, { color: isDark ? 0x444466 : 0x9999aa, width: 5*item.s1 });
      }
      else if (item.type === 'ferris-cart') {
         api.brush.rect(item.x1 - 15*item.s1, item.y1, 30*item.s1, 40*item.s1, { fill: isDark ? 0xff3366 : 0xff4466, blendMode: 'add', alpha: 0.9 });
      }
      else if (item.type === 'tree') {
         const th = trees[item.id1].h * item.s1;
         const tw = th * 0.35;
         const points: Point[] = [
            {x: item.x1, y: item.y1 - th},
            {x: item.x1 + tw, y: item.y1},
            {x: item.x1 - tw, y: item.y1}
         ];
         api.brush.polygon(points, { fill: isDark ? 0x0a2211 : 0x11aa44, alpha: Math.min(1, item.s1 * 0.9) });
         api.brush.ellipse(item.x1, item.y1, tw*1.2, tw*0.4, { fill: shadowColor, alpha: 0.3 });
      }
      else if (item.type === 'particle') {
         const p = particles[item.id1];
         const alpha = (Math.sin(time*2 + p.phase) * 0.5 + 0.5) * Math.min(1, item.s1);
         if (alpha > 0.05) {
             const c = item.id1 % 3 === 0 ? 0xffffff : (item.id1 % 2 === 0 ? 0x44ffff : 0xffaa44);
             api.brush.circle(item.x1, item.y1, 3 * item.s1, { fill: c, alpha, blendMode: 'add' });
         }
      }
    }
  },

  async teardown(): Promise<void> {
    items.length = 0;
    particles.length = 0;
    trees.length = 0;
    renderQueue.length = 0;
  },
};

registerActor(actor);
export default actor;
