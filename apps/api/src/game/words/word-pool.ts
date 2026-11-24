import { randomInt } from 'node:crypto';

export const wordsPerTurn = 3;

export class WordPool {
  private remaining: number;
  private readonly swaps = new Map<number, number>();

  constructor(private readonly bank: readonly string[]) {
    this.remaining = bank.length;
  }

  takeOptions(): readonly [string, string, string] {
    if (this.remaining < wordsPerTurn)
      throw new RangeError('Fewer than three unused drawing prompts remain');
    return [this.takeWord(), this.takeWord(), this.takeWord()];
  }

  release() {
    this.remaining = 0;
    this.swaps.clear();
  }

  private takeWord() {
    const index = randomInt(this.remaining);
    const last = --this.remaining;
    const wordIndex = this.swaps.get(index) ?? index;
    // Treat untouched positions as the identity mapping of a shuffled array.
    if (index !== last) this.swaps.set(index, this.swaps.get(last) ?? last);
    this.swaps.delete(last);
    return this.bank[wordIndex];
  }
}
