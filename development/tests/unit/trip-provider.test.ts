import {describe,it,expect,vi} from 'vitest';
import {emptyTravelApp,observeTravel,mergePrices,recordPurchase,tripProfit,type StockItem} from '@tcd/shared';
import {TornApi} from '../../packages/extension/src/services/torn-api';
const base=1800000000000;
function setup(overrides:Record<string,unknown>={}){
  let time=base;
  const payload:Record<string,unknown>={
    'key/info':{info:{user:{id:55,faction_id:null,company_id:null},access:{type:'Full',level:4},selections:{user:['log']}}},
    'user/profile':{profile:{id:55,name:'Fixture',level:40,status:{state:'Abroad',description:'In Japan'}}},
    'user/travel':{travel:{destination:'Japan',method:'Airstrip',departed_at:base/1000-300,arrival_at:base/1000-1,time_left:0}},
    'torn/items':{items:[{id:1,name:'Monkey Plushie',type:'Plushie',value:{market_price:40000,shops:[{country:'Japan',buy_price:10000}]}},{id:2,name:'Cherry Blossom',type:'Flower',value:{market_price:14000,shops:[{country:'Japan',buy_price:1000}]}}]},
    'user/inventory':{inventory:{timestamp:base/1000-500,items:[{id:1,amount:2,faction_owned:false},{id:1,amount:99,faction_owned:true}]},_metadata:{links:{next:null},total:2}},
    'user/bars':{bars:Object.fromEntries(['energy','nerve','life'].map(key=>[key,{current:100,maximum:150,increment:5,interval:300,tick_time:180}]))},
    'user/perks':{perks:{enhancer:['+4 travel items'],job:['+10 travel capacity'],faction:[],book:[],property:[],education:[],stock:[],merit:[]}},
    'torn/logtypes':{logtypes:[{id:4201,title:'Item abroad buy'}]},
    'user/log':{log:[{id:'stable',timestamp:base/1000,details:{id:4201,title:'Item abroad buy'},data:{item:1,quantity:29,cost_each:10000,cost_total:290000}}],_metadata:{links:{next:null}}},...overrides
  };
  const request=vi.fn<typeof fetch>(async(input,options)=>{const u=new URL(String(input));expect(u.hostname).toBe('api.torn.com');expect(u.searchParams.has('key')).toBe(false);expect(new Headers(options?.headers).get('authorization')).toBe('ApiKey TESTONLYKEY12345');return new Response(JSON.stringify(payload[u.pathname.replace('/v2/','')]));});
  const api=new TornApi('TESTONLYKEY12345',request,()=>time);return{api,request,payload,tick:(n:number)=>{time+=n;}};
}
async function active(api:TornApi){const snapshot=await api.snapshot('off',{}),app=emptyTravelApp();observeTravel(app,api.travelEvidence!,base);mergePrices(app,snapshot.stocks);return app;}
describe('real travel provider contracts and rate-bound cache',()=>{
  it('uses cached inventory timestamp, excludes faction items and imports actual foreign purchase logs',async()=>{
    const{api,request,tick}=setup(),app=await active(api),first=await api.travelData(app);
    expect(first.inventories[0]?.items[1]).toBe(2);expect(first.inventories[0]?.observedAt).toBe(base-500000);expect(first.logsComplete).toBe(true);expect(first.purchases[0]).toMatchObject({id:'log/stable',itemId:1,quantity:29,totalCost:290000,source:'api-log'});expect(first.capacity).toBe(29);expect(first.bars?.energy.nextTickAt).toBe(base+180000);
    first.purchases.forEach(p=>recordPurchase(app,p));expect(tripProfit(app.travelSession!,app,base).estimatedProfit).toBe(870000);
    const calls=request.mock.calls.length;await api.travelData(app);expect(request.mock.calls).toHaveLength(calls);
    tick(120000);await api.travelData(app);expect(request.mock.calls.filter(([u])=>String(u).includes('/user/inventory'))).toHaveLength(2); // One per covered category, not per UI tick.
    expect(request.mock.calls.filter(([u])=>String(u).includes('/user/log?'))).toHaveLength(2);
  });
  it('restores endpoint caches after worker suspension but revalidates key permissions and never persists raw logs',async()=>{
    const first=setup(),app=await active(first.api);await first.api.travelData(app);const rows=first.api.exportCache();expect(rows.some(([p])=>p.startsWith('user/log?'))).toBe(false);
    const next=setup();next.api.restoreCache(rows);await next.api.snapshot('off',{});await next.api.travelData(app);
    expect(next.request.mock.calls.some(([u])=>String(u).includes('/user/inventory'))).toBe(false);expect(next.request.mock.calls.some(([u])=>String(u).includes('/key/info'))).toBe(true);
  });
  it('does not request purchase logs for a Minimal key or a custom key without the foreign-buy log',async()=>{
    for(const access of [{type:'Minimal',level:1},{type:'Custom',level:0,log:{custom_permissions:true,available:[{category_id:1,log_ids:[999]}]}}]){
      const{api,request}=setup({'key/info':{info:{user:{id:55,faction_id:null,company_id:null},access,selections:{user:access.type==='Custom'?['log']:[]}}}}),app=await active(api),data=await api.travelData(app);expect(data.logAccess).toBe(false);expect(request.mock.calls.some(([u])=>String(u).includes('/user/log?'))).toBe(false);
    }
  });
  it('does not follow arbitrary pagination URLs or their embedded keys, and marks truncated evidence incomplete',async()=>{
    const{api,request}=setup({'user/log':{log:[],_metadata:{links:{next:'https://attacker.example/v2/user/log?key=PRIVATE&to=1'}}}}),app=await active(api),data=await api.travelData(app);expect(data.logsComplete).toBe(false);expect(request.mock.calls.some(([u])=>String(u).includes('attacker'))).toBe(false);
  });
  it('keeps failed inventory categories out of diff coverage and does not fabricate capacity with unknown multiplier perks',async()=>{
    const{api}=setup({'user/inventory':{error:{code:16}},'user/perks':{perks:{faction:[],job:[],book:['Double travel capacity'],enhancer:[]}}}),app=await active(api),data=await api.travelData(app);expect(data.inventories).toEqual([]);expect(data.capacity).toBeUndefined();expect(data.purchases).toHaveLength(1);
  });
  it('rejects unsupported bar intervals rather than producing misleading landing predictions',async()=>{
    const{api}=setup({'user/bars':{bars:Object.fromEntries(['energy','nerve','life'].map(key=>[key,{current:100,maximum:150,increment:5,interval:0,tick_time:180}]))}}),app=await active(api);expect((await api.travelData(app)).bars).toBeUndefined();
  });
  it('retains stock and market value independently when only one provider responds',async()=>{
    const{api}=setup(),app=await active(api);expect(app.marketPrices[1]?.value).toBe(40000);const s:StockItem={itemId:1,name:'Monkey Plushie',country:'Japan',stock:0,observedAt:base,tornValue:null,cost:10000,priceObservedAt:null,restock:{kind:'unknown',reason:'No history'}};mergePrices(app,[s]);expect(app.marketPrices[1]?.value).toBe(40000);
  });
});
