import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorMetadata,
  ActorUpdateAPI,
  FrameContext,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'rain-on-window',
  name: 'Rain On Window',
  description:
    'Realistic rain drops sliding down glass with refraction, wet trails, and condensation',
  author: {
    name: 'Alain Schlesser',
    github: 'schlessera',
  },
  version: '1.0.0',
  tags: ['filter', 'rain', 'window', 'glass', 'refraction', 'shader', 'weather'],
  createdAt: new Date(),
  role: 'filter',
  preferredDuration: 60,
  requiredContexts: ['display'],
};

// Procedural rain-on-glass shader using the BigWings grid-cell technique.
// Three layers: large sliding drops with trails, medium drops, static condensation.
// All animation driven by built-in uTime; only uDarkMode passed as custom uniform.
const RAIN_SHADER = /* glsl */ `
  uniform float uDarkMode;

  // Pseudo-random hash: vec2 -> float [0, 1]
  float hash(vec2 p) {
    p = fract(p * vec2(443.897, 441.423));
    p += dot(p, p.yx + 19.19);
    return fract(p.x * p.y);
  }

  // Sliding rain drops with wet trails.
  // Returns vec3(UV-space distortion.xy, specular highlight intensity).
  vec3 drops(vec2 uv, float t, float gridSz, float speed) {
    float aspect = uResolution.x / uResolution.y;
    // Square cells in pixel-space by pre-multiplying x by aspect
    vec2 gv = vec2(uv.x * aspect, uv.y) * gridSz;
    vec2 id = floor(gv);
    vec2 st = fract(gv) - 0.5; // cell-local coords, centred at origin

    vec3 acc = vec3(0.0);

    // Check 3x3 neighbourhood so drops near cell edges render correctly
    for (int yi = -1; yi <= 1; yi++) {
      for (int xi = -1; xi <= 1; xi++) {
        vec2 off = vec2(float(xi), float(yi));
        vec2 cid = id + off;
        vec2 cls = st - off;

        // Per-cell random seeds
        float h0 = hash(cid);
        float h1 = hash(cid + 127.1);
        float h2 = hash(cid + 253.3);
        float h3 = hash(cid + 379.5);

        // --- Drop Y: slides top-to-bottom within the cell ---
        float spd  = speed * (0.3 + h0 * 0.7);
        float ph   = fract(t * spd + h1 * 10.0);
        float dy   = -0.5 + ph;
        // Fade near wrap-around to hide the teleport
        float fade = smoothstep(0.0, 0.12, ph) * smoothstep(1.0, 0.88, ph);

        // --- Drop X: random offset + sine wobble ---
        float wF = 5.0 + h2 * 5.0;
        float wA = 0.03 + h0 * 0.05;
        float dx = (h1 - 0.5) * 0.4 + sin(dy * wF + h2 * 6.283) * wA;

        // Vector from drop centre to current pixel (cell-space)
        vec2 d = cls - vec2(dx, dy);

        // Teardrop shape: narrow top, wide bottom
        d.x *= (1.0 - clamp(d.y, -0.3, 0.3) * 1.8) * 1.25;

        float dist = length(d);
        float sz   = 0.06 + h3 * 0.04;
        float drop = smoothstep(sz, sz * 0.05, dist) * fade;

        // Refraction offset (cell-space -> UV-space)
        vec2 duv = drop * d * 2.0 / gridSz;
        duv.x /= aspect;
        acc.xy += duv;

        // Specular highlight near top of drop
        vec2 hld = d - vec2(0.015, -sz * 0.3);
        float hl  = (1.0 - smoothstep(0.0, sz * 0.3, length(hld))) * drop;
        acc.z += hl * 0.7;

        // --- Wet trail above the drop ---
        float above = dy - cls.y; // positive when pixel is above drop
        float tMask = smoothstep(0.0, 0.02, above)
                    * smoothstep(0.5, 0.0, above)
                    * fade;

        // Trail follows the wobble path at each Y
        float trailX = (h1 - 0.5) * 0.4
                      + sin(cls.y * wF + h2 * 6.283) * wA;
        float tDist  = abs(cls.x - trailX);
        float rawTW  = sz * 0.15 * (1.0 - above * 3.0);
        float tW     = max(rawTW, 0.004);
        float trail   = (1.0 - smoothstep(tW * 0.3, tW, tDist))
                      * tMask * step(0.005, rawTW);

        // Small beads along the trail
        float bead = smoothstep(0.35, 0.5, fract(above * 10.0 + h3 * 3.0))
                   * smoothstep(0.65, 0.5, fract(above * 10.0 + h3 * 3.0));
        trail *= 0.3 + bead * 0.7;

        vec2 tduv = trail * vec2(trailX - cls.x, 0.0) * 0.4 / gridSz;
        tduv.x /= aspect;
        acc.xy += tduv;
        acc.z  += trail * 0.2;
      }
    }
    return acc;
  }

  // Tiny static condensation droplets
  vec3 mist(vec2 uv, float t) {
    float aspect = uResolution.x / uResolution.y;
    float gs = 35.0;
    vec2 gv = vec2(uv.x * aspect, uv.y) * gs;
    vec2 id = floor(gv);
    vec2 st = fract(gv) - 0.5;

    vec3 acc = vec3(0.0);

    for (int yi = -1; yi <= 1; yi++) {
      for (int xi = -1; xi <= 1; xi++) {
        vec2 off = vec2(float(xi), float(yi));
        vec2 cid = id + off;
        vec2 cls = st - off;

        float h0 = hash(cid);
        float h1 = hash(cid + 50.0);

        vec2 pos = (vec2(h0, h1) - 0.5) * 0.65;
        vec2 d   = cls - pos;
        float sz = 0.02 + hash(cid + 99.0) * 0.025;
        float drop = smoothstep(sz, sz * 0.05, length(d))
                   * smoothstep(-0.2, 0.4, sin(t * 0.15 + h0 * 6.283));

        vec2 duv = drop * d * 0.6 / gs;
        duv.x /= aspect;
        acc.xy += duv;
        acc.z  += drop * 0.15;
      }
    }
    return acc;
  }

  void main() {
    vec2 uv = vTextureCoord;
    float t = uTime;

    // Large, slow drops with trails
    vec3 big  = drops(uv, t, 7.0, 0.1);
    // Smaller, faster drops (offset UV + time for independent pattern)
    vec3 med  = drops(uv + 0.37, t + 47.0, 13.0, 0.18);
    // Tiny static condensation
    vec3 tiny = mist(uv, t);

    // Combine all layers
    vec2 totalDist = big.xy + med.xy * 0.5 + tiny.xy * 0.25;
    float totalHL  = big.z  + med.z  * 0.3 + tiny.z  * 0.15;

    // Sample scene through wet glass
    vec4 color = texture(uTexture, clamp(uv + totalDist, vec2(0.0), vec2(1.0)));

    // Wet-glass dimming + cool blue tint
    color.rgb *= mix(0.95, 0.88, uDarkMode);
    color.rgb = mix(color.rgb, color.rgb * vec3(0.92, 0.95, 1.05), 0.2);

    // Specular highlights on drops
    vec3 hlCol = mix(vec3(0.25, 0.25, 0.3), vec3(0.5, 0.55, 0.65), uDarkMode);
    color.rgb += hlCol * totalHL;

    // Moody vignette
    float vig = 1.0 - smoothstep(0.35, 1.0, length(uv - 0.5) * 1.3);
    color.rgb *= mix(mix(0.92, 1.0, vig), mix(0.82, 1.0, vig), uDarkMode);

    finalColor = color;
  }
`;

const actor: Actor = {
  metadata,

  update(api: ActorUpdateAPI, _frame: FrameContext): void {
    const isDark = api.context.display.isDarkMode();
    api.filter.customShader(RAIN_SHADER, { uDarkMode: isDark ? 1.0 : 0.0 });
  },
};

registerActor(actor);
export default actor;
