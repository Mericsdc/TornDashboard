import { FavoriteSchema, SettingsSchema, ACTIVE_WIDGET_IDS, category, freshStock, type PublicState, type Snapshot, type StockItem, historyTotals } from '@tcd/shared';
import { send } from '../services/protocol';
import { button, el, time, stat } from '../core/dom';
import { money } from '../core/format';
import { profitNodes, signedMoney } from '../widgets/travel-profit';
import { requestTornAccess } from '../services/torn-connection';
let state: PublicState, stocks: StockItem[] = [];
document.querySelector<HTMLElement>('#extension-version')!.textContent = `v${chrome.runtime.getManifest().version}`;
const status = document.querySelector<HTMLElement>('#status')!, form = document.querySelector<HTMLFormElement>('#settings-form')!;
function field(name: string, target = form): HTMLInputElement | HTMLSelectElement { return target.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement; }
function checked(name: string) { return (field(name) as HTMLInputElement).checked; }
function report(message: string, error = false): void { status.textContent = message; status.className = error ? 'error' : ''; }
function handle(promise: Promise<unknown>): void { void promise.catch(error => report(error instanceof Error ? error.message : 'Operation failed', true)); }
function connectionAction(message: string, action: () => Promise<void>): void {
  report(message);
  const buttons = document.querySelectorAll<HTMLButtonElement>('#key-form button'); buttons.forEach(button => { button.disabled = true; });
  // Request in this click/submit gesture, before any asynchronous worker or storage call.
  const permission = requestTornAccess();
  handle((async () => { try { await permission; await action(); } finally { buttons.forEach(button => { button.disabled = false; }); } })());
}
function render(): void {
  for (const [name,value] of Object.entries(state.settings)) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(value);
    else if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) input.value = String(value);
  }
  for (const [name,value] of Object.entries({ chainAlert: state.settings.alerts.chain, stockAlert: state.settings.alerts.stock, soundAlert: state.settings.alerts.sound, restockReminder: state.settings.alerts.restockReminder, yata: state.settings.stockProvider === 'yata' })) (field(name) as HTMLInputElement).checked = value;
  field('travelCapacityOverride').value = state.settings.travelCapacityOverride === null ? '' : String(state.settings.travelCapacityOverride);
  const widgets = document.querySelector<HTMLElement>('#widget-settings')!; widgets.replaceChildren();
  for (const id of ACTIVE_WIDGET_IDS) { const label = el('label'), input = el('input'); input.type = 'checkbox'; input.name = `widget-${id}`; input.checked = !state.settings.disabledWidgets.includes(id); label.append(input, el('span','', id.replaceAll('-',' '))); widgets.append(label); }
  renderFavorites();
}
function renderFavorites(): void {
  const container = document.querySelector<HTMLElement>('#favorites')!; container.replaceChildren();
  const countries = [...new Set(state.favorites.map(f => f.country))].sort();
  if (!countries.length) container.append(el('p','muted','No watched products yet. Add a country and product below.'));
  for (const country of countries) {
    const group = el('details', 'watch-country'); group.open = true;
    const favorites = state.favorites.filter(f => f.country === country); group.append(el('summary','', `${country} · ${favorites.length} watched`));
    for (const kind of ['flowers','plushies','other'] as const) {
      const entries = favorites.filter(f => category(f) === kind); if (!entries.length) continue;
      group.append(el('h3','',kind.charAt(0).toUpperCase()+kind.slice(1)));
      for (const favorite of entries) {
        const row = el('div','favorite'), threshold = el('input'), enabled = el('input'); threshold.type='number'; threshold.min='1'; threshold.max='10000'; threshold.value=String(favorite.minimumStock); threshold.setAttribute('aria-label',`Minimum stock for ${favorite.name} in ${favorite.country}`);
        enabled.type='checkbox'; enabled.checked=favorite.alert; enabled.setAttribute('aria-label',`Alerts for ${favorite.name} in ${favorite.country}`);
        const stock = stocks.find(s=>s.itemId===favorite.itemId&&s.country===country), detail = el('div','watch-detail');
        detail.append(el('strong','',favorite.name),el('p','muted', stock ? `Stock ${freshStock(stock,Date.now()) ? stock.stock!.toLocaleString() : 'unknown'} · Cost ${money(stock.cost)} · Torn value ${money(stock.tornValue)} · Last seen ${stock.observedAt ? time(stock.observedAt) : 'unknown'}` : 'No stock observation yet'));
        const stockLabel=el('label','','Stock ≥'), alertLabel=el('label','inline','Alerts'); stockLabel.append(threshold); alertLabel.prepend(enabled);
        row.append(detail,stockLabel,alertLabel,button('Save watch',()=>handle((async()=>{ const updated=FavoriteSchema.parse({...favorite,minimumStock:threshold.valueAsNumber,alert:enabled.checked});state=await send<PublicState>({type:'SAVE_FAVORITES',favorites:state.favorites.map(f=>f.itemId===favorite.itemId&&f.country===country?updated:f)});renderFavorites();report('Watch saved');})())),button('Remove',()=>handle((async()=>{state=await send<PublicState>({type:'SAVE_FAVORITES',favorites:state.favorites.filter(f=>!(f.itemId===favorite.itemId&&f.country===country))});renderFavorites();report('Watch removed');})())));
        group.append(row);
      }
    }
    container.append(group);
  }
}
async function products(): Promise<void> {
  const data = await send<Snapshot>({type:'GET_SNAPSHOT'}); stocks=data.stocks;renderHistory(data);renderDataStatus(data);
  const list=document.querySelector<HTMLSelectElement>('#product-list')!; list.replaceChildren();
  for (const country of [...new Set(stocks.map(s=>s.country))].sort()) for (const kind of ['flowers','plushies','other'] as const) {
    const rows=stocks.filter(s=>s.country===country&&category(s)===kind).sort((a,b)=>a.name.localeCompare(b.name));if(!rows.length)continue;
    const group=el('optgroup');group.label=`${country} · ${kind}`;
    for(const item of rows){const option=el('option','',`${item.name} · ${money(item.cost)}`);option.value=`${country}:${item.itemId}`;group.append(option);}list.append(group);
  }
  renderFavorites();
}
async function keyStatus(): Promise<boolean> {
  const result=await send<{connected:boolean;userId?:number;remember?:boolean;access?:string;hasApiAccess:boolean}>({type:'KEY_STATUS'});
  document.querySelector('#key-status')!.textContent=result.connected?(result.hasApiAccess?`Connected to your Torn account #${result.userId} · ${result.access || 'API'} · ${result.remember?'Remembered on this browser':'Until Chrome closes'}`:`Key saved for account #${result.userId}. Chrome API access is blocked; click Test connection or Connect Torn API to restore it.`):'No personal API key connected';
  return result.connected;
}
form.addEventListener('submit',event=>{ event.preventDefault(); handle((async()=>{
  const stockProvider=checked('yata')?'yata':'off';
  if(stockProvider==='yata'&&!await chrome.permissions.request({origins:['https://yata.yt/*']}))throw new Error('YATA access was not granted');
  const nullable=(name:string)=>field(name).value.trim()===''?null:Number(field(name).value);
  // Send only fields edited here. An older Options tab must not overwrite appearance saved on Torn.
  const patch=SettingsSchema.pick({stockProvider:true,travelCapacityOverride:true,alerts:true,disabledWidgets:true}).parse({stockProvider,travelCapacityOverride:nullable('travelCapacityOverride'),alerts:{chain:checked('chainAlert'),stock:checked('stockAlert'),sound:checked('soundAlert'),restockReminder:checked('restockReminder')},disabledWidgets:ACTIVE_WIDGET_IDS.filter(id=>!checked(`widget-${id}`))});
  state=await send<PublicState>({type:'SAVE_SETTINGS',patch});render();report('Settings saved. Torn tabs update automatically.');handle(products());
})());});
document.querySelector<HTMLFormElement>('#key-form')!.addEventListener('submit',event=>{event.preventDefault();const target=event.currentTarget as HTMLFormElement,key=field('tornKey',target).value.trim(),remember=(field('rememberKey',target) as HTMLInputElement).checked;connectionAction('Connecting to Torn API…',async()=>{await send({type:'SAVE_KEY',key,remember});field('tornKey',target).value='';await keyStatus();await products();report('Connected. Personal data comes directly from Torn. Enable YATA and Save settings for stocks.');});});
document.querySelector('#disconnect-key')!.addEventListener('click',()=>handle((async()=>{await send({type:'DISCONNECT_KEY'});stocks=[];await keyStatus();document.querySelector('#product-list')!.replaceChildren();document.querySelector('#data-status')!.textContent='No personal API key connected';renderFavorites();report('API key removed');})()));
document.querySelector('#refresh-data')!.addEventListener('click',()=>connectionAction('Refreshing Torn data…',async()=>{await send({type:'REFRESH_DATA'});await keyStatus();await products();report('Showing saved data while refresh completes. Torn and YATA cache intervals still apply.');}));
document.querySelector('#test-connection')!.addEventListener('click',()=>connectionAction('Checking Chrome access and Torn API…',async()=>{await send({type:'TEST_CONNECTION'});await keyStatus();report('Chrome access and Torn API connection are working. No API key was sent by this test.');}));
document.querySelector('#test-sound')!.addEventListener('click',()=>handle((async()=>{await send({type:'TEST_SOUND'});report('Warning sound played');})()));
document.querySelector<HTMLFormElement>('#favorite-form')!.addEventListener('submit',event=>{event.preventDefault();const target=event.currentTarget as HTMLFormElement;handle((async()=>{const item=stocks.find(s=>`${s.country}:${s.itemId}`===field('product',target).value);if(!item)throw new Error('Connect your Torn API to load products');const favorite=FavoriteSchema.parse({itemId:item.itemId,name:item.name,country:item.country,minimumStock:Number(field('minimumStock',target).value),alert:(field('alert',target) as HTMLInputElement).checked});state=await send<PublicState>({type:'SAVE_FAVORITES',favorites:[...state.favorites.filter(f=>!(f.itemId===item.itemId&&f.country===item.country)),favorite]});renderFavorites();report('Product watch saved');})());});
handle((async()=>{state=await send<PublicState>({type:'READ_STATE'});render();const connected=await keyStatus();report('Ready');if(connected)handle(products());})());

function renderHistory(data: Snapshot): void {
  const host=document.querySelector<HTMLElement>('#trip-history')!,app=data.travelApp,opened=new Set([...host.querySelectorAll<HTMLDetailsElement>('details[data-trip-id]')].filter(n=>n.open).map(n=>n.dataset.tripId));host.replaceChildren();
  if(!app){host.append(el('p','muted','Waiting for saved trips…'));return;}
  const totals=historyTotals(app,Date.now());host.append(stat('Trips · last 30 days',String(totals.trips)),stat('Spent · known purchases',money(totals.spent)),stat('Estimated value at completion',money(totals.value)),stat('Estimated profit',signedMoney(totals.estimatedProfit)),stat('Actual profit · attributed sales',totals.actualProfit===null?'Not yet verified':signedMoney(totals.actualProfit)),stat('Round trip profit / hour',totals.profitPerHour===null?'Insufficient duration data':signedMoney(totals.profitPerHour)),stat('Best country · estimated',totals.bestCountry||'—'),stat('Best item · estimated',totals.bestItem||'—'));
  if(!app.history.length)host.append(el('p','muted','Your completed trips will appear here.'));
  for(const trip of app.history){const row=el('details','watch-country');row.dataset.tripId=trip.tripId;row.open=opened.has(trip.tripId);row.append(el('summary','',`${trip.country} · ${trip.finalizedAt?new Date(trip.finalizedAt).toLocaleDateString():''} · ${trip.purchases.length} receipts`),el('p','muted',trip.finalization==='incomplete-evidence'?'Incomplete purchase evidence':'Confirmed purchase ledger'),...profitNodes(trip,app,Date.now()));host.append(row);}
}
function renderDataStatus(data: Snapshot): void {
  const host=document.querySelector<HTMLElement>('#data-status')!,now=Date.now(),issues=data.issues||{};
  const seen=(at:number|undefined|null)=>at?`${Math.max(0,Math.floor((now-at)/1000))}s ago`:'Waiting for first refresh';
  const rows:Record<string,string>={
    Faction:data.player.factionId===undefined?'Waiting for account data':data.player.factionId===null?'Not in a faction':`#${data.player.factionId}`,
    War:!data.generatedAt?'Waiting for first refresh':data.war?`${data.war.active?'Active':'Scheduled / ended'} · ${data.war.opponent} · seen ${seen(data.war.observedAt)}`:issues.war||issues.warFallback?'Could not complete war detection':'No active ranked war detected',
    Targets:`${data.targets.length} opponents · latest status ${seen(Math.max(0,...data.targets.map(t=>t.observedAt)))}`,
    Travel:`${data.travelApp?.travel.state||'Waiting'} · ${data.travelApp?.travel.marketContextCountry||'Torn'} · seen ${seen(data.travelApp?.travel.observedAt)}`,
    Prices:`${data.stocks.filter(s=>s.tornValue!==null&&s.tornValue!==undefined).length} priced country products`,
    Stock:`${data.stockProvider==='yata'?'YATA':'Disabled'} · ${data.stocks.filter(s=>s.stock!==null).length} observed country products`
  };
  host.replaceChildren(...Object.entries(rows).map(([name,value])=>stat(name,value)));
  for(const [section,message]of Object.entries(issues))if(section!=='stocks'||data.stockProvider!=='off')host.append(el('p','error',`${section}: ${message}`));
}
let updating=false;
chrome.runtime.onMessage.addListener((message: unknown)=>{
  if(!state||typeof message!=='object'||message===null||!('type' in message))return;
  if(message.type==='ACCOUNT_CHANGED'){stocks=[];document.querySelector('#trip-history')!.replaceChildren();document.querySelector('#product-list')!.replaceChildren();document.querySelector('#data-status')!.textContent='Waiting for account data';handle(keyStatus());return;}
  if(message.type==='DATA_CHANGED'&&!updating){updating=true;void products().catch(()=>undefined).finally(()=>{updating=false;});}
});
