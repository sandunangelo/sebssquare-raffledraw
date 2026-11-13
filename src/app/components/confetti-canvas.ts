import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  flutter: number;
  flutterRate: number;
  colour: string;
  ribbon: boolean;
  age: number;
  life: number;
}

const COLOURS = ['#52b149', '#ffc712', '#ffc712', '#6fc85f', '#6fc85f', '#ffffff'];
const GRAVITY = 0.0016;
const DRAG = 0.9988;
const MAX_PARTICLES = 320;

/**
 * Hand-rolled canvas confetti: two corner cannons plus an overhead shower, in
 * two waves. One canvas, one animation frame loop, no library.
 */
@Component({
  selector: 'app-confetti-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #surface aria-hidden="true"></canvas>`,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 1080;
      pointer-events: none;
      display: block;
    }

    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
  `,
})
export class ConfettiCanvas {
  private readonly surface = viewChild.required<ElementRef<HTMLCanvasElement>>('surface');

  private context: CanvasRenderingContext2D | null = null;
  private particles: Particle[] = [];
  private frameId = 0;
  private lastFrameAt = 0;
  private width = 0;
  private height = 0;
  private pendingWave = 0;

  constructor() {
    afterNextRender(() => {
      const canvas = this.surface().nativeElement;
      this.context = canvas.getContext('2d');
      this.resize();
    });

    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Launches a celebration burst. Safe to call while one is already running. */
  fire(): void {
    this.resize();
    this.launchWave(1);
    // A second, smaller wave a beat later reads as applause rather than a pop.
    clearTimeout(this.pendingWave);
    this.pendingWave = setTimeout(() => this.launchWave(0.55), 420) as unknown as number;
    this.run();
  }

  stop(): void {
    clearTimeout(this.pendingWave);
    if (this.frameId !== 0) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
    this.particles = [];
    this.context?.clearRect(0, 0, this.width, this.height);
  }

  protected onResize(): void {
    this.resize();
  }

  private launchWave(scale: number): void {
    const { width, height } = this;
    if (width === 0 || height === 0) {
      return;
    }

    // Corner cannons, aimed up and inward.
    this.spawnCone(Math.round(70 * scale), 0, height * 0.98, -52, 26);
    this.spawnCone(Math.round(70 * scale), width, height * 0.98, -128, 26);
    // Overhead shower.
    this.spawnShower(Math.round(55 * scale));
  }

  private spawnCone(count: number, x: number, y: number, aimDeg: number, spreadDeg: number): void {
    const reach = Math.hypot(this.width, this.height);
    for (let i = 0; i < count; i++) {
      const angle = ((aimDeg + (Math.random() - 0.5) * spreadDeg * 2) * Math.PI) / 180;
      const speed = (0.55 + Math.random() * 0.55) * (reach / 900);
      this.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      });
    }
  }

  private spawnShower(count: number): void {
    for (let i = 0; i < count; i++) {
      this.push({
        x: Math.random() * this.width,
        y: -20 - Math.random() * this.height * 0.25,
        vx: (Math.random() - 0.5) * 0.12,
        vy: 0.1 + Math.random() * 0.22,
      });
    }
  }

  private push(seed: Pick<Particle, 'x' | 'y' | 'vx' | 'vy'>): void {
    if (this.particles.length >= MAX_PARTICLES) {
      return;
    }
    const ribbon = Math.random() > 0.35;
    this.particles.push({
      ...seed,
      size: ribbon ? 7 + Math.random() * 7 : 3 + Math.random() * 3,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.012,
      flutter: Math.random() * Math.PI * 2,
      flutterRate: 0.004 + Math.random() * 0.006,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      ribbon,
      age: 0,
      life: 2800 + Math.random() * 1800,
    });
  }

  private run(): void {
    if (this.frameId !== 0) {
      return;
    }
    this.lastFrameAt = performance.now();
    const frame = (now: number): void => {
      // Clamped so a backgrounded tab does not teleport every particle.
      const dt = Math.min(34, now - this.lastFrameAt);
      this.lastFrameAt = now;
      this.step(dt);
      this.draw();

      if (this.particles.length === 0) {
        this.frameId = 0;
        return;
      }
      this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
  }

  private step(dt: number): void {
    const bottom = this.height + 60;
    this.particles = this.particles.filter((p) => {
      p.age += dt;
      p.vy += GRAVITY * dt;
      p.vx *= DRAG;
      p.vy *= DRAG;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      p.flutter += p.flutterRate * dt;
      return p.age < p.life && p.y < bottom;
    });
  }

  private draw(): void {
    const ctx = this.context;
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, this.width, this.height);

    for (const p of this.particles) {
      const remaining = 1 - p.age / p.life;
      ctx.globalAlpha = remaining < 0.25 ? Math.max(0, remaining / 0.25) : 1;
      ctx.fillStyle = p.colour;

      if (p.ribbon) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        // Squashing on one axis fakes a ribbon tumbling through 3D.
        ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(p.flutter))));
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private resize(): void {
    const canvas = this.surface().nativeElement;
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();

    this.width = rect.width;
    this.height = rect.height;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}
