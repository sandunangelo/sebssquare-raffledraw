import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

import { environment } from '../../environments/environment';
import { toCsv } from './csv';
import { identityKey, type Candidate, type DrawPhase, type SheetTable, type Winner } from './models';
import {
  awardLabel,
  normalisePrizes,
  toAward,
  type Prize,
  type PrizeAward,
  type PrizeStatus,
} from './prizes';
import { secureRandomIndex } from './random';
import { ReelFeed, shuffle } from './reel-feed';
import { SoundService } from './sound';
import { WinnerSync } from './winner-sync';

/** Every draw lasts exactly this long, to the frame. Configured per build. */
export const DRAW_DURATION_MS = Math.max(5, environment.drawDurationSeconds) * 1000;

export interface DrawStage {
  readonly label: string;
  readonly caption: string;
  /** 1 to 5, raised as the clock runs down. Drives the stage visuals. */
  readonly intensity: number;
}

@Injectable({ providedIn: 'root' })
export class RaffleStore {
  readonly drawDurationMs = DRAW_DURATION_MS;

  /** Prize levels exactly as configured at build time. */
  private readonly basePrizes: readonly Prize[] = normalisePrizes(environment.prizes);

  /** Slot counts changed from the UI during the event, by prize id. */
  private readonly _slotOverrides = signal<ReadonlyMap<string, number>>(new Map());

  /** Prize levels in draw order, with any runtime slot change applied. */
  readonly prizes = computed<readonly Prize[]>(() => {
    const overrides = this._slotOverrides();
    return this.basePrizes.map((prize) =>
      overrides.has(prize.id) ? { ...prize, slots: overrides.get(prize.id)! } : prize,
    );
  });

  private readonly sound = inject(SoundService);
  private readonly sync = inject(WinnerSync);

  private readonly _table = signal<SheetTable | null>(null);
  private readonly _candidates = signal<readonly Candidate[]>([]);
  private readonly _winners = signal<readonly Winner[]>([]);
  private readonly _sourceLabel = signal('');
  private readonly _selectedPrizeId = signal(this.basePrizes[0]?.id ?? '');

  private readonly _phase = signal<DrawPhase>('idle');
  private readonly _secondsLeft = signal(DRAW_DURATION_MS / 1000);
  private readonly _reelName = signal('');
  private readonly _reelTick = signal(0);
  private readonly _stage = signal<DrawStage>(STAGES[0].stage);
  private readonly _lastWinner = signal<Winner | null>(null);
  private readonly _tickerNames = signal<readonly string[]>([]);
  /** Latched when the night ends, so the results screen stays put. */
  private readonly _finished = signal(false);

  private frameId = 0;
  private nextTickAt = 0;
  private riserArmed = false;
  /** Captured when a draw starts, so a later auto-advance cannot rewrite it. */
  private pendingPrize: PrizeAward | null = null;

  readonly table = this._table.asReadonly();
  readonly candidates = this._candidates.asReadonly();
  readonly winners = this._winners.asReadonly();
  readonly sourceLabel = this._sourceLabel.asReadonly();
  readonly phase = this._phase.asReadonly();
  readonly secondsLeft = this._secondsLeft.asReadonly();
  readonly reelName = this._reelName.asReadonly();
  /** Increments on every visible reel change, so the view can key animations. */
  readonly reelTick = this._reelTick.asReadonly();
  readonly stage = this._stage.asReadonly();
  readonly lastWinner = this._lastWinner.asReadonly();

  private readonly wonKeys = computed(
    () => new Set(this._winners().map((winner) => identityKey(winner.candidate))),
  );

  /** Tickets still in the drum: every row whose person has not won yet. */
  readonly pool = computed(() => {
    const won = this.wonKeys();
    return this._candidates().filter((candidate) => !won.has(identityKey(candidate)));
  });

  /** Every entry in sheet order, tagged with the prize it has already won. */
  readonly entryList = computed(() => {
    const won = new Map<string, string>();
    for (const winner of this._winners()) {
      won.set(
        identityKey(winner.candidate),
        winner.prize ? awardLabel(winner.prize) : `Round ${winner.round}`,
      );
    }
    return this._candidates().map((candidate) => ({
      candidate,
      wonLabel: won.get(identityKey(candidate)) ?? null,
    }));
  });

  readonly ticketCount = computed(() => this._candidates().length);
  readonly peopleCount = computed(() => countPeople(this._candidates()));
  readonly ticketsInPlay = computed(() => this.pool().length);
  readonly peopleInPlay = computed(() => countPeople(this.pool()));
  readonly round = computed(() => this._winners().length + 1);

  // ---------------------------------------------------------------------------
  //  Prize levels
  // ---------------------------------------------------------------------------

  /** Each level with how many of its slots have been awarded. */
  readonly prizeStatus = computed<readonly PrizeStatus[]>(() => {
    const awarded = new Map<string, number>();
    for (const winner of this._winners()) {
      if (winner.prize) {
        awarded.set(winner.prize.id, (awarded.get(winner.prize.id) ?? 0) + 1);
      }
    }

    return this.prizes().map((prize) => {
      const count = awarded.get(prize.id) ?? 0;
      return { prize, awarded: count, complete: count >= prize.slots, finale: prize.grand };
    });
  });

  readonly selectedStatus = computed(() =>
    this.prizeStatus().find((status) => status.prize.id === this._selectedPrizeId()),
  );
  readonly selectedPrize = computed(() => this.selectedStatus()?.prize ?? null);
  /** Every slot across every level: how many rounds the night holds. */
  readonly prizeSlotsTotal = computed(() =>
    this.prizes().reduce((sum, prize) => sum + prize.slots, 0),
  );

  /** True when there are not enough entrants to fill every prize slot. */
  readonly shortOfEntrants = computed(
    () =>
      this.prizeSlotsTotal() > 0 &&
      this.hasCandidates() &&
      this.peopleCount() < this.prizeSlotsTotal(),
  );

  readonly allPrizesAwarded = computed(
    () => this.prizes().length > 0 && this.prizeStatus().every((status) => status.complete),
  );

  readonly hasCandidates = computed(() => this._candidates().length > 0);
  readonly isDrawing = computed(() => this._phase() === 'drawing');
  readonly exhausted = computed(() => this.hasCandidates() && this.ticketsInPlay() === 0);

  /** The night is over: every prize given out, or nobody left to draw. */
  readonly drawComplete = computed(
    () => this.hasCandidates() && (this.allPrizesAwarded() || this.ticketsInPlay() === 0),
  );

  /**
   * Time to show the results rather than the trigger. Gated on idle so the
   * final winner's reveal plays out in full before the stage changes.
   *
   * Latched rather than derived straight from `drawComplete`: once the results
   * are up on a projector, a background refresh picking up one new entrant
   * must not yank the screen back to the DRAW button mid-sentence. The compere
   * decides when to carry on.
   */
  readonly showingResults = computed(() => this._phase() === 'idle' && this._finished());

  /** Results are up, and there is now someone to draw and a slot to fill. */
  readonly canResume = computed(
    () => this._finished() && this.ticketsInPlay() > 0 && !this.allPrizesAwarded(),
  );

  /** Slots still to fill across every level. */
  readonly slotsRemaining = computed(() =>
    this.prizeStatus().reduce(
      (sum, status) => sum + Math.max(0, status.prize.slots - status.awarded),
      0,
    ),
  );

  /**
   * How many slots cannot be filled because the drum will run out of people
   * first. Nonzero means the night ends early, which is worth saying out loud
   * on the stage rather than letting it arrive as a surprise.
   */
  readonly peopleShortfall = computed(() =>
    Math.max(0, this.slotsRemaining() - this.peopleInPlay()),
  );

  readonly canDraw = computed(() => {
    if (this._phase() !== 'idle' || this.ticketsInPlay() === 0) {
      return false;
    }
    if (this.prizes().length === 0) {
      return true;
    }
    const selected = this.selectedStatus();
    return selected !== undefined && !selected.complete;
  });

  /**
   * Whether another draw is available once the current reveal is dismissed.
   * `canDraw` cannot answer this because it requires the idle phase.
   */
  readonly canDrawNext = computed(
    () => this.ticketsInPlay() > 0 && !this.allPrizesAwarded(),
  );

  /** Background ticker names, shuffled fresh for each draw. */
  readonly tickerNames = this._tickerNames.asReadonly();

  constructor() {
    this.restore();
    this.followPrizeFlow();
    this._finished.set(this.drawComplete());
    inject(DestroyRef).onDestroy(() => this.stopClock());
  }

  /** The compere picks the level this draw is for. */
  selectPrize(id: string): void {
    if (this._phase() === 'drawing') {
      return;
    }
    const status = this.prizeStatus().find((entry) => entry.prize.id === id);
    if (status && !status.complete) {
      this._selectedPrizeId.set(id);
    }
  }

  /**
   * Changes how many winners a level awards, mid-event and without disturbing
   * anything already drawn.
   *
   * The floor is the number of slots already awarded: lowering past that would
   * mean a recorded winner no longer has a prize, so it is simply refused. The
   * winner list is never touched either way - only the target count moves.
   */
  setPrizeSlots(id: string, slots: number): void {
    if (this._phase() === 'drawing') {
      return;
    }
    const status = this.prizeStatus().find((entry) => entry.prize.id === id);
    if (!status || !Number.isFinite(slots)) {
      return;
    }

    const floor = Math.max(1, status.awarded);
    const next = Math.min(MAX_PRIZE_SLOTS, Math.max(floor, Math.floor(slots)));
    if (next === status.prize.slots) {
      return;
    }

    this._slotOverrides.update((overrides) => new Map(overrides).set(id, next));
    // Raising a full level reopens it; lowering to the awarded count closes it.
    this.followPrizeFlow();
    this.persist();
  }

  adjustPrizeSlots(id: string, delta: number): void {
    const current = this.prizeStatus().find((entry) => entry.prize.id === id);
    if (current) {
      this.setPrizeSlots(id, current.prize.slots + delta);
    }
  }

  /** Lowest slot count this level can be set to without orphaning a winner. */
  slotFloor(id: string): number {
    const status = this.prizeStatus().find((entry) => entry.prize.id === id);
    return Math.max(1, status?.awarded ?? 0);
  }

  readonly maxPrizeSlots = MAX_PRIZE_SLOTS;

  /** Steps through the levels that still have slots open. */
  selectAdjacentPrize(delta: number): void {
    if (this._phase() === 'drawing') {
      return;
    }
    const open = this.prizeStatus().filter((status) => !status.complete);
    if (open.length === 0) {
      return;
    }
    const current = open.findIndex((status) => status.prize.id === this._selectedPrizeId());
    const next = open[(current + delta + open.length) % open.length];
    this._selectedPrizeId.set(next.prize.id);
  }

  // ---------------------------------------------------------------------------
  //  Loading entries
  // ---------------------------------------------------------------------------

  /** Replaces the entry list. Any winners drawn so far are cleared. */
  setCandidates(candidates: readonly Candidate[], sourceLabel: string, table: SheetTable | null): void {
    this.stopClock();
    this._phase.set('idle');
    this._table.set(table);
    this._candidates.set([...candidates]);
    this._finished.set(false);
    this._winners.set([]);
    this._lastWinner.set(null);
    this._sourceLabel.set(sourceLabel);
    this._reelName.set('');
    this._secondsLeft.set(DRAW_DURATION_MS / 1000);
    this.followPrizeFlow();
    this.persistAndSync();
  }

  /**
   * Replaces the entry list while keeping every winner already drawn.
   *
   * This is what the auto-refresh uses. `setCandidates` clears the winners,
   * which is right when a human deliberately loads a different list and
   * catastrophic on a timer - a refresh must never cost the night's results.
   * Returns how many people are new, so the UI can say so.
   */
  mergeCandidates(
    candidates: readonly Candidate[],
    sourceLabel: string,
    table: SheetTable | null,
  ): number {
    // Never move the ground under a running draw.
    if (this._phase() === 'drawing') {
      return 0;
    }

    const known = new Set(this._candidates().map(identityKey));
    this._table.set(table);
    this._candidates.set([...candidates]);
    this._sourceLabel.set(sourceLabel);
    this.persist();

    return candidates.filter((candidate) => !known.has(identityKey(candidate))).length;
  }

  /** Carries on after the results screen, once more entrants have arrived. */
  resume(): void {
    if (!this.canResume()) {
      return;
    }
    this._finished.set(false);
    this.followPrizeFlow();
  }

  clearAll(): void {
    this._slotOverrides.set(new Map());
    this.setCandidates([], '', null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do - storage is optional.
    }
  }

  // ---------------------------------------------------------------------------
  //  The draw
  // ---------------------------------------------------------------------------

  /**
   * Starts a draw. The winner is picked immediately from the eligible pool with
   * the crypto RNG; the 30 seconds that follow are theatre, and the reel is
   * steered to land on that winner.
   */
  draw(): void {
    if (!this.canDraw()) {
      return;
    }
    const pool = this.pool();
    const status = this.selectedStatus();
    this.pendingPrize = toAward(status?.prize ?? null, (status?.awarded ?? 0) + 1);
    this.runDraw(pool[secureRandomIndex(pool.length)], pool);
  }

  /** Abandons a running draw. No winner is recorded and nobody leaves the pool. */
  abortDraw(): void {
    if (this._phase() !== 'drawing') {
      return;
    }
    this.stopClock();
    this.sound.abort();
    this.pendingPrize = null;
    this._phase.set('idle');
    this._secondsLeft.set(DRAW_DURATION_MS / 1000);
    this._reelName.set('');
  }

  /** Clears the reveal and arms the next draw. */
  acknowledge(): void {
    if (this._phase() !== 'reveal') {
      return;
    }
    if (this.drawComplete()) {
      this._finished.set(true);
    }
    this._phase.set('idle');
    this._secondsLeft.set(DRAW_DURATION_MS / 1000);
    this._reelName.set('');
  }

  /** Puts the most recent winner back in the drum and frees their prize slot. */
  undoLastWinner(): void {
    if (this._phase() === 'drawing' || this._winners().length === 0) {
      return;
    }
    const winners = this._winners();
    const removed = winners[winners.length - 1];

    this._winners.set(winners.slice(0, -1));
    this._lastWinner.set(null);
    this._finished.set(false);
    this._phase.set('idle');
    this._reelName.set('');
    this._secondsLeft.set(DRAW_DURATION_MS / 1000);

    // Put the selection back on the level this winner was drawn for.
    //
    // Settling had already advanced it to the next level, and since that next
    // level is not complete, followPrizeFlow would leave it there quite
    // happily - so "not present, redraw" would draw for the following prize
    // and silently skip the one being redrawn.
    const award = removed.prize;
    if (award && this.prizeStatus().some((status) => status.prize.id === award.id)) {
      this._selectedPrizeId.set(award.id);
    }

    this.followPrizeFlow();
    this.persistAndSync();
  }

  /** Returns everyone to the drum and starts the rounds over. */
  resetWinners(): void {
    this.stopClock();
    this._finished.set(false);
    this._winners.set([]);
    this._lastWinner.set(null);
    this._phase.set('idle');
    this._reelName.set('');
    this._secondsLeft.set(DRAW_DURATION_MS / 1000);
    this.followPrizeFlow();
    this.persistAndSync();
  }

  winnersCsv(): string {
    const rows: string[][] = [
      ['Round', 'Prize', 'Seat', 'Name', 'Detail', 'Drawn at'],
      ...this._winners().map((winner) => [
        String(winner.round),
        winner.prize ? awardLabel(winner.prize) : '',
        winner.prize && winner.prize.slots > 1 ? `${winner.prize.seat} of ${winner.prize.slots}` : '',
        winner.candidate.name,
        winner.candidate.detail,
        new Date(winner.drawnAt).toISOString(),
      ]),
    ];
    return toCsv(rows);
  }

  private runDraw(chosen: Candidate, pool: readonly Candidate[]): void {
    // Reshuffled for every draw, so the reel never replays the sheet order.
    const feed = new ReelFeed([...new Set(pool.map((candidate) => candidate.name))]);
    this._tickerNames.set(shuffle(pool.map((candidate) => candidate.name)).slice(0, 48));
    const startedAt = performance.now();

    this._phase.set('drawing');
    this._secondsLeft.set(DRAW_DURATION_MS / 1000);
    this._stage.set(STAGES[0].stage);
    this._reelName.set('');
    this.showName(feed.next('') || chosen.name);
    this.nextTickAt = startedAt;
    this.riserArmed = false;

    const frame = (now: number): void => {
      const elapsed = now - startedAt;
      if (elapsed >= DRAW_DURATION_MS) {
        this.settle(chosen);
        return;
      }

      const progress = elapsed / DRAW_DURATION_MS;
      // Setting a signal to its current value is a no-op, so writing these on
      // every frame only triggers change detection when something changed.
      this._secondsLeft.set(Math.ceil((DRAW_DURATION_MS - elapsed) / 1000));
      this._stage.set(stageAt(progress));

      if (!this.riserArmed && DRAW_DURATION_MS - elapsed <= RISER_LEAD_MS) {
        this.riserArmed = true;
        this.sound.startRiser((DRAW_DURATION_MS - elapsed) / 1000);
      }

      if (elapsed >= DRAW_DURATION_MS - LOCK_IN_MS) {
        // The reel has landed: hold the winner for the last moment of suspense.
        this.showName(chosen.name);
      } else if (now >= this.nextTickAt) {
        this.nextTickAt = now + tickIntervalAt(progress);
        this.showName(feed.next(this._reelName()));
        this.sound.tick(progress);
      }

      this.frameId = requestAnimationFrame(frame);
    };

    this.frameId = requestAnimationFrame(frame);
  }

  private settle(chosen: Candidate): void {
    this.stopClock();
    const winner: Winner = {
      round: this._winners().length + 1,
      candidate: chosen,
      drawnAt: Date.now(),
      prize: this.pendingPrize,
    };
    this.pendingPrize = null;

    this._winners.update((winners) => [...winners, winner]);
    this._lastWinner.set(winner);
    this.showName(chosen.name);
    this._secondsLeft.set(0);
    this._stage.set(STAGES[STAGES.length - 1].stage);
    this._phase.set('reveal');
    this.sound.fanfare();
    this.followPrizeFlow();
    this.persistAndSync();
  }

  /**
   * Keeps the selection on a level that still has slots. Called after anything
   * that changes the awarded counts, so a full level hands over to the next.
   */
  private followPrizeFlow(): void {
    if (this.prizes().length === 0) {
      return;
    }
    const current = this.selectedStatus();
    if (current && !current.complete) {
      return;
    }
    const next = this.prizeStatus().find((status) => !status.complete);
    const prizes = this.prizes();
    this._selectedPrizeId.set(next?.prize.id ?? prizes[prizes.length - 1].id);
  }

  private showName(name: string): void {
    if (this._reelName() === name) {
      return;
    }
    this._reelName.set(name);
    this._reelTick.update((tick) => tick + 1);
  }

  private stopClock(): void {
    if (this.frameId !== 0) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
    this.riserArmed = false;
    this.sound.stopRiser();
  }

  // ---------------------------------------------------------------------------
  //  Persistence - survives an accidental refresh mid-event
  // ---------------------------------------------------------------------------

  /** Saves locally and mirrors the winner list back to the sheet. */
  private persistAndSync(): void {
    this.persist();
    this.sync.push(this._winners());
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: STORAGE_VERSION,
          candidates: this._candidates(),
          winners: this._winners(),
          sourceLabel: this._sourceLabel(),
          slotOverrides: Object.fromEntries(this._slotOverrides()),
        }),
      );
    } catch {
      // Storage can be unavailable or full; the draw works fine in memory.
    }
  }

  private restore(): void {
    let parsed: unknown;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        return;
      }
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return;
    }
    const saved = parsed as Record<string, unknown>;
    if (saved['version'] !== STORAGE_VERSION) {
      return;
    }

    const candidates = asArray(saved['candidates']).map(toCandidate).filter(isPresent);
    if (candidates.length === 0) {
      return;
    }

    const known = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const winners = asArray(saved['winners'])
      .map((entry, index) => toWinner(entry, index, known))
      .filter(isPresent);

    this._candidates.set(candidates);
    this._winners.set(winners);
    this._sourceLabel.set(typeof saved['sourceLabel'] === 'string' ? saved['sourceLabel'] : '');
    this._slotOverrides.set(toSlotOverrides(saved['slotOverrides'], this.basePrizes));
  }
}

// -----------------------------------------------------------------------------
//  Draw choreography
// -----------------------------------------------------------------------------

const STAGES: readonly { readonly until: number; readonly stage: DrawStage }[] = [
  {
    until: 0.08,
    stage: { label: 'Sealing the entries', caption: 'Every ticket is in the drum', intensity: 1 },
  },
  {
    until: 0.42,
    stage: { label: 'Shuffling the pool', caption: 'Mixing at full speed', intensity: 2 },
  },
  {
    until: 0.7,
    stage: { label: 'Narrowing it down', caption: 'The field is thinning out', intensity: 3 },
  },
  {
    until: 0.9,
    stage: { label: 'Final contenders', caption: 'Hold your breath', intensity: 4 },
  },
  {
    until: Number.POSITIVE_INFINITY,
    stage: { label: 'And the winner is', caption: 'Locking in the result', intensity: 5 },
  },
];

/** Reel speed envelope, in milliseconds between name changes. */
const SPIN_UP_FRACTION = 0.05;
const TICK_MS_START = 210;
const TICK_MS_FASTEST = 45;
const TICK_MS_FINAL = 620;
/** The reel settles on the winner this long before the reveal. */
const LOCK_IN_MS = 900;
/** The riser begins this long before the reveal. */
const RISER_LEAD_MS = 4200;

const MAX_PRIZE_SLOTS = 99;

const STORAGE_KEY = 'raffle-drawer.state';
const STORAGE_VERSION = 1;

function stageAt(progress: number): DrawStage {
  return (STAGES.find((entry) => progress < entry.until) ?? STAGES[STAGES.length - 1]).stage;
}

function tickIntervalAt(progress: number): number {
  if (progress < SPIN_UP_FRACTION) {
    // Spin up: a slow first second builds anticipation before the blur.
    const ramp = progress / SPIN_UP_FRACTION;
    return TICK_MS_START - (TICK_MS_START - TICK_MS_FASTEST) * ramp;
  }
  // Quartic easing holds full speed for most of the draw, then decelerates
  // hard over the final third - the classic slot-machine landing.
  const eased = progress ** 4;
  return TICK_MS_FASTEST + (TICK_MS_FINAL - TICK_MS_FASTEST) * eased;
}

function countPeople(candidates: readonly Candidate[]): number {
  return new Set(candidates.map(identityKey)).size;
}

// -----------------------------------------------------------------------------
//  Restoring untrusted localStorage content
// -----------------------------------------------------------------------------

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

/** Only ids that still exist in the build config, and only sane counts. */
function toSlotOverrides(value: unknown, prizes: readonly Prize[]): ReadonlyMap<string, number> {
  const overrides = new Map<string, number>();
  if (typeof value !== 'object' || value === null) {
    return overrides;
  }
  const known = new Set(prizes.map((prize) => prize.id));
  for (const [id, slots] of Object.entries(value as Record<string, unknown>)) {
    if (known.has(id) && typeof slots === 'number' && Number.isFinite(slots) && slots >= 1) {
      overrides.set(id, Math.min(MAX_PRIZE_SLOTS, Math.floor(slots)));
    }
  }
  return overrides;
}

function toCandidate(value: unknown): Candidate | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const name = typeof raw['name'] === 'string' ? raw['name'] : '';
  if (name.trim() === '') {
    return null;
  }
  return {
    id: typeof raw['id'] === 'string' ? raw['id'] : name,
    name,
    detail: typeof raw['detail'] === 'string' ? raw['detail'] : '',
  };
}

function toWinner(value: unknown, index: number, known: Map<string, Candidate>): Winner | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const candidate = toCandidate(raw['candidate']);
  if (!candidate) {
    return null;
  }
  return {
    round: typeof raw['round'] === 'number' ? raw['round'] : index + 1,
    candidate: known.get(candidate.id) ?? candidate,
    drawnAt: typeof raw['drawnAt'] === 'number' ? raw['drawnAt'] : Date.now(),
    prize: toPrizeAward(raw['prize']),
  };
}

function toPrizeAward(value: unknown): PrizeAward | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = typeof raw['id'] === 'string' ? raw['id'] : '';
  const label = typeof raw['label'] === 'string' ? raw['label'] : '';
  if (id === '' || label === '') {
    return null;
  }
  const slots = typeof raw['slots'] === 'number' && raw['slots'] > 0 ? raw['slots'] : 1;
  const seat = typeof raw['seat'] === 'number' && raw['seat'] > 0 ? raw['seat'] : 1;
  return { id, label, detail: typeof raw['detail'] === 'string' ? raw['detail'] : '', seat, slots };
}
