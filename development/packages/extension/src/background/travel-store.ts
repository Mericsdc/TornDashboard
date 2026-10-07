import { SnapshotSchema, TravelAppSchema, PurchaseSchema, emptyTravelApp, observeTravel, applyPageTravel, mergePrices, recordInventory, recordPurchase, finalizeDerived, mergeSnapshot, type Snapshot, type PublicState, type Purchase, type PageTravel, type StockObservation, estimateRestock, canonicalCountry, currentChain, pageChain, type ChainObservation } from '@tcd/shared';
import { TornApi } from '../services/torn-api';
import { requireTornAccess, TornError } from '../services/torn-connection';
type Auth = { key: string; userId: number };
type Bundle = { ownerId: number; snapshot: Snapshot; endpointCache: ReturnType<TornApi['exportCache']>; stockHistory: Record<string, StockObservation[]>; pendingReceipts: Purchase[] };
/** One owner-scoped data layer. UI reads cache; API work never occupies the message mutation queue. */
export class TravelDataStore {
  private bundle?: Bundle;
  private refreshing?: Promise<void>;
  private lastAttempt = 0;
  private hydratedApi?: TornApi;
  constructor(private credential: () => Promise<Auth | undefined>, private api: () => TornApi | undefined,
    private commit: (work: () => Promise<void>) => Promise<unknown>, private changed: () => Promise<void>,
    private alerts: (snapshot: Snapshot, state: PublicState, owner: number) => Promise<void>) {}
  reset(): void { this.bundle = undefined; this.lastAttempt = 0; this.hydratedApi = undefined; }
  private async load(auth: Auth): Promise<Bundle> {
    if (this.bundle?.ownerId === auth.userId) return this.bundle;
    const raw = (await chrome.storage.local.get('travelDataV1')).travelDataV1 as Partial<Bundle> | undefined;
    const parsed = SnapshotSchema.safeParse(raw?.snapshot);
    this.bundle = raw?.ownerId === auth.userId && parsed.success && parsed.data.travelApp
      ? { ownerId: auth.userId, snapshot: parsed.data, endpointCache: Array.isArray(raw.endpointCache) ? raw.endpointCache : [],
        stockHistory: raw.stockHistory || {}, pendingReceipts: (raw.pendingReceipts || []).filter(p => PurchaseSchema.safeParse(p).success).slice(-50) }
      : { ownerId: auth.userId, snapshot: { source: 'live', provider: 'torn', generatedAt: 0, war: null, chain: null, travel: null, travelApp: emptyTravelApp(), player: { level: null }, targets: [], stocks: [] }, endpointCache: [], stockHistory: {}, pendingReceipts: [] };
    return this.bundle;
  }
  private async persist(): Promise<void> {
    if (!this.bundle) return;
    TravelAppSchema.parse(this.bundle.snapshot.travelApp);
    // Bound history by both age/count and encoded size, including inventory baselines.
    while (this.bundle.snapshot.travelApp!.history.length && new TextEncoder().encode(JSON.stringify(this.bundle)).length > 4 * 1024 * 1024) this.bundle.snapshot.travelApp!.history.pop();
    await chrome.storage.local.set({ travelDataV1: this.bundle });
  }
  private current(state: PublicState): Snapshot {
    const snapshot = this.bundle!.snapshot, app = snapshot.travelApp!;
    finalizeDerived(app, Date.now(), state.settings.travelCapacityOverride);
    snapshot.chain = currentChain(snapshot.chain, Date.now());
    const t = app.travel;
    snapshot.travel = { active: t.state !== 'AT_HOME', origin: t.originCountry || 'Torn', destination: t.destinationCountry || 'Torn',
      arrivesAt: t.arrivalAt, departedAt: t.departedAt, observedAt: t.observedAt ?? undefined, state: t.state, capacity: app.bag.total };
    if(app.refreshedAt && Date.now()-app.refreshedAt>2*3600000 && !app.quality.startsWith('error'))app.quality='stale';
    if (app.quality === 'fresh' && app.refreshedAt && Date.now() - app.refreshedAt > 90000) app.quality = 'cached';
    return snapshot;
  }
  async read(state: PublicState, revalidate = true): Promise<Snapshot> {
    const auth = await this.credential(); if (!auth) throw new Error('Connect your personal Torn API in Options.');
    await this.load(auth);
    const before = JSON.stringify([this.bundle!.snapshot.travelApp!.travel, this.bundle!.snapshot.travelApp!.history.length]);
    const snapshot = this.current(state);
    if (before !== JSON.stringify([snapshot.travelApp!.travel, snapshot.travelApp!.history.length])) { await this.persist(); await this.changed(); }
    if (revalidate) this.requestRefresh(state);
    return snapshot;
  }
  async chain(state: PublicState, observation: ChainObservation): Promise<Snapshot | null> {
    const auth = await this.credential(); if (!auth) return null;
    await this.load(auth);
    const chain = pageChain(this.bundle!.snapshot.chain, observation, Date.now()); if (!chain) return null;
    this.bundle!.snapshot.chain = chain;
    const snapshot = this.current(state); await this.persist();
    await this.alerts(snapshot, state, auth.userId); await this.changed(); return snapshot;
  }
  async page(state: PublicState, observation: PageTravel): Promise<Snapshot> {
    const auth = await this.credential(); if (!auth) return this.read(state);
    await this.load(auth);
    const snapshot = this.bundle!.snapshot, app = snapshot.travelApp!, now = Date.now();
    applyPageTravel(app, { ...observation, receipt: undefined }, snapshot.stocks, now);
    if (observation.shop && app.travelSession && (!observation.destinationCountry || canonicalCountry(observation.destinationCountry)===app.travelSession.country)) {
      for (const row of observation.shop) {
        const item = snapshot.stocks.find(s => s.country === app.travelSession!.country && s.itemId === row.itemId);
        if (item && row.stock !== null) {
          item.stock=row.stock;item.observedAt=now;if(row.cost!==null&&row.cost>0){item.cost=row.cost;item.costObservedAt=now;}
          const key=`${item.country}:${item.itemId}`,history=this.bundle!.stockHistory[key]||=[];
          history.push({itemId:item.itemId,country:item.country,stock:row.stock,observedAt:now,source:'provider'});
          this.bundle!.stockHistory[key]=history.filter(v=>now-v.observedAt<7*86400000).slice(-128);item.restock=estimateRestock(this.bundle!.stockHistory[key]!,now);
        }
      }
    }
    if (observation.receipt) {
      const receipt: Purchase = { ...observation.receipt, source: observation.receipt.source === 'inventory-corroborated' ? 'inventory-corroborated' : 'page-receipt', id: `page/${observation.receipt.id.slice(0, 100)}`, observedAt: now };
      if (app.travelSession?.marketSnapshot.some(p => p.itemId === receipt.itemId)) recordPurchase(app, receipt);
      else if (!this.bundle!.pendingReceipts.some(p => p.id === receipt.id)) this.bundle!.pendingReceipts.push(receipt);
      this.bundle!.pendingReceipts = this.bundle!.pendingReceipts.slice(-50);
    }
    this.current(state); await this.persist(); await this.changed();
    if (observation.returnIntent || observation.receipt) this.requestRefresh(state, true);
    return snapshot;
  }
  requestRefresh(state: PublicState, force = false): void {
    if (this.refreshing || (!force && Date.now() - this.lastAttempt < 15000)) return;
    this.lastAttempt = Date.now();
    this.refreshing = this.refresh(state).catch(() => undefined).finally(() => { this.refreshing = undefined; });
  }
  private async refresh(state: PublicState): Promise<void> {
    const auth = await this.credential(), api = this.api(); if (!auth || !api) return;
    const bundle = await this.load(auth);
    if (this.hydratedApi !== api) { api.restoreCache(bundle.endpointCache); this.hydratedApi = api; }
    try {
      await requireTornAccess();
      const history = structuredClone(bundle.stockHistory), fresh = await api.snapshot(state.settings.stockProvider, history);
      const prepared = structuredClone(bundle.snapshot.travelApp!);
      if (api.travelEvidence) observeTravel(prepared, api.travelEvidence, Date.now());
      mergePrices(prepared, fresh.stocks);
      const details = await api.travelData(prepared), evidence = api.travelEvidence;
      await this.commit(async () => {
        const active = await this.credential(); if (!active || active.key !== auth.key || this.api() !== api) return;
        const latest = await this.load(active), app = latest.snapshot.travelApp!, now = Date.now();
        if (evidence) observeTravel(app, evidence, now);
        mergePrices(app, fresh.stocks);
        for (const inventory of details.inventories) recordInventory(app, inventory);
        for (const receipt of [...details.purchases, ...latest.pendingReceipts]) recordPurchase(app, receipt);
        latest.pendingReceipts = latest.pendingReceipts.filter(p => !app.travelSession?.purchases.some(r => r.id === p.id) && now - p.observedAt < 86400000).slice(-50);
        if (details.bars) app.bars = details.bars;
        if (details.capacity && app.bag.source !== 'page') { app.bag.total = details.capacity; app.bag.source = 'inferred'; app.bag.exact = false; }
        app.logAccess = details.logAccess;
        if (app.travelSession) { app.travelSession.logsCheckedAt = details.logsCheckedAt ?? app.travelSession.logsCheckedAt; app.travelSession.logsComplete = details.logsComplete || app.travelSession.logsComplete; }
        app.notice = details.issues.purchases ?? null;
        fresh.issues = { ...fresh.issues, ...details.issues };
        latest.snapshot = mergeSnapshot(latest.snapshot, fresh, app, now);
        latest.stockHistory = Object.fromEntries([...new Set([...Object.keys(history),...Object.keys(latest.stockHistory)])].map(key=>[key,[...new Map([...(history[key]||[]),...(latest.stockHistory[key]||[])].map(v=>[v.observedAt,v])).values()].sort((a,b)=>a.observedAt-b.observedAt).filter(v=>now-v.observedAt<7*86400000).slice(-128)])); latest.endpointCache = api.exportCache();
        this.current(state); await this.persist(); await this.alerts(latest.snapshot, state, auth.userId); await this.changed();
      });
    } catch (error) {
      await this.commit(async () => {
        const active = await this.credential(); if (!active || active.key !== auth.key || this.api() !== api) return;
        const latest = await this.load(active), app = latest.snapshot.travelApp!;
        latest.snapshot.issues = {...latest.snapshot.issues, connection: error instanceof TornError ? error.message.slice(0,200) : 'Data refresh did not complete. Retry from Options.'};
        app.quality = app.refreshedAt ? 'error-with-cache' : 'error-without-cache';
        app.notice = app.refreshedAt ? 'Showing saved travel data. Reconnecting…' : 'Waiting for travel data…';
        this.current(state); await this.persist(); await this.changed();
      });
    }
  }
}
