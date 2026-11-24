import { roomCodeSchema } from '@draw-and-guess/shared';
import { notFound } from 'next/navigation';
import { LobbyScreen } from '@/features/lobby/components/lobby-screen';

export default async function RoomPage({ params }: PageProps<'/room/[code]'>) {
  const { code } = await params;

  const roomCode = roomCodeSchema.safeParse(code);
  if (!roomCode.success) notFound();

  return <LobbyScreen code={roomCode.data} />;
}
