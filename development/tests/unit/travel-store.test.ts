import {afterEach,describe,it,expect,vi} from 'vitest';
import {emptyTravelApp,defaultState,observeTravel,mergePrices,recordPurchase,type Snapshot,type StockItem} from '@tcd/shared';
import {TravelDataStore} from '../../packages/extension/src/background/travel-store';
import type {TornApi} from '../../packages/extension/src/services/torn-api';
const now=1800000000000;
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function setup(){
  vi.spyOn(Date,'now').mockReturnValue(now);
  const app=emptyTravelApp();observeTravel(app,{state:'ABROAD',destinationCountry:'Japan',departedAt:now-600000,source:'api',at:now-1000},now);
  const item:StockItem={itemId:1,name:'Monkey Plushie',country:'Japan',cost:10000,tornValue:40000,priceObservedAt:now-60000,stock:18,observedAt:now-60000,restock:{kind:'unknown',reason:'Need observations'}};mergePrices(app,[item]);
  recordPurchase(app,{id:'log/one',itemId:1,country:'Japan',quantity:2,unitCost:10000,totalCost:20000,costSource:'receipt',observedAt:now-500,source:'api-log'});observeTravel(app,{state:'RETURNING',originCountry:'Japan',destinationCountry:'Torn',departedAt:now,arrivalAt:now+600000,source:'api',at:now},now);app.refreshedAt=now-60000;app.quality='cached';
  const snapshot:Snapshot={source:'live',provider:'torn',generatedAt:now-60000,travelApp:app,travel:null,stocks:[item],war:null,chain:null,player:{level:40},targets:[]};
  const raw:Record<string,unknown>={travelDataV1:{ownerId:55,snapshot,endpointCache:[],stockHistory:{},pendingReceipts:[]}};
  vi.stubGlobal('chrome',{permissions:{contains:vi.fn().mockResolvedValue(true)},storage:{local:{get:async(name:string)=>structuredClone({[name]:raw[name]}),set:async(values:Record<string,unknown>)=>{Object.assign(raw,structuredClone(values));}}}});
  let auth={key:'TESTONLYKEY12345',userId:55},release:((value:Snapshot)=>void)|undefined;
  const api={restoreCache:vi.fn(),exportCache:()=>[],snapshot:vi.fn(async()=>new Promise<Snapshot>(resolve=>{release=resolve;})),travelData:vi.fn(async()=>({inventories:[],purchases:[],logsComplete:false,logsCheckedAt:null,logAccess:false,issues:{}}))} as unknown as TornApi;
  const changed=vi.fn().mockResolvedValue(undefined),alerts=vi.fn().mockResolvedValue(undefined),store=new TravelDataStore(async()=>auth,()=>api,async task=>task(),changed,alerts);
  return{store,raw,api,changed,alerts,snapshot,setAuth:(id:number)=>{auth={key:'OTHERTESTKEY1234',userId:id};},release:(s:Snapshot)=>release!(s)};
}
describe('owner-scoped cache-first travel data layer',()=>{
  it('persists native chain correction and rejects a delayed API revival after native expiry',async()=>{
    const s=setup(),state=defaultState();await s.store.read(state,false);
    const before={id:42,count:4,goal:10,expiresAt:now+15000,observedAt:now,source:'api' as const};
    const corrected=await s.store.chain(state,{count:4,goal:10,remaining:12,at:now});expect(corrected?.chain?.expiresAt).toBe(now+12000);
    await s.store.read(state);await vi.waitFor(()=>expect(s.api.snapshot).toHaveBeenCalledTimes(1));
    await s.store.chain(state,{count:0,goal:10,remaining:0,at:now});
    s.release({...s.snapshot,chain:before});await vi.waitFor(()=>expect(s.alerts.mock.calls.length).toBeGreaterThan(2));
    s.store.reset();const resumed=await s.store.read(state,false);expect(resumed.chain).toMatchObject({count:0,status:'ended',source:'page'});
  });
  it('returns cached state before revalidation and coalesces concurrent reads across tabs',async()=>{
    const s=setup(),state=defaultState();const first=await s.store.read(state);expect(first.travelApp?.travel).toMatchObject({state:'RETURNING',originCountry:'Japan',marketContextCountry:'Japan'});expect(first.travelApp?.tripProfit?.estimatedProfit).toBe(60000);
    await s.store.read(state);await s.store.read(state);await vi.waitFor(()=>expect(s.api.snapshot).toHaveBeenCalledTimes(1));
    s.release({...s.snapshot,stocks:[],issues:{prices:'failed',stocks:'failed'}});await vi.waitFor(()=>expect(s.changed).toHaveBeenCalled());expect((await s.store.read(state,false)).stocks[0]?.tornValue).toBe(40000);
  });
  it('keeps the complete session during partial provider failure and preserves it when the worker is recreated',async()=>{
    const s=setup();vi.mocked(s.api.snapshot).mockRejectedValue(new Error('PRIVATE_PROVIDER_DETAIL'));await s.store.read(defaultState());await vi.waitFor(()=>expect(s.changed).toHaveBeenCalled());
    s.store.reset();const cached=await s.store.read(defaultState(),false);expect(cached.travelApp?.quality).toBe('error-with-cache');expect(cached.travelApp?.travelSession?.purchases).toHaveLength(1);expect(cached.travelApp?.travel.marketContextCountry).toBe('Japan');expect(JSON.stringify(cached)).not.toContain('PRIVATE_PROVIDER_DETAIL');
  });
  it('never exposes one owner’s trip when a different account connects',async()=>{
    const s=setup();await s.store.read(defaultState(),false);s.setAuth(77);s.store.reset();const next=await s.store.read(defaultState(),false);expect(next.travelApp?.travelSession).toBeNull();expect(next.travelApp?.marketPrices).toEqual({});expect(next.stocks).toEqual([]);expect(next.travelApp?.history).toEqual([]);
  });
  it('retains the same trip when an unrelated country or late shop response arrives during return',async()=>{
    const s=setup();const data=await s.store.page(defaultState(),{state:'ABROAD',destinationCountry:'Japan',shop:[{itemId:1,stock:14,cost:10000}]});expect(data.travelApp?.travel.state).toBe('RETURNING');expect(data.stocks[0]?.stock).toBe(14);
    const unrelated=await s.store.page(defaultState(),{state:'ABROAD',destinationCountry:'UAE'});expect(unrelated.travelApp?.travelSession?.country).toBe('Japan');
  });
});
