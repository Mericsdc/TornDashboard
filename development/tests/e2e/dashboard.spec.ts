import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultState, type PublicState } from '@tcd/shared';
const TEST_KEY='TESTONLYKEY12345';
const fixture=async()=> (await readFile('packages/extension/demo/index.html','utf8')).replace('<script type="module" src="demo.js"></script>','').replace('<span class="plane">✈</span>','<span class="plane">✈</span><p>Dubai to Torn. Remaining Flight Time - 01:10:43</p>');
const launch=(profile:string)=>chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1680,height:1080},args:[`--disable-extensions-except=${resolve('..')}`,`--load-extension=${resolve('..')}`]});
async function mockTorn(context:BrowserContext,state:{travel:boolean;director?:boolean;chainTimeout?:number}){
  const calls:string[]=[];
  await context.route('https://www.torn.com/**',async route=>route.fulfill({body:state.travel?(await fixture()).replace('Dubai to Torn','Torn to Dubai'):(await fixture()).replace(/<p>Dubai to Torn\. Remaining Flight Time[^<]*<\/p>/,''),contentType:'text/html'}));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(state=>{
    const testGlobal=globalThis as unknown as {fixtureCalls:string[];fetch:typeof fetch};testGlobal.fixtureCalls=[];
    const nativeFetch=globalThis.fetch.bind(globalThis);
    testGlobal.fetch=async(input,options)=>{
    const url=new URL(String(input)),now=Math.floor(Date.now()/1000);
    if(url.protocol==='chrome-extension:')return nativeFetch(input,options);
    if(url.hostname==='yata.yt'){
      if(new Headers(options?.headers).has('authorization'))throw new Error('Key leaked to stock provider');
      return new Response(JSON.stringify({stocks:{uae:{update:now,stocks:[{id:1,quantity:50},{id:2,quantity:0},{id:3,quantity:1000}]},swi:{update:now,stocks:[{id:3,quantity:100}]},jap:{update:now,stocks:[{id:4,quantity:10}]}}}));
    }
    if(url.hostname==='api.torn.com'&&url.pathname==='/v2/key/info'&&!new Headers(options?.headers).has('authorization')){testGlobal.fixtureCalls.push('anonymous-key/info');return new Response(JSON.stringify({error:{code:2}}));}
    if(url.hostname!=='api.torn.com'||new Headers(options?.headers).get('authorization')!=='ApiKey TESTONLYKEY12345')throw new Error('Unexpected API request');
    const path=url.pathname.replace('/v2/','');testGlobal.fixtureCalls.push(path);
    const payloads:Record<string,unknown>={
      'key/info':{info:{user:{id:55,faction_id:10,company_id:state.director?88:null},access:{level:1,type:'Minimal'},selections:{}}},
      'user/profile':{profile:{id:55,name:'Fixture player',level:40,status:{state:state.travel?'Traveling':'Okay',description:state.travel?'Traveling to UAE':'Okay'}}},
      'user/travel':{travel:{destination:state.travel?'UAE':'Torn',departed_at:now-100,arrival_at:state.travel?now+500:now-1,time_left:state.travel?500:0,method:'Airstrip'}},
      'faction/chain':{chain:{id:42,current:49,max:49,timeout:state.chainTimeout??120,start:now-500,end:0}},
      'faction/wars':{wars:{ranked:{war_id:8,start:now-10000,end:null,winner:null,target:1000,factions:[{id:10,name:'Our faction',score:450},{id:20,name:'Actual opponent',score:200}]}}},
      'faction/20/members':{members:[{id:123,name:'Opponent A',level:20,status:{state:'Okay',description:'Okay',until:null},last_action:{status:'Offline'}},{id:124,name:'Opponent hospital',level:30,status:{state:'Hospital',description:'Hospital',until:now+120},last_action:{status:'Online'}}]},
      'torn/items':{items:[{id:1,name:'Camel Plushie',value:{market_price:3000,shops:[{country:'UAE',buy_price:100}]}},{id:2,name:'Tribulus Omanense',value:{market_price:2000,shops:[{country:'UAE',buy_price:500}]}},{id:3,name:'Xanax',value:{market_price:900000,shops:[{country:'Switzerland',buy_price:840000}]}},{id:4,name:'Monkey Plushie',value:{market_price:40000,shops:[{country:'Japan',buy_price:10000}]}}]},
      'company/profile':{profile:{name:'Director company',director:{id:55}}},'company/employees':{employees:[{id:99,name:'Employee A',effectiveness:{addiction:-8}}]}
    };
    return new Response(JSON.stringify(payloads[path]||{error:{code:16}}));
    };
  },state);
  void calls;
  return worker;
}

async function isolatedContext(context:BrowserContext,page:import('@playwright/test').Page){const cdp=await context.newCDPSession(page);let isolated=0;cdp.on('Runtime.executionContextCreated',event=>{if(event.context.auxData?.type==='isolated'&&!event.context.name.startsWith('__playwright'))isolated=event.context.id;});await cdp.send('Runtime.enable');await expect.poll(()=>isolated).toBeGreaterThan(0);return{cdp,isolated};}

test('Chrome host access, connection retry and anonymous diagnosis protect key setup',async()=>{
  const profile=await mkdtemp(join(tmpdir(),'torndashboard-connection-profile-')),context=await launch(profile);
  try{
    const worker=await mockTorn(context,{travel:false}),id=new URL(worker.url()).hostname,options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);await expect(options.locator('#status')).toHaveText('Ready');
    // Revoke actual Chrome host access in this disposable profile, rather than mocking contains().
    const management=await context.newPage();await management.goto(`chrome://extensions/?id=${id}`);await expect(management.getByRole('heading',{name:'TornDashboard',level:1,exact:true})).toBeVisible();
    const hostAccess=async(value:'ON_CLICK'|'ON_ALL_SITES')=>management.evaluate(async({id,value})=>{const browser=chrome as unknown as {developerPrivate:{updateExtensionConfiguration(config:{extensionId:string;hostAccess:string}):Promise<void>}};await browser.developerPrivate.updateExtensionConfiguration({extensionId:id,hostAccess:value});},{id,value});
    await hostAccess('ON_CLICK');expect(await worker.evaluate(()=>chrome.permissions.contains({origins:['https://api.torn.com/*']}))).toBe(false);
    for(const message of [{type:'TEST_CONNECTION'},{type:'SAVE_KEY',key:TEST_KEY,remember:true}])expect(await options.evaluate(message=>chrome.runtime.sendMessage(message),message)).toMatchObject({ok:false,error:expect.stringContaining('Chrome has blocked')});
    expect(await worker.evaluate(()=>(globalThis as unknown as {fixtureCalls:string[]}).fixtureCalls)).toEqual([]);
    // Native Chrome permission prompts need a human; exercise denial without opening that prompt in CI.
    await options.evaluate(()=>{const testWindow=window as unknown as {originalRequest:typeof chrome.permissions.request;permissionCalls:chrome.permissions.Permissions[]};testWindow.originalRequest=chrome.permissions.request.bind(chrome.permissions);testWindow.permissionCalls=[];chrome.permissions.request=async permissions=>{testWindow.permissionCalls.push(permissions);return false;};});
    await options.getByLabel('Torn API key').fill(TEST_KEY);await options.getByRole('button',{name:'Connect Torn API',exact:true}).click();await expect(options.locator('#status')).toContainText('Chrome has blocked');expect(await worker.evaluate(async()=>Boolean((await chrome.storage.local.get('tornCredential')).tornCredential))).toBe(false);
    expect(await options.evaluate(()=>(window as unknown as {permissionCalls:chrome.permissions.Permissions[]}).permissionCalls)).toEqual([{origins:['https://api.torn.com/*']}]);
    // Restore Chrome access, then use the real permissions API and inject one transport failure.
    await hostAccess('ON_ALL_SITES');await options.evaluate(()=>{chrome.permissions.request=(window as unknown as {originalRequest:typeof chrome.permissions.request}).originalRequest;});
    await worker.evaluate(()=>{const testGlobal=globalThis as unknown as {fetch:typeof fetch;connectAttempts:number},fixtureFetch=globalThis.fetch.bind(globalThis);testGlobal.connectAttempts=0;testGlobal.fetch=async(input,options)=>{if(String(input).endsWith('/key/info')&&new Headers(options?.headers).has('authorization')&&++testGlobal.connectAttempts===1)throw new TypeError('PRIVATE_NETWORK_DETAIL');return fixtureFetch(input,options);};});
    await options.getByRole('button',{name:'Connect Torn API',exact:true}).click();await expect(options.locator('#key-status')).toContainText('#55');await expect(options.getByLabel('Torn API key')).toHaveValue('');expect(await worker.evaluate(()=>(globalThis as unknown as {connectAttempts:number}).connectAttempts)).toBe(2);
    await options.getByRole('button',{name:'Test connection',exact:true}).click();await expect(options.locator('#status')).toContainText('No API key was sent');expect((await worker.evaluate(()=>(globalThis as unknown as {fixtureCalls:string[]}).fixtureCalls)).filter(path=>path==='anonymous-key/info')).toHaveLength(1);
    await worker.evaluate(()=>{globalThis.fetch=async()=>{throw new TypeError('PRIVATE_KEY_OR_NETWORK_DETAIL');};});await options.getByLabel('Torn API key').fill('TESTONLYKEY54321');await options.getByRole('button',{name:'Connect Torn API',exact:true}).click();await expect(options.locator('#status')).toContainText('Chrome could not reach');await expect(options.locator('#status')).not.toContainText('PRIVATE');await expect(options.getByRole('button',{name:'Connect Torn API',exact:true})).toBeEnabled();expect(await worker.evaluate(async()=>(await chrome.storage.local.get<{tornCredential:{key:string}}>('tornCredential')).tornCredential.key)).toBe(TEST_KEY);
  }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});

test('responsive preview, explicit save, separated arrangement and SPA dock recovery',async({page})=>{
  await page.goto('/');const host=page.locator('#tcd-dashboard');await expect(host).toHaveAttribute('data-placement','gutters');await expect(host.locator('.widget-card')).toHaveCount(2);
  await host.getByLabel('Panel settings').click();await host.getByLabel('Width',{exact:true}).fill('340');await host.getByLabel('density',{exact:true}).selectOption('comfortable');await host.getByLabel('theme',{exact:true}).selectOption('slate');
  await expect(host.locator('.dashboard')).toHaveAttribute('data-theme','liquid-glass');await host.getByRole('button',{name:'Save settings',exact:true}).click();await expect(host.locator('.dashboard')).toHaveAttribute('data-theme','slate');
  await page.setViewportSize({width:1680,height:1080});await expect(host).toHaveAttribute('data-placement','gutters');await expect(host.getByLabel('Drag Chain',{exact:true})).toBeHidden();
  const box=await host.locator('.panel[data-side="left"]').boundingBox();expect(box!.width).toBeLessThan(340);expect(box!.y).toBeLessThan(200);
  await host.getByLabel('Arrange widgets',{exact:true}).click();await expect(host.getByLabel('Drag Chain',{exact:true})).toBeVisible();await host.getByLabel('Arrange widgets',{exact:true}).click();
  await page.reload();await expect(host.locator('.dashboard')).toHaveAttribute('data-theme','slate');
  await page.getByRole('button',{name:'Simulate SPA navigation'}).click();await expect(host).toHaveCount(1);await expect(host.getByLabel('Dashboard preset')).toHaveValue('TRAVEL');await expect(host.locator('[data-widget-id="chain"]')).toHaveCount(0);
  const dock=page.locator('#tcd-travel-dock');await expect(dock).toHaveCount(1);await expect(dock).toBeVisible();await expect(dock.locator('.widget-card')).toHaveCount(1);await expect(page.locator('main #tcd-travel-dock')).toHaveCount(1);
  await page.setViewportSize({width:760,height:900});await expect(host).toHaveAttribute('data-placement','inline');const main=await page.locator('main').boundingBox(),dashboard=await host.boundingBox();expect(dashboard!.y).toBeLessThan(main!.y);
});

test('same-folder updates retain identity, personal key and saved preferences',async()=>{
  const profile=await mkdtemp(join(tmpdir(),'torndashboard-update-profile-')),staging=await mkdtemp(join(tmpdir(),'torndashboard-update-stage-')),extensionPath=resolve('..');
  const{readRuntime,promoteExtension}=await import(/* @vite-ignore */new URL('../../scripts/extension-runtime.mjs',import.meta.url).href);const original=await readRuntime(extensionPath);let context=await launch(profile);
  try{
    let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname,state=defaultState();state.settings.theme='slate';state.settings.gap=14;
    const tornCredential={key:TEST_KEY,userId:55,remember:true};await worker.evaluate(async data=>chrome.storage.local.set(data),{state,tornCredential,personalApiV4:true});await context.close();
    for(const[name,contents]of original.files)await writeFile(join(staging,name),contents);const parts=original.manifest.version.split('.').map(Number);await writeFile(join(staging,'manifest.json'),JSON.stringify({...original.manifest,version:`${parts[0]}.${parts[1]}.${parts[2]+1}`}));await promoteExtension(staging,extensionPath);
    context=await launch(profile);worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');expect(new URL(worker.url()).hostname).toBe(id);const retained=await worker.evaluate(async()=>chrome.storage.local.get<{state:PublicState;tornCredential:unknown}>(['state','tornCredential']));expect(retained.tornCredential).toEqual(tornCredential);expect(retained.state.settings.theme).toBe('slate');expect(retained.state.settings.gap).toBe(14);
  }finally{await context.close();for(const[name,contents]of original.files)await writeFile(join(staging,name),contents);await promoteExtension(staging,extensionPath);await rm(staging,{recursive:true,force:true});await rm(profile,{recursive:true,force:true});}
});

test('legacy BOS state migrates, saves dragging and keeps personal credentials outside content scripts',async()=>{
  const profile=await mkdtemp(join(tmpdir(),'torndashboard-migration-profile-')),context=await launch(profile);
  try{
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
    const legacy=defaultState();legacy.settings.dataSource='bosbot';legacy.settings.autoSwitching=false;legacy.layouts.WAR.right.push('restock');delete(legacy.layouts as Partial<typeof legacy.layouts>).CUSTOM;
    await worker.evaluate(async state=>{await chrome.storage.local.clear();await chrome.storage.local.set({state,bosbotDevice:{token:'TEST_ONLY_OLD_DEVICE'}});},legacy);
    await context.route('https://www.torn.com/**',async route=>route.fulfill({body:await fixture(),contentType:'text/html'}));
    const page=await context.newPage();await page.goto('https://www.torn.com/index.php');const host=page.locator('#tcd-dashboard');await expect(host.locator('.source-badge')).toHaveText('NO DATA');await host.getByLabel('Dashboard preset').selectOption('WAR');await expect(host.locator('.widget-card')).toHaveCount(2);await host.getByLabel('Arrange widgets').click();
    const left=host.locator('.widget-list[data-side="left"]'),right=host.locator('.widget-list[data-side="right"]'),handle=await right.getByLabel('Drag Recommended Targets',{exact:true}).boundingBox(),destination=await left.boundingBox();
    await page.mouse.move(handle!.x+handle!.width/2,handle!.y+handle!.height/2);await page.mouse.down();await page.mouse.move(handle!.x+handle!.width/2+15,handle!.y+handle!.height/2,{steps:4});await page.mouse.move(destination!.x+destination!.width/2,destination!.y+destination!.height-10,{steps:30});await page.mouse.up();
    await expect(left.locator('[data-widget-id="recommended-targets"]')).toHaveCount(1);await page.reload();await expect(left.locator('[data-widget-id="recommended-targets"]')).toHaveCount(1);
    const migrated=await worker.evaluate(async()=>chrome.storage.local.get<{state:PublicState;bosbotDevice?:unknown}>(['state','bosbotDevice']));expect(migrated.state.settings.dataSource).toBe('torn');expect(migrated.state.layouts.CUSTOM.right).toContain('restock');expect(migrated.bosbotDevice).toBeUndefined();
    const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);await expect(options.getByLabel('Torn API key')).toHaveCount(1);await expect(options.getByText('BOSBOT connection',{exact:true})).toHaveCount(0);
    const{cdp,isolated}=await isolatedContext(context,page);
    for(const type of ['KEY_STATUS','SAVE_KEY','TEST_CONNECTION']){const denied=await cdp.send('Runtime.evaluate',{contextId:isolated,expression:`chrome.runtime.sendMessage({type:'${type}',${type==='SAVE_KEY'?`key:'${TEST_KEY}',remember:true`:''}})`,awaitPromise:true,returnByValue:true});expect(denied.result.value).toMatchObject({ok:false});}
    const denied=await cdp.send('Runtime.evaluate',{contextId:isolated,expression:"(async()=>{try{await chrome.storage.local.get('tornCredential');return false}catch{return true}})()",awaitPromise:true,returnByValue:true});expect(denied.result.value).toBe(true);
    await host.getByLabel('Dashboard preset').selectOption('CUSTOM');await expect(host.getByLabel('Dashboard preset')).toHaveValue('CUSTOM');await expect(host.locator('[data-widget-id="restock"]')).toHaveCount(1);
  }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});

test('personal API and YATA power only Dubai travel products, grouped watches and cached automatic capacity',async()=>{
  test.setTimeout(90000);const profile=await mkdtemp(join(tmpdir(),'torndashboard-travel-profile-')),context=await launch(profile);
  try{
    const calls=await mockTorn(context,{travel:true}),worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
    const state=defaultState();state.settings.stockProvider='yata';state.settings.travelCapacityOverride=29;state.favorites=[{itemId:3,name:'Xanax',country:'Switzerland',minimumStock:1,alert:true}];
    await worker.evaluate(async data=>{await chrome.storage.local.set(data);},{state,personalApiV4:true});
    const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);await options.getByLabel('Torn API key').fill(TEST_KEY);await options.getByRole('button',{name:'Connect Torn API',exact:true}).click();await expect(options.locator('#key-status')).toContainText('#55');
    const page=await context.newPage();await page.goto('https://www.torn.com/page.php?sid=travel');const host=page.locator('#tcd-dashboard'),dock=page.locator('#tcd-travel-dock');
    await expect(host.locator('.source-badge')).toHaveText('TORN API');await expect(host.getByLabel('Dashboard preset')).toHaveValue('TRAVEL');await expect(host.locator('[data-widget-id="chain"]')).toHaveCount(0);
    const market=dock.locator('[data-widget-id="travel-market"]');await expect(market).toContainText('UAE');await expect(market.locator('.market-product')).toHaveCount(2);await expect(market).not.toContainText('Xanax');await expect(market).not.toContainText('Monkey Plushie');
    await expect(dock.locator('[data-widget-id="travel-profit"]')).toHaveCount(0);await expect(market).toContainText('29 · manual');await expect(page.locator('#travel-flight + #tcd-travel-dock')).toHaveCount(1);
    await market.getByLabel('In stock only',{exact:true}).check();await expect(market.locator('.market-product')).toHaveCount(1);await market.getByLabel('In stock only',{exact:true}).uncheck();await market.getByLabel('Search products').fill('trib');await expect(market.locator('.market-product')).toHaveCount(1);await expect(market.getByLabel('Search products')).toHaveValue('trib');await expect(market.getByLabel('Search products')).toBeFocused();
    await market.getByLabel('Search products').fill('');await market.getByLabel('Watch Camel Plushie in UAE',{exact:true}).click();await expect(host.locator('[data-widget-id="travel-favorites"]')).toContainText('UAE');await expect(host.locator('[data-widget-id="travel-favorites"]')).not.toContainText('Switzerland');
    await options.reload();await expect(options.locator('#favorites .watch-country')).toHaveCount(2);await expect(options.locator('#favorites')).toContainText('Plushies');
    await options.getByRole('button',{name:'Test warning sound',exact:true}).click();await expect(options.locator('#status')).toContainText('Warning sound played');expect((await worker.evaluate(()=>chrome.runtime.getContexts({contextTypes:[chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]}))).length).toBe(1);
    const second=await context.newPage();await second.goto('https://www.torn.com/page.php?sid=travel');await expect(second.locator('#tcd-dashboard .source-badge')).toHaveText('TORN API');expect((await calls.evaluate(()=> (globalThis as unknown as {fixtureCalls:string[]}).fixtureCalls)).filter(path=>path==='torn/items')).toHaveLength(1);
    const reply=await options.evaluate(async()=>chrome.runtime.sendMessage({type:'READ_STATE'}));expect(JSON.stringify(reply)).not.toContain(TEST_KEY);expect(await page.content()).not.toContain(TEST_KEY);
    await page.screenshot({path:resolve('docs/travel-preview.png'),fullPage:true});
    await options.getByRole('button',{name:'Remove API key',exact:true}).click();await expect(options.locator('#key-status')).toContainText('No personal API key');await expect(host.locator('.source-badge')).toHaveText('NO DATA');await expect(dock).toBeHidden();
  }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});

test('WAR has only chain and live opponent recommendations, with an actual 30 second sound alert',async()=>{
  const profile=await mkdtemp(join(tmpdir(),'torndashboard-war-profile-')),context=await launch(profile);
  try{
    await mockTorn(context,{travel:false,chainTimeout:30});const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
    await worker.evaluate(async data=>chrome.storage.local.set(data),{state:{...defaultState(),favorites:[{itemId:3,name:'Xanax',country:'Switzerland',minimumStock:1,alert:false}]},personalApiV4:true});const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);await options.getByLabel('Torn API key').fill(TEST_KEY);await options.getByRole('button',{name:'Connect Torn API',exact:true}).click();await expect(options.locator('#key-status')).toContainText('#55');
    const page=await context.newPage();await page.goto('https://www.torn.com/index.php');const host=page.locator('#tcd-dashboard');await expect(host.getByLabel('Dashboard preset')).toHaveValue('WAR');await expect(host.locator('.widget-card')).toHaveCount(2);await expect(host.locator('[data-widget-id="recommended-targets"]')).toContainText('Actual opponent');await expect(host.locator('[data-widget-id="recommended-targets"]')).toContainText('Opponent A');await expect(host.locator('[data-widget-id="recommended-targets"]')).toContainText('Stats: unknown');await expect(host.locator('[data-widget-id="chain"] .chain-warning')).toBeVisible();
    await expect.poll(async()=>{const stored=await worker.evaluate(async()=>chrome.storage.local.get<{alertDelivery?:{failed:boolean}}>('alertDelivery'));return stored.alertDelivery?.failed;}).toBe(false);await expect.poll(async()=>{const stored=await worker.evaluate(async()=>chrome.storage.local.get<{alertState?:{memory:{seen:string[]}}}>('alertState'));return stored.alertState?.memory.seen.filter((key:string)=>key.startsWith('chain:')).length;}).toBe(1);
    await page.screenshot({path:resolve('docs/war-preview.png'),fullPage:true});
    await host.getByLabel('Dashboard preset').selectOption('TRAVEL');await expect(host.locator('[data-widget-id="restock"]')).toContainText('Waiting for market context');await expect(host.locator('[data-widget-id="restock"]')).not.toContainText('Xanax');
  }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});


test('company addiction is director-only, while CUSTOM retains arbitrary widget selection',async()=>{
  const profile=await mkdtemp(join(tmpdir(),'torndashboard-director-profile-')),context=await launch(profile);
  try{
    await mockTorn(context,{travel:false,director:true});const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).hostname;
    const state=defaultState();state.settings.mode='CUSTOM';state.settings.autoSwitching=false;
    await worker.evaluate(async data=>chrome.storage.local.set(data),{state,personalApiV4:true});const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);await options.getByLabel('Torn API key').fill(TEST_KEY);await options.getByRole('button',{name:'Connect Torn API',exact:true}).click();await expect(options.locator('#key-status')).toContainText('#55');
    const page=await context.newPage();await page.goto('https://www.torn.com/index.php');const host=page.locator('#tcd-dashboard');await expect(host.getByLabel('Dashboard preset')).toHaveValue('CUSTOM');await expect(host.locator('[data-widget-id="company-addiction"]')).toContainText('Employee A');await expect(host.locator('[data-widget-id="company-addiction"]')).toContainText('-8');await expect(host.locator('[data-widget-id="travel-profit"]')).toHaveCount(0);
    await expect(options.getByRole('heading',{name:'Appearance',exact:true})).toHaveCount(0);await expect(options.getByLabel('Panel width',{exact:true})).toHaveCount(0);await expect(options.getByRole('button',{name:'Reset appearance & layouts',exact:true})).toHaveCount(0);
    // Keep Options open while appearance changes on Torn, then save only Options-owned settings.
    await host.getByLabel('Panel settings').click();await host.getByLabel('Width',{exact:true}).fill('340');await host.getByLabel('density',{exact:true}).selectOption('comfortable');await host.getByLabel('theme',{exact:true}).selectOption('slate');await host.getByRole('button',{name:'Save settings',exact:true}).click();await expect(host.locator('.dashboard')).toHaveAttribute('data-theme','slate');
    await options.getByLabel('Total capacity · one-time fallback',{exact:true}).fill('29');await options.getByRole('button',{name:'Save settings',exact:true}).click();await expect(options.locator('#status')).toContainText('Settings saved');await expect(host.locator('.dashboard')).toHaveAttribute('data-density','comfortable');await expect(host.locator('.dashboard')).toHaveAttribute('data-theme','slate');
    const saved=await options.evaluate(async()=>chrome.runtime.sendMessage({type:'READ_STATE'}));expect(saved.data.settings.panelWidth).toBe(340);expect(saved.data.settings.travelCapacityOverride).toBe(29);await page.reload();await expect(host.locator('.dashboard')).toHaveAttribute('data-theme','slate');
    await host.getByLabel('Dashboard preset').selectOption('WAR');await expect(host.locator('.widget-card')).toHaveCount(2);await expect(host.locator('[data-widget-id="company-addiction"]')).toHaveCount(0);
  }finally{await context.close();await rm(profile,{recursive:true,force:true});}
});
