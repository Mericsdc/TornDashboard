import { describe, expect, it, vi } from 'vitest';
import { TornApi, joinStocks } from '../../packages/extension/src/services/torn-api';
import { canonicalCountry, defaultState, marketRows, migrateState, optimizeBag, presetLayout, travelCountry, type StockItem } from '@tcd/shared';
const now=1800000000000;
const item=(patch:Partial<StockItem>={}):StockItem=>({itemId:1,name:'Camel Plushie',country:'UAE',cost:10,tornValue:30,priceObservedAt:now,stock:20,observedAt:now,restock:{kind:'unknown',reason:'No history'},...patch});
const payloads:Record<string,unknown>={
  'key/info':{info:{user:{id:55,faction_id:10,company_id:null},access:{level:1,type:'Minimal'},selections:{}}},
  'user/profile':{profile:{id:55,name:'Fixture player',level:40,status:{state:'Traveling',description:'Traveling to Torn'}}},
  'user/travel':{travel:{destination:'Torn',departed_at:now/1000-100,arrival_at:now/1000+500,time_left:500}},
  'faction/chain':{chain:{id:42,current:49,max:49,timeout:30,start:now/1000-500,end:0}},
  'faction/wars':{wars:{ranked:{war_id:8,start:now/1000-10000,end:null,winner:null,target:1000,factions:[{id:10,name:'Our faction',score:450},{id:20,name:'Actual opponent',score:200}]}}},
  'faction/20/members':{members:[{id:123,name:'Opponent A',level:20,status:{state:'Okay',description:'Okay',until:null},last_action:{status:'Offline'}},{id:124,name:'Opponent hospital',level:30,status:{state:'Hospital',description:'Hospital',until:now/1000+120},last_action:{status:'Online'}}]},
  'torn/items':{items:[{id:1,name:'Camel Plushie',value:{market_price:30,shops:[{country:'UAE',buy_price:10}]}},{id:2,name:'Xanax',value:{market_price:50,shops:[{country:'Switzerland',buy_price:20}]}}]}
};
function network(extra:Record<string,unknown>={}){
  return vi.fn<typeof fetch>(async(input,options)=>{
    const url=new URL(String(input));
    if(url.hostname==='yata.yt'){expect(new Headers(options?.headers).has('authorization')).toBe(false);return new Response(JSON.stringify(extra.yata??{stocks:{uae:{update:now/1000,stocks:[{id:1,quantity:15},{id:2,quantity:100}]}}}));}
    expect(new Headers(options?.headers).get('authorization')).toBe('ApiKey TESTONLYKEY12345');expect(url.searchParams.has('key')).toBe(false);
    const path=url.pathname.replace('/v2/','');return new Response(JSON.stringify(extra[path]??payloads[path]));
  });
}
describe('direct Torn API adapter',()=>{
  it('loads the actual war opponent, chain and correct foreign catalog without leaking a key',async()=>{
    const request=network(),api=new TornApi('TESTONLYKEY12345',request,()=>now);
    const data=await api.snapshot('yata',{}, {origin:'Dubai',destination:'Torn',observedAt:now});
    expect(data.provider).toBe('torn');expect(data.war?.opponent).toBe('Actual opponent');expect(data.chain?.expiresAt).toBe(now+30000);expect(data.targets[0]?.activity).toBe('offline');expect(data.targets[0]?.battleStats).toBeNull();expect(data.targets[1]?.hospitalUntil).toBe(now+120000);expect(travelCountry(data)).toBe('UAE');
    expect(data.stocks.find(s=>s.country==='Switzerland')?.stock).toBeNull();expect(marketRows(data,defaultState().settings.market,[],now)).toHaveLength(1);expect(data.stocks[0]?.stock).toBe(15);expect(JSON.stringify(data)).not.toContain('TESTONLY');
    const calls=request.mock.calls.length;await api.snapshot('yata',{});expect(request.mock.calls).toHaveLength(calls);
    const chainUrl=String(request.mock.calls.find(([url])=>String(url).includes('faction/chain'))?.[0]);expect(chainUrl).toContain('timestamp=');
  });
  it('preserves an unknown return origin rather than substituting every country',async()=>{
    const data=await new TornApi('TESTONLYKEY12345',network(),()=>now).snapshot('off',{});
    expect(travelCountry(data)).toBeNull();expect(marketRows(data,{...defaultState().settings.market,country:'all'},[],now)).toEqual([]);
  });
  it('rejects a mismatched personal profile instead of mixing accounts',async()=>{
    const api=new TornApi('TESTONLYKEY12345',network({'user/profile':{profile:{id:999,name:'Other account',level:40,status:{state:'Traveling',description:'Traveling'}}}}),()=>now);
    await expect(api.snapshot('off',{})).rejects.toThrow('does not match the key owner');
  });
  it('stops retrying invalid keys and never echoes the provider error message',async()=>{
    const request=network({'key/info':{error:{code:2,error:'SECRET_KEY_IN_PROVIDER_BODY'}}}),api=new TornApi('TESTONLYKEY12345',request,()=>now);
    await expect(api.connect()).rejects.toThrow('API key was rejected');await expect(api.connect()).rejects.not.toThrow('SECRET_KEY');expect(request).toHaveBeenCalledTimes(1);
  });
  it('backs off rate limits across endpoint reads',async()=>{
    const request=network({'key/info':{error:{code:5}}}),api=new TornApi('TESTONLYKEY12345',request,()=>now);
    await expect(api.connect()).rejects.toThrow('Torn API error 5');await expect(api.connect()).rejects.toThrow('Waiting');expect(request).toHaveBeenCalledTimes(1);
  });
  it('returns unknown stock on stale, future, absent or wrong-country observations',()=>{
    for(const at of [now/1000-181,now/1000+31])expect(joinStocks([item()],{stocks:{uae:{update:at,stocks:[{id:1,quantity:15}]}}},now,{})[0]?.stock).toBeNull();
    expect(joinStocks([item()],{stocks:{jap:{update:now/1000,stocks:[{id:1,quantity:50}]}}},now,{})[0]?.stock).toBeNull();
  });
  it('requests private employee effects only for the key owner verified as director',async()=>{
    const base={'key/info':{info:{user:{id:55,faction_id:null,company_id:88},access:{level:2,type:'Limited'},selections:{}}}};
    const denied=network({...base,'company/profile':{profile:{name:'Company',director:{id:99}}}});
    const outsider=await new TornApi('TESTONLYKEY12345',denied,()=>now).snapshot('off',{});expect(outsider.company).toBeNull();expect(denied.mock.calls.some(([url])=>String(url).includes('company/employees'))).toBe(false);
    const allowed=network({...base,'company/profile':{profile:{name:'My company',director:{id:55}}},'company/employees':{employees:[{id:9,name:'Employee',effectiveness:{addiction:-8}},{id:8,name:'Unknown effect'}]}});
    const owner=await new TornApi('TESTONLYKEY12345',allowed,()=>now).snapshot('off',{});expect(owner.company?.isDirector).toBe(true);expect(owner.company?.employees.map(e=>e.addictionEffect)).toEqual([-8,null]);
  });
  it('keeps history bounded while retaining restock phase evidence',()=>{
    const history:Parameters<typeof joinStocks>[3]={};for(let n=0;n<500;n++)joinStocks([item()],{stocks:{uae:{update:now/1000+n,stocks:[{id:1,quantity:15}]}}},now+n*1000,history);
    expect(history['UAE:1']).toHaveLength(2);expect(history['UAE:1']?.[0]?.observedAt).toBe(now);expect(history['UAE:1']?.[1]?.observedAt).toBe(now+499000);
  });
});
describe('presets, migration and travel shopping',()=>{
  it('normalizes aliases and isolates the travel destination even after an old manual country choice',()=>{
    expect(canonicalCountry('Dubai')).toBe('UAE');expect(canonicalCountry('UK')).toBe('United Kingdom');expect(canonicalCountry('Unknown')).toBeNull();
  });
  it('moves legacy extra widgets to CUSTOM and keeps watches and appearance',()=>{
    const old=defaultState();old.settings.panelWidth=340;old.favorites=[{itemId:1,country:'UAE',name:'Camel Plushie',minimumStock:10,alert:true}];old.layouts.WAR.right.push('restock');delete (old.layouts as Partial<typeof old.layouts>).CUSTOM;
    const migrated=migrateState(old);expect(migrated.settings.panelWidth).toBe(340);expect(migrated.favorites).toEqual(old.favorites);expect(migrated.layouts.WAR).toEqual({left:['chain'],right:['recommended-targets']});expect(migrated.layouts.CUSTOM.right).toContain('restock');expect(presetLayout(old.layouts.WAR,'WAR').right).not.toContain('restock');
  });
  it('maximizes profit with bounded stock and budget, including mixed bags and fees',()=>{
    const rows=[item({stock:1,cost:10,tornValue:100}),item({itemId:2,stock:20,cost:5,tornValue:50})];
    const plan=optimizeBag(rows,3,20,0,now)!;expect(plan.quantity).toBe(3);expect(plan.profit).toBe(180);expect(plan.cost).toBe(20);expect(plan.purchases.map(p=>p.quantity)).toEqual([1,2]);
    expect(optimizeBag(rows,3,9,0,now)?.quantity).toBe(1);expect(optimizeBag([item({observedAt:now-181000})],10,null,0,now)?.quantity).toBe(0);expect(optimizeBag(rows,3,null,100,now)?.profit).toBe(0);expect(optimizeBag(rows,NaN,null,0,now)).toBeNull();
  });
});
