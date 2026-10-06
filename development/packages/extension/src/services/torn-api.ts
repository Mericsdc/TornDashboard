/** Worker-only fixed endpoints. Keys are never included in snapshots or sent to stock providers. */
import { z } from 'zod';
import { canonicalCountry, estimateRestock, SnapshotSchema, type Snapshot, type StockItem, type StockObservation } from '@tcd/shared';
import { requestTorn, TornError } from './torn-connection';
export { TornError } from './torn-connection';
const num = z.number().finite(), id = num.int().positive(), sec = num.nonnegative().nullable();
const Status = z.object({ state: z.string(), description: z.string().default(''), until: sec.optional() });
const Profile = z.object({ profile: z.object({ id, name: z.string(), level: id, status: Status }) });
const Info = z.object({ info: z.object({ user: z.object({ id, faction_id: id.nullable(), company_id: id.nullable() }), access: z.object({ level: num, type: z.string() }), selections: z.record(z.string(), z.array(z.string())).optional() }) });
const Travel = z.object({ travel: z.object({ destination: z.string(), departed_at: sec, arrival_at: sec, time_left: num.nonnegative() }) });
const Chain = z.object({ chain: z.object({ id: num.int(), current: num.nonnegative(), max: num.nonnegative(), timeout: num.nonnegative(), start: num, end: num }) });
const Wars = z.object({ wars: z.object({ ranked: z.object({ war_id: id, start: num, end: sec, target: num, winner: id.nullable(), factions: z.array(z.object({ id, name: z.string(), score: num })).max(2) }).nullable() }) });
const Members = z.object({ members: z.array(z.object({ id, name: z.string(), level: id, status: Status, last_action: z.object({ status: z.string() }) })).max(200) });
const Items = z.object({ items: z.array(z.object({ id, name: z.string(), value: z.object({ market_price: num.nonnegative(), shops: z.array(z.object({ country: z.string(), buy_price: sec })).max(50) }) })).max(10000) });
const Company = z.object({ profile: z.object({ name: z.string(), director: z.object({ id }) }) });
const Employees = z.object({ employees: z.array(z.object({ id, name: z.string(), effectiveness: z.object({ addiction: num }).optional() })).max(100) });
const Yata = z.object({ stocks: z.record(z.string(), z.object({ update: num.int().nonnegative(), stocks: z.array(z.object({ id, quantity: num.int().min(0).max(10000000) })).max(300) })) });
const CODES: Record<string, string> = { mex: 'Mexico', haw: 'Hawaii', sou: 'South Africa', jap: 'Japan', chi: 'China', arg: 'Argentina', swi: 'Switzerland', can: 'Canada', uni: 'United Kingdom', uae: 'UAE', cay: 'Cayman Islands' };
export type RouteHint = { origin: string; destination: string; observedAt: number };
export type KeyInfo = z.infer<typeof Info>['info'];
export function joinStocks(catalog: StockItem[], raw: unknown, now: number, history: Record<string, StockObservation[]>): StockItem[] {
  const data = Yata.parse(raw);
  return catalog.map(item => {
    const country = Object.keys(CODES).find(code => CODES[code] === item.country), source = country ? data.stocks[country] : undefined;
    const observation = source?.stocks.find(row => row.id === item.itemId), at = source ? source.update * 1000 : 0;
    if (!observation || at > now + 30000 || at < now - 180000) return { ...item, stock: null, observedAt: at && at <= now + 30000 ? at : null };
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
  private disabled = false;
  private lastForeign: string | null = null;
  info?: KeyInfo;
  constructor(private key: string, private request: typeof fetch = fetch, private clock: () => number = Date.now) {}
  private async get<T>(path: string, schema: z.ZodType<T>, ttl: number): Promise<{ value: T; at: number }> {
    const cached = this.cache.get(path), now = this.clock();
    if (this.disabled) throw new TornError('API key was rejected. Replace it in Options.', true);
    if (now < this.blockedUntil) throw new TornError('Torn rate limit or temporary error. Waiting before retrying.');
    if (cached && now - cached.at < ttl) return { value: schema.parse(cached.value), at: cached.at };
    let result: Awaited<ReturnType<typeof requestTorn>>;
    try { result = await requestTorn(`${path}${path === 'faction/chain' ? `?timestamp=${Math.floor(now / 1000)}` : ''}`, this.key, this.request); }
    catch (error) { this.blockedUntil = this.clock() + 30000; throw error; }
    const { response, text } = result;
    if (!response.ok) { this.blockedUntil = now + 60000; throw new TornError(`Torn API returned HTTP ${response.status}. Retrying later.`); }
    let raw: unknown; try { raw = JSON.parse(text); } catch { throw new TornError('Invalid Torn API response.'); }
    const failure = z.object({ error: z.object({ code: num }) }).safeParse(raw);
    if (failure.success) {
      const code = failure.data.error.code;
      if ([2, 13, 18].includes(code)) { this.disabled = true; throw new TornError('API key was rejected. Replace it in Options.', true); }
      if ([5, 8, 9].includes(code)) this.blockedUntil = now + 60000;
      throw new TornError(code === 16 ? 'This API key does not allow this selection. Use a Minimal key or the required custom permissions.' : `Torn API error ${code}.`);
    }
    const parsed = schema.safeParse(raw); if (!parsed.success) throw new TornError('Torn response has an unsupported format.');
    this.cache.set(path, { at: now, value: parsed.data }); return { value: parsed.data, at: now };
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
    const travel = await safe('travel', () => this.get('user/travel', Travel, 30000));
    if (profile && travel) {
      const t = travel.value.travel, status = profile.value.profile.status, dest = canonicalCountry(t.destination);
      const active = ['Traveling', 'Abroad'].includes(status.state);
      if (active && dest && dest !== 'Torn') this.lastForeign = dest;
      const route = hint && now - hint.observedAt <= 60000 && now >= hint.observedAt - 30000 && canonicalCountry(hint.destination) === dest ? canonicalCountry(hint.origin) : null;
      s.travel = { active, destination: dest || 'Unknown destination', origin: dest === 'Torn' ? route || this.lastForeign || 'Unknown origin' : 'Torn', arrivesAt: t.arrival_at ? t.arrival_at * 1000 : null, departedAt: t.departed_at ? t.departed_at * 1000 : null, state: status.state, description: status.description.slice(0,150), observedAt: Math.min(profile.at, travel.at) };
    }
    if (info.user.faction_id) {
      const war = await safe('war', () => this.get('faction/wars', Wars, 60000)), chain = await safe('chain', () => this.get('faction/chain', Chain, 15000));
      if (chain) { const c = chain.value.chain; s.chain = { id: c.id > 0 ? c.id : null, count: c.current, goal: [10,25,50,100,250,500,1000,2500,5000,10000,25000,50000,100000].find(n => n > c.current) || Math.max(c.current,1), expiresAt: c.current > 0 && c.timeout > 0 ? chain.at + c.timeout * 1000 : null, startedAt: c.start ? c.start * 1000 : null, observedAt: chain.at }; }
      const ranked = war?.value.wars.ranked;
      if (ranked && war) {
        const enemy = ranked.factions.find(f => f.id !== info.user.faction_id), own = ranked.factions.find(f => f.id === info.user.faction_id);
        const active = ranked.start * 1000 <= now && !ranked.end && !ranked.winner;
        s.war = { id: ranked.war_id, opponentId: enemy?.id || null, active, opponent: enemy?.name || 'Unknown opponent', score: own?.score ?? null, enemyScore: enemy?.score ?? null, targetScore: ranked.target, endsAt: ranked.end ? ranked.end * 1000 : null, observedAt: war.at };
        if (active && enemy) {
          const members = await safe('targets', () => this.get(`faction/${enemy.id}/members`, Members, 30000));
          s.targets = members?.value.members.map(member => ({ id: member.id, name: member.name.slice(0,80), level: member.level, status: ['Okay','Hospital','Traveling','Abroad','Federal'].includes(member.status.state) ? member.status.state as 'Okay' : 'Unknown', activity: ['online','idle','offline'].includes(member.last_action.status.toLowerCase()) ? member.last_action.status.toLowerCase() as 'online' : 'unknown', observedAt: members.at, hospitalUntil: member.status.state === 'Hospital' && member.status.until ? member.status.until * 1000 : null, wins: null, losses: null, battleStats: null })) || [];
        }
      }
    }
    const items = await safe('prices', () => this.get('torn/items', Items, 3600000));
    if (items) s.stocks = items.value.items.flatMap(item => item.value.shops.filter(shop => canonicalCountry(shop.country) && shop.country !== 'Torn' && shop.buy_price && shop.buy_price > 0).map(shop => ({ itemId: item.id, name: item.name.slice(0,80), country: canonicalCountry(shop.country)!, cost: shop.buy_price, tornValue: item.value.market_price || null, priceObservedAt: items.at, stock: null, observedAt: null, restock: { kind: 'unknown' as const, reason: 'Need at least three observed restocks' } })));
    if (stockProvider === 'yata') {
      await safe('stocks', async () => {
        const cached = this.cache.get('yata'); let raw: unknown;
        if (cached && now - cached.at < 30000) raw = cached.value;
        else { const response = await this.request('https://yata.yt/api/v1/travel/export/', { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new TornError('YATA stock observations are unavailable'); const text = await response.text(); if (text.length > 2*1024*1024) throw new TornError('YATA response exceeded the size limit'); raw = Yata.parse(JSON.parse(text)); this.cache.set('yata', { at: now, value: raw }); }
        s.stocks = joinStocks(s.stocks, raw, now, history);
      });
    } else issues.stocks = 'Enable YATA shared stock observations in Options. Torn API provides prices, but no foreign live stock.';
    if (info.user.company_id) {
      const company = await safe('company', () => this.get('company/profile', Company, 300000));
      if (company && company.value.profile.director.id === info.user.id) {
        const employees = await safe('company', () => this.get('company/employees', Employees, 60000));
        s.company = { isDirector: true, name: company.value.profile.name.slice(0,100), observedAt: employees?.at || company.at, employees: employees?.value.employees.map(e => ({ id: e.id, name: e.name.slice(0,80), addictionEffect: e.effectiveness?.addiction ?? null })) || [] };
      }
    }
    return SnapshotSchema.parse(s);
  }
}
