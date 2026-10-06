import type { Snapshot, StockItem } from './contracts';
import { canonicalCountry } from './travel';
import type { InventorySnapshot, PageTravel, Purchase, ResourceBars, TravelApp, Trip, TripProfit } from './trip-model';

export function compareInventory(before: InventorySnapshot, after: InventorySnapshot) {
  const covered = new Set(after.coveredIds), prior = new Set(before.coveredIds);
  return [...new Set([...Object.keys(before.items), ...Object.keys(after.items)])].map(Number).filter(id => covered.has(id) && prior.has(id)).map(itemId => {
    const a = before.items[itemId] ?? 0, b = after.items[itemId] ?? 0;
    return { itemId, before: a, after: b, added: Math.max(0, b - a), removed: Math.max(0, a - b), unchanged: Math.min(a, b) };
  });
}
export function priceConfidence(at: number | null | undefined, now: number): 'high' | 'medium' | 'low' {
  if (!at || at > now + 30000) return 'low';
  return now - at <= 30 * 60000 ? 'high' : now - at <= 2 * 3600000 ? 'medium' : 'low';
}
export function predictResource(bar: ResourceBars['energy'], arrivalAt: number | null, now: number): number | null {
  if (!arrivalAt || !bar.nextTickAt || now - bar.observedAt > 15 * 60000 || arrivalAt < bar.observedAt) return null;
  if (bar.current >= bar.maximum) return bar.current;
  const ticks = arrivalAt < bar.nextTickAt ? 0 : Math.floor((arrivalAt - bar.nextTickAt) / (bar.interval * 1000)) + 1;
  return Math.min(bar.maximum, bar.current + ticks * bar.increment);
}
function effectivePurchases(trip: Trip): Purchase[] {
  const logs = trip.purchases.filter(p => p.source === 'api-log'), matched = new Set<string>();
  return [...logs, ...trip.purchases.filter(p => p.source !== 'api-log').filter(page => {
    const log = logs.find(log => !matched.has(log.id) && log.itemId === page.itemId && log.quantity === page.quantity && Math.abs(log.observedAt - page.observedAt) <= 120000);
    if (log) { matched.add(log.id); return false; } return true;
  })];
}
export function tripProfit(trip: Trip, app: TravelApp, now: number): TripProfit {
  const purchases = effectivePurchases(trip), ids = [...new Set(purchases.map(p => p.itemId))], prices = trip.finalizedAt ? Object.fromEntries(trip.marketPricesAtFinalization.map(p => [p.itemId,p])) : app.marketPrices;
  const rows = ids.map(itemId => {
    const receipts = purchases.filter(p => p.itemId === itemId), quantity = receipts.reduce((n, p) => n + p.quantity, 0);
    const shop = trip.marketSnapshot.find(p => p.itemId === itemId), price = prices[itemId];
    const costs = receipts.map(p => { const unit = p.unitCost ?? shop?.cost ?? null; return p.totalCost ?? (unit === null ? null : unit * p.quantity); });
    const cost = costs.every(n => n !== null) ? costs.reduce<number>((sum, n) => sum + n!, 0) : null;
    const marketPrice = price?.value ?? null, marketValue = marketPrice === null ? null : quantity * marketPrice, profit = cost === null || marketValue === null ? null : marketValue - cost;
    const confidence = receipts.some(p => p.source === 'inventory-corroborated' || p.costSource !== 'receipt') ? 'low' : priceConfidence(price?.observedAt, now);
    return { itemId, name: shop?.name || price?.name || `Item ${itemId}`, quantity, unitCost: cost === null ? null : cost / quantity, cost,
      marketPrice, priceObservedAt: price?.observedAt ?? null, marketValue, profit, roi: profit !== null && cost ? profit / cost * 100 : null, confidence };
  });
  const spent = rows.every(r => r.cost !== null) ? rows.reduce((n, r) => n + r.cost!, 0) : null;
  const marketValue = rows.every(r => r.marketValue !== null) ? rows.reduce((n, r) => n + r.marketValue!, 0) : null;
  const estimatedProfit = spent === null || marketValue === null ? null : marketValue - spent;
  const start = trip.outbound.departedAt, finish = trip.inbound.arrivedAt ?? trip.inbound.arrivesAt;
  const roundTripMs = start && finish && finish > start ? finish - start : null;
  const oneWayMs = trip.inbound.departedAt && finish && finish > trip.inbound.departedAt ? finish - trip.inbound.departedAt : null;
  const confidence = rows.some(r => r.confidence === 'low') ? 'low' : rows.some(r => r.confidence === 'medium') ? 'medium' : 'high';
  let range: TripProfit['range'] = null;
  if (confidence === 'low' && spent !== null && rows.length && rows.every(r => (prices[r.itemId]?.history.length ?? 0) >= 2)) {
    const bands = rows.map(r => prices[r.itemId]!.history.filter(p => now - p.at <= 86400000).map(p => p.value));
    if (bands.every(b => b.length >= 2)) range = { low: bands.reduce((n, b, i) => n + Math.min(...b) * rows[i]!.quantity, 0) - spent, high: bands.reduce((n, b, i) => n + Math.max(...b) * rows[i]!.quantity, 0) - spent };
    if (range?.low === range?.high) range = null;
  }
  const additions = trip.inventoryBeforeShopping && trip.inventoryAtDeparture ? compareInventory(trip.inventoryBeforeShopping, trip.inventoryAtDeparture).filter(d => trip.marketSnapshot.some(s => s.itemId === d.itemId)) : [];
  return { rows, quantity: rows.reduce((n, r) => n + r.quantity, 0), spent, marketValue, estimatedProfit, actualProfit: trip.actualProfit, actualRevenue: trip.actualRevenue,
    roi: estimatedProfit !== null && spent ? estimatedProfit / spent * 100 : null, confidence, range, roundTripMs, oneWayMs,
    profitPerHour: estimatedProfit !== null && roundTripMs ? estimatedProfit / (roundTripMs / 3600000) : null,
    oneWayProfitPerHour: estimatedProfit !== null && oneWayMs ? estimatedProfit / (oneWayMs / 3600000) : null,
    priceAgeMs: rows.some(r => r.priceObservedAt === null) ? null : rows.length ? Math.max(...rows.map(r => Math.max(0, now - r.priceObservedAt!))) : null,
    unconfirmedAdditions: additions.reduce((n, d) => n + Math.max(0, d.added - (rows.find(r => r.itemId === d.itemId)?.quantity ?? 0)), 0) };
}
export type TravelObservation = { state: TravelApp['travel']['state']; originCountry?: string | null; destinationCountry?: string | null; departedAt?: number | null; arrivalAt?: number | null; method?: string | null; at: number; source: 'page' | 'api'; pendingReturn?: boolean };
export function observeTravel(app: TravelApp, observation: TravelObservation, now: number): void {
  const prior = app.travel, o = { ...observation }, origin = canonicalCountry(o.originCountry), dest = canonicalCountry(o.destinationCountry);
  const sameLeg=(!dest||dest===prior.destinationCountry)&&(!origin||origin===prior.originCountry);
  if(o.source==='page' && sameLeg && prior.arrivalAt && ['OUTBOUND','RETURNING','LANDED'].includes(prior.state)) {
    o.arrivalAt=prior.arrivalAt;
    if(prior.state==='LANDED' && prior.arrivalAt<=now && ['OUTBOUND','RETURNING'].includes(o.state))o.state='LANDED';
  }
  if (o.at < prior.phaseObservedAt) {
    // A compatible API response can enrich a newer page route without regressing its phase.
    if (o.source === 'api' && o.state === prior.state && (!dest || dest === prior.destinationCountry)) {
      if (o.departedAt) { prior.departedAt = o.departedAt; if (app.travelSession) { if (o.state === 'RETURNING') app.travelSession.inbound.departedAt = o.departedAt; else if(o.state === 'OUTBOUND') app.travelSession.outbound.departedAt = o.departedAt; } }
      if (o.arrivalAt) { prior.arrivalAt = o.arrivalAt; if(app.travelSession && o.state === 'RETURNING') app.travelSession.inbound.arrivesAt=o.arrivalAt; }
      if (o.method) prior.method=o.method;
      if(o.state==='RETURNING'&&o.departedAt)prior.pendingReturn=false;
    }
    return;
  }
  if(prior.pendingReturn && !prior.arrivalAt && o.state==='ABROAD' && o.source==='api' && o.at-prior.phaseObservedAt>=45000 && dest===app.travelSession?.country){
    // A fresh API observation can cancel an unconfirmed return intent (cancelled confirmation or failed departure).
    app.travelSession!.inbound={departedAt:null,arrivesAt:null,arrivedAt:null};app.travelSession!.inventoryAtDeparture=null;prior.pendingReturn=false;
  }
  if (app.travelSession?.inbound.departedAt && ['OUTBOUND','ABROAD'].includes(o.state) && (!o.departedAt || o.departedAt <= app.travelSession.inbound.departedAt)) return;
  if (o.source === 'api' && prior.pendingReturn && o.state === 'ABROAD' && now - prior.phaseObservedAt < 45000) return;
  if (o.state === 'OUTBOUND' && origin === 'Torn' && app.travelSession?.inbound.arrivesAt && o.departedAt && o.departedAt >= app.travelSession.inbound.arrivesAt) {
    app.travelSession.inbound.arrivedAt ??= app.travelSession.inbound.arrivesAt;
    archiveTrip(app, o.departedAt);
  }
  if (o.state === 'AT_HOME' && app.travelSession) {
    if (prior.destinationCountry !== 'Torn' || !app.travelSession.inbound.departedAt) return;
    if (prior.arrivalAt && prior.arrivalAt > now) return;
    prior.state = 'LANDED'; prior.homeConfirmedAt ??= o.at; prior.observedAt = o.at;
    app.travelSession.inbound.arrivedAt ??= prior.destinationCountry === 'Torn' ? prior.arrivalAt ?? o.at : o.at;
    return;
  }
  const country = o.state === 'RETURNING' ? origin || app.travelSession?.country || prior.marketContextCountry : dest && dest !== 'Torn' ? dest : prior.marketContextCountry;
  if (['OUTBOUND', 'ABROAD', 'RETURNING'].includes(o.state) && !country) return;
  if (country && ['OUTBOUND', 'ABROAD', 'RETURNING'].includes(o.state) && !app.travelSession) {
    app.travelSession = { tripId: `${country}:${o.departedAt ?? o.at}`, country, startedAt: o.at,
      outbound: { departedAt: o.state === 'RETURNING' ? null : o.departedAt ?? null, arrivedAt: o.state === 'ABROAD' ? o.arrivalAt ?? o.at : o.state === 'OUTBOUND' ? o.arrivalAt ?? null : null },
      inbound: { departedAt: null, arrivesAt: null, arrivedAt: null }, inventoryBeforeShopping: null, inventoryAtDeparture: null, purchases: [], marketPricesAtFinalization: [], marketSnapshot: [],
      estimatedProfit: null, actualProfit: null, actualRevenue: null, finalizedAt: null, finalization: 'pending', logsCheckedAt: null, logsComplete: false, baselineMissing: o.state !== 'OUTBOUND' };
    app.bag = { ...app.bag, total: null, used: o.state === 'OUTBOUND' ? 0 : null, free: null, usedSource: 'unknown', source: 'unknown', exact: false };
  }
  if (country && app.travelSession && country !== app.travelSession.country) return; // A conflicting observation cannot switch a live trip's market.
  const trip = app.travelSession;
  app.travel = { state: o.state, originCountry: o.state === 'RETURNING' ? country : origin || (o.state === 'ABROAD' ? country : 'Torn'),
    destinationCountry: o.state === 'RETURNING' ? 'Torn' : dest || country || 'Torn', marketContextCountry: o.state === 'AT_HOME' ? null : country,
    departedAt: o.departedAt ?? (prior.state === o.state ? prior.departedAt : null), arrivalAt: o.arrivalAt ?? (prior.state === o.state ? prior.arrivalAt : null),
    observedAt: o.at, phaseObservedAt: prior.state===o.state ? prior.phaseObservedAt : o.at, source: o.source, pendingReturn: o.pendingReturn ?? false, homeConfirmedAt: null, method: o.method ?? prior.method };
  if (trip) {
    if (o.state === 'OUTBOUND') { trip.outbound.departedAt ??= o.departedAt ?? null; trip.outbound.arrivedAt = o.arrivalAt ?? trip.outbound.arrivedAt; }
    if (o.state === 'ABROAD') trip.outbound.arrivedAt ??= o.at;
    if (o.state === 'RETURNING') {
      trip.inbound.departedAt = o.departedAt ?? trip.inbound.departedAt; trip.inbound.arrivesAt = o.arrivalAt ?? trip.inbound.arrivesAt;
      if (app.inventory?.kind === 'inventory' && app.inventory.observedAt <= (o.departedAt ?? o.at)) trip.inventoryAtDeparture = structuredClone(app.inventory);
    }
  }
}
export function recordInventory(app: TravelApp, inventory: InventorySnapshot): void {
  if (inventory.kind === 'travel-bag') {
    if (inventory.complete && ['ABROAD', 'RETURNING', 'LANDED'].includes(app.travel.state)) {app.bag.used = Object.values(inventory.items).reduce((n, q) => n + q, 0);app.bag.usedSource='inventory';}
    return;
  }
  if (app.inventory && inventory.observedAt < app.inventory.observedAt) return;
  app.inventory = inventory;
  const trip = app.travelSession; if (!trip) return;
  if (!trip.inventoryBeforeShopping && (!trip.purchases.length || inventory.observedAt < Math.min(...trip.purchases.map(p => p.observedAt)))) {
    trip.inventoryBeforeShopping = structuredClone(inventory); trip.baselineMissing = false;
  }
  if (app.travel.state === 'RETURNING' && inventory.observedAt <= (trip.inbound.departedAt ?? Infinity)) trip.inventoryAtDeparture = structuredClone(inventory);
}
export function recordPurchase(app: TravelApp, receipt: Purchase): void {
  const trip = app.travelSession;
  if (!trip || canonicalCountry(receipt.country) !== trip.country || receipt.observedAt < (trip.outbound.departedAt ?? trip.startedAt) - 30000 ||
      receipt.observedAt > (trip.inbound.departedAt ?? Infinity) + 30000 || !trip.marketSnapshot.some(s => s.itemId === receipt.itemId)) return;
  if (!trip.purchases.some(p => p.id === receipt.id)) trip.purchases.push(receipt);
  trip.purchases = trip.purchases.sort((a, b) => a.observedAt - b.observedAt).slice(-300);
}
export function mergePrices(app: TravelApp, stocks: StockItem[]): void {
  for (const stock of stocks) {
    const old = app.marketPrices[stock.itemId];
    if (stock.tornValue && stock.priceObservedAt && (!old?.observedAt || stock.priceObservedAt >= old.observedAt)) {
      const history = [...(old?.history ?? [])]; if (!history.some(p => p.at === stock.priceObservedAt)) history.push({ at: stock.priceObservedAt, value: stock.tornValue });
      app.marketPrices[stock.itemId] = { itemId: stock.itemId, name: stock.name, value: stock.tornValue, observedAt: stock.priceObservedAt, history: history.slice(-12) };
    }
    const trip = app.travelSession;
    if (trip?.country === stock.country && !trip.marketSnapshot.some(s => s.itemId === stock.itemId)) trip.marketSnapshot.push({ itemId: stock.itemId, name: stock.name, cost: stock.cost ?? null, observedAt: stock.priceObservedAt ?? null });
  }
}
export function applyPageTravel(app: TravelApp, page: PageTravel, stocks: StockItem[], now: number): void {
  if (page.selectedCountry) app.previewCountry = canonicalCountry(page.selectedCountry);
  if (page.returnIntent && app.travelSession && ['ABROAD', 'RETURNING'].includes(app.travel.state)) observeTravel(app, { state: 'RETURNING', originCountry: app.travelSession.country, destinationCountry: 'Torn', source: 'page', at: now, departedAt: now, pendingReturn: true }, now);
  if (page.state) observeTravel(app, { state: page.state, originCountry: page.originCountry, destinationCountry: page.destinationCountry, arrivalAt: page.arrivalAt, source: 'page', at: now }, now);
  mergePrices(app, stocks);
  if (page.inventory) recordInventory(app, page.inventory);
  if (page.bag && app.travelSession) {
    if (page.bag.total) { app.knownCapacity = { total: page.bag.total, method: app.travel.method, at: now }; app.bag = { ...app.bag, total: page.bag.total, source: 'page', exact: true, observedAt: now }; }
    if (page.bag.used !== null) {app.bag.used = page.bag.used;app.bag.usedSource='page';}
  }
  if (page.receipt) recordPurchase(app, page.receipt);
}
export function finalizeDerived(app: TravelApp, now: number, capacityOverride: number | null = null): void {
  app.history=app.history.filter(h=>h.finalizedAt!==null && now-h.finalizedAt<90*86400000).slice(0,100);
  const t = app.travel;
  if (['OUTBOUND', 'RETURNING'].includes(t.state) && t.arrivalAt && now >= t.arrivalAt) t.state = 'LANDED';
  if (app.bag.source==='cached' && app.knownCapacity?.method && t.method && t.method!==app.knownCapacity.method) {app.bag.total=null;app.bag.source='unknown';app.bag.exact=false;}
  if (app.bag.source !== 'page' && app.knownCapacity && (!t.method || !app.knownCapacity.method || t.method === app.knownCapacity.method)) {
    app.bag.total = app.knownCapacity.total; app.bag.source = 'cached'; app.bag.observedAt = app.knownCapacity.at; app.bag.exact = false;
  }
  if (app.bag.total === null && capacityOverride) { app.bag.total = capacityOverride; app.bag.source = 'manual'; app.bag.exact = false; }
  if (app.travelSession) {
    app.tripProfit = tripProfit(app.travelSession, app, now); app.travelSession.estimatedProfit = app.tripProfit.estimatedProfit;
    if (app.bag.used === null && app.travelSession.logsComplete) { app.bag.used = app.tripProfit.quantity;app.bag.usedSource='purchases'; if (app.bag.source === 'unknown') app.bag.source = 'inferred'; }
  }
  app.bag.free = app.bag.total !== null && app.bag.used !== null ? Math.max(0, app.bag.total - app.bag.used) : null;
  const trip = app.travelSession;
  if (trip && t.homeConfirmedAt && now - t.homeConfirmedAt >= 15000 && (!app.logAccess || (trip.logsComplete && trip.logsCheckedAt !== null && trip.logsCheckedAt >= t.homeConfirmedAt))) {
    archiveTrip(app, now);
    app.travelSession = null; app.tripProfit = null; app.previewCountry = null;
    app.travel = { ...t, state: 'AT_HOME', originCountry: 'Torn', destinationCountry: 'Torn', marketContextCountry: null, pendingReturn: false };
    app.bag.used = 0; app.bag.free = app.bag.total;
  }
}
function archiveTrip(app: TravelApp, now: number): void {
  const trip=app.travelSession; if(!trip)return;
  app.tripProfit=tripProfit(trip,app,now);trip.estimatedProfit=app.tripProfit.estimatedProfit;
  trip.marketPricesAtFinalization=app.tripProfit.rows.flatMap(r=>app.marketPrices[r.itemId]?[structuredClone(app.marketPrices[r.itemId]!)]:[]);
  trip.finalizedAt=now;
  trip.finalization=trip.logsComplete && trip.logsCheckedAt!==null && trip.logsCheckedAt>=(trip.inbound.departedAt??now) ? 'complete' : 'incomplete-evidence';
  app.history=[structuredClone(trip),...app.history.filter(h=>h.tripId!==trip.tripId)].filter(h=>h.finalizedAt!==null&&now-h.finalizedAt<90*86400000).slice(0,100);
  app.travelSession=null;app.tripProfit=null;
}
export function mergeSnapshot(previous: Snapshot | undefined, fresh: Snapshot, app: TravelApp, now: number): Snapshot {
  const byId = new Map((previous?.stocks ?? []).map(s => [`${s.country}:${s.itemId}`, s]));
  for (const stock of fresh.stocks) {
    const old = byId.get(`${stock.country}:${stock.itemId}`);
    const newerStock = stock.stock !== null && stock.observedAt !== null && (!old?.observedAt || stock.observedAt >= old.observedAt);
    const newerPrice = stock.tornValue !== null && stock.priceObservedAt && (!old?.priceObservedAt || stock.priceObservedAt >= old.priceObservedAt);
    byId.set(`${stock.country}:${stock.itemId}`, { ...old, ...stock, cost: old?.costObservedAt && (!stock.costObservedAt || old.costObservedAt>stock.costObservedAt) ? old.cost : stock.cost ?? old?.cost, costObservedAt: Math.max(old?.costObservedAt??0,stock.costObservedAt??0)||null, stock: newerStock ? stock.stock : old?.stock ?? stock.stock,
      observedAt: newerStock ? stock.observedAt : old?.observedAt ?? stock.observedAt,
      tornValue: newerPrice ? stock.tornValue : old?.tornValue ?? stock.tornValue, priceObservedAt: newerPrice ? stock.priceObservedAt : old?.priceObservedAt ?? stock.priceObservedAt,
      restock: stock.restock.kind === 'unknown' && old?.restock.kind !== 'unknown' ? old?.restock ?? stock.restock : stock.restock });
  }
  const snapshot = { ...fresh, travelApp: app, stocks: [...byId.values()], war: fresh.issues?.war ? previous?.war ?? fresh.war : fresh.war, chain: fresh.issues?.chain ? previous?.chain ?? fresh.chain : fresh.chain };
  mergePrices(app, snapshot.stocks);
  const t = app.travel;
  snapshot.travel = { active: t.state !== 'AT_HOME', origin: t.originCountry || 'Torn', destination: t.destinationCountry || 'Unknown destination',
    arrivesAt: t.arrivalAt, departedAt: t.departedAt, state: t.state, capacity: app.bag.total, observedAt: t.observedAt ?? undefined };
  app.quality = Object.keys(fresh.issues ?? {}).some(k => ['profile', 'travel', 'prices', 'inventory'].includes(k) || k==='stocks'&&fresh.stockProvider!=='off') ? (previous ? 'error-with-cache' : 'error-without-cache') : 'fresh';
  app.refreshedAt = now; return snapshot;
}
export function historyTotals(app: TravelApp, now: number) {
  const trips = app.history.filter(t => t.finalizedAt && now - t.finalizedAt <= 30 * 86400000), plans = trips.map(t => ({ trip: t, profit: tripProfit(t, app, now) }));
  const spent = plans.reduce((n, p) => n + (p.profit.spent ?? 0), 0), value = plans.reduce((n, p) => n + (p.profit.marketValue ?? 0), 0);
  const profit = plans.reduce((n, p) => n + (p.profit.estimatedProfit ?? 0), 0), timed = plans.filter(p=>p.profit.roundTripMs && p.profit.estimatedProfit !== null), duration = timed.reduce((n,p)=>n+p.profit.roundTripMs!,0), timedProfit = timed.reduce((n,p)=>n+p.profit.estimatedProfit!,0);
  const country = new Map<string, number>(), item = new Map<string, number>();
  for (const p of plans) { country.set(p.trip.country, (country.get(p.trip.country) ?? 0) + (p.profit.estimatedProfit ?? 0)); for (const r of p.profit.rows) item.set(r.name, (item.get(r.name) ?? 0) + (r.profit ?? 0)); }
  return { trips: trips.length, spent, value, estimatedProfit: profit, actualProfit: plans.some(p => p.profit.actualProfit !== null) ? plans.reduce((n, p) => n + (p.profit.actualProfit ?? 0), 0) : null,
    bestCountry: [...country].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, bestItem: [...item].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, profitPerHour: duration ? timedProfit / (duration / 3600000) : null };
}
