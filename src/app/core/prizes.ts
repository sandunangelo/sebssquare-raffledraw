/**
 * Prize levels. The configured order is the *draw* order, which in a raffle
 * runs up from the smallest prize to the grand prize - 3rd, then 2nd, then 1st
 * - so the ceremony builds instead of peaking first.
 */

/** Shape accepted from the environment file. */
export interface PrizeConfig {
  readonly label: string;
  /** What the prize actually is, shown under the level. Optional. */
  readonly detail?: string;
  /** How many winners this level awards. Defaults to 1. */
  readonly slots?: number;
  /**
   * Marks the headline prize, which gets the gold treatment on the stage.
   *
   * Without this the grand prize would just be whichever level sits last, and
   * that breaks as soon as the order puts something else there - a consolation
   * round at the end would wear the gold.
   *
   * Defaults to the last level when no level claims it.
   */
  readonly grand?: boolean;
}

export interface Prize {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly slots: number;
  /** The headline prize. Exactly one level carries this. */
  readonly grand: boolean;
}

/** A prize as recorded against a winner - a snapshot, so the roll of honour
 *  stays correct even if the configuration is edited later. */
export interface PrizeAward {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  /** 1-based position within the level: consolation winner 3 of 10. */
  readonly seat: number;
  /** How many slots the level had when this was awarded. */
  readonly slots: number;
}

export interface PrizeStatus {
  readonly prize: Prize;
  readonly awarded: number;
  readonly complete: boolean;
  /** True for the last level in draw order: the grand prize. */
  readonly finale: boolean;
}

/** Validates and fills in the environment's prize list. */
export function normalisePrizes(config: readonly PrizeConfig[]): Prize[] {
  const used = new Set<string>();

  const entries = config
    .map((entry) => ({
      label: (entry.label ?? '').trim(),
      detail: (entry.detail ?? '').trim(),
      slots: normaliseSlots(entry.slots),
      grand: entry.grand === true,
    }))
    .filter((entry) => entry.label !== '');

  // Exactly one grand prize: the first that claims it, else the last level.
  const claimed = entries.findIndex((entry) => entry.grand);
  const grandIndex = claimed >= 0 ? claimed : entries.length - 1;

  return entries.map((entry, index) => ({
    ...entry,
    grand: index === grandIndex,
    id: uniqueId(entry.label, index, used),
  }));
}

export function toAward(prize: Prize | null, seat: number): PrizeAward | null {
  return prize === null
    ? null
    : { id: prize.id, label: prize.label, detail: prize.detail, seat, slots: prize.slots };
}

/**
 * How an award reads in a list. A level with one slot is just its name; a
 * multi-slot level is numbered, so ten consolation winners stay tellable apart.
 */
export function awardLabel(award: PrizeAward): string {
  return award.slots > 1 ? `${award.label} ${award.seat}` : award.label;
}

function normaliseSlots(slots: number | undefined): number {
  if (typeof slots !== 'number' || !Number.isFinite(slots) || slots < 1) {
    return 1;
  }
  return Math.floor(slots);
}

/** Slug from the label so counts survive a reordered config; index as a tie-break. */
function uniqueId(label: string, index: number, used: Set<string>): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let id = base === '' ? `prize-${index}` : base;
  while (used.has(id)) {
    id = `${id}-${index}`;
  }
  used.add(id);
  return id;
}
