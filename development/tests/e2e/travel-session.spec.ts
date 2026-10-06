import {test,expect,chromium,type BrowserContext,type Worker,type Page} from '@playwright/test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {defaultState,type TravelApp} from '@tcd/shared';
const KEY='TESTONLYKEY12345';
type World={phase:'OUTBOUND'|'ABROAD'|'RETURNING'|'AT_HOME';offset:number;departed:number;arrives:number;fail:boolean;logs:{id:string;timestamp:number;details:{id:number;title:string};data:{item:number;quantity:number;cost_each:number;cost_total:number}}[]};
const launch=(profile:string)=>chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1680,height:1080},args:[`--disable-extensions-except=${resolve('..')}`,`--load-extension=${resolve('..')}`]});
async function network(context:BrowserContext,world:World){
  const html=(await readFile('packages/extension/demo/index.html','utf8')).replace('<script type="module" src="demo.js"></script>','');
  await context.route('https://www.torn.com/**',async route=>{
    const u=new URL(route.request().url());
    if(u.searchParams.get('sid')==='travelData'){
      if(u.searchParams.get('step')==='shop')return route.fulfill({json:{country:'UAE',stock:[{ID:1,price:14000,stock:43},{ID:2,price:500,stock:50},{ID:5,price:2000,stock:30}]}});
      const item=Number(u.searchParams.get('itemID')),qty=Number(u.searchParams.get('amount')),cost=item===1?14000:item===2?500:2000;
      if(u.searchParams.get('fail'))return route.fulfill({json:{success:false,error:'Not enough money'}});
      world.logs.push({id:String(world.logs.length+1),timestamp:Math.floor((Date.now()+world.offset)/1000),details:{id:4201,title:'Item abroad buy'},data:{item,quantity:qty,cost_each:cost,cost_total:cost*qty}});
      return route.fulfill({json:u.searchParams.has('opaque')?{cost_each:cost,cost_total:cost*qty}:{success:true,country:'UAE',cost_each:cost,cost_total:cost*qty}});
    }
    return route.fulfill({body:html.replace('<span class="plane">✈</span>',`<span class="plane">✈</span>${world.phase==='AT_HOME'?'':`<p>${world.phase==='RETURNING'?'Dubai to Torn':'Torn to Dubai'}. Remaining Flight Time - 02:59:37</p>`}`),contentType:'text/html'});
  });
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(world=>{
    const g=globalThis as unknown as {world:World;nativeNow:typeof Date.now;calls:string[]};g.world=world;g.nativeNow=Date.now.bind(Date);g.calls=[];Date.now=()=>g.nativeNow()+g.world.offset;
    const original=fetch.bind(globalThis);
    globalThis.fetch=async(input,options)=>{
      const u=new URL(String(input)),w=g.world,now=Math.floor(Date.now()/1000);if(u.protocol==='chrome-extension:')return original(input,options);
      if(u.hostname==='yata.yt'){if(new Headers(options?.headers).has('authorization'))throw new Error('Key leak');return new Response(JSON.stringify({stocks:{uae:{update:now,stocks:[{id:1,quantity:43},{id:2,quantity:50},{id:5,quantity:30}]},jap:{update:now,stocks:[{id:4,quantity:100}]}}}));}
      if(u.hostname!=='api.torn.com'||new Headers(options?.headers).get('authorization')!=='ApiKey TESTONLYKEY12345')throw new Error('Unexpected endpoint');g.calls.push(u.pathname+u.search);
      if(w.fail)return new Response('PRIVATE_PROVIDER_FAILURE',{status:503});
      const payloads:Record<string,unknown>={
        'key/info':{info:{user:{id:55,faction_id:null,company_id:null},access:{level:4,type:'Full'},selections:{user:['log']}}},
        'user/profile':{profile:{id:55,name:'Fixture',level:40,status:{state:w.phase==='ABROAD'?'Abroad':w.phase==='AT_HOME'?'Okay':'Traveling',description:''}}},
        'user/travel':{travel:{destination:w.phase==='RETURNING'||w.phase==='AT_HOME'?'Torn':'UAE',method:'Airstrip',departed_at:Math.floor(w.departed/1000),arrival_at:Math.floor(w.arrives/1000),time_left:w.phase==='ABROAD'||w.phase==='AT_HOME'?0:Math.max(0,Math.floor(w.arrives/1000)-now)}},
        'torn/items':{items:[{id:1,name:'Camel Plushie',type:'Plushie',value:{market_price:70455,shops:[{country:'UAE',buy_price:14000}]}},{id:2,name:'Tribulus Omanense',type:'Flower',value:{market_price:2000,shops:[{country:'UAE',buy_price:500}]}},{id:5,name:'Fixture Booster',type:'Booster',value:{market_price:4000,shops:[{country:'UAE',buy_price:2000}]}},{id:4,name:'Monkey Plushie',type:'Plushie',value:{market_price:50000,shops:[{country:'Japan',buy_price:10000}]}}]},
        'user/inventory':{inventory:{timestamp:now,items:u.searchParams.get('cat')==='Plushie'?[{id:1,amount:2,faction_owned:false}]:[]},_metadata:{links:{next:null},total:1}},
        'user/bars':{bars:Object.fromEntries(['energy','nerve','life'].map((k,i)=>[k,{current:i===0?105:i===1?37:2070,maximum:i===0?150:i===1?45:2070,increment:i===0?5:i===1?1:10,interval:300,tick_time:180}]))},
        'user/perks':{perks:{faction:['+14 travel capacity'],job:[],enhancer:[],book:[]}},
        'torn/logtypes':{logtypes:[{id:4201,title:'Item abroad buy'}]},
        'user/log':{log:w.logs,_metadata:{links:{next:null},total:w.logs.length}}
      };
      return new Response(JSON.stringify(payloads[u.pathname.replace('/v2/','')]||{error:{code:16}}));
    };
  },world);return worker;
}
async function update(worker:Worker,world:World,options:Page){await worker.evaluate(w=>{(globalThis as unknown as {world:World}).world=w;},world);await options.evaluate(()=>chrome.runtime.sendMessage({type:'REFRESH_DATA'}));}
async function model(worker:Worker):Promise<TravelApp>{return worker.evaluate(async()=>(await chrome.storage.local.get<{travelDataV1:{snapshot:{travelApp:TravelApp}}}>('travelDataV1')).travelDataV1.snapshot.travelApp);}
async function pageClock(page:Page,world:World){
  await page.evaluate(offset=>{const g=window as unknown as {nativeNow?:typeof Date.now};g.nativeNow ||= Date.now.bind(Date);Date.now=()=>g.nativeNow!()+offset;},world.offset);
  const cdp=await page.context().newCDPSession(page);let isolated=0;
  cdp.on('Runtime.executionContextCreated',event=>{if(event.context.auxData?.type==='isolated'&&!event.context.name.startsWith('__playwright'))isolated=event.context.id;});await cdp.send('Runtime.enable');await expect.poll(()=>isolated).toBeGreaterThan(0);
  await cdp.send('Runtime.evaluate',{contextId:isolated,expression:`window.fixtureNow ||= Date.now.bind(Date); Date.now=()=>window.fixtureNow()+${world.offset}`});await cdp.detach();
}

test('real extension tracks outbound, shopping, return, persisted cache, outage, stale prices and history',async()=>{
  test.setTimeout(120000);const profile=await mkdtemp(join(tmpdir(),'torndashboard-trip-'));let context=await launch(profile);
  const world:World={phase:'OUTBOUND',offset:0,departed:Date.now()-60000,arrives:Date.now()+60000,fail:false,logs:[]};
  try{
    let worker=await network(context,world);const id=new URL(worker.url()).hostname,state=defaultState();state.settings.stockProvider='yata';state.favorites=[{itemId:1,name:'Camel Plushie',country:'UAE',minimumStock:1,alert:false}];
    await worker.evaluate(async state=>chrome.storage.local.set({state,personalApiV4:true}),state);
    let options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);await options.getByLabel('Torn API key').fill(KEY);await options.getByRole('button',{name:'Connect Torn API',exact:true}).click();await expect(options.locator('#key-status')).toContainText('#55');
    let page=await context.newPage();await page.goto('https://www.torn.com/page.php?sid=travel');let host=page.locator('#tcd-dashboard'),profit=host.locator('[data-widget-id="travel-profit"]');
    await expect(host.getByLabel('Dashboard preset')).toHaveValue('TRAVEL');await expect(page.locator('#tcd-travel-dock')).toHaveCount(0);await expect(host.locator('[data-widget-id="travel-status"]')).toHaveCount(0);await expect(host.locator('[data-widget-id="restock"]')).toHaveCount(0);await expect(profit).toHaveCount(0);await expect(host.locator('[data-widget-id="travel-favorites"]')).toContainText('Camel Plushie');await expect(host.locator('[data-widget-id="travel-favorites"]')).not.toContainText('Monkey Plushie');
    await expect.poll(async()=>(await model(worker)).inventory?.items['1']).toBe(2);
    // Actual page request responses drive the isolated observer, not injected application state.
    world.phase='ABROAD';world.offset+=31000;await pageClock(page,world);
    await page.evaluate(()=>{document.querySelector('#travel-flight')!.innerHTML='<h1>UAE shop</h1><div class="info-msg-cont"><p class="msg">Bag <strong>0 / 29</strong></p></div><button id="return-torn">Return to Torn</button>';});
    await update(worker,world,options);await page.evaluate(async()=>{await fetch('/page.php?sid=travelData&step=shop').then(r=>r.json());});
    await expect.poll(async()=>(await model(worker)).travel.state).toBe('ABROAD');await expect(page.locator('#tcd-travel-dock')).toHaveCount(0);
    await expect.poll(async()=>(await model(worker)).bag.total).toBe(29);
    await page.evaluate(async()=>{await fetch('/page.php?sid=travelData&step=buy&itemID=1&amount=20').then(r=>r.json());document.querySelector('.msg strong')!.textContent='20 / 29';});
    await expect(profit).toContainText('+$1,129,100');await expect(profit).toContainText('20 purchased');await expect(profit.getByText('Purchase details',{exact:true})).toBeVisible();await expect(profit.locator('.trip-details')).not.toHaveAttribute('open','');await profit.getByText('Purchase details',{exact:true}).click();
    await expect.poll(async()=>(await model(worker)).bag.used).toBe(20);
    // Failed purchases and unrelated inventory additions must not become automatic purchases.
    await page.evaluate(async()=>{await fetch('/page.php?sid=travelData&step=buy&itemID=1&amount=99&fail=1').then(r=>r.json());});
    await page.evaluate(async()=>{await fetch('/page.php?sid=travelData&step=buy&itemID=2&amount=5&opaque=1').then(r=>r.json());document.querySelector('.msg strong')!.textContent='25 / 29';});
    await expect.poll(async()=>(await model(worker)).travelSession?.purchases.some(p=>p.itemId===2&&p.source==='inventory-corroborated')).toBe(true);
    await page.evaluate(async()=>{await fetch('/page.php?sid=travelData&step=buy&itemID=5&amount=4').then(r=>r.json());document.querySelector('.msg strong')!.textContent='29 / 29';});
    await expect(profit.locator('tbody tr')).toHaveCount(3);await expect(profit).toContainText('+$1,144,600');await expect(profit).toContainText('29 / 29');
    await page.locator('#return-torn').click();await page.evaluate(()=>{document.querySelector('#travel-flight')!.innerHTML='<h1>Loading flight…</h1>';});
    await expect.poll(async()=>(await model(worker)).travel.state).toBe('RETURNING');await expect(profit).toContainText('UAE');await expect(host.locator('[data-widget-id="travel-favorites"]')).toContainText('Camel Plushie');
    world.phase='RETURNING';world.offset+=61000;world.departed=Date.now()+world.offset;world.arrives=world.departed+3*3600000;await pageClock(page,world);await update(worker,world,options);
    await expect.poll(async()=>(await model(worker)).travelSession?.purchases.filter(p=>p.source==='api-log').length).toBe(3);
    await expect(profit).toContainText('+$1,144,600');await expect.poll(async()=>(await model(worker)).travel.originCountry).toBe('UAE');await expect(page.locator('#tcd-travel-dock')).toHaveCount(0);
    const tripId=(await model(worker)).travelSession!.tripId;
    await page.reload();await pageClock(page,world);await expect(profit).toContainText('UAE');await expect(profit).toContainText('+$1,144,600');expect((await model(worker)).travelSession!.tripId).toBe(tripId);
    await page.screenshot({path:resolve('docs/travel-return-preview.png'),fullPage:true});
    // A full browser restart recreates the service worker and forces an API outage.
    await context.close();world.fail=true;context=await launch(profile);worker=await network(context,world);expect(new URL(worker.url()).hostname).toBe(id);
    options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);page=await context.newPage();await page.goto('https://www.torn.com/page.php?sid=travel');await pageClock(page,world);host=page.locator('#tcd-dashboard');profit=host.locator('[data-widget-id="travel-profit"]');
    await expect(profit).toContainText('+$1,144,600');await expect(host.locator('[data-widget-id="travel-favorites"]')).toContainText('UAE');await expect.poll(async()=>(await model(worker)).quality).toBe('error-with-cache');await expect(page.locator('#tcd-dashboard')).not.toContainText('Unable to save or refresh');await expect(page.locator('#tcd-dashboard')).not.toContainText('PRIVATE_PROVIDER');
    world.offset+=4*3600000;await pageClock(page,world);await update(worker,world,options);await expect(profit).toContainText('low confidence');await profit.getByText('Purchase details',{exact:true}).click();await expect(profit).toContainText('~$70,455');await expect(host.locator('[data-widget-id="travel-favorites"]')).toContainText('last seen');expect((await model(worker)).travel.marketContextCountry).toBe('UAE');
    world.phase='AT_HOME';world.fail=false;world.offset+=61000;await pageClock(page,world);await page.evaluate(()=>{document.querySelector('#travel-flight')!.innerHTML='<h1>Torn</h1>';});await update(worker,world,options);await expect.poll(async()=>(await model(worker)).travel.homeConfirmedAt).not.toBeNull();
    world.offset+=16000;await pageClock(page,world);await worker.evaluate(w=>{(globalThis as unknown as {world:World}).world=w;},world);await options.getByRole('button',{name:'Refresh data',exact:true}).click();
    await expect.poll(async()=>(await model(worker)).history.length).toBe(1);expect((await model(worker)).travel.state).toBe('AT_HOME');expect((await model(worker)).travel.marketContextCountry).toBeNull();await expect(profit).toHaveCount(0);await expect(options.locator('#trip-history')).toContainText('+$1,144,600');expect((await model(worker)).history[0]?.actualProfit).toBeNull();
    expect(await page.content()).not.toContain(KEY);expect(await options.locator('#trip-history').textContent()).not.toContain('PRIVATE');
  }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});
