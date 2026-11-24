import { ResultsScreen } from '@/features/results/components/results-screen';
import { mockResults } from '@/features/results/data/mock-results';

export default async function ResultsPage({
  params,
}: PageProps<'/results/[code]'>) {
  const { code } = await params;

  return <ResultsScreen code={code} results={mockResults} />;
}
