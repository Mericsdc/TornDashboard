import { freshStock } from './travel';
import type { PublicState, Snapshot } from './contracts';
export type AlertEvent = { key: string; title: string; message: string };
export type AlertMemory = { seen: string[]; stocks: Record<string, { at: number; available: boolean }> };
export const emptyAlertMemory = (): AlertMemory => ({ seen: [], stocks: {} });
export function evaluateAlerts(snapshot: Snapshot, state: PublicState, previous: AlertMemory, now: number): { memory: AlertMemory; events: AlertEvent[] } {
  const memory = structuredClone(previous), events: AlertEvent[] = [];
  const emit = (event: AlertEvent) => { if (!memory.seen.includes(event.key)) { memory.seen.push(event.key); events.push(event); } };
  if (snapshot.source !== 'live' || snapshot.provider !== 'bosbot') return { memory, events };
  const chain = snapshot.chain;
  if (state.settings.alerts.chain && chain?.count && chain.expiresAt && chain.observedAt && now - chain.observedAt >= -30000 && now - chain.observedAt <= 45000 && chain.expiresAt - now > 0 && chain.expiresAt - now <= 30000) {
    emit({ key: `chain:${chain.id || chain.startedAt || 'active'}:${chain.count}`, title: 'Chain · 30 seconds remaining', message: `${chain.count} hits · ${Math.ceil((chain.expiresAt - now) / 1000)} seconds to keep the chain alive.` });
  }
  const watched = new Set<string>();
  for (const favorite of state.favorites.filter(f => f.alert)) {
    const id = `${favorite.country}:${favorite.itemId}:${favorite.minimumStock}`; watched.add(id);
    const stock = snapshot.stocks.find(item => item.itemId === favorite.itemId && item.country === favorite.country && item.name.toLowerCase() === favorite.name.toLowerCase());
    if (!stock || !freshStock(stock, now)) continue;
    const old = memory.stocks[id], at = stock.observedAt!, available = stock.stock! >= favorite.minimumStock;
    if (!old || at > old.at) {
      // Establish a fresh baseline first; startup and stale observations never create stock alerts.
      if (state.settings.alerts.stock && old && at - old.at <= 180000 && !old.available && available) emit({ key: `stock:${id}:${at}`, title: `${favorite.name} · stock available`, message: `${favorite.country} · observed stock ${stock.stock} (threshold ${favorite.minimumStock}).` });
      memory.stocks[id] = { at, available };
    }
    const estimate = stock.restock;
    if (state.settings.alerts.restockReminder && !available && estimate.kind !== 'unknown') {
      const at = estimate.kind === 'exact' ? estimate.at : estimate.earliest;
      if (at - now > 0 && at - now <= 30000) emit({ key: `restock:${id}:${estimate.kind === 'estimated' ? estimate.lastSeenRestock : at}`, title: `${favorite.name} · ${estimate.kind === 'exact' ? 'scheduled' : 'estimated'} restock`, message: estimate.kind === 'exact' ? `${favorite.country} · scheduled restock in ${Math.ceil((at - now) / 1000)}s.` : `${favorite.country} · estimated window starts within 30s. Stock is not confirmed.` });
    }
  }
  memory.stocks = Object.fromEntries(Object.entries(memory.stocks).filter(([key]) => watched.has(key)));
  memory.seen = memory.seen.slice(-100);
  return { memory, events };
}
