import { secureRandomIndex } from './random';

/**
 * Supplies the names that flicker past during a draw.
 *
 * The pool is shuffled and then walked in order, rather than picking at random
 * each tick: that way every entrant's name goes past the audience exactly once
 * per pass, nobody is shown twice before everyone has been shown once, and the
 * reel never betrays the order of the source sheet. Each pass is reshuffled, so
 * a long draw does not repeat the same sequence.
 *
 * This is presentation only. The winner was already chosen in `RaffleStore.draw`
 * before any of these names appeared.
 */
export class ReelFeed {
  private readonly names: readonly string[];
  private order: string[] = [];
  private cursor = 0;

  constructor(names: readonly string[]) {
    this.names = names;
    this.reshuffle('');
  }

  get size(): number {
    return this.names.length;
  }

  /** The next name to show, never equal to `current`. */
  next(current: string): string {
    if (this.order.length === 0) {
      return current;
    }
    if (this.cursor >= this.order.length) {
      this.reshuffle(current);
    }
    return this.order[this.cursor++];
  }

  private reshuffle(current: string): void {
    this.order = shuffle(this.names);
    this.cursor = 0;

    // A fresh pass could open on the name still on screen, which would read as
    // a stalled reel. Swap it away.
    if (this.order.length > 1 && this.order[0] === current) {
      const swap = 1 + secureRandomIndex(this.order.length - 1);
      [this.order[0], this.order[swap]] = [this.order[swap], this.order[0]];
    }
  }
}

/** Fisher-Yates: every permutation equally likely. */
export function shuffle<T>(values: readonly T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
