import { useEffect, useRef, useState } from 'react';
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

// --- Actor card data ---

const ACTORS = [
  {
    name: 'Wave Painter',
    role: 'foreground',
    description: 'Flowing sinusoidal patterns with smooth color palette cycling through sunset, ocean, and aurora themes.',
    color: COLORS.cyan,
  },
  {
    name: 'Constellation Weaver',
    role: 'foreground',
    description: 'Drifting stars that connect with glowing lines when they drift close, with twinkle effects and shooting stars.',
    color: COLORS.gold,
  },
  {
    name: 'Particle Flow',
    role: 'foreground',
    description: 'Physics-based particle systems with attraction, repulsion, and trails. Five different shape types.',
    color: COLORS.pink,
  },
  {
    name: 'Weather Mood',
    role: 'foreground',
    description: 'Atmospheric particles driven by live weather — rain, snow, fog, lightning, all rendered in real-time.',
    color: COLORS.purple,
  },
  {
    name: 'Starfield Drift',
    role: 'background',
    description: 'A deep-space starfield that slowly drifts and pulses, setting the stage for everything painted on top.',
    color: '#4488ff',
  },
  {
    name: 'Film Grain',
    role: 'filter',
    description: 'A post-processing filter that adds analog film texture and subtle vignetting to the final composition.',
    color: '#aa8866',
  },
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

          <div className="actors-grid">
            {ACTORS.map((actor, i) => (
              <div
                key={actor.name}
                className="actor-card reveal-on-scroll"
                style={{ '--actor-color': actor.color, animationDelay: `${i * 0.08}s` } as React.CSSProperties}
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
