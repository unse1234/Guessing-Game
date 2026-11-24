export const socketLimits = {
  activeRooms: 128,
  connections: 1_536,
  peers: 4_096,
  windowMs: 10_000,
  handshakes: 256,
  roomCreates: 32,
  roomJoins: 128,
  reconnects: 64,
} as const;

export class PeerRateLimit {
  private readonly peers = new Map<string, { used: number; until: number }>();

  constructor(
    private readonly limit: number,
    private readonly capacity: number = socketLimits.peers,
  ) {}

  take(address: string | undefined, now = performance.now()) {
    const key = address ?? '';
    const current = this.peers.get(key);
    if (current && now < current.until) {
      if (current.used >= this.limit) return false;
      current.used++;
      return true;
    }

    // Fixed windows keep insertion order aligned with expiry order.
    for (const [peer, budget] of this.peers) {
      if (budget.until > now) break;
      this.peers.delete(peer);
    }
    if (this.peers.size >= this.capacity) return false;
    this.peers.set(key, { used: 1, until: now + socketLimits.windowMs });
    return true;
  }
}
