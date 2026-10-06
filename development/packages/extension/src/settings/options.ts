import { FavoriteSchema, SettingsSchema, WIDGET_IDS, category, freshStock, type PublicState, type Snapshot, type StockItem } from '@tcd/shared';
import { send } from '../services/protocol';
import { button, el, time } from '../core/dom';
import { money } from '../widgets/travel-market';
let state: PublicState, stocks: StockItem[] = [];
document.querySelector<HTMLElement>('#extension-version')!.textContent = `v${chrome.runtime.getManifest().version}`;
const status = document.querySelector<HTMLElement>('#status')!, form = document.querySelector<HTMLFormElement>('#settings-form')!;
function field(name: string, target = form): HTMLInputElement | HTMLSelectElement { return target.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement; }
function checked(name: string) { return (field(name) as HTMLInputElement).checked; }
function report(message: string, error = false): void { status.textContent = message; status.className = error ? 'error' : ''; }
function handle(promise: Promise<unknown>): void { void promise.catch(error => report(error instanceof Error ? error.message : 'Operation failed', true)); }
function render(): void {
  for (const [name,value] of Object.entries(state.settings)) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(value);
    else if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) input.value = String(value);
  }
  for (const [name,value] of Object.entries({ chainAlert: state.settings.alerts.chain, stockAlert: state.settings.alerts.stock, soundAlert: state.settings.alerts.sound, restockReminder: state.settings.alerts.restockReminder, yata: state.settings.stockProvider === 'yata', bagFavoritesOnly: state.settings.bag.favoritesOnly })) (field(name) as HTMLInputElement).checked = value;
  for (const [name,value] of Object.entries(state.settings.bag)) if (name !== 'favoritesOnly') field(name).value = value === null ? '' : String(value);
  const widgets = document.querySelector<HTMLElement>('#widget-settings')!; widgets.replaceChildren();
  for (const id of WIDGET_IDS) { const label = el('label'), input = el('input'); input.type = 'checkbox'; input.name = `widget-${id}`; input.checked = !state.settings.disabledWidgets.includes(id); label.append(input, el('span','', id.replaceAll('-',' '))); widgets.append(label); }
  renderFavorites();
}
function renderFavorites(): void {
  const container = document.querySelector<HTMLElement>('#favorites')!; container.replaceChildren();
  const countries = [...new Set(state.favorites.map(f => f.country))].sort();
  if (!countries.length) container.append(el('p','muted','No watched products yet. Add one below or tap a star in Travel Market.'));
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
  const data = await send<Snapshot>({type:'GET_SNAPSHOT'}); stocks=data.stocks;
  const list=document.querySelector<HTMLSelectElement>('#product-list')!; list.replaceChildren();
  for (const country of [...new Set(stocks.map(s=>s.country))].sort()) for (const kind of ['flowers','plushies','other'] as const) {
    const rows=stocks.filter(s=>s.country===country&&category(s)===kind).sort((a,b)=>a.name.localeCompare(b.name));if(!rows.length)continue;
    const group=el('optgroup');group.label=`${country} · ${kind}`;
    for(const item of rows){const option=el('option','',`${item.name} · ${money(item.cost)}`);option.value=`${country}:${item.itemId}`;group.append(option);}list.append(group);
  }
  renderFavorites();
}
async function keyStatus(): Promise<boolean> {
  const result=await send<{connected:boolean;userId?:number;remember?:boolean;access?:string}>({type:'KEY_STATUS'});
  document.querySelector('#key-status')!.textContent=result.connected?`Connected to your Torn account #${result.userId} · ${result.access || 'API'} · ${result.remember?'Remembered on this browser':'Until Chrome closes'}`:'No personal API key connected';
  return result.connected;
}
form.addEventListener('submit',event=>{ event.preventDefault(); handle((async()=>{
  const stockProvider=checked('yata')?'yata':'off';
  if(stockProvider==='yata'&&!await chrome.permissions.request({origins:['https://yata.yt/*']}))throw new Error('YATA access was not granted');
  const nullable=(name:string)=>field(name).value.trim()===''?null:Number(field(name).value);
  const patch=SettingsSchema.parse({...state.settings,panelWidth:Number(field('panelWidth').value),opacity:Number(field('opacity').value),gap:Number(field('gap').value),density:field('density').value,theme:field('theme').value,mode:field('mode').value,animation:checked('animation'),autoSwitching:checked('autoSwitching'),rememberPositions:checked('rememberPositions'),dataSource:'torn',stockProvider,bag:{capacity:nullable('capacity'),budget:nullable('budget'),roundTripMinutes:nullable('roundTripMinutes'),feePercent:Number(field('feePercent').value),favoritesOnly:checked('bagFavoritesOnly')},alerts:{chain:checked('chainAlert'),stock:checked('stockAlert'),sound:checked('soundAlert'),restockReminder:checked('restockReminder')},disabledWidgets:WIDGET_IDS.filter(id=>!checked(`widget-${id}`))});
  // Connection origin is retained only for migrating old local preferences, never sent as a setting.
  const { bosbotUrl: _legacy, ...publicPatch }=patch;void _legacy;
  state=await send<PublicState>({type:'SAVE_SETTINGS',patch:publicPatch});render();report('Settings saved. Torn tabs update automatically.');handle(products());
})());});
document.querySelector<HTMLFormElement>('#key-form')!.addEventListener('submit',event=>{event.preventDefault();const target=event.currentTarget as HTMLFormElement;handle((async()=>{const key=field('tornKey',target).value.trim();await send({type:'SAVE_KEY',key,remember:(field('rememberKey',target) as HTMLInputElement).checked});field('tornKey',target).value='';await keyStatus();await products();report('Connected. Personal data comes directly from Torn. Enable YATA and Save settings for stocks.');})());});
document.querySelector('#disconnect-key')!.addEventListener('click',()=>handle((async()=>{await send({type:'DISCONNECT_KEY'});stocks=[];await keyStatus();document.querySelector('#product-list')!.replaceChildren();renderFavorites();report('API key removed');})()));
document.querySelector('#refresh-data')!.addEventListener('click',()=>handle((async()=>{await send({type:'REFRESH_DATA'});await products();report('Data refreshed. Torn and YATA cache intervals still apply.');})()));
document.querySelector('#test-sound')!.addEventListener('click',()=>handle((async()=>{await send({type:'TEST_SOUND'});report('Warning sound played');})()));
document.querySelector('#reset')!.addEventListener('click',()=>handle((async()=>{state=await send<PublicState>({type:'RESET_STATE'});render();report('Appearance and layouts reset. Your key and watches are retained.');})()));
document.querySelector<HTMLFormElement>('#favorite-form')!.addEventListener('submit',event=>{event.preventDefault();const target=event.currentTarget as HTMLFormElement;handle((async()=>{const item=stocks.find(s=>`${s.country}:${s.itemId}`===field('product',target).value);if(!item)throw new Error('Connect your Torn API to load products');const favorite=FavoriteSchema.parse({itemId:item.itemId,name:item.name,country:item.country,minimumStock:Number(field('minimumStock',target).value),alert:(field('alert',target) as HTMLInputElement).checked});state=await send<PublicState>({type:'SAVE_FAVORITES',favorites:[...state.favorites.filter(f=>!(f.itemId===item.itemId&&f.country===item.country)),favorite]});renderFavorites();report('Product watch saved');})());});
handle((async()=>{state=await send<PublicState>({type:'READ_STATE'});render();const connected=await keyStatus();report('Ready');if(connected)handle(products());})());
