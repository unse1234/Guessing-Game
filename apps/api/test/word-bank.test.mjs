import assert from 'node:assert/strict';
import test from 'node:test';
import bankModule from '../dist/game/words/word-bank.js';
import poolModule from '../dist/game/words/word-pool.js';

const { normalizeGuess, publicGuessText, validateWordBank, wordBank } =
  bankModule;
const { WordPool } = poolModule;

test('the compiled word bank contains at least 8,000 distinct short prompts', () => {
  assert.ok(wordBank.length >= 8_000 && wordBank.length <= 10_000);
  assert.equal(new Set(wordBank.map(normalizeGuess)).size, wordBank.length);
  assert.ok(wordBank.some((word) => word.includes(' ')));
  assert.deepEqual(validateWordBank(['  Sea   Turtle  ']), ['sea turtle']);
  assert.throws(
    () => validateWordBank(['bicycle', ' Ｂｉｃｙｃｌｅ ']),
    /Duplicate/,
  );
  assert.throws(
    () => validateWordBank(['a very long drawing prompt']),
    /Invalid/,
  );
  assert.throws(() => validateWordBank(['bad\u0000prompt']), /Invalid/);
  for (const excluded of ['assault gun', 'death chamber', 'nude painting'])
    assert.ok(!wordBank.includes(excluded));
});

test('sampling consumes every offered prompt exactly once and fails closed on exhaustion', () => {
  const pool = new WordPool(wordBank);
  const seen = new Set();
  for (let index = 0; index + 3 <= wordBank.length; index += 3) {
    const options = pool.takeOptions();
    assert.equal(new Set(options).size, 3);
    for (const option of options) {
      assert.ok(!seen.has(option), `Repeated prompt: ${option}`);
      seen.add(option);
    }
  }
  assert.equal(seen.size, Math.floor(wordBank.length / 3) * 3);
  assert.throws(() => pool.takeOptions(), RangeError);

  const small = new WordPool(['cat', 'dog', 'fish', 'owl', 'pig']);
  assert.equal(new Set(small.takeOptions()).size, 3);
  assert.throws(() => small.takeOptions(), RangeError);
  assert.throws(() => small.takeOptions(), RangeError);
  const released = new WordPool(wordBank);
  released.takeOptions();
  released.release();
  assert.throws(() => released.takeOptions(), RangeError);
});

test('indexed guess redaction agrees with the same rule applied to the whole bank', () => {
  for (const original of [
    'Something else',
    'a bicycle?',
    'sea turtle!',
    'ａ bicycle',
    'owl',
    'butterfly',
  ]) {
    const normalized = normalizeGuess(original);
    const matched = wordBank.some(
      (word) => word !== normalized && normalized.includes(word),
    );
    assert.equal(
      publicGuessText(original, normalized),
      matched ? '…' : original,
    );
  }
});
