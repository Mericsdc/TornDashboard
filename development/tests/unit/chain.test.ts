import { describe, expect, it } from 'vitest';
import { currentChain, defaultState, emptyAlertMemory, evaluateAlerts, mergeChain, migrateState, pageChain, type ChainState, type Snapshot } from '@tcd/shared';
const now=1800000000000;
const active:ChainState={id:42,startedAt:now-600000,count:4,goal:10,expiresAt:now+15000,observedAt:now,source:'api',status:'active'};
describe('native chain synchronization and terminal state',()=>{
  it('corrects an API timer ahead of the native sidebar without a fixed fudge offset',()=>{
    const native=pageChain(active,{count:4,goal:10,remaining:12,at:now},now)!;
    expect(native.expiresAt).toBe(now+12000);expect(native.source).toBe('page');
    expect(mergeChain(native,{...active,observedAt:now+1000,expiresAt:now+18000},now+1000)?.expiresAt).toBe(now+12000);
  });
  it('resets hits and the progress goal at expiry even without a fresh API response',()=>{
    expect(currentChain(active,now+15000)).toMatchObject({status:'ended',count:0,goal:10,expiresAt:null,lastCount:4});
    expect(currentChain({...active,expiresAt:null},now)).toMatchObject({status:'ended',count:0});
  });
  it('immediately observes a native zero and prevents cached API data reviving it',()=>{
    const ended=pageChain(active,{count:0,goal:10,remaining:0,at:now+100},now+100)!;
    expect(ended).toMatchObject({count:0,status:'ended',lastCount:4});
    expect(mergeChain(ended,{...active,observedAt:now+1000},now+1000)?.count).toBe(0);
  });
  it('allows API fallback after the page lease and rearms a genuinely new chain',()=>{
    const ended=pageChain(active,{count:0,goal:10,remaining:0,at:now},now)!;
    const restarted=pageChain(ended,{count:1,goal:10,remaining:300,at:now+1000},now+1000)!;
    expect(restarted.id).toBeNull();expect(restarted.startedAt).toBe(now+1000);
    expect(mergeChain(ended,{...active,count:5,observedAt:now+16000,expiresAt:now+300000},now+16000)?.count).toBe(5);
  });
  it('rejects stale or future page samples and invalid progress',()=>{
    expect(pageChain(active,{count:4,goal:10,remaining:12,at:now-6000},now)).toBeNull();
    expect(pageChain(active,{count:4,goal:10,remaining:12,at:now+2000},now)).toBeNull();
    expect(pageChain(active,{count:11,goal:10,remaining:12,at:now},now)).toBeNull();
  });
  it('uses the synchronized deadline for a single 30s warning and none after expiry',()=>{
    const chain=pageChain(active,{count:4,goal:10,remaining:30,at:now},now)!;
    const snapshot:Snapshot={source:'live',provider:'torn',generatedAt:now,chain,war:null,travel:null,stocks:[],targets:[],player:{level:40}};
    const first=evaluateAlerts(snapshot,defaultState(),emptyAlertMemory(),now);expect(first.events).toHaveLength(1);
    expect(evaluateAlerts(snapshot,defaultState(),first.memory,now+1000).events).toHaveLength(0);
    expect(evaluateAlerts(snapshot,defaultState(),emptyAlertMemory(),now+30000).events).toHaveLength(0);
  });
  it('migrates compact travel layouts without losing watches, saved positions or appearance',()=>{
    const old=defaultState();old.layouts.TRAVEL={left:['travel-status'],right:['restock','travel-favorites']};old.layouts.CUSTOM={left:['chain','restock'],right:['travel-status','travel-market','travel-profit']};old.settings.theme='slate';old.settings.disabledWidgets=['travel-market','travel-profit'];old.favorites=[{itemId:1,name:'Camel Plushie',country:'UAE',minimumStock:5,alert:true}];
    const next=migrateState(old);expect(next.layouts.TRAVEL).toEqual({left:['travel-profit'],right:['travel-favorites']});expect(next.layouts.CUSTOM.left).toContain('travel-favorites');expect([...next.layouts.CUSTOM.left,...next.layouts.CUSTOM.right]).not.toContain('restock');expect(next.settings.theme).toBe('slate');expect(next.settings.disabledWidgets).toEqual(['travel-profit']);expect(next.favorites).toEqual(old.favorites);
  });
});
