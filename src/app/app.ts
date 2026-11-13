import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';

import { ConfirmDialog } from './components/confirm-dialog';
import { DrawStage } from './components/draw-stage';
import { SetupPanel } from './components/setup-panel';
import { WinnersBoard } from './components/winners-board';
import { ConfirmService } from './core/confirm';
import { DRAW_DURATION_MS, RaffleStore } from './core/raffle-store';
import { SoundService } from './core/sound';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialog, DrawStage, SetupPanel, WinnersBoard],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    // Keeps every CSS timeline in lockstep with the draw clock.
    '[style.--rd-draw-ms]': 'drawMs',
    '(document:keydown)': 'onKeydown($event)',
    '(document:fullscreenchange)': 'syncFullscreen()',
  },
})
export class App {
  protected readonly store = inject(RaffleStore);
  protected readonly sound = inject(SoundService);
  private readonly confirm = inject(ConfirmService);

  protected readonly drawSeconds = Math.round(DRAW_DURATION_MS / 1000);
  protected readonly drawMs = `${DRAW_DURATION_MS}ms`;

  /** Entries restored from a previous session go straight to the stage. */
  protected readonly showSetup = signal(!this.store.hasCandidates());
  /** Hides the chrome so a projector shows nothing but the stage. */
  protected readonly stageMode = signal(false);
  protected readonly fullscreen = signal(false);

  constructor() {
    // When the night finishes, drop back to the full layout so the results
    // and the roll of honour are both on screen - stage mode would hide the
    // board, and a collapsed Entries panel is the right default anyway.
    effect(() => {
      if (this.store.showingResults()) {
        this.stageMode.set(false);
        this.showSetup.set(false);
      }
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) {
      return;
    }
    // The dialog owns the keyboard while it is up: Escape must dismiss it, not
    // cancel a draw, and Space must not start one behind it.
    if (this.confirm.pending() !== null) {
      return;
    }

    switch (event.key) {
      case ' ':
      case 'Enter':
        // Also suppresses the synthetic click when a button holds focus, so the
        // draw cannot be started twice by one keypress.
        event.preventDefault();
        this.trigger();
        break;
      case 'Escape':
        if (this.store.isDrawing()) {
          this.store.abortDraw();
        } else {
          this.store.acknowledge();
        }
        break;
      case 'f':
      case 'F':
        this.toggleFullscreen();
        break;
      case 'm':
      case 'M':
        this.sound.toggleMute();
        break;
      case 's':
      case 'S':
        this.stageMode.update((on) => !on);
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        // Step through the prize levels that still have slots open.
        event.preventDefault();
        this.store.selectAdjacentPrize(event.key === 'ArrowRight' ? 1 : -1);
        break;
      default:
        break;
    }
  }

  /** Space does the obvious thing for whatever is on screen. */
  protected trigger(): void {
    if (this.store.phase() === 'reveal') {
      this.store.acknowledge();
      return;
    }
    this.store.draw();
  }

  protected toggleStage(): void {
    this.stageMode.update((on) => !on);
  }

  protected toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }

  protected syncFullscreen(): void {
    this.fullscreen.set(document.fullscreenElement !== null);
  }
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
