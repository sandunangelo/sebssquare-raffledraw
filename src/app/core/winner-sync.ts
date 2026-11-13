import { DestroyRef, inject, Injectable, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import { awardLabel } from './prizes';
import type { Winner } from './models';

export type SyncState = 'off' | 'idle' | 'saving' | 'saved' | 'failed';

const HEADER = ['Round', 'Prize', 'Seat', 'Name', 'Detail', 'Drawn at'];
/** Backoff between retries, in ms; the last value repeats. */
const RETRY_STEPS = [2_000, 5_000, 15_000, 30_000, 60_000];

/**
 * Writes the winner list back to the spreadsheet through the Apps Script web
 * app in `apps-script/winners-sync.gs`.
 *
 * Every call sends the complete list and the script replaces the Winners tab,
 * which makes the request idempotent: a retry cannot duplicate rows, and one
 * successful sync repairs every failure before it. Sync is strictly
 * best-effort - it never blocks a draw, and localStorage remains the primary
 * guard against losing the night's results.
 */
@Injectable({ providedIn: 'root' })
export class WinnerSync {
  readonly state = signal<SyncState>(isConfigured() ? 'idle' : 'off');
  readonly lastError = signal('');
  readonly lastSavedAt = signal<number | null>(null);

  readonly enabled = isConfigured();

  /** Newest snapshot waiting to go out; replaced rather than queued. */
  private pending: readonly Winner[] | null = null;
  private inFlight = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearRetry());
  }

  /** Records the latest winner list and sends it when it can. */
  push(winners: readonly Winner[]): void {
    if (!this.enabled) {
      return;
    }
    this.pending = [...winners];
    this.clearRetry();
    this.attempt = 0;
    void this.flush();
  }

  /** Manual "try again" from the UI. */
  retry(): void {
    if (!this.enabled || this.pending === null) {
      return;
    }
    this.clearRetry();
    this.attempt = 0;
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.inFlight || this.pending === null) {
      return;
    }

    const snapshot = this.pending;
    this.pending = null;
    this.inFlight = true;
    this.state.set('saving');

    try {
      await this.send(snapshot);
      this.state.set('saved');
      this.lastError.set('');
      this.lastSavedAt.set(Date.now());
      this.attempt = 0;
    } catch (error) {
      // Put it back so the retry has something to send.
      this.pending ??= snapshot;
      this.state.set('failed');
      this.lastError.set(error instanceof Error ? error.message : String(error));
      this.scheduleRetry();
    } finally {
      this.inFlight = false;
      // A newer snapshot arrived while this one was in the air.
      if (this.pending !== null && this.state() !== 'failed') {
        void this.flush();
      }
    }
  }

  private async send(winners: readonly Winner[]): Promise<void> {
    const response = await fetch(environment.winnersSync.webAppUrl, {
      method: 'POST',
      // text/plain keeps this a "simple" request. Apps Script does not answer
      // CORS preflight, so application/json would be rejected before it runs.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: environment.winnersSync.token,
        tab: environment.winnersSync.tabName,
        rows: toRows(winners),
      }),
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`The script replied ${response.status}.`);
    }

    const text = await response.text();
    let result: { ok?: boolean; error?: string };
    try {
      result = JSON.parse(text) as { ok?: boolean; error?: string };
    } catch {
      // An HTML body here is the Google sign-in page: the deployment is not
      // set to "Anyone", so the browser never reaches the script.
      throw new Error('The script URL asked for a sign-in. Redeploy it with access set to Anyone.');
    }

    if (result.ok !== true) {
      throw new Error(result.error ?? 'The script rejected the update.');
    }
  }

  private scheduleRetry(): void {
    const delay = RETRY_STEPS[Math.min(this.attempt, RETRY_STEPS.length - 1)];
    this.attempt++;
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}

function isConfigured(): boolean {
  return /^https:\/\/script\.google\.com\//.test(environment.winnersSync.webAppUrl.trim());
}

function toRows(winners: readonly Winner[]): string[][] {
  return [
    HEADER,
    ...winners.map((winner) => [
      String(winner.round),
      winner.prize ? awardLabel(winner.prize) : '',
      winner.prize && winner.prize.slots > 1 ? `${winner.prize.seat} of ${winner.prize.slots}` : '',
      winner.candidate.name,
      winner.candidate.detail,
      new Date(winner.drawnAt).toISOString(),
    ]),
  ];
}
