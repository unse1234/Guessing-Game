import { GameScreen } from '@/features/game/components/game-screen';

export default async function GamePage({
  params,
  searchParams,
}: PageProps<'/game/[code]'>) {
  const { code } = await params;
  const development = process.env.NODE_ENV === 'development';
  const role =
    development && (await searchParams).role === 'guesser'
      ? 'guesser'
      : 'drawer';

  return (
    <GameScreen
      key={JSON.stringify([code, role])}
      code={code}
      role={role}
      allowWordPreview={development}
    />
  );
}
