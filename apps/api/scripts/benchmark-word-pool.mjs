import shared from '@draw-and-guess/shared';
import configModule from '../dist/game/game-config.js';
import bankModule from '../dist/game/words/word-bank.js';
import poolModule from '../dist/game/words/word-pool.js';

const { performance, console } = globalThis;
const { wordBank } = bankModule;
const { WordPool } = poolModule;
const turnsPerGame = shared.ROOM_CAPACITY * configModule.gameConfig.totalRounds;
const sampleGames = 5_000;

function drawFullGame() {
  const pool = new WordPool(wordBank);
  for (let turn = 0; turn < turnsPerGame; turn++) pool.takeOptions();
  pool.release();
}

for (let game = 0; game < 500; game++) drawFullGame();
const samples = Array.from({ length: sampleGames }, () => {
  const start = performance.now();
  drawFullGame();
  return ((performance.now() - start) * 1_000) / turnsPerGame;
}).sort((a, b) => a - b);
const percentile = (p) => samples[Math.ceil(samples.length * p) - 1].toFixed(2);

console.log(
  `${wordBank.length} prompts, ${sampleGames} games × ${turnsPerGame} turns`,
);
console.log(
  `Per-game mean selection time, µs per turn: median ${percentile(0.5)}, p95 ${percentile(0.95)}`,
);
