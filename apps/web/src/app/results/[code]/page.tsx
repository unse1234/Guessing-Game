import { roomCodeSchema } from '@draw-and-guess/shared';
import { notFound } from 'next/navigation';
import { ResultsScreen } from '@/features/results/components/results-screen';

export default async function ResultsPage({
  params,
}: PageProps<'/results/[code]'>) {
  const code = roomCodeSchema.safeParse((await params).code);
  if (!code.success) notFound();

  return <ResultsScreen key={code.data} code={code.data} />;
}
