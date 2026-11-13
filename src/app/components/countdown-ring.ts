import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The draw clock. The sweep is a single CSS animation over `--rd-draw-ms`
 * rather than a per-frame redraw, so it stays perfectly smooth while change
 * detection only runs when the whole second changes.
 */
@Component({
  selector: 'app-countdown-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ring" [attr.data-intensity]="intensity()">
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <defs>
          <linearGradient id="rdRingStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#6fc85f" />
            <stop offset="55%" stop-color="#52b149" />
            <stop offset="100%" stop-color="#ffc712" />
          </linearGradient>
        </defs>

        <circle class="ring__track" cx="110" cy="110" r="96" />

        @if (running()) {
          <!-- Remounted at the start of each draw, which restarts the sweep. -->
          <circle class="ring__sweep rd-keep-motion" cx="110" cy="110" r="96" pathLength="100" />
        } @else {
          <circle class="ring__rest" cx="110" cy="110" r="96" pathLength="100" />
        }
      </svg>

      <div class="ring__face">
        @for (value of [seconds()]; track value) {
          <span class="ring__value rd-nums">{{ value }}</span>
        }
        <span class="ring__unit">{{ running() ? 'seconds left' : 'seconds' }}</span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      max-width: 15rem;
      margin-inline: auto;
    }

    .ring {
      position: relative;
      aspect-ratio: 1;
    }

    svg {
      width: 100%;
      height: 100%;
      overflow: visible;
      transform: rotate(-90deg);
    }

    circle {
      fill: none;
      stroke-linecap: round;
    }

    .ring__track {
      stroke: rgba(255, 255, 255, 0.08);
      stroke-width: 10;
    }

    .ring__rest,
    .ring__sweep {
      stroke: url(#rdRingStroke);
      stroke-width: 10;
      stroke-dasharray: 100;
      filter: drop-shadow(0 0 10px rgba(82, 177, 73, 0.75));
    }

    .ring__rest {
      stroke-dashoffset: 100;
    }

    .ring__sweep {
      stroke-dashoffset: 0;
      animation: rd-drain var(--rd-draw-ms) linear forwards;
    }

    .ring__face {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.1rem;
    }

    .ring__value {
      font-size: clamp(2.75rem, 8vw, 4rem);
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.03em;
      color: #fff;
      animation: rd-count-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .ring__unit {
      font-size: 0.64rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--rd-faint);
    }

    /* The glow tightens and quickens as the clock runs down. */
    .ring[data-intensity='3'] .ring__value {
      text-shadow: 0 0 24px rgba(82, 177, 73, 0.7);
    }

    .ring[data-intensity='4'] .ring__value {
      text-shadow: 0 0 30px rgba(255, 199, 18, 0.8);
    }

    .ring[data-intensity='5'] .ring__value {
      color: var(--rd-gold);
      text-shadow: 0 0 36px rgba(255, 199, 18, 0.9);
      animation:
        rd-count-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) both,
        rd-breathe 0.5s ease-in-out infinite 0.42s;
    }
  `,
})
export class CountdownRing {
  readonly seconds = input.required<number>();
  readonly running = input(false);
  readonly intensity = input(1);
}
