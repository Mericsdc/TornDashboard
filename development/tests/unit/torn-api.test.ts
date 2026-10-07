import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { TornApi, joinStocks } from '../../packages/extension/src/services/torn-api';
import { requireTornAccess, requestTornAccess, testTornConnection } from '../../packages/extension/src/services/torn-connection';
import { canonicalCountry, defaultState, marketRows, migrateState, optimizeBag, presetLayout, travelCountry, type StockItem } from '@tcd/shared';
const now=1800000000000;
const item=(patch:Partial<StockItem>={}):StockItem=>({itemId:1,name:'Camel Plushie',country:'UAE',cost:10,tornValue:30,priceObservedAt:now,stock:20,observedAt:now,restock:{kind:'unknown',reason:'No history'},...patch});
const payloads:Record<string,unknown>={
  'key/info':{info:{user:{id:55,faction_id:10,company_id:null},access:{level:1,type:'Minimal'},selections:{}}},
  'user/profile':{profile:{id:55,name:'Fixture player',level:40,status:{state:'Traveling',description:'Traveling to Torn'}}},
  'user/travel':{travel:{destination:'Torn',departed_at:now/1000-100,arrival_at:now/1000+500,time_left:500}},
  'faction/chain':{chain:{id:42,current:49,max:49,timeout:30,start:now/1000-500,end:0}},
  'faction/10/wars':{wars:{ranked:{war_id:8,start:now/1000-10000,end:null,winner:null,target:1000,factions:[{id:10,name:'Our faction',score:450},{id:20,name:'Actual opponent',score:200}]}}},
  'faction/20/members':{members:[{id:123,name:'Opponent A',level:20,status:{state:'Okay',description:'Okay',until:null},last_action:{status:'Offline'}},{id:124,name:'Opponent hospital',level:30,status:{state:'Hospital',description:'Hospital',until:now/1000+120},last_action:{status:'Online'}}]},
  'torn/items':{items:[{id:1,name:'Camel Plushie',value:{market_price:30,shops:[{country:'UAE',buy_price:10}]}},{id:2,name:'Xanax',value:{market_price:50,shops:[{country:'Switzerland',buy_price:20}]}}]}
};
function network(extra:Record<string,unknown>={}){
  return vi.fn<typeof fetch>(async(input,options)=>{
    const url=new URL(String(input));
    if(url.hostname==='yata.yt'){expect(new Headers(options?.headers).has('authorization')).toBe(false);return new Response(JSON.stringify(extra.yata??{stocks:{uae:{update:now/1000,stocks:[{id:1,quantity:15},{id:2,quantity:100}]}}}));}
    expect(new Headers(options?.headers).get('authorization')).toBe('ApiKey TESTONLYKEY12345');expect(url.searchParams.has('key')).toBe(false);
    const path=url.pathname.slice(4);return new Response(JSON.stringify(extra[path]??payloads[path]));
  });
}
describe('direct Torn API adapter',()=>{
  it('accounts for HTTP cache age without extending the returned chain deadline',async()=>{
    const base=network(),request=vi.fn<typeof fetch>(async(input,options)=>{const response=await base(input,options);if(String(input).includes('faction/chain'))return new Response(await response.text(),{headers:{age:'3'}});return response;});
    const data=await new TornApi('TESTONLYKEY12345',request,()=>now).snapshot('off',{});expect(data.chain?.expiresAt).toBe(now+27000);
    const call=request.mock.calls.find(([url])=>String(url).includes('faction/chain'));expect(call?.[1]?.cache).toBe('no-store');
  });
  it('normalizes timeout-zero and completed API chains instead of keeping their hit meter active',async()=>{
    for(const c of [{id:42,current:4,max:4,timeout:0,start:now/1000-500,end:0},{id:42,current:4,max:4,timeout:30,start:now/1000-500,end:now/1000-1}]){
      const data=await new TornApi('TESTONLYKEY12345',network({'faction/chain':{chain:c}}),()=>now).snapshot('off',{});expect(data.chain).toMatchObject({status:'ended',count:0,goal:10,lastCount:4,expiresAt:null});
    }
  });
  it('loads the actual war opponent, chain and correct foreign catalog without leaking a key',async()=>{
    const request=network(),api=new TornApi('TESTONLYKEY12345',request,()=>now);
    const data=await api.snapshot('yata',{}, {origin:'Dubai',destination:'Torn',observedAt:now});
    expect(data.provider).toBe('torn');expect(data.war?.opponent).toBe('Actual opponent');expect(data.chain?.expiresAt).toBe(now+30000);expect(data.targets[0]?.activity).toBe('offline');expect(data.targets[0]?.battleStats).toBeNull();expect(data.targets[1]?.hospitalUntil).toBe(now+120000);expect(travelCountry(data)).toBe('UAE');
    expect(data.stocks.find(s=>s.country==='Switzerland')?.stock).toBeNull();expect(marketRows(data,defaultState().settings.market,[],now)).toHaveLength(1);expect(data.stocks[0]?.stock).toBe(15);expect(JSON.stringify(data)).not.toContain('TESTONLY');
    const calls=request.mock.calls.length;await api.snapshot('yata',{});expect(request.mock.calls).toHaveLength(calls);
    const chainUrl=String(request.mock.calls.find(([url])=>String(url).includes('faction/chain'))?.[0]);expect(chainUrl).toContain('timestamp=');
  });
  it('recovers the BOS vs EPIC war from the same Torn ranked-war list as BOSBOT, without a bot credential',async()=>{
    const factions=[{id:49122,name:'Balls of Steel MC',score:450,chain:4},{id:54175,name:'EPIC Warmong3rs',score:200,chain:0}];
    const row=(id:number,start:number,end:number,winner:number)=>({id,start,end,winner,target:1000,factions});
    const request=network({
      'key/info':{info:{user:{id:55,faction_id:49122,company_id:null},access:{level:3,type:'Limited'},selections:{}}},
      'faction/49122/wars':{wars:{ranked:null}},
      'faction/49122/rankedwars':{rankedwars:[row(777,now/1000-1000,0,0),row(900,now/1000-100000,now/1000-50000,49122),row(901,now/1000+600,0,0)]},
      'faction/54175/members':payloads['faction/20/members']
    });
    const api=new TornApi('TESTONLYKEY12345',request,()=>now),data=await api.snapshot('yata',{});
    expect(data.war).toMatchObject({id:777,active:true,opponentId:54175,opponent:'EPIC Warmong3rs'});expect(data.targets).toHaveLength(2);expect(data.issues?.war).toBeUndefined();
    const calls=request.mock.calls.length;await api.snapshot('yata',{});expect(request).toHaveBeenCalledTimes(calls);
    const restored=new TornApi('TESTONLYKEY12345',request,()=>now);restored.restoreCache(api.exportCache());await restored.snapshot('yata',{});
    expect(request.mock.calls.filter(([u])=>String(u).includes('/faction/49122/rankedwars?'))).toHaveLength(1);
    for(const[u,o]of request.mock.calls){expect(new URL(String(u)).searchParams.has('key')).toBe(false);if(String(u).includes('yata'))expect(new Headers(o?.headers).has('authorization')).toBe(false);}
  });
  it('uses a fresh profile faction rather than a stale key-info faction',async()=>{
    const request=network({'user/profile':{profile:{id:55,name:'Fixture',level:40,faction_id:49122,status:{state:'Okay'}}},'faction/49122/wars':{wars:{ranked:{war_id:8,start:now/1000-100,end:0,winner:0,target:1000,factions:[{id:49122,name:'Our faction',score:1},{id:20,name:'Actual opponent',score:2}]}}}});
    const data=await new TornApi('TESTONLYKEY12345',request,()=>now).snapshot('off',{});expect(data.war?.active).toBe(true);expect(data.player.factionId).toBe(49122);expect(request.mock.calls.some(([u])=>String(u).includes('/faction/10/wars'))).toBe(false);
  });
  it('does not let a failed chain read block travel, catalog, opponents or YATA',async()=>{
    const base=network(),request=vi.fn<typeof fetch>(async(u,o)=>String(u).includes('faction/chain')?new Response('',{status:503}):base(u,o));
    const api=new TornApi('TESTONLYKEY12345',request,()=>now),data=await api.snapshot('yata',{});
    expect(data.issues?.chain).toContain('HTTP 503');expect(data.travel?.active).toBe(true);expect(data.war?.active).toBe(true);expect(data.targets).toHaveLength(2);expect(data.stocks[0]?.stock).toBe(15);
    await api.snapshot('yata',{});expect(request.mock.calls.filter(([u])=>String(u).includes('faction/chain'))).toHaveLength(1);
  });
  it('continues war and stock reads when travel returns an HTTP error',async()=>{
    const base=network(),request=vi.fn<typeof fetch>(async(u,o)=>String(u).includes('user/travel')?new Response('',{status:403}):base(u,o));
    const data=await new TornApi('TESTONLYKEY12345',request,()=>now).snapshot('yata',{});expect(data.issues?.travel).toContain('HTTP 403');expect(data.war?.active).toBe(true);expect(data.targets).toHaveLength(2);expect(data.stocks[0]?.stock).toBe(15);
  });
  it('reports a failed history cross-check rather than confidently saying no war exists',async()=>{
    const data=await new TornApi('TESTONLYKEY12345',network({'faction/10/wars':{wars:{ranked:null}},'faction/10/rankedwars':{error:{code:7}}}),()=>now).snapshot('yata',{});expect(data.war).toBeNull();expect(data.issues?.warFallback).toContain('does not allow');expect(data.stocks[0]?.stock).toBe(15);
  });
  it('retains real YATA products and stocks when Torn prices are unavailable',async()=>{
    const base=network({yata:{stocks:{uae:{update:now/1000,stocks:[{id:1,name:'Camel Plushie',cost:14000,quantity:18}]},jap:{update:now/1000,stocks:[{id:4,name:'Monkey Plushie',cost:10000,quantity:12}]}}}}),request=vi.fn<typeof fetch>(async(u,o)=>String(u).includes('torn/items')?new Response('',{status:503}):base(u,o));
    const data=await new TornApi('TESTONLYKEY12345',request,()=>now).snapshot('yata',{});
    expect(data.stocks).toHaveLength(2);expect(data.stocks[0]).toMatchObject({country:'UAE',name:'Camel Plushie',cost:14000,stock:18,tornValue:null});expect(data.war?.active).toBe(true);expect(data.issues?.prices).toContain('HTTP 503');expect(data.issues?.stocks).toBeUndefined();
  });
  it('re-fetches incompatible restored caches instead of failing every read until their TTL expires',async()=>{
    const request=network(),api=new TornApi('TESTONLYKEY12345',request,()=>now);api.restoreCache([['torn/items',{at:now,value:{items:{legacy:'wrong format'}}}]]);
    const data=await api.snapshot('yata',{});expect(data.stocks[0]?.tornValue).toBe(30);expect(data.issues?.prices).toBeUndefined();expect(request.mock.calls.some(([u])=>String(u).includes('/torn/items'))).toBe(true);
  });
  it('does not misidentify a future or completed ranked war as active',async()=>{
    const factions=[{id:10,name:'Our faction',score:450,chain:4},{id:20,name:'Actual opponent',score:200,chain:0}];
    const data=await new TornApi('TESTONLYKEY12345',network({'faction/10/wars':{wars:{ranked:null}},'faction/10/rankedwars':{rankedwars:[{id:7,start:now/1000-1000,end:now/1000-10,winner:10,target:100,factions},{id:8,start:now/1000+1000,end:0,winner:0,target:100,factions}]}}),()=>now).snapshot('off',{});
    expect(data.war?.active??false).toBe(false);expect(data.targets).toEqual([]);
  });
  it('recovers a failed current-war read through ranked-war history while continuing all other endpoints',async()=>{
    const factions=[{id:10,name:'Our faction',score:450,chain:4},{id:20,name:'Actual opponent',score:200,chain:0}];
    const base=network({'faction/10/rankedwars':{rankedwars:[{id:8,start:now/1000-1000,end:0,winner:0,target:100,factions}]}}),request=vi.fn<typeof fetch>(async(u,o)=>String(u).includes('/v2/faction/10/wars')?new Response('',{status:503}):base(u,o));
    const data=await new TornApi('TESTONLYKEY12345',request,()=>now).snapshot('yata',{});expect(data.war?.active).toBe(true);expect(data.targets).toHaveLength(2);expect(data.issues?.war).toBeUndefined();expect(data.stocks[0]?.stock).toBe(15);
  });
  it('reports an unreadable war instead of silently declaring that no war exists',async()=>{
    const data=await new TornApi('TESTONLYKEY12345',network({'faction/10/wars':{bad:'format'},'faction/10/rankedwars':{rankedwars:[{id:8,start:now/1000-1000,end:0,winner:0,target:100,factions:[{id:10,name:'Our',score:1}]}]}}),()=>now).snapshot('yata',{});
    expect(data.war).toBeNull();expect(data.issues?.war).toContain('Both Torn war selections failed');expect(data.stocks[0]?.stock).toBe(15);
  });
  it('does not let historical travel values override the current home profile',async()=>{
    for(const time_left of [0,500]){
      const api=new TornApi('TESTONLYKEY12345',network({'user/profile':{profile:{id:55,name:'Fixture',level:40,status:{state:'Okay',description:'Okay'}}},'user/travel':{travel:{destination:'Japan',departed_at:now/1000-1000,arrival_at:now/1000-1,time_left}}}),()=>now);
      const data=await api.snapshot('off',{});expect(api.travelEvidence).toMatchObject({state:'AT_HOME',destinationCountry:'Torn'});expect(data.war?.active).toBe(true);
    }
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
  it('recovers a transient Chrome fetch failure without moving the key into a URL',async()=>{
    const request=network();request.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect((await new TornApi('TESTONLYKEY12345',request,()=>now).connect()).user.id).toBe(55);expect(request).toHaveBeenCalledTimes(2);
    for(const[url,options]of request.mock.calls){expect(String(url)).toBe('https://api.torn.com/v2/key/info');expect(options?.credentials).toBe('omit');expect(options?.redirect).toBe('error');expect(new Headers(options?.headers).get('authorization')).toBe('ApiKey TESTONLYKEY12345');}
  });
  it('recovers a dropped response stream within the same bounded read policy',async()=>{
    const request=network();request.mockResolvedValueOnce(new Response(new ReadableStream({start(controller){controller.error(new TypeError('PRIVATE_PROVIDER_DETAIL'));}})));
    expect((await new TornApi('TESTONLYKEY12345',request,()=>now).connect()).user.id).toBe(55);expect(request).toHaveBeenCalledTimes(2);
  });
  it('reports timeout and offline failures separately without leaking transport details',async()=>{
    const timeout=vi.fn<typeof fetch>().mockRejectedValue(new DOMException('PRIVATE_PROVIDER_DETAIL','TimeoutError'));
    await expect(new TornApi('TESTONLYKEY12345',timeout,()=>now).connect()).rejects.toThrow('timed out after two attempts');expect(timeout).toHaveBeenCalledTimes(2);
    vi.stubGlobal('navigator',{onLine:false});
    try{const offline=vi.fn<typeof fetch>().mockRejectedValue(new TypeError('PRIVATE_PROVIDER_DETAIL'));await expect(new TornApi('TESTONLYKEY12345',offline,()=>now).connect()).rejects.toThrow('Chrome is offline');expect(offline).toHaveBeenCalledTimes(1);}finally{vi.unstubAllGlobals();}
  });
  it('bounds repeated network failures and backs off all reads after the attempts',async()=>{
    const request=vi.fn<typeof fetch>().mockRejectedValue(new TypeError('SECRET_KEY_IN_NETWORK_ERROR')),api=new TornApi('TESTONLYKEY12345',request,()=>now);
    await expect(api.connect()).rejects.toThrow('Chrome could not reach api.torn.com');await expect(api.connect()).rejects.toThrow('Waiting');expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not retry HTTP or API failures as network failures',async()=>{
    const request=vi.fn<typeof fetch>().mockResolvedValue(new Response('private error details',{status:503}));
    await expect(new TornApi('TESTONLYKEY12345',request,()=>now).connect()).rejects.toThrow('HTTP 503');expect(request).toHaveBeenCalledTimes(1);
  });
  it('checks reachability anonymously and rejects intercepted HTML',async()=>{
    const request=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({error:{code:2}})));
    await expect(testTornConnection(request)).resolves.toBeUndefined();const[url,options]=request.mock.calls[0]!;expect(String(url)).toBe('https://api.torn.com/v2/key/info');expect(new Headers(options?.headers).has('authorization')).toBe(false);expect(options?.credentials).toBe('omit');
    request.mockResolvedValueOnce(new Response('<html>filter</html>'));await expect(testTornConnection(request)).rejects.toThrow('network filter');
  });
  it('blocks worker reads without API access and requests only the declared Torn origin',async()=>{
    const contains=vi.fn().mockResolvedValue(false),request=vi.fn().mockResolvedValue(false);vi.stubGlobal('chrome',{permissions:{contains,request}});
    try{await expect(requireTornAccess()).rejects.toThrow('Chrome has blocked');await expect(requestTornAccess()).rejects.toThrow('Chrome has blocked');expect(request).toHaveBeenCalledWith({origins:['https://api.torn.com/*']});contains.mockResolvedValue(true);await expect(requireTornAccess()).resolves.toBeUndefined();}finally{vi.unstubAllGlobals();}
  });
  it('accepts the real anonymous YATA export for all eleven countries without a Torn catalog',()=>{
    const raw=JSON.parse(readFileSync(new URL('../fixtures/yata-export-2026-10-07.json',import.meta.url),'utf8'));
    const at=Math.max(...Object.values(raw.stocks as Record<string,{update:number}>).map(s=>s.update))*1000;
    const rows=joinStocks([],raw,at,{});expect(rows).toHaveLength(227);expect(new Set(rows.map(s=>s.country)).size).toBe(11);expect(rows.every(s=>s.stock!==null&&s.cost&&s.tornValue===null)).toBe(true);
  });
  it('keeps old stock observations labelled by age while rejecting future and wrong-country data',()=>{
    expect(joinStocks([item()],{stocks:{uae:{update:now/1000-181,stocks:[{id:1,quantity:15}]}}},now,{})[0]?.stock).toBe(15);
    for(const at of [now/1000+31])expect(joinStocks([item()],{stocks:{uae:{update:at,stocks:[{id:1,quantity:15}]}}},now,{})[0]?.stock).toBeNull();
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
    const migrated=migrateState(old);expect(migrated.settings.panelWidth).toBe(340);expect(migrated.favorites).toEqual(old.favorites);expect(migrated.layouts.WAR).toEqual({left:['chain'],right:['recommended-targets']});expect(migrated.layouts.CUSTOM.right).toContain('travel-favorites');expect(presetLayout(old.layouts.WAR,'WAR').right).not.toContain('restock');
  });
  it('maximizes profit with bounded stock and budget, including mixed bags and fees',()=>{
    const rows=[item({stock:1,cost:10,tornValue:100}),item({itemId:2,stock:20,cost:5,tornValue:50})];
    const plan=optimizeBag(rows,3,20,0,now)!;expect(plan.quantity).toBe(3);expect(plan.profit).toBe(180);expect(plan.cost).toBe(20);expect(plan.purchases.map(p=>p.quantity)).toEqual([1,2]);
    expect(optimizeBag(rows,3,9,0,now)?.quantity).toBe(1);expect(optimizeBag([item({observedAt:now-181000})],10,null,0,now)?.quantity).toBe(0);expect(optimizeBag(rows,3,null,100,now)?.profit).toBe(0);expect(optimizeBag(rows,NaN,null,0,now)).toBeNull();
  });
});
