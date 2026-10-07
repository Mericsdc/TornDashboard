/** Worker-only fixed endpoints. Keys are never included in snapshots or sent to stock providers. */
import { z } from 'zod';
import { canonicalCountry, nextChainBonus, currentChain, estimateRestock, SnapshotSchema, type Snapshot, type StockItem, type StockObservation, type TravelApp, type TravelObservation, type InventorySnapshot, type Purchase, type ResourceBars } from '@tcd/shared';
import { requestTorn, TornError } from './torn-connection';
export { TornError } from './torn-connection';
const num = z.number().finite(), id = num.int().positive(), sec = num.nonnegative().nullable();
const Status = z.object({ state: z.string(), description: z.string().default(''), until: sec.optional() });
const Profile = z.object({ profile: z.object({ id, name: z.string(), level: id, faction_id: id.nullable().optional(), status: Status }) });
const Info = z.object({ info: z.object({ user: z.object({ id, faction_id: id.nullable(), company_id: id.nullable() }), access: z.object({ level: num, type: z.string(), log: z.object({ custom_permissions: z.boolean(), available: z.array(z.object({ category_id: id, log_ids: z.array(id) })) }).optional() }), selections: z.record(z.string(), z.array(z.string())).optional() }) });
const Travel = z.object({ travel: z.object({ destination: z.string(), departed_at: sec, arrival_at: sec, time_left: num.nonnegative(), method: z.string().nullable().optional() }) });
const Chain = z.object({ chain: z.object({ id: num.int(), current: num.nonnegative(), max: num.nonnegative(), timeout: num.nonnegative(), start: num, end: num, cooldown: num.optional() }) });
const Participant = z.object({ id, name: z.string(), score: num.nonnegative() });
const Ranked = z.object({ war_id: id, start: num.nonnegative(), end: sec, target: num.nonnegative(), winner: sec, factions: z.array(Participant).length(2) });
const Wars = z.object({ wars: z.object({ ranked: Ranked.nullable() }) });
// BOSBOT also selects the active entry from ranked-war history. Use v2's documented array contract and header authentication.
const RankedHistory = z.object({rankedwars:z.array(Ranked.omit({war_id:true}).extend({id})).max(100)});
const Members = z.object({ members: z.array(z.object({ id, name: z.string(), level: id, status: Status, last_action: z.object({ status: z.string() }) })).max(200) });
const Items = z.object({ items: z.array(z.object({ id, name: z.string(), type: z.string().optional(), value: z.object({ market_price: num.nonnegative(), shops: z.array(z.object({ country: z.string(), buy_price: sec })).max(50) }) })).max(10000) });
const Links = z.object({ _metadata: z.object({ links: z.object({ next: z.string().nullable().optional() }).optional() }).optional() });
const Inventory = z.object({ inventory: z.object({ timestamp: num.nonnegative(), items: z.array(z.object({ id, amount: num.int().nonnegative(), faction_owned: z.boolean().optional() })).max(250) }) }).extend(Links.shape);
const LogTypes = z.object({ logtypes: z.array(z.object({ id, title: z.string() })).max(3000) });
const Logs = z.object({ log: z.array(z.object({ id: z.string(), timestamp: num.nonnegative(), details: z.object({ id, title: z.string() }), data: z.record(z.string(), z.unknown()) })).max(100) }).extend(Links.shape);
const Bar = z.object({ current: num.nonnegative(), maximum: num.positive(), increment: num.nonnegative(), interval: num.positive(), tick_time: num.nonnegative() });
const Bars = z.object({ bars: z.object({ energy: Bar, nerve: Bar, life: Bar }) });
const Perks = z.object({ perks: z.object({ enhancer: z.array(z.string()).default([]), job: z.array(z.string()).default([]), faction: z.array(z.string()).default([]), book: z.array(z.string()).default([]), property: z.array(z.string()).default([]), education: z.array(z.string()).default([]), stock: z.array(z.string()).default([]), merit: z.array(z.string()).default([]) }) });
const Company = z.object({ profile: z.object({ name: z.string(), director: z.object({ id }) }) });
const Employees = z.object({ employees: z.array(z.object({ id, name: z.string(), effectiveness: z.object({ addiction: num }).optional() })).max(100) });
const Yata = z.object({ stocks: z.record(z.string(), z.object({ update: num.int().nonnegative(), stocks: z.array(z.object({ id, quantity: num.int().min(0).max(10000000), name: z.string().min(1).max(200).optional(), cost: num.positive().optional() })).max(300) })) });
const CODES: Record<string, string> = { mex: 'Mexico', haw: 'Hawaii', sou: 'South Africa', jap: 'Japan', chi: 'China', arg: 'Argentina', swi: 'Switzerland', can: 'Canada', uni: 'United Kingdom', uae: 'UAE', cay: 'Cayman Islands' };
export type RouteHint = { origin: string; destination: string; observedAt: number };
export type KeyInfo = z.infer<typeof Info>['info'];
export function joinStocks(catalog: StockItem[], raw: unknown, now: number, history: Record<string, StockObservation[]>): StockItem[] {
  const data = Yata.parse(raw);
  const products = new Map(catalog.map(item => [`${item.country}:${item.itemId}`, item]));
  // The export supplies country, id, name and cost independently of Torn's price endpoint.
  for (const [code, source] of Object.entries(data.stocks)) {
    const country = Object.hasOwn(CODES,code) ? CODES[code] : undefined; if (!country || source.update * 1000 > now + 30000) continue;
    for (const row of source.stocks) if (row.name && row.cost && !products.has(`${country}:${row.id}`)) products.set(`${country}:${row.id}`, {
      itemId: row.id, country, name: row.name.slice(0,80), cost: row.cost, costObservedAt: source.update * 1000,
      tornValue: null, priceObservedAt: null, stock: null, observedAt: null, restock: {kind:'unknown',reason:'Need at least three observed restocks'}
    });
  }
  return [...products.values()].map(item => {
    const country = Object.keys(CODES).find(code => CODES[code] === item.country), source = country ? data.stocks[country] : undefined;
    const observation = source?.stocks.find(row => row.id === item.itemId), at = source ? source.update * 1000 : 0;
    if (!observation || at > now + 30000) return { ...item, stock: null, observedAt: at && at <= now + 30000 ? at : null };
    const key = `${item.country}:${item.itemId}`, rows = history[key] ||= [];
    if (!rows.some(row => row.observedAt === at)) {
      const row: StockObservation = { itemId: item.itemId, country: item.country, stock: observation.quantity, observedAt: at, source: 'provider' };
      const last=rows.at(-1),before=rows.at(-2);
      // Keep phase boundaries plus the latest reading, rather than storing every positive tick.
      if(last&&before&&(last.stock>0)===(row.stock>0)&&(before.stock>0)===(row.stock>0))rows[rows.length-1]=row;else rows.push(row);
    }
    history[key] = rows.filter(row => now - row.observedAt < 7 * 86400000).slice(-128);
    return { ...item, stock: observation.quantity, observedAt: at, restock: estimateRestock(history[key]!, now) };
  });
}
export class TornApi {
  private cache = new Map<string, { at: number; value: unknown }>();
  private blockedUntil = 0;
  private endpointBackoff = new Map<string, number>();
  private disabled = false;
  private lastForeign: string | null = null;
  info?: KeyInfo;
  travelEvidence?: TravelObservation;
  private catalog: StockItem[] = [];
  private permissionFailures = new Set<string>();
  constructor(private key: string, private request: typeof fetch = fetch, private clock: () => number = Date.now) {}
  private async get<T>(path: string, schema: z.ZodType<T>, ttl: number): Promise<{ value: T; at: number }> {
    const cacheKey = path, selection = cacheKey.split('?')[0]!, cached = this.cache.get(cacheKey), now = this.clock();
    if (this.disabled) throw new TornError('API key was rejected. Replace it in Options.', true);
    if (cached && now - cached.at < ttl) {
      const parsed = schema.safeParse(cached.value);
      if (parsed.success) return {value: parsed.data, at: cached.at};
      this.cache.delete(cacheKey); // An old/incompatible cache must never prevent a fresh read.
    }
    if (this.permissionFailures.has(selection)) throw new TornError('This key does not allow this selection. Check the required permissions in Options.');
    if (now < this.blockedUntil) throw new TornError('Torn rate limit or temporary error. Waiting before retrying.');
    if (now < (this.endpointBackoff.get(selection) ?? 0)) throw new TornError('This selection is temporarily unavailable. Waiting before retrying.');
    let result: Awaited<ReturnType<typeof requestTorn>>;
    try { result = await requestTorn(`${path}${path === 'faction/chain' ? `?timestamp=${Math.floor(now / 1000)}` : ''}`, this.key, this.request); }
    catch (error) { this.endpointBackoff.set(selection, this.clock() + 30000); throw error; }
    const { response, text } = result;
    if (!response.ok) { if(response.status===429)this.blockedUntil=now+60000;else this.endpointBackoff.set(selection, now + 60000); throw new TornError(`Torn API returned HTTP ${response.status}. Retrying later.`); }
    let raw: unknown; try { raw = JSON.parse(text); } catch { throw new TornError('Invalid Torn API response.'); }
    const failure = z.object({ error: z.object({ code: num }) }).safeParse(raw);
    if (failure.success) {
      const code = failure.data.error.code;
      if ([7,16].includes(code)) this.permissionFailures.add(selection);
      if ([2, 13, 18].includes(code)) { this.disabled = true; throw new TornError('API key was rejected. Replace it in Options.', true); }
      if ([5, 8, 9].includes(code)) this.blockedUntil = now + 60000;
      throw new TornError([7,16].includes(code) ? 'This API key does not allow this selection. Use a Minimal key or the required custom permissions.' : `Torn API error ${code}.`);
    }
    const parsed = schema.safeParse(raw); if (!parsed.success) { this.endpointBackoff.set(selection, now + 30000); throw new TornError('Torn response has an unsupported format.'); }
    const age = path === 'faction/chain' ? Math.max(0, Math.min(3600, Number(response.headers.get('age')) || 0)) * 1000 : 0;
    const at = now - age;
    this.cache.set(cacheKey, { at, value: parsed.data }); return { value: parsed.data, at };
  }
  async connect(): Promise<KeyInfo> { this.info = (await this.get('key/info', Info, 300000)).value.info; return this.info; }
  async snapshot(stockProvider: 'off' | 'yata', history: Record<string, StockObservation[]>, hint?: RouteHint): Promise<Snapshot> {
    const info = await this.connect(), now = this.clock(), issues: Record<string, string> = {};
    const s: Snapshot = { source: 'live', provider: 'torn', stockProvider, generatedAt: now, war: null, chain: null, travel: null, company: null, player: { level: null }, targets: [], stocks: [], issues };
    const safe = async <T>(name: string, action: () => Promise<T>): Promise<T | undefined> => { try { return await action(); } catch (error) { if (error instanceof TornError && error.invalidKey) throw error; issues[name] = error instanceof TornError ? error.message : `${name} data is unavailable`; return undefined; } };
    // Shared caches bound requests across all tabs; only the chain uses Torn’s timestamp parameter for a current warning deadline.
    const profile = await safe('profile', () => this.get('user/profile', Profile, 30000));
    if (profile && profile.value.profile.id !== info.user.id) throw new TornError('Torn profile does not match the key owner. Reconnect your personal key.');
    if (profile) s.player.level = profile.value.profile.level;
    const factionId = profile?.value.profile.faction_id === undefined ? info.user.faction_id : profile.value.profile.faction_id;
    s.player.factionId = factionId;
    const travel = await safe('travel', () => this.get('user/travel', Travel, 30000));
    this.travelEvidence = undefined;
    if (profile && travel) {
      const t = travel.value.travel, status = profile.value.profile.status, dest = canonicalCountry(t.destination);
      const active = ['Traveling', 'Abroad'].includes(status.state);
      if (active && dest && dest !== 'Torn') this.lastForeign = dest;
      const route = hint && now - hint.observedAt <= 60000 && now >= hint.observedAt - 30000 && canonicalCountry(hint.destination) === dest ? canonicalCountry(hint.origin) : null;
      // Historical /user/travel values are not proof of a current flight or foreign location.
      const phase = status.state === 'Traveling' ? t.time_left > 0 ? dest === 'Torn' ? 'RETURNING' : 'OUTBOUND' : 'LANDED'
        : status.state === 'Abroad' ? 'ABROAD' : status.state === 'Okay' || dest === 'Torn' ? 'AT_HOME' : null;
      if(phase) this.travelEvidence = { state: phase, originCountry: phase === 'AT_HOME' ? 'Torn' : dest === 'Torn' ? route || this.lastForeign : 'Torn', destinationCountry: phase === 'AT_HOME' ? 'Torn' : dest, departedAt: t.departed_at ? t.departed_at * 1000 : null, arrivalAt: t.arrival_at ? t.arrival_at * 1000 : null, method: t.method ?? null, source: 'api', at: Math.min(profile.at, travel.at) };
      s.travel = { active, destination: dest || 'Unknown destination', origin: dest === 'Torn' ? route || this.lastForeign || 'Unknown origin' : 'Torn', arrivesAt: t.arrival_at ? t.arrival_at * 1000 : null, departedAt: t.departed_at ? t.departed_at * 1000 : null, state: status.state, description: status.description.slice(0,150), observedAt: Math.min(profile.at, travel.at) };
    }
    if (factionId) {
      // Explicit account faction prevents an implicit endpoint from selecting a stale faction context.
      const war = await safe('war', () => this.get(`faction/${factionId}/wars`, Wars, 60000));
      let ranked = war?.value.wars.ranked, warAt = war?.at;
      if (!ranked || ranked.end || ranked.winner || ranked.start * 1000 > now || !ranked.factions.some(f=>f.id===factionId)) {
        const fallback = await safe('warFallback', () => this.get(`faction/${factionId}/rankedwars?limit=20`, RankedHistory, 60000));
        if (fallback) {
          const rows = fallback.value.rankedwars.map(row=>({...row,war_id:row.id})).filter(row=>row.factions.some(f=>f.id===factionId));
          const active = rows.filter(row=>row.start * 1000<=now && !row.end && !row.winner).sort((a,b)=>b.start-a.start || b.war_id-a.war_id)[0];
          if (active || !war) { ranked = active ?? rows.filter(row=>!row.end && !row.winner && row.start*1000>now).sort((a,b)=>a.start-b.start)[0] ?? null; warAt=fallback.at; delete issues.war; }
          delete issues.warFallback;
        } else if (issues.war) { issues.war = `Both Torn war selections failed: ${issues.war} Ranked list: ${issues.warFallback}`.slice(0,200); delete issues.warFallback; }
        // A valid current-war response remains usable, but expose a failed history cross-check in Options.
      }
      const chain = await safe('chain', () => this.get('faction/chain', Chain, 15000));
      if (chain) { const c = chain.value.chain; s.chain = currentChain({ id: c.id > 0 ? c.id : null, count: c.current, goal: nextChainBonus(c.current), expiresAt: c.current > 0 && c.timeout > 0 && !c.end ? chain.at + c.timeout * 1000 : null, startedAt: c.start ? c.start * 1000 : null, observedAt: chain.at, source: 'api', status: c.current > 0 && c.timeout > 0 && !c.end ? 'active' : c.current > 0 ? 'ended' : c.cooldown && c.cooldown * 1000 > now ? 'cooldown' : 'inactive' }, now); }
      if (ranked && warAt !== undefined) {
        const enemy = ranked.factions.find(f => f.id !== factionId), own = ranked.factions.find(f => f.id === factionId);
        if (!own) { issues.war = 'Torn returned a war for another faction. Saved war data is retained.'; }
        else {
          const active = ranked.start * 1000 <= now && !ranked.end && !ranked.winner;
          s.war = { id: ranked.war_id, opponentId: enemy?.id || null, active, opponent: enemy?.name || 'Unknown opponent', score: own.score, enemyScore: enemy?.score ?? null, targetScore: ranked.target, endsAt: ranked.end ? ranked.end * 1000 : null, observedAt: warAt };
          if (active && enemy) {
            const members = await safe('targets', () => this.get(`faction/${enemy.id}/members`, Members, 30000));
            s.targets = members?.value.members.map(member => ({ id: member.id, name: member.name.slice(0,80), level: member.level, status: ['Okay','Hospital','Traveling','Abroad','Federal'].includes(member.status.state) ? member.status.state as 'Okay' : 'Unknown', activity: ['online','idle','offline'].includes(member.last_action.status.toLowerCase()) ? member.last_action.status.toLowerCase() as 'online' : 'unknown', observedAt: members.at, hospitalUntil: member.status.state === 'Hospital' && member.status.until ? member.status.until * 1000 : null, wins: null, losses: null, battleStats: null })) || [];
          }
        }
      }
    }
    const items = await safe('prices', () => this.get('torn/items', Items, 15 * 60000));
    if (items) s.stocks = items.value.items.flatMap(item => item.value.shops.filter(shop => canonicalCountry(shop.country) && shop.country !== 'Torn' && shop.buy_price && shop.buy_price > 0).map(shop => ({ itemId: item.id, name: item.name.slice(0,80), country: canonicalCountry(shop.country)!, cost: shop.buy_price, costObservedAt: items.at, tornValue: item.value.market_price || null, priceObservedAt: items.at, stock: null, observedAt: null, restock: { kind: 'unknown' as const, reason: 'Need at least three observed restocks' } })));
    if (stockProvider === 'yata') {
      await safe('stocks', async () => {
        const cached = this.cache.get('yata'); let raw: unknown;
        if (cached && now - cached.at < 30000) raw = cached.value;
        else { const response = await this.request('https://yata.yt/api/v1/travel/export/', { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new TornError('YATA stock observations are unavailable'); const text = await response.text(); if (text.length > 2*1024*1024) throw new TornError('YATA response exceeded the size limit'); raw = Yata.parse(JSON.parse(text)); this.cache.set('yata', { at: now, value: raw }); }
        s.stocks = joinStocks(s.stocks, raw, now, history);
        if (items) for (const stock of s.stocks) {
          const price = items.value.items.find(item=>item.id===stock.itemId)?.value.market_price;
          if (price && price>0) { stock.tornValue=price; stock.priceObservedAt=items.at; }
        }
      });
    } else issues.stocks = 'Enable YATA shared stock observations in Options. Torn API provides prices, but no foreign live stock.';
    this.catalog = s.stocks;
    if (info.user.company_id) {
      const company = await safe('company', () => this.get('company/profile', Company, 300000));
      if (company && company.value.profile.director.id === info.user.id) {
        const employees = await safe('company', () => this.get('company/employees', Employees, 60000));
        s.company = { isDirector: true, name: company.value.profile.name.slice(0,100), observedAt: employees?.at || company.at, employees: employees?.value.employees.map(e => ({ id: e.id, name: e.name.slice(0,80), addictionEffect: e.effectiveness?.addiction ?? null })) || [] };
      }
    }
    return SnapshotSchema.parse(s);
  }

  exportCache(): [string, { at: number; value: unknown }][] {
    return [...this.cache].filter(([path]) => !path.startsWith('user/log?')).slice(-80);
  }
  restoreCache(rows: unknown): void {
    if (!Array.isArray(rows)) return;
    for (const entry of rows.slice(-80)) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || entry[0] === 'key/info') continue;
      const item = entry[1] as { at?: unknown; value?: unknown } | undefined;
      if (!item || typeof item.at !== 'number' || !Number.isFinite(item.at) || item.at > this.clock() + 30000) continue;
      // Every restored value is validated by its endpoint schema before it can be used.
      this.cache.set(entry[0], { at: item.at, value: item.value });
    }
  }
  async travelData(app: TravelApp): Promise<{ inventories: InventorySnapshot[]; purchases: Purchase[]; bars?: ResourceBars; capacity?: number; logsComplete: boolean; logsCheckedAt: number | null; logAccess: boolean; issues: Record<string, string> }> {
    const now = this.clock(), info = await this.connect(), trip = app.travelSession;
    const result: Awaited<ReturnType<TornApi['travelData']>> = { inventories: [], purchases: [], logsComplete: false, logsCheckedAt: null,
      logAccess: info.access.type.toLowerCase() === 'full' || Boolean(info.selections?.user?.includes('log')) || Boolean(info.access.log?.available.some(c=>c.log_ids.includes(4201))), issues: {} };
    if (!trip) return result;
    const safe = async <T>(name: string, work: () => Promise<T>): Promise<T | undefined> => { try { return await work(); } catch (error) { if (error instanceof TornError && error.invalidKey) throw error; result.issues[name] = name === 'purchases' ? 'Purchase records are temporarily unavailable; your saved trip is retained.' : `${name} is temporarily unavailable; last known data is retained.`; return undefined; } };
    const cachedCatalog = Items.safeParse(this.cache.get('torn/items')?.value), catalog = cachedCatalog.success ? cachedCatalog.data : undefined;
    const products = new Map<number,{itemId:number;name:string}>(trip.marketSnapshot.map(item=>[item.itemId,item]));
    for(const item of this.catalog)if(item.country===trip.country)products.set(item.itemId,item);
    const relevant = [...products.values()].map(item=>({id:item.itemId,name:item.name,type:catalog?.items.find(p=>p.id===item.itemId)?.type}));
    const categories = [...new Set(relevant.map(item => item.type || (item.name.endsWith(' Plushie') ? 'Plushie' : /flower|orchid|omanense|peony|edelweiss/i.test(item.name) ? 'Flower' : null)).filter((v): v is string => Boolean(v)))].slice(0, 8);
    const combined: InventorySnapshot = { items: {}, coveredIds: [], observedAt: now, source: 'api', kind: 'inventory', complete: true };
    for (const category of categories) {
      const rows = relevant.filter(item => item.type === category || (!item.type && (category === 'Plushie' ? item.name.endsWith(' Plushie') : !item.name.endsWith(' Plushie'))));
      let complete = false;
      for (let page = 0; page < 4; page++) {
        const inventory = await safe('inventory', () => this.get(`user/inventory?cat=${encodeURIComponent(category)}&limit=250&offset=${page * 250}`, Inventory, 3600000));
        if (!inventory) break;
        combined.observedAt = Math.min(combined.observedAt, inventory.value.inventory.timestamp * 1000);
        for (const item of inventory.value.inventory.items) if (!item.faction_owned && rows.some(r => r.id === item.id)) combined.items[item.id] = (combined.items[item.id] ?? 0) + item.amount;
        if (!inventory.value._metadata?.links?.next) { complete = true; break; }
      }
      if (complete) combined.coveredIds.push(...rows.map(r => r.id)); else combined.complete = false;
    }
    if (combined.coveredIds.length) result.inventories.push(combined);
    const bars = await safe('bars', () => this.get('user/bars', Bars, 60000));
    if (bars) {
      const convert = (b: z.infer<typeof Bar>) => ({ current: b.current, maximum: b.maximum, increment: b.increment, interval: b.interval,
        nextTickAt: b.tick_time <= b.interval ? bars.at + b.tick_time * 1000 : b.tick_time * 1000 >= bars.at - b.interval * 1000 && b.tick_time * 1000 <= bars.at + b.interval * 1000 ? b.tick_time * 1000 : null, observedAt: bars.at });
      result.bars = { energy: convert(bars.value.bars.energy), nerve: convert(bars.value.bars.nerve), life: convert(bars.value.bars.life) };
    }
    if (!app.knownCapacity || app.knownCapacity.method && app.travel.method && app.knownCapacity.method !== app.travel.method) {
      const perks = await safe('capacity', () => this.get('user/perks', Perks, 15 * 60000));
      if (perks && app.travel.method) {
        const texts = Object.values(perks.value.perks).flat(), bonuses = texts.filter(t => /travel.*(?:items|capacity)/i.test(t) && !/flower|plush|double|%/i.test(t));
        if (!texts.some(t => /double.*travel|travel.*(?:double|%)/i.test(t))) result.capacity = Math.min(100, 10 + (app.travel.method === 'Standard' ? 0 : 5) + bonuses.reduce((n, text) => n + Number(text.match(/\+?\s*(\d+)/)?.[1] ?? 0), 0));
      }
    }
    if (!result.logAccess) { result.issues.purchases = 'Automatic purchase logs need a Full key or custom user/log access. Visible successful purchases are still tracked.'; return result; }
    const types = await safe('purchases', () => this.get('torn/logtypes', LogTypes, 86400000));
    const logId = types?.value.logtypes.find(type => /^item abroad buy$/i.test(type.title))?.id ?? 4201;
    if (info.access.log?.custom_permissions && !info.access.log.available.some(category => category.log_ids.includes(logId))) { result.logAccess = false; result.issues.purchases = 'Allow Item abroad buy in this key’s custom log permissions.'; return result; }
    const from = Math.floor((trip.outbound.departedAt ?? trip.startedAt) / 1000), base = `user/log?log=${logId}&from=${from}&limit=100`;
    let path = base;
    for (let page = 0; page < 3; page++) {
      const logs = await safe('purchases', () => this.get(path, Logs, 60000)); if (!logs) { if(this.permissionFailures.has('user/log')) result.logAccess=false; break; }
      for (const log of logs.value.log) {
        if (log.details.id !== logId) continue;
        const itemId = Number(log.data.item), quantity = Number(log.data.quantity), total = Number(log.data.cost_total), unit = Number(log.data.cost_each);
        if (!Number.isSafeInteger(itemId) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000000 || !relevant.some(item => item.id === itemId)) continue;
        const country = canonicalCountry(typeof log.data.country === 'string' ? log.data.country : null) || trip.country;
        result.purchases.push({ id: `log/${log.id}`, itemId, country, quantity, observedAt: log.timestamp * 1000, source: 'api-log',
          totalCost: Number.isFinite(total) && total > 0 ? total : Number.isFinite(unit) && unit > 0 ? unit * quantity : null, unitCost: Number.isFinite(unit) && unit > 0 ? unit : Number.isFinite(total) && total > 0 ? total / quantity : null,
          costSource: Number.isFinite(total) && total > 0 || Number.isFinite(unit) && unit > 0 ? 'receipt' : 'unknown' });
      }
      const next = logs.value._metadata?.links?.next;
      if (!next) { result.logsComplete = true; result.logsCheckedAt = logs.at; break; }
      try { const url = new URL(next); if (url.origin !== 'https://api.torn.com' || !/^\/v2\/user\/log\/?$/.test(url.pathname)) break;
        const token = url.searchParams.get('nanostamp'), to = url.searchParams.get('to');
        if (token && /^\d+(?:,\d+)*$/.test(token)) path = `${base}&nanostamp=${encodeURIComponent(token)}`;
        else if (to && /^\d+$/.test(to)) path = `${base}&to=${to}`; else break;
      } catch { break; }
    }
    return result;
  }
}
