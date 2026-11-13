import type { PrizeAward } from './prizes';

/** One row of the source spreadsheet: a single raffle ticket. */
export interface Candidate {
  /** Stable, unique per ticket (row). */
  readonly id: string;
  /** Display name, already cased for the stage. */
  readonly name: string;
  /** Secondary line shown under the name - department, team, ticket no, ... */
  readonly detail: string;
}

export interface Winner {
  readonly round: number;
  readonly candidate: Candidate;
  readonly drawnAt: number;
  /** null when no prize levels are configured. */
  readonly prize: PrizeAward | null;
}

export type DrawPhase = 'idle' | 'drawing' | 'reveal';

/** Which sheet columns feed the entry list. -1 means "not used". */
export interface ColumnMap {
  readonly firstName: number;
  readonly lastName: number;
  readonly detail: number;
}

/** The spreadsheet as loaded, before the columns are confirmed. */
export interface SheetTable {
  /** Display label per column, always one per column of the widest row. */
  readonly columns: readonly string[];
  /** Data rows only - the header row is excluded when one was detected. */
  readonly rows: readonly (readonly string[])[];
  readonly hasHeader: boolean;
  readonly sourceUrl: string;
  /** Best guess at the column mapping, overridable in the setup panel. */
  readonly suggested: ColumnMap;
}

/**
 * Identity of the *person* behind a ticket, used to enforce "a winner can only
 * win once". Keyed on name + detail so duplicate rows for the same person are
 * extra chances to win rather than a second shot at winning, while two
 * different people who happen to share a name stay independent.
 */
export function identityKey(candidate: Candidate): string {
  return `${candidate.name.trim().toLowerCase()} ${candidate.detail.trim().toLowerCase()}`;
}
