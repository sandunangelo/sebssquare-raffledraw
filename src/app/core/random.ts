/**
 * Uniform random index in [0, size) backed by the Web Crypto CSPRNG.
 *
 * Rejection sampling discards the tail of the 32-bit range that does not divide
 * evenly by `size`, so every entry has exactly the same chance - a plain
 * `% size` would quietly favour the first few entries. This is the only place
 * the actual winner is chosen; the names flickering past during the draw are
 * decoration and use Math.random.
 */
export function secureRandomIndex(size: number): number {
  if (size <= 0) {
    throw new RangeError('secureRandomIndex needs a size of at least 1');
  }
  if (size === 1) {
    return 0;
  }

  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    return Math.floor(Math.random() * size);
  }

  const range = 0x1_0000_0000;
  const limit = range - (range % size);
  const buffer = new Uint32Array(1);

  // Expected iterations < 2 for any realistic pool size.
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) {
      return buffer[0] % size;
    }
  }
}

/** Picks a random element using the CSPRNG. */
export function securePick<T>(items: readonly T[]): T {
  return items[secureRandomIndex(items.length)];
}
