import { Injectable } from '@angular/core';

import { environment } from '../../environments/environment';
import type { SheetTable } from './models';
import {
  describeFailure,
  interpretCsv,
  interpretRows,
  looksLikeHtml,
  resolveEndpoints,
  SheetLoadError,
  type Failure,
} from './sheet-parse';

/**
 * Fetches the entry list, straight from the browser. Interpreting the result
 * lives in `sheet-parse.ts`.
 */
@Injectable({ providedIn: 'root' })
export class SheetLoader {
  /**
   * Two routes, in order of reliability:
   *
   * 1. The Apps Script web app, when one is configured. It reads the entries
   *    tab BY NAME, which matters once the workbook holds both Candidates and
   *    Winners: the plain CSV export returns whichever tab is first, so
   *    reordering the tabs would otherwise feed winner rows in as entries.
   * 2. Google's CSV endpoints, tried in turn. No script needed, but always the
   *    first tab.
   */
  async load(rawUrl: string): Promise<SheetTable> {
    const viaScript = await this.loadFromScript();
    if (viaScript) {
      return viaScript;
    }
    return this.loadFromCsv(rawUrl);
  }

  /** Returns null when no script is configured or it cannot answer. */
  private async loadFromScript(): Promise<SheetTable | null> {
    const base = environment.winnersSync.webAppUrl.trim();
    const tab = environment.candidatesTab.trim();
    if (!/^https:\/\/script\.google\.com\//.test(base) || tab === '') {
      return null;
    }

    const url = `${base}?tab=${encodeURIComponent(tab)}`;
    try {
      const response = await fetch(url, { cache: 'no-store', redirect: 'follow' });
      if (!response.ok) {
        return null;
      }

      const body = (await response.json()) as { ok?: boolean; rows?: unknown };
      if (body.ok !== true || !Array.isArray(body.rows)) {
        return null;
      }

      const rows = body.rows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : String(cell))));

      return interpretRows(rows, `${url} (tab "${tab}")`);
    } catch {
      // An older deployment without the read endpoint, or simply unreachable.
      // Either way the CSV route is still worth trying.
      return null;
    }
  }

  /**
   * Google exposes several CSV endpoints with different sharing and CORS
   * behaviour, so each candidate endpoint is tried in turn and the first one
   * that returns real CSV wins.
   */
  private async loadFromCsv(rawUrl: string): Promise<SheetTable> {
    const endpoints = resolveEndpoints(rawUrl);
    if (endpoints.length === 0) {
      throw new SheetLoadError(
        'That does not look like a Google Sheets link.',
        'Paste the full https://docs.google.com/spreadsheets/... URL, or any URL that serves CSV.',
      );
    }

    const failures: Failure[] = [];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, { cache: 'no-store', redirect: 'follow' });
        if (!response.ok) {
          failures.push(response.status === 404 ? 'not-found' : 'denied');
          continue;
        }

        const body = await response.text();
        if (looksLikeHtml(body)) {
          failures.push('denied');
          continue;
        }

        const table = interpretCsv(body, url);
        if (!table) {
          failures.push('empty');
          continue;
        }

        return table;
      } catch {
        // A cross-origin rejection lands here with no detail, by design.
        failures.push('blocked');
      }
    }

    throw describeFailure(failures);
  }
}
