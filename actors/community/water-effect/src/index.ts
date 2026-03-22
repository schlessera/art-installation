import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'water-effect',
  name: 'Water Effect',
  description:
    'Realistic water surface seen from above with drip ripples distorting the scene beneath',
  author: {
    name: 'Alain Schlesser',
    github: 'schlessera',
  },
  version: '1.0.0',
  tags: ['filter', 'water', 'ripples', 'distortion', 'shader'],
  createdAt: new Date(),
  role: 'filter',
  preferredDuration: 45,
  requiredContexts: ['display'],
};

// --- Drip state (pre-allocated, no allocations in update) ---
const MAX_DRIPS = 8;
const DRIP_LIFETIME = 6.0; // seconds

interface Drip {
  x: number;
  y: number;
  birthTime: number;
  amplitude: number;
  active: boolean;
}

const drips: Drip[] = [];
let nextDripTime = 0;
let elapsedSec = 0;

// Build the shader with individual drip uniforms (no array support in runtime)
// Each uDripN is vec4(x, y, birthTime, amplitude).
// Frequency is derived in-shader from birthTime to avoid extra uniforms.
const waterShader = /* glsl */ `
  // Simple 2D hash
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // Value noise
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

  // Fractal brownian motion for organic water surface
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  // Compute displacement from a single drip ripple
  vec2 dripDisplacement(vec4 drip, float t, vec2 uv, float aspect) {
    if (drip.z < -50.0) return vec2(0.0); // inactive sentinel

    float age = t - drip.z;
    if (age < 0.0 || age > 6.0) return vec2(0.0);

    vec2 delta = (uv - drip.xy) * vec2(aspect, 1.0);
    float dist = length(delta);

    // Derive frequency from birth time (deterministic pseudo-random)
    float freq = 30.0 + fract(sin(drip.z * 127.1) * 43758.5) * 40.0;

    // Expanding ring wave
    float wavePos = dist - age * 0.12;
    float ring = sin(wavePos * freq) * drip.w;

    // Envelope
    float fadeIn  = smoothstep(0.0, 0.15, age);
    float fadeOut = 1.0 - smoothstep(3.0, 6.0, age);
    float distFade = 1.0 / (1.0 + dist * 8.0);
    ring *= fadeIn * fadeOut * distFade;

    vec2 dir = dist > 0.001 ? delta / dist : vec2(0.0);
    return dir * ring * 0.025;
  }

  void main() {
    vec2 uv = vTextureCoord;
    float t = uElapsed;
    float aspect = uResolution.x / uResolution.y;

    // --- 1. Organic water surface distortion ---
    vec2 surfUV = uv * vec2(aspect, 1.0) * 6.0;
    float wave1 = fbm(surfUV + vec2(t * 0.15, t * 0.08));
    float wave2 = fbm(surfUV * 1.3 - vec2(t * 0.1, t * 0.12) + 50.0);
    float surface = wave1 + wave2;

    // Surface normal via finite differences for refraction
    float eps = 0.003;
    vec2 uvDx = uv + vec2(eps, 0.0);
    vec2 uvDy = uv + vec2(0.0, eps);
    float sx = fbm(uvDx * vec2(aspect, 1.0) * 6.0 + vec2(t * 0.15, t * 0.08))
             + fbm(uvDx * vec2(aspect, 1.0) * 6.0 * 1.3 - vec2(t * 0.1, t * 0.12) + 50.0);
    float sy = fbm(uvDy * vec2(aspect, 1.0) * 6.0 + vec2(t * 0.15, t * 0.08))
             + fbm(uvDy * vec2(aspect, 1.0) * 6.0 * 1.3 - vec2(t * 0.1, t * 0.12) + 50.0);

    vec2 displacement = vec2(sx - surface, sy - surface) * 0.012;

    // --- 2. Drip ripples (unrolled — no array uniforms) ---
    displacement += dripDisplacement(uDrip0, t, uv, aspect);
    displacement += dripDisplacement(uDrip1, t, uv, aspect);
    displacement += dripDisplacement(uDrip2, t, uv, aspect);
    displacement += dripDisplacement(uDrip3, t, uv, aspect);
    displacement += dripDisplacement(uDrip4, t, uv, aspect);
    displacement += dripDisplacement(uDrip5, t, uv, aspect);
    displacement += dripDisplacement(uDrip6, t, uv, aspect);
    displacement += dripDisplacement(uDrip7, t, uv, aspect);

    // --- 3. Sample scene with refraction ---
    vec2 refractedUV = clamp(uv + displacement, 0.0, 1.0);
    vec4 color = texture(uTexture, refractedUV);

    // --- 4. Water surface shading ---
    // Specular highlight from surface variation
    float highlight = smoothstep(0.48, 0.52, surface * 0.5) * 0.12;

    // Caustic shimmer
    float caustic1 = fbm(surfUV * 2.0 + vec2(t * 0.2, -t * 0.15));
    float caustic2 = fbm(surfUV * 2.5 - vec2(t * 0.18, t * 0.22) + 30.0);
    float caustic  = pow(abs(caustic1 - caustic2), 1.5) * 0.5;

    // Subtle blue tint + caustics + specular
    color.rgb = mix(color.rgb, color.rgb * vec3(0.75, 0.88, 1.0), 0.12);
    color.rgb += vec3(0.6, 0.8, 1.0) * caustic * 0.07;
    color.rgb += vec3(1.0) * highlight;

    // Depth vignette
    float vig = 1.0 - smoothstep(0.3, 0.85, length(uv - 0.5) * 1.2);
    color.rgb *= mix(0.93, 1.0, vig);

    finalColor = color;
  }
`;

// Inactive sentinel value — shader checks drip.z < -50
const INACTIVE: [number, number, number, number] = [0, 0, -100, 0];

const actor: Actor = {
  metadata,

  async setup(_api: ActorSetupAPI) {
    for (let i = 0; i < MAX_DRIPS; i++) {
      drips[i] = { x: 0, y: 0, birthTime: -100, amplitude: 0, active: false };
    }
    nextDripTime = 0.5 + Math.random() * 1.0;
    elapsedSec = 0;
  },

  update(api: ActorUpdateAPI, frame: FrameContext) {
    elapsedSec = frame.time / 1000;

    // --- Spawn drips at random intervals ---
    if (elapsedSec >= nextDripTime) {
      let slot = -1;
      for (let i = 0; i < MAX_DRIPS; i++) {
        if (!drips[i].active || elapsedSec - drips[i].birthTime > DRIP_LIFETIME) {
          slot = i;
          break;
        }
      }
      if (slot >= 0) {
        const d = drips[slot];
        d.x = 0.1 + Math.random() * 0.8;
        d.y = 0.1 + Math.random() * 0.8;
        d.birthTime = elapsedSec;
        d.amplitude = 0.3 + Math.random() * 0.7;
        d.active = true;
      }
      nextDripTime = elapsedSec + 0.8 + Math.random() * 1.7;
    }

    // --- Expire old drips ---
    for (let i = 0; i < MAX_DRIPS; i++) {
      if (drips[i].active && elapsedSec - drips[i].birthTime > DRIP_LIFETIME) {
        drips[i].active = false;
      }
    }

    // --- Build uniforms (individual vec4 per drip) ---
    const dripVec = (i: number): [number, number, number, number] => {
      const d = drips[i];
      return d.active ? [d.x, d.y, d.birthTime, d.amplitude] : INACTIVE;
    };

    api.filter.customShader(waterShader, {
      uDrip0: dripVec(0),
      uDrip1: dripVec(1),
      uDrip2: dripVec(2),
      uDrip3: dripVec(3),
      uDrip4: dripVec(4),
      uDrip5: dripVec(5),
      uDrip6: dripVec(6),
      uDrip7: dripVec(7),
      uElapsed: elapsedSec,
    });
  },

  async teardown() {
    for (let i = 0; i < MAX_DRIPS; i++) {
      drips[i] = { x: 0, y: 0, birthTime: -100, amplitude: 0, active: false };
    }
    nextDripTime = 0;
    elapsedSec = 0;
  },
};

registerActor(actor);
export default actor;
