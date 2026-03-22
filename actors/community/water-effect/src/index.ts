import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
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

// Fully procedural water shader — NO custom uniforms, only built-in uTime.
// Matches the pattern of working filter actors (underwater-caustics, etc.).
// All loops unrolled, no Voronoi (too complex), no float loop vars.
const waterShader = /* glsl */ `
  // --- Hash for procedural positions ---
  float hash1(float n) { return fract(sin(n) * 43758.5453); }

  // --- Water surface height from overlapping sine waves ---
  float waterH(vec2 p, float t) {
    return sin(p.x * 1.8 + t * 1.2) * 0.35
         + sin(p.y * 2.3 - t * 0.9) * 0.30
         + sin((p.x + p.y) * 1.4 + t * 1.5) * 0.20
         + sin(p.x * 3.6 - t * 2.1) * 0.12
         + sin(p.y * 3.1 + t * 1.7) * 0.10
         + sin((p.x * 0.7 - p.y) * 2.9 + t * 1.3) * 0.08;
  }

  // --- Caustic pattern: 3 directional wave planes ---
  // Bright lines form where the wave sum crosses zero (light focusing)
  float caustic(vec2 p, float t) {
    float w1 = sin(dot(p, vec2(2.8, 1.6)) + t * 1.3);
    float w2 = sin(dot(p, vec2(-1.9, 2.7)) - t * 1.0);
    float w3 = sin(dot(p, vec2(1.3, -2.5)) + t * 1.5);
    float sum = w1 + w2 + w3;
    // Inverse-abs creates bright lines at zero crossings
    return 1.0 / (1.0 + abs(sum) * 3.5);
  }

  // --- Single procedural drip ripple ---
  // Returns vec3(displacement.xy, ringBrightness)
  vec3 drip(float idx, float t, vec2 uv, float aspect) {
    float period = 4.5;
    float phase = idx * 1.47;
    float age = mod(t + phase, period);

    // Drip position (changes each cycle)
    float seed = floor((t + phase) / period) * 17.3 + idx * 7.1;
    float px = 0.15 + 0.7 * hash1(seed);
    float py = 0.15 + 0.7 * hash1(seed + 3.7);

    vec2 delta = (uv - vec2(px, py)) * vec2(aspect, 1.0);
    float dist = length(delta);
    vec2 dir = dist > 0.001 ? delta / dist : vec2(0.0);

    float freq = 30.0 + hash1(seed + 5.0) * 30.0;
    float wp = (dist - age * 0.11) * freq;
    float wave = sin(wp);

    float env = smoothstep(0.0, 0.2, age)
              * (1.0 - smoothstep(2.5, period, age))
              * (1.0 / (1.0 + dist * 12.0));
    float amp = 0.5 + hash1(seed + 1.0) * 0.5;

    vec2 disp = dir * wave * amp * env * 0.04;
    float ring = pow(max(wave, 0.0), 2.0) * amp * env;
    return vec3(disp, ring);
  }

  void main() {
    vec2 uv = vTextureCoord;
    float t = uTime;
    float aspect = uResolution.x / uResolution.y;
    vec2 sp = uv * vec2(aspect, 1.0) * 5.0;

    // 1. Surface displacement via analytical derivatives
    float eps = 0.012;
    float hC = waterH(sp, t);
    float hR = waterH(sp + vec2(eps, 0.0), t);
    float hU = waterH(sp + vec2(0.0, eps), t);
    vec2 disp = vec2(hR - hC, hU - hC) * 0.025;

    // 2. Drip ripples (unrolled — no loops)
    float glow = 0.0;
    vec3 r0 = drip(0.0, t, uv, aspect); disp += r0.xy; glow += r0.z;
    vec3 r1 = drip(1.0, t, uv, aspect); disp += r1.xy; glow += r1.z;
    vec3 r2 = drip(2.0, t, uv, aspect); disp += r2.xy; glow += r2.z;
    vec3 r3 = drip(3.0, t, uv, aspect); disp += r3.xy; glow += r3.z;
    vec3 r4 = drip(4.0, t, uv, aspect); disp += r4.xy; glow += r4.z;

    // 3. Refracted scene sample
    vec4 color = texture(uTexture, clamp(uv + disp, 0.0, 1.0));

    // 4. Caustic light network (two layers at different scales)
    float c1 = caustic(sp * 1.2, t);
    float c2 = caustic(sp * 0.85 + 20.0, t * 0.75);
    float cBright = (c1 * c1 + c2 * c2) * 0.5;

    // 5. Specular glint on wave crests
    float spec = pow(max(sin(hC * 2.5 + 0.8), 0.0), 6.0) * 0.18;

    // 6. Compose
    // Water tint
    color.rgb = mix(color.rgb, color.rgb * vec3(0.82, 0.93, 1.0), 0.12);
    // Caustic light (bright enough to see on dark backgrounds)
    color.rgb += vec3(0.4, 0.65, 0.9) * cBright * 0.5;
    // Drip ring highlights
    color.rgb += vec3(0.5, 0.75, 1.0) * glow * 0.6;
    // Specular
    color.rgb += vec3(0.9, 0.95, 1.0) * spec;
    // Vignette
    float vig = 1.0 - smoothstep(0.4, 0.95, length(uv - 0.5) * 1.1);
    color.rgb *= mix(0.93, 1.0, vig);

    finalColor = color;
  }
`;

const actor: Actor = {
  metadata,

  update(api: ActorUpdateAPI, _frame: FrameContext) {
    // No custom uniforms — animation via built-in uTime (proven working pattern)
    api.filter.customShader(waterShader);
  },
};

registerActor(actor);
export default actor;
