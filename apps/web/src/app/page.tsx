import { roomCodeSchema } from '@draw-and-guess/shared';
import { HomeScreen } from '@/features/home/components/home-screen';

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const invitation = roomCodeSchema.safeParse((await searchParams).room);
  return (
    <HomeScreen inviteCode={invitation.success ? invitation.data : undefined} />
  );
}
