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
