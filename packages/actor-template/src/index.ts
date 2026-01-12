/**
 * Actor Template
 *
 * This is a template for creating new actors for the Art Installation.
 * Replace the implementation with your own creative vision!
 *
 * Getting Started:
 * 1. Update the metadata below with your info
 * 2. Implement the update() method to draw on the canvas
 * 3. Optionally implement setup() for initialization
 * 4. Run `pnpm dev` to preview your actor
 * 5. Run `pnpm validate` before submitting
 *
 * @see https://github.com/cloudfest/art-installation/docs/actor-development.md
 */

import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

// ============================================================
// ACTOR METADATA - Update this with your information!
// ============================================================

const metadata: ActorMetadata = {
  // Unique ID for your actor (kebab-case, e.g., "rainbow-waves")
  id: 'template-actor',

  // Display name shown in gallery
  name: 'Template Actor',

  // Short description of what your actor does
  description: 'A template actor that demonstrates the API',

  // Your information
  author: {
    name: 'Your Name',      // Change this!
    github: 'your-github',  // Change this!
  },

  // Version of your actor
  version: '1.0.0',

  // Tags for categorization
  tags: ['template', 'example'],

  // When you created this actor
  createdAt: new Date(),

  // How long your actor prefers to run (seconds)
  preferredDuration: 30,

  // Which context APIs your actor uses (optional)
  requiredContexts: ['time'],
};

// ============================================================
// ACTOR STATE - Store any state your actor needs between frames
// ============================================================

interface ActorState {
  // Example: track positions, colors, animation progress, etc.
  hue: number;
  points: Array<{ x: number; y: number; vx: number; vy: number }>;
}

let state: ActorState = {
  hue: 0,
  points: [],
};

// ============================================================
// ACTOR IMPLEMENTATION
// ============================================================

const actor: Actor = {
  metadata,

  /**
   * Setup is called once when your actor is loaded.
   * Use this for initialization, loading assets, etc.
   */
  async setup(api: ActorSetupAPI): Promise<void> {
    const { width, height } = api.canvas.getSize();

    // Initialize state
    state.hue = Math.random() * 360;
    state.points = [];

    // Create some initial points with random positions and velocities
    for (let i = 0; i < 5; i++) {
      state.points.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
      });
    }

    console.log(`[${metadata.id}] Setup complete with ${state.points.length} points`);
  },

  /**
   * Update is called every frame while your actor is active.
   * This is where you draw on the canvas!
   *
   * @param api - Drawing and context APIs
   * @param frame - Frame timing information
   */
  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const time = frame.time / 1000; // Convert to seconds

    // Update hue over time for color cycling
    state.hue = (state.hue + 0.5) % 360;

    // Update and draw each point
    for (let i = 0; i < state.points.length; i++) {
      const point = state.points[i];

      // Update position
      point.x += point.vx;
      point.y += point.vy;

      // Bounce off walls
      if (point.x < 0 || point.x > width) point.vx *= -1;
      if (point.y < 0 || point.y > height) point.vy *= -1;

      // Keep in bounds
      point.x = Math.max(0, Math.min(width, point.x));
      point.y = Math.max(0, Math.min(height, point.y));

      // Calculate color for this point
      const hue = (state.hue + i * 30) % 360;

      // Draw a circle at the point
      api.brush.circle(point.x, point.y, 20 + Math.sin(time + i) * 10, {
        fill: `hsla(${hue}, 70%, 60%, 0.7)`,
        blendMode: 'add',
      });

      // Draw connections between points
      for (let j = i + 1; j < state.points.length; j++) {
        const other = state.points[j];
        const dist = Math.hypot(other.x - point.x, other.y - point.y);

        // Only draw connections for nearby points
        if (dist < 200) {
          const alpha = 1 - dist / 200;
          api.brush.line(point.x, point.y, other.x, other.y, {
            color: `hsla(${hue}, 70%, 60%, ${alpha * 0.5})`,
            width: 2,
          });
        }
      }
    }

    // Example: React to time of day
    const hour = api.context.time.hour();
    if (hour >= 18 || hour < 6) {
      // It's evening/night - make things darker
      // This is just an example of using context!
    }

    // Example: Using gradients (IMPORTANT: coordinates must be 0-1 range!)
    // Uncomment to try:
    // api.brush.circle(width / 2, height / 2, 50, {
    //   fill: {
    //     type: 'radial',
    //     cx: 0.5, cy: 0.5, radius: 0.5,  // 0-1 range, NOT pixel values!
    //     stops: [
    //       { offset: 0, color: 'rgba(255, 255, 255, 1)' },
    //       { offset: 1, color: 'rgba(255, 255, 255, 0)' },
    //     ],
    //   },
    //   blendMode: 'add',
    // });
  },

  /**
   * Teardown is called when your actor is being deactivated.
   * Clean up any resources, finish animations, etc.
   */
  async teardown(): Promise<void> {
    // Reset state for next activation
    state = {
      hue: 0,
      points: [],
    };

    console.log(`[${metadata.id}] Teardown complete`);
  },

  /**
   * Optional: React to context changes.
   * Called when external conditions change (weather, audio beat, etc.)
   */
  onContextChange(_context): void {
    // Example: Change behavior based on weather
    // const weather = _context.weather.condition();
    // if (weather === 'rain') {
    //   // Do something rainy!
    // }
  },
};

// Export the actor as default
export default actor;
