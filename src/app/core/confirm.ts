import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  /** Styles the confirm button as destructive. */
  readonly danger?: boolean;
}

/**
 * One-at-a-time confirmation prompt.
 *
 * `ask` resolves true only when the compere actually confirms, so a caller
 * reads as a plain guard clause. A native `confirm()` was the alternative, but
 * it blocks the thread and renders as a browser chrome dialog - wrong on a
 * projector mid-event.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly _pending = signal<ConfirmRequest | null>(null);
  readonly pending = this._pending.asReadonly();

  private resolver: ((confirmed: boolean) => void) | null = null;

  ask(request: ConfirmRequest): Promise<boolean> {
    // A second prompt cancels the first rather than stacking.
    this.settle(false);
    this._pending.set(request);
    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  confirm(): void {
    this.settle(true);
  }

  cancel(): void {
    this.settle(false);
  }

  private settle(confirmed: boolean): void {
    const resolve = this.resolver;
    this.resolver = null;
    this._pending.set(null);
    resolve?.(confirmed);
  }
}
