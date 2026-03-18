import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SavedArtwork } from '@art/types';
import { useGalleryApi } from '../hooks/useGalleryApi';

const RUNTIME_URL = import.meta.env.VITE_RUNTIME_URL || 'http://localhost:3000';

// --- Generative Canvas Background ---

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface Star {
  x: number;
  y: number;
  radius: number;
  twinkle: number;
  twinkleSpeed: number;
}

interface Wave {
  offset: number;
  amplitude: number;
  frequency: number;
  speed: number;
  color: string;
  lineWidth: number;
}

const COLORS = {
  cyan: '#00d8ff',
  purple: '#6a38ff',
  pink: '#e6457b',
  gold: '#fdd037',
};

const PALETTE = [COLORS.cyan, COLORS.purple, COLORS.pink, COLORS.gold];

function createStars(count: number, w: number, h: number): Star[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    radius: Math.random() * 1.5 + 0.3,
    twinkle: Math.random() * Math.PI * 2,
    twinkleSpeed: 0.01 + Math.random() * 0.03,
  }));
}

function createParticles(count: number, w: number, h: number): Particle[] {
  return Array.from({ length: count }, () => spawnParticle(w, h));
}

function spawnParticle(w: number, h: number): Particle {
  const maxLife = 200 + Math.random() * 300;
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    radius: Math.random() * 3 + 1,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    alpha: 0,
    life: 0,
    maxLife,
  };
}

function createWaves(): Wave[] {
  return [
    { offset: 0, amplitude: 40, frequency: 0.008, speed: 0.015, color: COLORS.cyan, lineWidth: 2 },
    { offset: 0, amplitude: 30, frequency: 0.012, speed: -0.01, color: COLORS.purple, lineWidth: 1.5 },
    { offset: 0, amplitude: 25, frequency: 0.006, speed: 0.02, color: COLORS.pink, lineWidth: 1 },
  ];
}

function useGenerativeCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let particles: Particle[] = [];
    const waves = createWaves();

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = createStars(120, w, h);
      particles = createParticles(60, w, h);
    }

    resize();
    window.addEventListener('resize', resize);

    function drawStars() {
      if (!ctx) return;
      for (const s of stars) {
        s.twinkle += s.twinkleSpeed;
        const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(s.twinkle));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      }
    }

    function drawWaves(time: number) {
      if (!ctx) return;
      const baseY = h * 0.55;
      for (const wave of waves) {
        wave.offset += wave.speed;
        ctx.beginPath();
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = wave.lineWidth;
        ctx.globalAlpha = 0.25;
        for (let x = 0; x <= w; x += 2) {
          const y =
            baseY +
            wave.amplitude * Math.sin(x * wave.frequency + wave.offset) +
            wave.amplitude * 0.5 * Math.sin(x * wave.frequency * 1.8 + wave.offset * 0.7 + time * 0.001);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    function drawParticles() {
      if (!ctx) return;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        // Fade in/out
        const progress = p.life / p.maxLife;
        if (progress < 0.15) {
          p.alpha = progress / 0.15;
        } else if (progress > 0.75) {
          p.alpha = (1 - progress) / 0.25;
        } else {
          p.alpha = 1;
        }

        if (p.life >= p.maxLife || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) {
          particles[i] = spawnParticle(w, h);
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    function drawConnections() {
      if (!ctx) return;
      const threshold = 120;
      const thresholdSq = threshold * threshold;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distSq = dx * dx + dy * dy;
          if (distSq < thresholdSq) {
            const dist = Math.sqrt(distSq);
            const alpha = (1 - dist / threshold) * 0.15 * Math.min(particles[i].alpha, particles[j].alpha);
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = particles[i].color;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    function frame(time: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      drawStars();
      drawConnections();
      drawParticles();
      drawWaves(time);
      animId = requestAnimationFrame(frame);
    }

    animId = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, [canvasRef]);
}

// --- Scroll-triggered fade-in ---

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    const targets = document.querySelectorAll('.reveal-on-scroll');
    targets.forEach((t) => observer.observe(t));

    return () => observer.disconnect();
  }, []);
}

// --- Cycle timer ---

function useCycleTimer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => (s + 1) % 60);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return seconds;
}

// --- Actor carousel ---

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const CAROUSEL_GAP = 20; // 1.25rem
const CAROUSEL_VISIBLE_COLS = 3;
const CAROUSEL_ROWS = 2;
const CAROUSEL_VISIBLE = CAROUSEL_VISIBLE_COLS * CAROUSEL_ROWS; // 6

function useActorCarousel(actors: typeof ACTORS) {
  const [shuffled] = useState(() => shuffleArray(actors));
  const extendedActors = useMemo(
    () => [...shuffled, ...shuffled.slice(0, CAROUSEL_VISIBLE)],
    [shuffled],
  );

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
  );
  const [transform, setTransform] = useState('translate3d(0,0,0)');
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const [mobileViewportHeight, setMobileViewportHeight] = useState<number | undefined>(undefined);
  const stepRef = useRef(0);
  const pausedRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Mobile detection
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const handler = () => {
      setIsMobile(mq.matches);
      stepRef.current = 0;
      setTransitionEnabled(false);
      setTransform('translate3d(0,0,0)');
      requestAnimationFrame(() => setTransitionEnabled(true));
    };
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Mobile viewport height measurement
  useEffect(() => {
    if (!isMobile) {
      setMobileViewportHeight(undefined);
      return;
    }
    const measure = () => {
      const firstCard = trackRef.current?.querySelector('.actor-card') as HTMLElement;
      if (firstCard) {
        setMobileViewportHeight(firstCard.offsetHeight * CAROUSEL_VISIBLE + CAROUSEL_GAP * (CAROUSEL_VISIBLE - 1));
      }
    };
    requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    if (trackRef.current) {
      const firstCard = trackRef.current.querySelector('.actor-card');
      if (firstCard) ro.observe(firstCard);
    }
    return () => ro.disconnect();
  }, [isMobile]);

  // Compute step size in px
  const getStepPx = useCallback(() => {
    if (isMobile) {
      const firstCard = trackRef.current?.querySelector('.actor-card') as HTMLElement;
      return firstCard ? firstCard.offsetHeight + CAROUSEL_GAP : 0;
    }
    const viewport = viewportRef.current;
    return viewport ? (viewport.offsetWidth + CAROUSEL_GAP) / CAROUSEL_VISIBLE_COLS : 0;
  }, [isMobile]);

  // Auto-scroll interval
  useEffect(() => {
    const maxStep = isMobile ? shuffled.length : shuffled.length / CAROUSEL_ROWS;

    const interval = setInterval(() => {
      if (pausedRef.current) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      stepRef.current += 1;
      if (stepRef.current > maxStep) return; // wait for transitionEnd reset
      const stepPx = getStepPx();
      if (stepPx === 0) return;

      setTransitionEnabled(true);
      if (isMobile) {
        setTransform(`translate3d(0, ${-stepRef.current * stepPx}px, 0)`);
      } else {
        setTransform(`translate3d(${-stepRef.current * stepPx}px, 0, 0)`);
      }
    }, 3800);

    return () => clearInterval(interval);
  }, [isMobile, shuffled.length, getStepPx]);

  // Wrap-around on transition end
  const handleTransitionEnd = useCallback(() => {
    const maxStep = isMobile ? shuffled.length : shuffled.length / CAROUSEL_ROWS;
    if (stepRef.current >= maxStep) {
      setTransitionEnabled(false);
      stepRef.current = 0;
      setTransform('translate3d(0, 0, 0)');
      requestAnimationFrame(() => setTransitionEnabled(true));
    }
  }, [isMobile, shuffled.length]);

  // Recalculate transform on resize
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (stepRef.current === 0) return;
      const stepPx = getStepPx();
      if (stepPx === 0) return;
      setTransitionEnabled(false);
      if (isMobile) {
        setTransform(`translate3d(0, ${-stepRef.current * stepPx}px, 0)`);
      } else {
        setTransform(`translate3d(${-stepRef.current * stepPx}px, 0, 0)`);
      }
      requestAnimationFrame(() => setTransitionEnabled(true));
    });
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [isMobile, getStepPx]);

  return {
    extendedActors,
    transform,
    transitionEnabled,
    isMobile,
    pausedRef,
    viewportRef,
    trackRef,
    handleTransitionEnd,
    mobileViewportHeight,
  };
}

// --- Actor card data ---

const ACTORS: { id: string; name: string; role: 'foreground' | 'background' | 'filter'; description: string }[] = [
  // Foreground actors (22)
  { id: 'architectural-patterns', name: 'Architectural Patterns', role: 'foreground', description: 'Geometric patterns inspired by Islamic art, Art Deco, Gothic, Celtic, and modernist design.' },
  { id: 'audio-reactive', name: 'Audio Reactive', role: 'foreground', description: 'Pulsing visualizations that react to audio frequencies and beats.' },
  { id: 'aurora-dreamscape', name: 'Aurora Dreamscape', role: 'foreground', description: 'Ethereal northern lights with flowing curtains of light.' },
  { id: 'bezier-garden', name: 'Bezier Garden', role: 'foreground', description: 'Organic plant growth with flowing bezier curves.' },
  { id: 'constellation-weaver', name: 'Constellation Weaver', role: 'foreground', description: 'Drifting stars that connect with glowing lines based on proximity.' },
  { id: 'crystal-growth', name: 'Crystal Growth', role: 'foreground', description: 'Fractal ice crystals that grow like frost on a window.' },
  { id: 'face-reactor', name: 'Face Reactor', role: 'foreground', description: 'Detects faces and creates artistic effects with emotion-based auras.' },
  { id: 'firefly-swarm', name: 'Firefly Swarm', role: 'foreground', description: 'Bioluminescent fireflies with flocking behavior and synchronized flashing.' },
  { id: 'geometric-mandala', name: 'Geometric Mandala', role: 'foreground', description: 'Sacred geometry with rotating polygons and stars.' },
  { id: 'glitch-artist', name: 'Glitch Artist', role: 'foreground', description: 'Digital glitch effects with pixelation and distortion.' },
  { id: 'ink-bloom', name: 'Ink Bloom', role: 'foreground', description: 'Organic watercolor ink drops that spread and blend across the canvas.' },
  { id: 'intelligent-painter', name: 'Intelligent Painter', role: 'foreground', description: 'AI that analyzes canvas and paints complementary content in empty spaces.' },
  { id: 'lunar-tides', name: 'Lunar Tides', role: 'foreground', description: 'Moon phase visualization with tidal waves.' },
  { id: 'motion-ghost', name: 'Motion Ghost', role: 'foreground', description: 'Ethereal trails following detected motion.' },
  { id: 'particle-flow', name: 'Particle Flow', role: 'foreground', description: 'Flowing particle systems with physics-based movement and trails.' },
  { id: 'psychedelic-distortion', name: 'Psychedelic Distortion', role: 'foreground', description: 'Mind-bending visual distortions reactive to audio frequencies.' },
  { id: 'social-pulse', name: 'Social Pulse', role: 'foreground', description: 'Visualizes social engagement with floating words.' },
  { id: 'spirograph-dreams', name: 'Spirograph Dreams', role: 'foreground', description: 'Mathematical spirograph patterns with mesmerizing rotating curves.' },
  { id: 'synthwave-horizon', name: 'Synthwave Horizon', role: 'foreground', description: 'Retro synthwave grid floor and gradient sky with neon aesthetics.' },
  { id: 'vintage-film', name: 'Vintage Film Projector', role: 'foreground', description: 'Nostalgic 8mm film aesthetic with grain, scratches, and vintage color grading.' },
  { id: 'wave-painter', name: 'Wave Painter', role: 'foreground', description: 'Creates flowing wave patterns with smooth color palette cycling.' },
  { id: 'weather-mood', name: 'Weather Mood', role: 'foreground', description: 'Atmospheric visuals driven by weather \u2014 rain, sun, snow, fog.' },
  // Background actors (10)
  { id: 'breathing-color', name: 'Breathing Color', role: 'background', description: 'Pulsating solid color background with optional hue cycling.' },
  { id: 'color-cells', name: 'Color Cells', role: 'background', description: 'Voronoi-inspired regions with soft color transitions.' },
  { id: 'floating-orbs', name: 'Floating Orbs', role: 'background', description: 'Soft bokeh-style circles drifting slowly with parallax depth.' },
  { id: 'gradient-sweep', name: 'Gradient Sweep', role: 'background', description: 'Rotating linear gradient background with multiple color palettes.' },
  { id: 'grid-pulse', name: 'Grid Pulse', role: 'background', description: 'Subtle grid lines that pulse alpha in wave patterns.' },
  { id: 'plasma-waves', name: 'Plasma Waves', role: 'background', description: 'Classic plasma effect with sine wave color cycling.' },
  { id: 'ripple-rings', name: 'Ripple Rings', role: 'background', description: 'Concentric circles expanding outward from origin points.' },
  { id: 'soft-noise', name: 'Soft Noise', role: 'background', description: 'Organic noise field using overlapping soft circles.' },
  { id: 'starfield-drift', name: 'Starfield Drift', role: 'background', description: 'Simple dots with gentle parallax movement.' },
  { id: 'stripe-scroll', name: 'Stripe Scroll', role: 'background', description: 'Angled stripes scrolling continuously.' },
  // Filter actors (20)
  { id: 'chromatic-pulse', name: 'Chromatic Pulse', role: 'filter', description: 'Rhythmic RGB separation that pulses with time.' },
  { id: 'cross-stitch', name: 'Cross-Stitch', role: 'filter', description: 'Cross-stitch embroidery effect with thread texture.' },
  { id: 'crt-monitor', name: 'CRT Monitor', role: 'filter', description: 'Classic CRT television aesthetic with scanlines and curvature.' },
  { id: 'dream-sequence', name: 'Dream Sequence', role: 'filter', description: 'Soft hazy dreamlike quality with radial blur.' },
  { id: 'ethereal-glow', name: 'Ethereal Glow', role: 'filter', description: 'Dreamy otherworldly bloom and shadow effect.' },
  { id: 'film-grain', name: 'Film Grain', role: 'filter', description: 'Cinematic 35mm film aesthetic with organic grain.' },
  { id: 'holographic-display', name: 'Holographic Display', role: 'filter', description: 'Futuristic holographic projection with rainbow interference.' },
  { id: 'impressionist', name: 'Impressionist Strokes', role: 'filter', description: 'Impressionist painting with directional strokes and vibrant color.' },
  { id: 'mosaic-tiles', name: 'Mosaic Tiles', role: 'filter', description: 'Mosaic tile effect with grout lines and tile variation.' },
  { id: 'neon-edge', name: 'Neon Edge', role: 'filter', description: 'Tron-like glowing wireframe edge detection with neon colors.' },
  { id: 'oil-impasto', name: 'Oil Paint Impasto', role: 'filter', description: 'Oil painting effect with thick brush strokes and paint ridges.' },
  { id: 'pencil-sketch', name: 'Pencil Sketch', role: 'filter', description: 'Pencil sketch effect with hatching and cross-hatching.' },
  { id: 'pointillism', name: 'Pointillism', role: 'filter', description: 'Pointillist painting effect with halftone dots.' },
  { id: 'stained-glass', name: 'Stained Glass', role: 'filter', description: 'Stained glass window effect with Voronoi cells and lead lines.' },
  { id: 'sumi-ink', name: 'Sumi-e Ink Wash', role: 'filter', description: 'East Asian brush painting style with ink wash and dry brush.' },
  { id: 'thermal-vision', name: 'Thermal Vision', role: 'filter', description: 'Infrared thermal camera look with heat-map color mapping.' },
  { id: 'underwater-caustics', name: 'Underwater Caustics', role: 'filter', description: 'Viewing through rippling water with dancing caustic light patterns.' },
  { id: 'vhs-tracking', name: 'VHS Tracking', role: 'filter', description: 'Nostalgic VHS tape aesthetic with tracking distortion.' },
  { id: 'watercolor-wash', name: 'Watercolor Wash', role: 'filter', description: 'Watercolor painting effect with color bleeding and paper texture.' },
  { id: 'woodcut-print', name: 'Woodcut Print', role: 'filter', description: 'Traditional woodcut print effect with wood grain and bold contrast.' },
];

const STEPS = [
  {
    number: '01',
    title: 'Actors Are Selected',
    description: 'The scheduler picks 1 background, 2-5 foreground actors, and 0-2 filters. Newer actors get priority.',
  },
  {
    number: '02',
    title: 'They Paint Together',
    description: 'For 60 seconds, actors draw simultaneously using the brush API for shapes and images, the filter API for post-processing effects, and context providers for time, weather, and audio — all at 60 FPS.',
  },
  {
    number: '03',
    title: 'The Canvas Is Captured',
    description: 'A high-resolution snapshot is taken and sent to the gallery server.',
  },
  {
    number: '04',
    title: 'AI Reviews It',
    description: 'Gemini 3.1 Pro evaluates each artwork across six dimensions: color harmony, composition, visual unity, depth & layering, rhythm & flow, and intentional complexity.',
  },
  {
    number: '05',
    title: 'You Vote On It',
    description: 'The artwork joins the gallery. Browse, discover, and vote for the compositions that move you.',
  },
];

// --- Main Component ---

export function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cycleSeconds = useCycleTimer();
  const [previewArtworks, setPreviewArtworks] = useState<SavedArtwork[]>([]);
  const api = useGalleryApi();

  useGenerativeCanvas(canvasRef);
  useScrollReveal();

  const {
    extendedActors,
    transform: carouselTransform,
    transitionEnabled,
    isMobile: carouselMobile,
    pausedRef,
    viewportRef: carouselViewportRef,
    trackRef: carouselTrackRef,
    handleTransitionEnd: carouselTransitionEnd,
    mobileViewportHeight,
  } = useActorCarousel(ACTORS);

  useEffect(() => {
    api
      .getArtworks({ isVisible: true, isArchived: false, sortBy: 'combinedScore', sortDirection: 'desc', limit: 6 })
      .then(setPreviewArtworks)
      .catch(() => {});
  }, []);

  const progress = cycleSeconds / 60;

  return (
    <div className="landing">
      {/* ===== HERO ===== */}
      <section className="landing-hero">
        <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />
        <div className="hero-gradient-overlay" />

        <div className="hero-content">
          <div className="hero-brand reveal-on-scroll">
            <span className="brand-name">Polychorus</span>
          </div>
          <div className="hero-definition reveal-on-scroll">
            <span className="definition-word">chorus</span>
            <span className="definition-pos">noun</span>
            <span className="definition-text">(in ancient Greek tragedy) a group of performers who comment together on the main action.</span>
          </div>

          <div className="hero-badge reveal-on-scroll">
            <span className="badge-dot" />
            CloudFest Hackathon 2026
          </div>

          <h1 className="hero-title reveal-on-scroll">
            <span className="title-line title-line--1">Generative Chaos,</span>
            <span className="title-line title-line--2">
              Accidental <em>Beauty</em>
            </span>
          </h1>

          <p className="hero-subtitle reveal-on-scroll">
            A living digital canvas where autonomous actors — wave painters, constellation
            weavers, particle flows — collaborate to create unique artworks every 60 seconds.
          </p>

          <div className="hero-cycle-indicator reveal-on-scroll">
            <div className="cycle-ring">
              <svg viewBox="0 0 100 100" className="cycle-svg">
                <circle cx="50" cy="50" r="45" className="cycle-track" />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  className="cycle-progress"
                  style={{
                    strokeDasharray: `${progress * 283} 283`,
                  }}
                />
              </svg>
              <span className="cycle-number">{60 - cycleSeconds}</span>
            </div>
            <span className="cycle-label">seconds until next artwork</span>
          </div>

          <div className="hero-actions reveal-on-scroll">
            <a href="/gallery" className="btn btn-primary">
              View the Gallery
            </a>
            <a href={RUNTIME_URL} className="btn btn-secondary" target="_blank" rel="noopener noreferrer">
              Watch Live Canvas
            </a>
          </div>
        </div>

        <div className="hero-scroll-hint">
          <span className="scroll-hint-text">Scroll to explore</span>
          <span className="scroll-line" />
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="landing-section section-how">
        <div className="section-inner">
          <h2 className="section-heading reveal-on-scroll">
            <span className="heading-accent">The Cycle</span>
            How a Painting Is Born
          </h2>

          <div className="steps-timeline">
            {STEPS.map((step, i) => (
              <div key={step.number} className="step reveal-on-scroll" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="step-number" style={{ color: PALETTE[i % PALETTE.length] }}>
                  {step.number}
                </div>
                <div className="step-content">
                  <h3 className="step-title">{step.title}</h3>
                  <p className="step-description">{step.description}</p>
                </div>
              </div>
            ))}
            <div className="timeline-line" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* ===== THE ACTORS ===== */}
      <section className="landing-section section-actors">
        <div className="section-inner">
          <h2 className="section-heading reveal-on-scroll">
            <span className="heading-accent">The Cast</span>
            Meet the Actors
          </h2>
          <p className="section-intro reveal-on-scroll">
            Each actor is an autonomous creative agent with its own personality and
            style. They interact with the canvas through a dedicated API — brushes for
            drawing shapes and images, filters for post-processing effects, and context
            providers for time, weather, and audio data. They don't know about each other
            — yet their layered output creates surprising, emergent compositions.
          </p>

          <div
            className="actors-carousel-viewport reveal-on-scroll"
            ref={carouselViewportRef}
            style={carouselMobile && mobileViewportHeight ? { height: mobileViewportHeight } : undefined}
            onMouseEnter={() => { pausedRef.current = true; }}
            onMouseLeave={() => { pausedRef.current = false; }}
            onFocusCapture={() => { pausedRef.current = true; }}
            onBlurCapture={() => { pausedRef.current = false; }}
          >
            <div
              className={`actors-carousel-track ${carouselMobile ? 'vertical' : 'horizontal'}`}
              ref={carouselTrackRef}
              style={{
                transform: carouselTransform,
                transition: transitionEnabled
                  ? 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                  : 'none',
              }}
              onTransitionEnd={carouselTransitionEnd}
            >
              {extendedActors.map((actor, i) => (
                <div
                  key={`${actor.id}-${i}`}
                  className="actor-card"
                  style={{ '--actor-color': PALETTE[i % PALETTE.length] } as React.CSSProperties}
                >
                  <div className="actor-card-glow" />
                  <div className="actor-card-header">
                    <h3 className="actor-card-name">{actor.name}</h3>
                    <span className={`actor-role-badge role-${actor.role}`}>{actor.role}</span>
                  </div>
                  <p className="actor-card-desc">{actor.description}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="actors-cta reveal-on-scroll">
            Hackathon developers can deploy their own actors via Git.
            <br />
            <span className="actors-cta-highlight">Hot-loaded in real-time — no restart needed.</span>
          </p>
        </div>
      </section>

      {/* ===== THE GALLERY ===== */}
      <section className="landing-section section-gallery">
        <div className="section-inner">
          <h2 className="section-heading reveal-on-scroll">
            <span className="heading-accent">The Gallery</span>
            Browse. Discover. Vote.
          </h2>
          <p className="section-intro reveal-on-scroll">
            Every artwork is reviewed by Gemini 3.1 Pro across six dimensions — color
            harmony, composition, visual unity, depth, rhythm, and complexity. Your votes
            combine with AI scores to surface the best collaborative compositions.
          </p>

          <div className="gallery-preview reveal-on-scroll">
            <div className="gallery-preview-grid">
              {previewArtworks.length > 0
                ? previewArtworks.map((artwork) => (
                    <a
                      key={artwork.id}
                      href={`/gallery/${artwork.id}`}
                      className="gallery-preview-card gallery-preview-card--real"
                    >
                      <img
                        src={artwork.thumbnailPath}
                        alt={`Artwork by ${artwork.contributingActors.map((a) => a.actorName).join(', ')}`}
                        className="preview-card-image"
                        loading="lazy"
                      />
                      <div className="preview-card-overlay">
                        <span className="preview-card-score">{artwork.review.overallScore}</span>
                        <span className="preview-card-votes">
                          {artwork.voteCount} {artwork.voteCount === 1 ? 'like' : 'likes'}
                        </span>
                      </div>
                    </a>
                  ))
                : Array.from({ length: 6 }, (_, i) => (
                    <div
                      key={i}
                      className="gallery-preview-card"
                      style={{
                        '--card-hue': `${(i * 55 + 180) % 360}`,
                      } as React.CSSProperties}
                    >
                      <div className="preview-card-shimmer" />
                    </div>
                  ))}
            </div>
            <div className="gallery-preview-fade" />
          </div>

          <div className="gallery-cta reveal-on-scroll">
            <a href="/gallery" className="btn btn-primary btn-lg">
              Enter the Gallery
            </a>
          </div>
        </div>
      </section>

      {/* ===== CLOUDFEST ===== */}
      <section className="landing-section section-cloudfest">
        <div className="section-inner">
          <div className="cloudfest-layout reveal-on-scroll">
            <div className="cloudfest-info">
              <h2 className="section-heading">
                <span className="heading-accent">The Event</span>
                CloudFest 2026
              </h2>
              <p className="cloudfest-text">
                The world's largest cloud computing festival. 10,000+ leaders in cloud
                and internet infrastructure gather at Europa-Park in Rust, Germany.
              </p>
              <dl className="cloudfest-details">
                <div className="detail-row">
                  <dt>Hackathon</dt>
                  <dd>March 20 &ndash; 22, 2026</dd>
                </div>
                <div className="detail-row">
                  <dt>Main Event</dt>
                  <dd>March 23 &ndash; 26, 2026</dd>
                </div>
                <div className="detail-row">
                  <dt>Venue</dt>
                  <dd>Europa-Park, Rust, Germany</dd>
                </div>
                <div className="detail-row">
                  <dt>Theme</dt>
                  <dd>The Sustainability of Everything</dd>
                </div>
              </dl>
              <div className="cloudfest-links">
                <a
                  href="https://www.cloudfest.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                >
                  CloudFest Website
                </a>
                <a
                  href="https://hackathon.cloudfest.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                >
                  Hackathon Website
                </a>
              </div>
            </div>
            <div className="cloudfest-visual" aria-hidden="true">
              <div className="cf-orb cf-orb--1" />
              <div className="cf-orb cf-orb--2" />
              <div className="cf-orb cf-orb--3" />
              <div className="cf-orb cf-orb--4" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">Polychorus</span>
            <span className="footer-tagline">polychorus.art</span>
          </div>
          <p className="footer-credit">
            Created by{' '}
            <a href="https://github.com/schlessera" target="_blank" rel="noopener noreferrer">
              Alain Schlesser
            </a>{' '}
            for the CloudFest Hackathon 2026
          </p>
          <p className="footer-tech">
            Built with Pixi.js, React, and Gemini AI
          </p>
        </div>
      </footer>
    </div>
  );
}
