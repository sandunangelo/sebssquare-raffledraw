import { Injectable, signal } from '@angular/core';

type AudioWindow = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

/**
 * Draw audio synthesised with the Web Audio API - accelerating ticks, a riser
 * through the final seconds, and a fanfare on the reveal. No audio files and no
 * libraries. The context is created on the first draw, which is always a user
 * gesture, so browser autoplay rules are satisfied.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  readonly muted = signal(false);

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private riser: { readonly osc: OscillatorNode; readonly gain: GainNode } | null = null;

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    if (next) {
      this.stopRiser();
      if (this.master) {
        this.master.gain.value = 0;
      }
    } else if (this.master) {
      this.master.gain.value = MASTER_GAIN;
    }
  }

  /** Short blip per reel tick; the pitch climbs as the draw progresses. */
  tick(progress: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = 460 + progress * 700;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  /** Starts the tension riser, held until the reveal or a cancel. */
  startRiser(seconds: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master || this.riser) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + seconds);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + seconds * 0.85);

    osc.connect(gain).connect(this.master);
    osc.start(now);

    this.riser = { osc, gain };
  }

  stopRiser(): void {
    const riser = this.riser;
    const ctx = this.context;
    this.riser = null;
    if (!riser || !ctx) {
      return;
    }
    const now = ctx.currentTime;
    riser.gain.gain.cancelScheduledValues(now);
    riser.gain.gain.setValueAtTime(riser.gain.gain.value, now);
    riser.gain.gain.linearRampToValueAtTime(0.0001, now + 0.12);
    riser.osc.stop(now + 0.15);
  }

  /** Cymbal-ish whoosh plus a rising arpeggio on the winner reveal. */
  fanfare(): void {
    this.stopRiser();
    const ctx = this.ensureContext();
    if (!ctx || !this.master) {
      return;
    }
    const now = ctx.currentTime;

    this.noiseBurst(ctx, this.master, now, 0.9, 0.35);

    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const at = now + index * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.42, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.75);

      osc.connect(gain).connect(this.master!);
      osc.start(at);
      osc.stop(at + 0.8);
    });
  }

  /** Soft descending blip when a draw is abandoned. */
  abort(): void {
    this.stopRiser();
    const ctx = this.ensureContext();
    if (!ctx || !this.master) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.22);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  private noiseBurst(
    ctx: AudioContext,
    destination: AudioNode,
    at: number,
    duration: number,
    level: number,
  ): void {
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    source.connect(filter).connect(gain).connect(destination);
    source.start(at);
  }

  private ensureContext(): AudioContext | null {
    if (this.muted()) {
      return null;
    }
    if (!this.context) {
      const Ctor = (globalThis as AudioWindow).AudioContext ?? (globalThis as AudioWindow).webkitAudioContext;
      if (!Ctor) {
        return null;
      }
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
    return this.context;
  }
}

const MASTER_GAIN = 0.2;
