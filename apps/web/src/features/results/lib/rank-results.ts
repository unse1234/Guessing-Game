import type {
  PlayerResult,
  RankedResult,
} from '@/features/results/types/results';

export function rankResults(results: readonly PlayerResult[]): RankedResult[] {
  const sorted = [...results].sort(
    (first, second) => second.score - first.score,
  );
  let rank = 0;

  return sorted.map((player, index) => {
    if (index === 0 || player.score !== sorted[index - 1].score) {
      rank = index + 1;
    }

    return { ...player, rank };
  });
}
