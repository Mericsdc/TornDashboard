import type { Snapshot } from './contracts';

export type ChainObservation = {count:number;goal:number;remaining:number;at:number};
export type ChainState = NonNullable<Snapshot['chain']>;
export const nextChainBonus = (count: number): number => [10,25,50,100,250,500,1000,2500,5000,10000,25000,50000,100000].find(n => n > count) || Math.max(count,1);

/** An elapsed deadline is a terminal local state, even while the API is unavailable. */
export function currentChain(chain: Snapshot['chain'], now: number): Snapshot['chain'] {
  if (!chain) return null;
  if (chain.count > 0 && (chain.expiresAt === null || chain.expiresAt <= now)) {
    return { ...chain, count: 0, goal: 10, expiresAt: null, status: 'ended', lastCount: chain.count };
  }
  return chain;
}

/** A visible native sidebar is authoritative for a short lease; stale tabs cannot revive it. */
export function mergeChain(previous: Snapshot['chain'] | undefined, fresh: Snapshot['chain'], now: number): Snapshot['chain'] {
  if (previous?.source === 'page' && previous.observedAt !== undefined && now - previous.observedAt <= 15000 && now >= previous.observedAt) return currentChain(previous, now);
  if (previous && fresh && (fresh.observedAt ?? 0) < (previous.observedAt ?? 0)) return currentChain(previous, now);
  return currentChain(fresh ?? previous ?? null, now);
}

export function pageChain(previous: Snapshot['chain'] | undefined, observation: ChainObservation, now: number): ChainState | null {
  if (observation.at > now + 1000 || now - observation.at > 5000 || observation.goal < observation.count) return null;
  if (previous?.source === 'page' && observation.at < (previous.observedAt ?? 0)) return null;
  const active = observation.count > 0 && observation.remaining > 0;
  const lastCount = active ? undefined : observation.count || previous?.lastCount || previous?.count || undefined;
  const newChain=active && previous?.count===0;
  return { id: newChain ? null : previous?.id ?? null, startedAt: newChain ? observation.at : previous?.startedAt ?? observation.at, source: 'page',
    count: active ? observation.count : 0, goal: active ? observation.goal : 10,
    expiresAt: active ? observation.at + observation.remaining * 1000 : null,
    observedAt: observation.at, status: active ? 'active' : lastCount ? 'ended' : 'inactive', lastCount };
}
