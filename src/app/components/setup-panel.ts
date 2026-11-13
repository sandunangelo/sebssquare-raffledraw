import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import { CandidateRefresh } from '../core/candidate-refresh';
import { ConfirmService } from '../core/confirm';
import { demoCandidates } from '../core/demo-data';
import type { ColumnMap, SheetTable } from '../core/models';
import { RaffleStore } from '../core/raffle-store';
import { SheetLoader } from '../core/sheet-loader';
import { buildCandidates, parsePastedList, SheetLoadError } from '../core/sheet-parse';

interface LoadProblem {
  readonly message: string;
  readonly hint: string;
}

/** Loads the candidate list: Google Sheet, pasted list, or the demo roster. */
@Component({
  selector: 'app-setup-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './setup-panel.html',
  styleUrl: './setup-panel.scss',
})
export class SetupPanel {
  /** Raised after entries land, so the shell can collapse this panel. */
  readonly loaded = output<void>();

  protected readonly store = inject(RaffleStore);
  private readonly loader = inject(SheetLoader);
  private readonly confirm = inject(ConfirmService);
  protected readonly refresh = inject(CandidateRefresh);

  protected readonly url = signal(environment.candidateSheetUrl);
  protected readonly loading = signal(false);
  protected readonly problem = signal<LoadProblem | null>(null);
  protected readonly notice = signal('');
  protected readonly columns = signal<ColumnMap>({ firstName: 0, lastName: -1, detail: -1 });
  protected readonly pasteOpen = signal(false);
  protected readonly pasteText = signal('');

  protected onUrlInput(event: Event): void {
    this.url.set((event.target as HTMLInputElement).value);
  }

  protected onPasteInput(event: Event): void {
    this.pasteText.set((event.target as HTMLTextAreaElement).value);
  }

  protected async loadFromSheet(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.problem.set(null);
    this.notice.set('');

    try {
      const table = await this.loader.load(this.url());
      this.columns.set(table.suggested);
      this.applyTable(table, 'Google Sheet');
    } catch (error) {
      this.problem.set(
        error instanceof SheetLoadError
          ? { message: error.message, hint: error.hint }
          : { message: 'Something went wrong while reading the sheet.', hint: String(error) },
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected onColumnChange(field: keyof ColumnMap, event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    this.columns.update((columns) => ({ ...columns, [field]: value }));

    const table = this.store.table();
    if (table) {
      this.applyTable(table, 'Google Sheet');
    }
  }

  protected applyPastedList(): void {
    const candidates = parsePastedList(this.pasteText());
    if (candidates.length === 0) {
      this.problem.set({
        message: 'No names found in the pasted text.',
        hint: 'One entry per line. Add a second column after a comma for the detail line.',
      });
      return;
    }
    this.problem.set(null);
    this.refresh.stop();
    this.store.setCandidates(candidates, 'Pasted list', null);
    this.announce(candidates.length);
  }

  protected loadDemo(): void {
    const candidates = demoCandidates();
    this.problem.set(null);
    this.refresh.stop();
    this.store.setCandidates(candidates, 'Demo roster', null);
    this.announce(candidates.length);
  }

  /** Clears entries AND any winners drawn so far, so it asks first. */
  protected async clear(): Promise<void> {
    const winners = this.store.winners().length;
    const confirmed = await this.confirm.ask({
      title: 'Clear the entry list?',
      body:
        winners > 0
          ? `This removes all ${this.store.ticketCount()} entries and the ${winners} winner` +
            `${winners === 1 ? '' : 's'} already drawn. This cannot be undone.`
          : `This removes all ${this.store.ticketCount()} entries. You can load them again from ` +
            'the sheet.',
      confirmLabel: 'Clear entries',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.refresh.stop();
    this.store.clearAll();
    this.notice.set('');
    this.problem.set(null);
  }

  private applyTable(table: SheetTable, source: string): void {
    const candidates = buildCandidates(table, this.columns());
    if (candidates.length === 0) {
      this.problem.set({
        message: 'That column has no names in it.',
        hint: 'Pick the column that holds the entrant names.',
      });
      return;
    }
    this.store.setCandidates(candidates, source, table);
    this.refresh.start(this.url(), this.columns());
    this.announce(candidates.length);
  }

  private announce(count: number): void {
    this.notice.set(`${count} ${count === 1 ? 'entry' : 'entries'} ready.`);
    this.loaded.emit();
  }
}
