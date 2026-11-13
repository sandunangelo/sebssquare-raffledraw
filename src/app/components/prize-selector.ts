import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { RaffleStore } from '../core/raffle-store';

/**
 * Prize level picker. Levels sit in draw order - smallest first, grand prize
 * last - and a level that has given out all its slots is marked done and drops
 * out of the running.
 *
 * Each level carries a stepper so the number of winners can be changed during
 * the event. The card is a plain element with the pick and the stepper as
 * sibling buttons: a button cannot be nested inside a button, and the stepper
 * has to stay usable on a level that is already full - otherwise a finished
 * consolation round could never be reopened.
 */
@Component({
  selector: 'app-prize-selector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.prizes().length > 0) {
      <div class="levels">
        @for (status of store.prizeStatus(); track status.prize.id) {
          <div
            class="level"
            [class.level--active]="status.prize.id === store.selectedPrize()?.id"
            [class.level--done]="status.complete"
            [class.level--finale]="status.finale"
          >
            <button
              type="button"
              class="level__pick"
              [attr.aria-pressed]="status.prize.id === store.selectedPrize()?.id"
              [disabled]="status.complete || store.isDrawing()"
              (click)="store.selectPrize(status.prize.id)"
            >
              <span class="level__top">
                <span class="level__label">{{ status.prize.label }}</span>
                @if (status.complete) {
                  <svg class="level__tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                }
              </span>

              @if (status.prize.detail !== '') {
                <span class="level__detail">{{ status.prize.detail }}</span>
              }

              @if (status.prize.slots > 1) {
                <span class="level__bar" aria-hidden="true">
                  <span
                    class="level__bar-fill"
                    [style.width.%]="(status.awarded / status.prize.slots) * 100"
                  ></span>
                </span>
              }

              <span class="level__slots rd-nums">
                @if (status.prize.slots > 1) {
                  {{ status.awarded }} of {{ status.prize.slots }} drawn
                } @else {
                  {{ status.complete ? 'Awarded' : 'Up next' }}
                }
              </span>
            </button>

            <span class="level__steps">
              <button
                type="button"
                class="level__step"
                [disabled]="store.isDrawing() || status.prize.slots <= store.slotFloor(status.prize.id)"
                [attr.aria-label]="'One fewer ' + status.prize.label + ' winner'"
                [title]="
                  status.prize.slots <= store.slotFloor(status.prize.id)
                    ? status.awarded + ' already drawn at this level'
                    : 'One fewer winner'
                "
                (click)="store.adjustPrizeSlots(status.prize.id, -1)"
              >
                &minus;
              </button>

              <span class="level__step-value rd-nums">
                {{ status.prize.slots }}
                <span class="level__step-unit">{{ status.prize.slots === 1 ? 'winner' : 'winners' }}</span>
              </span>

              <button
                type="button"
                class="level__step"
                [disabled]="store.isDrawing() || status.prize.slots >= store.maxPrizeSlots"
                [attr.aria-label]="'One more ' + status.prize.label + ' winner'"
                title="One more winner"
                (click)="store.adjustPrizeSlots(status.prize.id, 1)"
              >
                +
              </button>
            </span>
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .levels {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      justify-content: center;
      gap: 0.6rem;
    }

    .level {
      display: flex;
      flex-direction: column;
      min-width: 9.5rem;
      padding: 0.55rem 0.7rem 0.4rem;
      color: var(--rd-muted);
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--rd-line);
      border-radius: 1rem;
      transition:
        border-color 0.18s ease,
        background 0.18s ease,
        color 0.18s ease;
    }

    .level--active {
      color: #fff;
      border-color: rgba(82, 177, 73, 0.75);
      background: rgba(82, 177, 73, 0.18);
      box-shadow: 0 0 34px -12px rgba(82, 177, 73, 0.95);
    }

    /* The grand prize reads gold once it is the level in play. */
    .level--finale.level--active {
      border-color: rgba(255, 199, 18, 0.8);
      background: rgba(255, 199, 18, 0.16);
      box-shadow: 0 0 36px -10px rgba(255, 199, 18, 0.9);
    }

    .level--done {
      border-style: dashed;
    }

    .level--done .level__pick {
      opacity: 0.5;
    }

    .level__pick {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.15rem;
      padding: 0;
      color: inherit;
      text-align: left;
      background: none;
      border: 0;
      cursor: pointer;

      &:disabled {
        cursor: default;
      }

      &:not(:disabled):hover .level__label {
        color: #fff;
      }
    }

    .level__top {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .level__label {
      font-size: 0.95rem;
      font-weight: 800;
      letter-spacing: -0.01em;
    }

    .level--finale .level__label {
      color: var(--rd-gold);
    }

    .level__tick {
      width: 0.85rem;
      height: 0.85rem;
      color: var(--rd-green-bright);
    }

    .level__detail {
      font-size: 0.74rem;
      line-height: 1.3;
      opacity: 0.85;
    }

    .level__bar {
      display: block;
      width: 100%;
      height: 3px;
      margin: 0.3rem 0 0.15rem;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 50rem;
    }

    .level__bar-fill {
      display: block;
      height: 100%;
      background: var(--rd-grad-green);
      border-radius: inherit;
      transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .level--finale .level__bar-fill {
      background: var(--rd-grad-gold);
    }

    .level__slots {
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      opacity: 0.7;
    }

    /* Stepper: how many winners this level awards. Stays live on a full
       level so a finished round can be reopened. */
    .level__steps {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.3rem;
      margin-top: 0.45rem;
      padding-top: 0.4rem;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .level__step {
      display: grid;
      place-items: center;
      width: 1.45rem;
      height: 1.45rem;
      padding: 0;
      font-size: 0.95rem;
      font-weight: 800;
      line-height: 1;
      color: var(--rd-text);
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid var(--rd-line);
      border-radius: 0.45rem;
      cursor: pointer;
      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        color 0.15s ease;

      &:not(:disabled):hover {
        color: #fff;
        background: rgba(82, 177, 73, 0.32);
        border-color: rgba(82, 177, 73, 0.65);
      }

      &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
    }

    .level__step-value {
      flex: 1;
      font-size: 0.82rem;
      font-weight: 800;
      color: #fff;
      text-align: center;
      line-height: 1.1;
    }

    .level__step-unit {
      display: block;
      font-size: 0.56rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--rd-faint);
    }
  `,
})
export class PrizeSelector {
  protected readonly store = inject(RaffleStore);
}
