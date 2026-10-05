import { SnapshotSchema, type Scenario, type Snapshot } from '@tcd/shared';

export class CompanionApi {
  private socket?: WebSocket;
  constructor(private origin: string, private token: string) {}
  private async request(path: string, method = 'GET'): Promise<unknown> {
    const response = await fetch(new URL(path, this.origin), { method,
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {}, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Companion returned HTTP ${response.status}`);
    return response.json();
  }
  async snapshot(scenario: Scenario): Promise<Snapshot> { return SnapshotSchema.parse(await this.request(`/v1/snapshot?scenario=${scenario}`)); }
  async connect(scenario: Scenario, onSnapshot: (snapshot: Snapshot) => void): Promise<void> {
    this.close();
    const result = await this.request('/v1/ws-ticket', 'POST');
    if (typeof result !== 'object' || result === null || !('ticket' in result) || typeof result.ticket !== 'string') throw new Error('Invalid stream ticket');
    const url = new URL('/v1/stream', this.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', result.ticket); url.searchParams.set('scenario', scenario);
    const socket = new WebSocket(url); this.socket = socket;
    socket.addEventListener('message', event => {
      try {
        const value: unknown = JSON.parse(String(event.data));
        if (typeof value === 'object' && value !== null && 'snapshot' in value) {
          const parsed = SnapshotSchema.safeParse(value.snapshot); if (parsed.success) onSnapshot(parsed.data);
        }
      } catch { /* A malformed event cannot affect the dashboard. */ }
    });
  }
  close(): void { this.socket?.close(); this.socket = undefined; }
}
