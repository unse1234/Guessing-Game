import { LobbyScreen } from '@/features/lobby/components/lobby-screen';

export default async function RoomPage({ params }: PageProps<'/room/[code]'>) {
  const { code } = await params;

  return <LobbyScreen code={code} />;
}
