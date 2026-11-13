import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, viewChild } from '@angular/core';

import { CandidateRefresh, REFRESH_INTERVAL_MS } from '../core/candidate-refresh';
import { downloadCsv, winnersFilename } from '../core/download';
import { DRAW_DURATION_MS, RaffleStore } from '../core/raffle-store';
import { ConfettiCanvas } from './confetti-canvas';
import { CountdownRing } from './countdown-ring';
import { PrizeSelector } from './prize-selector';

/**
 * The show: the prize level the compere picks, the trigger they press, the
 * 30-second draw with its reel and countdown, and the winner reveal.
 */
@Component({
  selector: 'app-draw-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfettiCanvas, CountdownRing, PrizeSelector, DatePipe],
  templateUrl: './draw-stage.html',
  styleUrl: './draw-stage.scss',
})
export class DrawStage {
  protected readonly store = inject(RaffleStore);
  protected readonly refresh = inject(CandidateRefresh);
  protected readonly drawSeconds = Math.round(DRAW_DURATION_MS / 1000);
  protected readonly refreshSeconds = Math.round(REFRESH_INTERVAL_MS / 1000);
  /** Two strips of marquee bulbs around the stage frame. */
  protected readonly bulbs = Array.from({ length: 18 }, (_, index) => index);

  private readonly confetti = viewChild(ConfettiCanvas);

  /**
   * Single-item list so the template can key the reel animation on the tick
   * counter: a new key remounts the element, which replays the flip-in.
   */
  protected readonly reelFrames = computed(() => {
    const name = this.store.reelName();
    return name === '' ? [] : [{ key: this.store.reelTick(), name }];
  });

  /** Winners grouped by level, in the same order as the tiles. */
  protected readonly resultGroups = computed(() => {
    const winners = this.store.winners();
    const groups = this.store
      .prizes()
      .map((prize) => ({
        id: prize.id,
        label: prize.label,
        grand: prize.grand,
        winners: winners.filter((winner) => winner.prize?.id === prize.id),
      }))
      .filter((group) => group.winners.length > 0);

    // Anyone drawn with no prize levels configured at all.
    const loose = winners.filter((winner) => winner.prize === null);
    return loose.length > 0
      ? [...groups, { id: 'unassigned', label: 'Drawn', grand: false, winners: loose }]
      : groups;
  });

  protected exportCsv(): void {
    downloadCsv(winnersFilename(), this.store.winnersCsv());
  }

  protected readonly drawLabel = computed(() => {
    const prize = this.store.selectedPrize();
    const base = `Start the ${this.drawSeconds} second draw for round ${this.store.round()}`;
    return prize ? `${base}, ${prize.label}` : base;
  });

  constructor() {
    effect(() => {
      const confetti = this.confetti();
      if (this.store.phase() === 'reveal') {
        confetti?.fire();
      } else {
        confetti?.stop();
      }
    });
  }
}
