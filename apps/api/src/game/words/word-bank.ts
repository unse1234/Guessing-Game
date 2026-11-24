import { ROOM_CAPACITY } from '@draw-and-guess/shared';
import { gameConfig } from '../game-config';
import data from './word-bank.json';
import { wordsPerTurn } from './word-pool';

export function normalizeGuess(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

export function validateWordBank(entries: readonly unknown[]) {
  const words = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const word = typeof entry === 'string' ? normalizeGuess(entry) : '';
    if (word.length > 32 || !/^[a-z]+(?:[ '-][a-z]+){0,2}$/.test(word))
      throw new Error(`Invalid drawing prompt at index ${index}`);
    if (words.has(word))
      throw new Error(`Duplicate drawing prompt at index ${index}`);
    words.add(word);
  }
  return Object.freeze([...words]);
}

export const wordBank = validateWordBank(data);
if (wordBank.length < ROOM_CAPACITY * gameConfig.totalRounds * wordsPerTurn)
  throw new Error('The drawing word bank cannot supply a full game');

interface Prefix {
  children?: Map<string, Prefix>;
  isWord?: true;
}

// Build the index once so redaction never has to scan the bank during a guess.
const prefixes: Prefix = {};
for (const word of wordBank) {
  let prefix = prefixes;
  for (const letter of word) {
    const children = (prefix.children ??= new Map());
    let next = children.get(letter);
    if (!next) {
      next = {};
      children.set(letter, next);
    }
    prefix = next;
  }
  prefix.isWord = true;
}

export function publicGuessText(original: string, normalized: string) {
  // Apply the same rule to every candidate regardless of the active answer.
  for (let start = 0; start < normalized.length; start++) {
    let prefix: Prefix | undefined = prefixes;
    for (let end = start; end < normalized.length; end++) {
      prefix = prefix.children?.get(normalized[end]);
      if (!prefix) break;
      if (prefix.isWord && (start !== 0 || end !== normalized.length - 1))
        return '…';
    }
  }
  return original;
}
