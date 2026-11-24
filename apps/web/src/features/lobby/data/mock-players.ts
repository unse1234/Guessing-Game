export interface LobbyPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
  isOnline: boolean;
}

export const mockPlayers: readonly LobbyPlayer[] = [
  { id: '1', nickname: 'Hammad', isHost: true, isOnline: true },
  { id: '2', nickname: 'Ali', isHost: false, isOnline: true },
  { id: '3', nickname: 'Usman', isHost: false, isOnline: true },
  { id: '4', nickname: 'Zain', isHost: false, isOnline: true },
];
