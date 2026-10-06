import { ModeManager } from '../../packages/extension/src/core/mode-manager';
import { defaultState } from '@tcd/shared';
import { describe,it,expect } from 'vitest';
import { COUNTRIES, emptyTravelApp, TravelAppSchema, observeTravel, applyPageTravel, recordInventory, recordPurchase, mergePrices, mergeSnapshot, finalizeDerived, tripProfit, compareInventory, predictResource, priceConfidence, historyTotals, type InventorySnapshot, type Purchase, type Snapshot, type StockItem } from '@tcd/shared';
const now=1800000000000;
const stock=(patch:Partial<StockItem>={}):StockItem=>({itemId:1,name:'Camel Plushie',country:'UAE',cost:14000,tornValue:70455,priceObservedAt:now,stock:43,observedAt:now,restock:{kind:'unknown',reason:'Need history'},...patch});
const inventory=(items:Record<string,number>,at=now):InventorySnapshot=>({items,coveredIds:[1,2,3],observedAt:at,source:'api',kind:'inventory',complete:true});
const receipt=(patch:Partial<Purchase>={}):Purchase=>({id:'log/1',itemId:1,country:'UAE',quantity:29,unitCost:14000,totalCost:406000,observedAt:now+1000,source:'api-log',costSource:'receipt',...patch});
function trip(){const app=emptyTravelApp();observeTravel(app,{state:'OUTBOUND',originCountry:'Torn',destinationCountry:'UAE',departedAt:now-3*3600000,arrivalAt:now,method:'Airstrip',at:now-1000,source:'api'},now);mergePrices(app,[stock(),stock({itemId:2,name:'Xanax',cost:830000,tornValue:850000}),stock({itemId:3,name:'Can of Goose Juice',cost:2000,tornValue:4000})]);observeTravel(app,{state:'ABROAD',destinationCountry:'UAE',at:now,source:'page'},now);return app;}
it('shows preflight market only when a destination is selected on the travel page',()=>{
  const app=emptyTravelApp();app.previewCountry='Japan';const snapshot:Snapshot={source:'live',provider:'torn',generatedAt:now,war:null,chain:null,travel:null,travelApp:app,player:{level:null},targets:[],stocks:[]};const manager=new ModeManager();expect(manager.resolve(defaultState().settings,snapshot,true)).toBe('TRAVEL');expect(manager.resolve(defaultState().settings,snapshot,false)).toBe('NORMAL');
});
describe('persistent travel phases and trip lifecycle',()=>{
  for(const country of COUNTRIES)it(`preserves ${country} market through return, reload and safe completion`,()=>{
    const app=emptyTravelApp();observeTravel(app,{state:'OUTBOUND',originCountry:'Torn',destinationCountry:country,departedAt:now-10000,arrivalAt:now,at:now-5000,source:'api'},now);
    observeTravel(app,{state:'ABROAD',destinationCountry:country,at:now,source:'page'},now);
    applyPageTravel(app,{returnIntent:true},[],now+1000);expect(app.travel).toMatchObject({state:'RETURNING',originCountry:country,destinationCountry:'Torn',marketContextCountry:country});
    observeTravel(app,{state:'ABROAD',destinationCountry:country,at:now+500,source:'api'},now+2000);expect(app.travel.state).toBe('RETURNING');
    observeTravel(app,{state:'RETURNING',destinationCountry:'Torn',departedAt:now+1000,arrivalAt:now+10000,at:now+2000,source:'api'},now+2000);
    const restored=TravelAppSchema.parse(JSON.parse(JSON.stringify(app)));expect(restored.travel.marketContextCountry).toBe(country);
    finalizeDerived(restored,now+10000);expect(restored.travel.state).toBe('LANDED');expect(restored.travelSession).not.toBeNull();
    observeTravel(restored,{state:'AT_HOME',destinationCountry:'Torn',at:now+11000,source:'api'},now+11000);finalizeDerived(restored,now+25000);expect(restored.history).toHaveLength(0);
    finalizeDerived(restored,now+26000);expect(restored.travel.state).toBe('AT_HOME');expect(restored.travelSession).toBeNull();expect(restored.history[0]?.country).toBe(country);expect(restored.travel.marketContextCountry).toBeNull();
  });
  it('enriches a newer DOM route with cached matching API timestamps without regressing the phase',()=>{
    const app=trip();applyPageTravel(app,{returnIntent:true},[],now+30000);applyPageTravel(app,{state:'RETURNING',originCountry:'UAE',destinationCountry:'Torn',arrivalAt:now+4*3600000},[],now+40000);
    observeTravel(app,{state:'RETURNING',destinationCountry:'Torn',departedAt:now+30000,arrivalAt:now+3*3600000,method:'Airstrip',at:now+35000,source:'api'},now+40000);
    expect(app.travelSession?.inbound.departedAt).toBe(now+30000);expect(app.travel.arrivalAt).toBe(now+3*3600000);
    observeTravel(app,{state:'OUTBOUND',destinationCountry:'UAE',departedAt:now-3*3600000,at:now+50000,source:'api'},now+50000);expect(app.travel.state).toBe('RETURNING');
    applyPageTravel(app,{state:'ABROAD',destinationCountry:'UAE'},[],now+60000);expect(app.travel.state).toBe('RETURNING');
  });
  it('allows fresh ground evidence to cancel an unconfirmed return without losing the trip',()=>{
    const app=trip();applyPageTravel(app,{returnIntent:true},[],now+1000);const id=app.travelSession!.tripId;observeTravel(app,{state:'ABROAD',destinationCountry:'UAE',source:'api',at:now+2000},now+2000);expect(app.travel.state).toBe('RETURNING');
    observeTravel(app,{state:'ABROAD',destinationCountry:'UAE',source:'api',at:now+61000},now+61000);expect(app.travel.state).toBe('ABROAD');expect(app.travelSession?.inbound.departedAt).toBeNull();expect(app.travelSession?.tripId).toBe(id);expect(app.travel.marketContextCountry).toBe('UAE');
  });
  it('does not extend a known arrival or restart a landed timer from a stale page countdown',()=>{
    const app=trip();applyPageTravel(app,{returnIntent:true},[],now+1000);observeTravel(app,{state:'RETURNING',originCountry:'UAE',destinationCountry:'Torn',departedAt:now+1000,arrivalAt:now+5000,source:'api',at:now+2000},now+2000);
    finalizeDerived(app,now+6000);applyPageTravel(app,{state:'RETURNING',originCountry:'UAE',destinationCountry:'Torn',arrivalAt:now+3600000},[],now+6000);expect(app.travel.state).toBe('LANDED');expect(app.travel.arrivalAt).toBe(now+5000);expect(app.travelSession?.inbound.arrivesAt).toBe(now+5000);
  });
  it('does not finalize outbound landing on a transient home response or reset a live trip to another country',()=>{
    const app=trip();observeTravel(app,{state:'AT_HOME',destinationCountry:'UAE',at:now+1000,source:'api'},now+1000);expect(app.travel.state).toBe('ABROAD');
    observeTravel(app,{state:'ABROAD',destinationCountry:'Japan',at:now+2000,source:'api'},now+2000);expect(app.travelSession?.country).toBe('UAE');
  });
  it('waits for final log evidence, freezes archived market value and keeps estimates separate from actual profit',()=>{
    const app=trip();recordPurchase(app,receipt());app.logAccess=true;applyPageTravel(app,{returnIntent:true},[],now+2000);app.travel.arrivalAt=now+3000;
    observeTravel(app,{state:'AT_HOME',destinationCountry:'Torn',at:now+4000,source:'api'},now+4000);finalizeDerived(app,now+20000);expect(app.history).toHaveLength(0);
    app.travelSession!.logsComplete=true;app.travelSession!.logsCheckedAt=now+5000;finalizeDerived(app,now+20000);expect(app.history).toHaveLength(1);expect(app.history[0]?.actualProfit).toBeNull();
    app.marketPrices[1]!.value=1;expect(tripProfit(app.history[0]!,app,now+30000).estimatedProfit).toBe(1637195);
  });
  it('archives a previous return before starting the next outbound trip when home navigation was too brief',()=>{
    const app=trip();recordPurchase(app,receipt());applyPageTravel(app,{returnIntent:true},[],now+2000);app.travelSession!.inbound.arrivesAt=now+10000;
    observeTravel(app,{state:'OUTBOUND',originCountry:'Torn',destinationCountry:'Japan',departedAt:now+12000,arrivalAt:now+30000,source:'api',at:now+12000},now+12000);
    expect(app.history[0]?.country).toBe('UAE');expect(app.travelSession?.country).toBe('Japan');expect(app.travel.marketContextCountry).toBe('Japan');
  });
  it('bounds history by age and count and calculates hourly aggregates only for trips with a known duration',()=>{
    const app=trip(),original=app.travelSession!;recordPurchase(app,receipt());original.finalizedAt=now;original.marketPricesAtFinalization=[app.marketPrices[1]!];original.inbound.arrivesAt=now+3*3600000;
    app.history=[structuredClone(original),{...structuredClone(original),tripId:'duration-missing',outbound:{departedAt:null,arrivedAt:null}}];
    expect(historyTotals(app,now).profitPerHour).toBeCloseTo(1637195/6);
    app.history=Array.from({length:110},(_,i)=>({...structuredClone(original),tripId:String(i),finalizedAt:i===0?now-91*86400000:now-i}));finalizeDerived(app,now);expect(app.history).toHaveLength(100);expect(app.history.some(h=>h.tripId==='0')).toBe(false);
  });
});
describe('purchase evidence and automatic derived values',()=>{
  it('diffs preowned quantities, removed and unchanged items without inventing purchases',()=>{
    expect(compareInventory(inventory({'1':2,'2':4,'3':5}),inventory({'1':31,'2':4,'3':2}))).toEqual([{itemId:1,before:2,after:31,added:29,removed:0,unchanged:2},{itemId:2,before:4,after:4,added:0,removed:0,unchanged:4},{itemId:3,before:5,after:2,added:0,removed:3,unchanged:2}]);
    const app=trip();recordInventory(app,inventory({'1':2,'2':4}));applyPageTravel(app,{returnIntent:true},[],now+5000);recordInventory(app,inventory({'1':31,'2':4},now+4000));const profit=tripProfit(app.travelSession!,app,now+5000);expect(profit.rows).toEqual([]);expect(profit.unconfirmedAdditions).toBe(29);
    expect(compareInventory(inventory({'1':10}),{...inventory({}),coveredIds:[]})).toEqual([]);
  });
  it('calculates the 29 plushie example and round-trip / return-flight hourly profit from receipts',()=>{
    const app=trip();recordPurchase(app,receipt());observeTravel(app,{state:'RETURNING',originCountry:'UAE',destinationCountry:'Torn',departedAt:now+2000,arrivalAt:now+3*3600000,source:'api',at:now+2000},now+2000);
    const p=tripProfit(app.travelSession!,app,now+2000);expect(p.spent).toBe(406000);expect(p.marketValue).toBe(2043195);expect(p.estimatedProfit).toBe(1637195);expect(p.roi).toBeCloseTo(403.25,1);expect(p.rows[0]!.profit!/29).toBe(56455);expect(p.profitPerHour).toBeCloseTo(272865.8333);expect(p.actualProfit).toBeNull();
  });
  it('tracks multiple products, rejects wrong-country / non-shop gains and deduplicates logs versus receipts',()=>{
    const app=trip();recordPurchase(app,receipt({quantity:20,totalCost:280000}));recordPurchase(app,receipt({id:'page/1',source:'page-receipt',quantity:20,totalCost:280000}));recordPurchase(app,receipt({id:'log/2',itemId:2,quantity:5,unitCost:830000,totalCost:4150000}));recordPurchase(app,receipt({id:'log/3',itemId:3,quantity:4,unitCost:2000,totalCost:8000}));recordPurchase(app,receipt({id:'gift',itemId:99}));recordPurchase(app,receipt({id:'japan',country:'Japan'}));recordPurchase(app,receipt({id:'old',observedAt:now-86400000}));
    const p=tripProfit(app.travelSession!,app,now+2000);expect(p.quantity).toBe(29);expect(p.rows).toHaveLength(3);expect(p.spent).toBe(4438000);expect(p.marketValue).toBe(5675100);expect(p.estimatedProfit).toBe(1237100);
  });
  it('retains stale prices, marks their confidence and uses an observed range without arbitrary uncertainty percentages',()=>{
    const app=trip();recordPurchase(app,receipt());app.marketPrices[1]!.observedAt=now-4*3600000;app.marketPrices[1]!.history=[{at:now-5*3600000,value:60000},{at:now-4*3600000,value:70455}];
    const p=tripProfit(app.travelSession!,app,now);expect(p.rows[0]!.marketPrice).toBe(70455);expect(p.confidence).toBe('low');expect(p.range).toEqual({low:1334000,high:1637195});expect(priceConfidence(now-180000,now)).toBe('high');app.marketPrices[1]!.history=[];expect(tripProfit(app.travelSession!,app,now).range).toBeNull();
  });
  it('keeps partial cards usable when cost or market price is missing',()=>{
    const app=trip();recordPurchase(app,receipt());app.marketPrices={};let p=tripProfit(app.travelSession!,app,now);expect(p.spent).toBe(406000);expect(p.marketValue).toBeNull();expect(p.estimatedProfit).toBeNull();
    app.travelSession!.purchases[0]!.totalCost=null;app.travelSession!.purchases[0]!.unitCost=null;app.travelSession!.marketSnapshot[0]!.cost=null;p=tripProfit(app.travelSession!,app,now);expect(p.quantity).toBe(29);expect(p.spent).toBeNull();
  });
  it('prefers exact page capacity then cached data, uses total override only as fallback and rejects method mismatch',()=>{
    const app=trip();applyPageTravel(app,{bag:{total:29,used:21}},[],now);finalizeDerived(app,now,10);expect(app.bag).toMatchObject({total:29,used:21,free:8,source:'page',exact:true});
    app.bag.total=null;app.bag.source='unknown';finalizeDerived(app,now,10);expect(app.bag.total).toBe(29);expect(app.bag.source).toBe('cached');app.bag.total=null;app.travel.method='Standard';finalizeDerived(app,now,10);expect(app.bag.total).toBe(10);expect(app.bag.source).toBe('manual');
  });
  it('projects resource regeneration locally, preserves over-cap bars and declines unsupported timers',()=>{
    const bar={current:105,maximum:150,increment:5,interval:300,nextTickAt:now+60000,observedAt:now};expect(predictResource(bar,now+3600000,now)).toBe(150);expect(predictResource({...bar,current:200},now+60000,now)).toBe(200);expect(predictResource({...bar,nextTickAt:null},now+3600000,now)).toBeNull();expect(predictResource(bar,now+3600000,now+16*60000)).toBeNull();
  });
  it('clears a finished war on a valid null response while retaining it during an API failure',()=>{
    const app=trip(),before:Snapshot={source:'live',provider:'torn',generatedAt:now,war:{active:true,opponent:'Opponent',score:1,targetScore:10,endsAt:null},chain:null,travel:null,player:{level:null},stocks:[],targets:[]};
    expect(mergeSnapshot(before,{...before,war:null},app,now).war).toBeNull();expect(mergeSnapshot(before,{...before,war:null,issues:{war:'failed'}},app,now).war?.active).toBe(true);
  });
  it('preserves newer page stocks and prices through failed or older API updates',()=>{
    const app=trip(),before:Snapshot={source:'live',provider:'torn',generatedAt:now,war:null,chain:null,travel:null,travelApp:app,player:{level:null},targets:[],stocks:[stock()]};
    const merged=mergeSnapshot(before,{...before,issues:{stocks:'failed'},stocks:[stock({stock:null,observedAt:null,tornValue:null})]},app,now+1000);expect(merged.stocks[0]?.stock).toBe(43);expect(merged.stocks[0]?.tornValue).toBe(70455);expect(app.quality).toBe('error-with-cache');
    expect(mergeSnapshot(merged,{...before,stocks:[stock({stock:1,observedAt:now-1000})]},app,now+2000).stocks[0]?.stock).toBe(43);
  });
});
