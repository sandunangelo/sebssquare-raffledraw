import { DestroyRef, inject, Injectable, signal } from '@angular/core';

import type { ColumnMap } from './models';
import { RaffleStore } from './raffle-store';
import { SheetLoader } from './sheet-loader';
import { buildCandidates } from './sheet-parse';

/** How often the sheet is re-read while the app is open. */
export const REFRESH_INTERVAL_MS = 60_000;

interface Source {
  readonly url: string;
  readonly columns: ColumnMap;
}

/**
 * Re-reads the candidate sheet once a minute so names added mid-event turn up
 * on their own.
 *
 * It always merges rather than replaces: `RaffleStore.setCandidates` clears the
 * winners, which is correct for a deliberate reload and would be a disaster on
 * a timer. A refresh can add and remove entrants but can never cost a result.
 */
@Injectable({ providedIn: 'root' })
export class CandidateRefresh {
  readonly active = signal(false);
  readonly checking = signal(false);
  readonly lastCheckedAt = signal<number | null>(null);
  readonly lastAdded = signal(0);
  readonly lastError = signal('');

  private readonly store = inject(RaffleStore);
  private readonly loader = inject(SheetLoader);

  private source: Source | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /**
   * Begins (or re-points) the polling. Called after a successful sheet load,
   * and again whenever the column mapping changes.
   */
  start(url: string, columns: ColumnMap): void {
    this.source = { url, columns };
    this.active.set(true);
    this.lastError.set('');

    if (this.timer === null) {
      this.timer = setInterval(() => void this.check(), REFRESH_INTERVAL_MS);
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.source = null;
    this.active.set(false);
    this.lastAdded.set(0);
  }

  /** The "check now" button, and the timer's tick. */
  async check(): Promise<void> {
    const source = this.source;
    if (!source || this.checking()) {
      return;
    }
    // A draw owns the pool for its thirty seconds; the next tick can wait.
    if (this.store.isDrawing()) {
      return;
    }

    this.checking.set(true);
    try {
      const table = await this.loader.load(source.url);
      const candidates = buildCandidates(table, source.columns);
      if (candidates.length === 0) {
        this.lastError.set('The sheet came back with no usable names.');
        return;
      }

      const added = this.store.mergeCandidates(candidates, 'Google Sheet', table);
      this.lastAdded.set(added);
      this.lastCheckedAt.set(Date.now());
      this.lastError.set('');
    } catch (error) {
      // Transient: the next tick tries again. The entry list is left alone.
      this.lastError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.checking.set(false);
    }
  }
}
