import { roomCodeSchema } from '@draw-and-guess/shared';
import { notFound } from 'next/navigation';
import { GameScreen } from '@/features/game/components/game-screen';

export default async function GamePage({ params }: PageProps<'/game/[code]'>) {
  const code = roomCodeSchema.safeParse((await params).code);
  if (!code.success) notFound();

  return <GameScreen key={code.data} code={code.data} />;
}
