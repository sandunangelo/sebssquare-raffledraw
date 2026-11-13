import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ConfirmService } from '../core/confirm';
import { downloadCsv, winnersFilename } from '../core/download';
import { awardLabel } from '../core/prizes';
import { RaffleStore } from '../core/raffle-store';
import { WinnerSync } from '../core/winner-sync';

/** Roll of honour, newest first, with export and mistake recovery. */
@Component({
  selector: 'app-winners-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <div class="card h-100">
      <div class="card-body d-flex flex-column gap-3">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div>
            <p class="rd-eyebrow mb-1">Roll of honour</p>
            <h2 class="board__title rd-nums mb-0">
              {{ store.winners().length }}
              <small>{{ store.winners().length === 1 ? 'winner' : 'winners' }}</small>
            </h2>
          </div>

          <div class="d-flex gap-2">
            <button
              type="button"
              class="btn btn-sm rd-btn-ghost"
              (click)="exportCsv()"
              [disabled]="store.winners().length === 0"
              title="Download the winners as CSV"
            >
              <svg class="board__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <span class="visually-hidden">Export CSV</span>
            </button>

            <button
              type="button"
              class="btn btn-sm rd-btn-ghost"
              (click)="resetWinners()"
              [disabled]="store.winners().length === 0 || store.isDrawing()"
              title="Return everyone to the drum"
            >
              <svg class="board__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
              </svg>
              <span class="visually-hidden">Reset rounds</span>
            </button>
          </div>
        </div>

        @if (store.winners().length === 0) {
          <p class="board__empty mb-0">
            Nobody has been drawn yet. Winners appear here the moment the reel lands, and each one
            leaves the drum so they cannot be drawn twice.
          </p>
        } @else {
          <ol class="board__list rd-scroll list-unstyled mb-0">
            @for (winner of ordered(); track winner.round) {
              <li class="board__item rd-animate-in" [class.board__item--latest]="$first">
                <span class="board__round rd-nums">{{ winner.round }}</span>
                <span class="board__who">
                  <span class="board__name">{{ winner.candidate.name }}</span>
                  <span class="board__sub">
                    @if (winner.prizeLabel) {
                      <span class="board__prize">{{ winner.prizeLabel }}</span>
                    }
                    @if (winner.candidate.detail !== '') {
                      <span class="board__detail">{{ winner.candidate.detail }}</span>
                    }
                  </span>
                </span>
                <time class="board__time rd-nums" [attr.datetime]="winner.drawnAt">
                  {{ winner.drawnAt | date: 'HH:mm' }}
                </time>
              </li>
            }
          </ol>

          @if (sync.state() !== 'off') {
            <p class="sheet" [attr.data-state]="sync.state()">
              @switch (sync.state()) {
                @case ('saving') {
                  <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                  Saving to the sheet
                }
                @case ('saved') {
                  <span class="sheet__dot" aria-hidden="true"></span>
                  Saved to the sheet at {{ sync.lastSavedAt() | date: 'HH:mm:ss' }}
                }
                @case ('failed') {
                  <span class="sheet__dot" aria-hidden="true"></span>
                  <span>
                    Could not reach the sheet &mdash; retrying.
                    <span class="sheet__why">{{ sync.lastError() }}</span>
                  </span>
                  <button type="button" class="btn btn-sm rd-btn-ghost ms-auto" (click)="sync.retry()">
                    Retry now
                  </button>
                }
                @default {
                  <span class="sheet__dot" aria-hidden="true"></span>
                  Winners will be written back to the sheet
                }
              }
            </p>
          }

          <button
            type="button"
            class="btn btn-sm rd-btn-ghost align-self-start"
            (click)="store.undoLastWinner()"
            [disabled]="store.isDrawing()"
          >
            Undo round {{ store.winners().length }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .board__title {
      font-size: 1.6rem;
      font-weight: 800;

      small {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--rd-faint);
      }
    }

    .board__icon {
      width: 1rem;
      height: 1rem;
    }

    .board__empty {
      color: var(--rd-faint);
      font-size: 0.88rem;
      line-height: 1.6;
    }

    .board__list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 26rem;
      margin: 0;
      padding-right: 0.25rem;
    }

    .board__item {
      display: grid;
      grid-template-columns: 2rem 1fr auto;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 0.75rem;
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid var(--rd-line);
      border-radius: 0.9rem;
    }

    .board__item--latest {
      border-color: rgba(255, 199, 18, 0.45);
      background: rgba(255, 199, 18, 0.08);
      box-shadow: 0 0 28px -14px rgba(255, 199, 18, 0.8);
    }

    .board__round {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      background: var(--rd-grad-green);
      color: #fff;
      font-size: 0.8rem;
      font-weight: 800;
    }

    .board__item--latest .board__round {
      background: var(--rd-grad-gold);
      color: #141001;
    }

    .board__who {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .board__name {
      font-weight: 700;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }

    .board__sub {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem;
    }

    .board__prize {
      padding: 0.05rem 0.4rem;
      font-size: 0.64rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--rd-gold);
      background: rgba(255, 199, 18, 0.12);
      border: 1px solid rgba(255, 199, 18, 0.35);
      border-radius: 50rem;
      white-space: nowrap;
    }

    .board__detail {
      font-size: 0.74rem;
      color: var(--rd-faint);
      overflow-wrap: anywhere;
    }

    /* Write-back status. */
    .sheet {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
      padding: 0.45rem 0.6rem;
      font-size: 0.72rem;
      line-height: 1.4;
      color: var(--rd-muted);
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid var(--rd-line);
      border-radius: 0.75rem;
    }

    .sheet__dot {
      flex: 0 0 auto;
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--rd-faint);
    }

    .sheet[data-state='saved'] {
      color: var(--rd-green-bright);
      border-color: rgba(111, 200, 95, 0.35);
    }

    .sheet[data-state='saved'] .sheet__dot {
      background: var(--rd-green-bright);
      box-shadow: 0 0 10px rgba(111, 200, 95, 0.9);
    }

    .sheet[data-state='failed'] {
      color: #ffd5dd;
      border-color: rgba(255, 77, 109, 0.4);
      background: rgba(255, 77, 109, 0.1);
    }

    .sheet[data-state='failed'] .sheet__dot {
      background: #ff4d6d;
    }

    .sheet__why {
      display: block;
      opacity: 0.75;
    }

    .board__time {
      font-size: 0.72rem;
      color: var(--rd-faint);
    }
  `,
})
export class WinnersBoard {
  protected readonly store = inject(RaffleStore);
  protected readonly sync = inject(WinnerSync);
  private readonly confirm = inject(ConfirmService);

  /** Newest first, each with its display label (numbered for multi-slot levels). */
  protected readonly ordered = computed(() =>
    [...this.store.winners()]
      .reverse()
      .map((winner) => ({ ...winner, prizeLabel: winner.prize ? awardLabel(winner.prize) : null })),
  );

  /** Wipes the whole night, so it asks first. */
  protected async resetWinners(): Promise<void> {
    const count = this.store.winners().length;
    const plural = count === 1 ? '' : 's';
    const confirmed = await this.confirm.ask({
      title: 'Clear the roll of honour?',
      body:
        `All ${count} winner${plural} go back in the drum and the rounds start again from ` +
        'the first prize. This cannot be undone.',
      confirmLabel: 'Clear winners',
      danger: true,
    });
    if (confirmed) {
      this.store.resetWinners();
    }
  }

  protected exportCsv(): void {
    downloadCsv(winnersFilename(), this.store.winnersCsv());
  }
}
