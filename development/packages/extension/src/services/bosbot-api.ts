import { z } from 'zod';
import { SnapshotSchema, type Snapshot } from '@tcd/shared';
const PairSchema = z.object({ pairingId: z.string().regex(/^[\w-]{20,100}$/), pollingSecret: z.string().regex(/^[\w-]{20,100}$/), expiresAt: z.number(), verificationUrl: z.string().url() }).strict();
const PollSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }), z.object({ status: z.literal('expired') }), z.object({ status: z.literal('limit') }),
  z.object({ status: z.literal('approved'), token: z.string().regex(/^[\w-]{20,100}$/), deviceId: z.string().regex(/^[\w-]{20,100}$/), expiresAt: z.number() })
]);
export type BosbotPair = z.infer<typeof PairSchema> & { origin: string };
export type BosbotDevice = { origin: string; token: string; deviceId: string; expiresAt: number };
export class BosbotApi {
  constructor(private readonly origin: string, private readonly extensionId: string, private readonly token = '') {}
  private async request(path: string, body?: object, method = body ? 'POST' : 'GET'): Promise<unknown> {
    const response = await fetch(`${new URL(this.origin).origin}${path}`, {
      method, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(22000),
      headers: { 'X-Extension-Id': this.extensionId, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    }).catch(() => { throw new Error('BOSBOT is unreachable. Check your connection and the BOSBOT server address.'); });
    if (response.status === 401 || response.status === 403) throw new Error('BOSBOT connection expired, revoked or denied. Reconnect in extension settings.');
    if (response.status === 404) throw new Error('This BOSBOT server needs the extension API update before connecting.');
    if (!response.ok) throw new Error(`BOSBOT request failed (${response.status}). Try again shortly.`);
    return response.json();
  }
  async start(): Promise<BosbotPair> {
    const pair = PairSchema.parse(await this.request('/api/extension/pair/start', { extensionId: this.extensionId }));
    const verification = new URL(pair.verificationUrl);
    if (verification.origin !== new URL(this.origin).origin || verification.pathname !== '/extension/connect' || verification.searchParams.get('pairingId') !== pair.pairingId) throw new Error('BOSBOT returned an invalid approval address');
    return { ...pair, origin: new URL(this.origin).origin };
  }
  async poll(pair: BosbotPair): Promise<z.infer<typeof PollSchema>> {
    return PollSchema.parse(await this.request('/api/extension/pair/poll', { extensionId: this.extensionId, pairingId: pair.pairingId, pollingSecret: pair.pollingSecret }));
  }
  async snapshot(): Promise<Snapshot> {
    const snapshot = SnapshotSchema.parse(await this.request('/api/extension/snapshot'));
    if (snapshot.source !== 'live' || snapshot.provider !== 'bosbot') throw new Error('BOSBOT did not return a live data feed');
    return snapshot;
  }
  async disconnect(): Promise<void> { await this.request('/api/extension/device', undefined, 'DELETE'); }
}
