import type { FinalPlayerResult } from '@draw-and-guess/shared';

const basePoints = 100;
const pointsPerSecond = 5;
const drawerBonus = 50;
const drawerBonusLimit = 200;

export function scoreCorrectGuess(remainingMs: number, bonusSoFar: number) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  return {
    guesser: basePoints + seconds * pointsPerSecond,
    drawer: Math.min(drawerBonus, drawerBonusLimit - bonusSoFar),
  };
}
export function rankPlayerScores(
  roster: readonly { id: string; nickname: string }[],
  scores: ReadonlyMap<string, number>,
): FinalPlayerResult[] {
  const sorted = roster
    .map(({ id, nickname }) => ({
      playerId: id,
      nickname,
      score: scores.get(id) ?? 0,
    }))
    .sort((first, second) => second.score - first.score);
  let rank = 0;
  return sorted.map((player, index) => {
    if (index === 0 || player.score !== sorted[index - 1].score)
      rank = index + 1;
    return { ...player, rank };
  });
}
