import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';

import { ConfirmService } from '../core/confirm';

/**
 * Renders whatever `ConfirmService` is currently asking.
 *
 * Built on the native `<dialog>` so modality, the backdrop, focus containment
 * and Escape-to-dismiss all come from the platform rather than from Bootstrap's
 * JavaScript, which this app does not ship. The element stays in the DOM and is
 * only opened and closed, because `showModal()` needs a live element.
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg class="ask" (close)="confirm.cancel()" (cancel)="confirm.cancel()">
      @if (confirm.pending(); as request) {
        <h2 class="ask__title">{{ request.title }}</h2>
        <p class="ask__body">{{ request.body }}</p>

        <div class="ask__actions">
          <!-- Cancel holds focus, so a stray Enter cannot confirm. -->
          <button type="button" class="btn rd-btn-ghost" autofocus (click)="confirm.cancel()">
            Cancel
          </button>
          <button
            type="button"
            class="btn px-4"
            [class.btn-danger]="request.danger"
            [class.btn-primary]="!request.danger"
            (click)="confirm.confirm()"
          >
            {{ request.confirmLabel }}
          </button>
        </div>
      }
    </dialog>
  `,
  styles: `
    .ask {
      width: min(26rem, calc(100vw - 2rem));
      padding: 1.5rem;
      color: var(--rd-text);
      background: #0b100a;
      border: 1px solid var(--rd-line-strong);
      border-radius: var(--bs-border-radius-xl);
      box-shadow: var(--rd-shadow-lg);
    }

    .ask::backdrop {
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(3px);
    }

    .ask__title {
      margin: 0 0 0.6rem;
      font-size: 1.2rem;
      font-weight: 800;
    }

    .ask__body {
      margin: 0 0 1.4rem;
      font-size: 0.9rem;
      line-height: 1.6;
      color: var(--rd-muted);
    }

    .ask__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.6rem;
    }
  `,
})
export class ConfirmDialog {
  protected readonly confirm = inject(ConfirmService);

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const element = this.dialog()?.nativeElement;
      const request = this.confirm.pending();
      if (!element) {
        return;
      }

      if (request && !element.open) {
        element.showModal();
      } else if (!request && element.open) {
        // Fires `close`, which calls cancel() again - harmless, the request
        // has already been settled and the resolver cleared.
        element.close();
      }
    });
  }
}
