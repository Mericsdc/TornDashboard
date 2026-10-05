import { FavoriteSchema, SettingsSchema, WIDGET_IDS, type PublicState, type Snapshot, type StockItem } from '@tcd/shared';
import { send } from '../services/protocol';
import { button, el } from '../core/dom';
let state: PublicState, stocks: StockItem[] = [];
document.querySelector<HTMLElement>('#extension-version')!.textContent = `BOSBOT · ${chrome.runtime.getManifest().version}`;
const status = document.querySelector<HTMLElement>('#status')!, form = document.querySelector<HTMLFormElement>('#settings-form')!;
function field(name: string, target = form): HTMLInputElement | HTMLSelectElement { return target.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement; }
function report(message: string, error = false): void { status.textContent = message; status.className = error ? 'error' : ''; }
function handle(promise: Promise<unknown>): void { void promise.catch(error => report(error instanceof Error ? error.message : 'Operation failed', true)); }
function checked(name: string) { return (field(name) as HTMLInputElement).checked; }
function render(): void {
  for (const [name, value] of Object.entries(state.settings)) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(value);
    else if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) input.value = String(value);
  }
  for (const [name, value] of Object.entries({ chainAlert: state.settings.alerts.chain, stockAlert: state.settings.alerts.stock, soundAlert: state.settings.alerts.sound, restockReminder: state.settings.alerts.restockReminder })) (field(name) as HTMLInputElement).checked = value;
  const widgets = document.querySelector<HTMLElement>('#widget-settings')!; widgets.replaceChildren();
  for (const id of WIDGET_IDS) { const label = el('label'), input = el('input'); input.type = 'checkbox'; input.name = `widget-${id}`; input.checked = !state.settings.disabledWidgets.includes(id); label.append(input, el('span', '', id.replaceAll('-', ' '))); widgets.append(label); }
  renderFavorites();
}
function renderFavorites(): void {
  const container = document.querySelector<HTMLElement>('#favorites')!; container.replaceChildren();
  state.favorites.forEach(favorite => {
    const row = el('div', 'favorite'), threshold = el('input'), enabled = el('input'); threshold.type = 'number'; threshold.min = '1'; threshold.max = '10000'; threshold.value = String(favorite.minimumStock); threshold.setAttribute('aria-label', `Minimum stock for ${favorite.name} in ${favorite.country}`);
    enabled.type = 'checkbox'; enabled.checked = favorite.alert; enabled.setAttribute('aria-label', `Alerts for ${favorite.name} in ${favorite.country}`);
    row.append(el('strong', '', favorite.name), el('span', 'muted', favorite.country), threshold, enabled,
      button('Update', () => handle((async () => { const updated = FavoriteSchema.parse({ ...favorite, minimumStock: threshold.valueAsNumber, alert: enabled.checked }); state = await send<PublicState>({ type: 'SAVE_FAVORITES', favorites: state.favorites.map(v => v.itemId === favorite.itemId && v.country === favorite.country ? updated : v) }); renderFavorites(); report('Watch threshold saved'); })())),
      button('Remove', () => handle((async () => { state = await send<PublicState>({ type: 'SAVE_FAVORITES', favorites: state.favorites.filter(v => !(v.itemId === favorite.itemId && v.country === favorite.country)) }); renderFavorites(); report('Watched product removed'); })()))); container.append(row);
  });
}
async function loadProducts(): Promise<void> {
  const snapshot = await send<Snapshot>({ type: 'GET_SNAPSHOT' }); stocks = snapshot.stocks;
  const list = document.querySelector<HTMLSelectElement>('#product-list')!;
  list.replaceChildren(...stocks.map(v => { const option = el('option', '', `${v.country} · ${v.name}`); option.value = `${v.country}:${v.itemId}`; return option; }));
  if (snapshot.issues?.stocks) throw new Error(snapshot.issues.stocks);
}
form.addEventListener('submit', event => { event.preventDefault(); handle((async () => {
  const patch = SettingsSchema.parse({ ...state.settings, panelWidth: Number(field('panelWidth').value), opacity: Number(field('opacity').value), gap: Number(field('gap').value), density: field('density').value, theme: field('theme').value, mode: field('mode').value, dataSource: 'bosbot', bosbotUrl: field('bosbotUrl').value.trim(), animation: checked('animation'), autoSwitching: checked('autoSwitching'), rememberPositions: checked('rememberPositions'), alerts: { chain: checked('chainAlert'), stock: checked('stockAlert'), sound: checked('soundAlert'), restockReminder: checked('restockReminder') }, disabledWidgets: WIDGET_IDS.filter(id => !checked(`widget-${id}`)) });
  const granted = await chrome.permissions.request({ origins: [`${new URL(patch.bosbotUrl).origin}/*`] }); if (!granted) throw new Error('BOSBOT server access was not granted');
  state = await send<PublicState>({ type: 'SAVE_SETTINGS', patch }); render(); await bosbotStatus(); report('Settings saved. Torn tabs update automatically.');
})()); });
document.querySelector('#test-sound')!.addEventListener('click', () => handle((async () => { await send({ type: 'TEST_SOUND' }); report('Warning sound played. Check your system volume if you did not hear it.'); })()));
document.querySelector('#reset')!.addEventListener('click', () => handle((async () => { state = await send<PublicState>({ type: 'RESET_STATE' }); render(); await bosbotStatus(); report('Settings and layouts reset'); })()));
document.querySelector('#refresh-data')!.addEventListener('click', () => handle((async () => { await send({ type: 'BOSBOT_REFRESH' }); await bosbotStatus(); report('BOSBOT product list refreshed'); })()));
document.querySelector<HTMLFormElement>('#favorite-form')!.addEventListener('submit', event => {
  event.preventDefault(); const target = event.currentTarget as HTMLFormElement;
  handle((async () => { const stock = stocks.find(v => `${v.country}:${v.itemId}` === field('product', target).value); if (!stock) throw new Error('Load the BOSBOT product list first');
    const favorite = FavoriteSchema.parse({ itemId: stock.itemId, name: stock.name, country: stock.country, minimumStock: Number(field('minimumStock', target).value), alert: (field('alert', target) as HTMLInputElement).checked });
    const favorites = state.favorites.filter(v => !(v.itemId === favorite.itemId && v.country === favorite.country)); favorites.push(favorite); state = await send<PublicState>({ type: 'SAVE_FAVORITES', favorites }); renderFavorites(); report('Product watch saved');
  })());
});
const bosbotLabel = document.querySelector<HTMLElement>('#bosbot-status')!;
let polling: ReturnType<typeof setTimeout> | undefined, pairingActive = false;
async function bosbotStatus(): Promise<void> {
  const result = await send<{ connected: boolean; online: boolean; error?: string; expiresAt?: number; extensionId: string; pending?: boolean; alertDelivery?: { failed: boolean; title: string } }>({ type: 'BOSBOT_STATUS' });
  bosbotLabel.textContent = `${result.online ? 'BOSBOT live feed verified' : result.connected ? `Browser paired · ${result.error || 'server unavailable'}` : 'No BOSBOT account connected'} · Browser ID: ${result.extensionId}${result.alertDelivery?.failed ? ' · Last alert delivery failed; check sound and notification settings' : ''}`;
  if (result.pending && !pairingActive) { pairingActive = true; schedulePoll(); }
  if (result.online) await loadProducts();
}
function schedulePoll(): void {
  clearTimeout(polling); polling = setTimeout(() => handle((async () => {
    const result = await send<{ status: 'pending' | 'approved' | 'expired' | 'limit' }>({ type: 'BOSBOT_POLL' });
    if (result.status === 'pending') { schedulePoll(); return; } pairingActive = false;
    if (result.status === 'approved') { state = await send<PublicState>({ type: 'READ_STATE' }); render(); await bosbotStatus(); report('BOSBOT connected. Destination, products and war use your account.'); }
    else { await bosbotStatus(); report(result.status === 'limit' ? 'Revoke an old browser at BOSBOT /extension/devices.' : 'Pairing expired. Start a new connection.', true); }
  })().catch(error => { pairingActive = false; throw error; })), 2000);
}
document.querySelector('#bosbot-connect')!.addEventListener('click', () => handle((async () => {
  const settings = SettingsSchema.parse({ ...state.settings, bosbotUrl: field('bosbotUrl').value.trim() });
  if (!await chrome.permissions.request({ origins: [`${new URL(settings.bosbotUrl).origin}/*`] })) throw new Error('BOSBOT server access was not granted');
  state = await send<PublicState>({ type: 'SAVE_SETTINGS', patch: { bosbotUrl: settings.bosbotUrl } });
  const result = await send<{ extensionId: string }>({ type: 'BOSBOT_CONNECT' }); bosbotLabel.textContent = `Waiting for approval · compare browser ID ${result.extensionId}`; report('Log in on the opened BOSBOT page and approve this browser.'); pairingActive = true; schedulePoll();
})()));
document.querySelector('#bosbot-disconnect')!.addEventListener('click', () => handle((async () => { clearTimeout(polling); pairingActive = false; const result = await send<{ revoked: boolean }>({ type: 'BOSBOT_DISCONNECT' }); await bosbotStatus(); stocks = []; document.querySelector('#product-list')!.replaceChildren(); report(result.revoked ? 'BOSBOT connection revoked.' : 'Removed locally. Revoke this browser at BOSBOT /extension/devices when the server is available.', !result.revoked); })()));
document.querySelector('#bosbot-favorites')!.addEventListener('click', () => handle((async () => { state = await send<PublicState>({ type: 'BOSBOT_IMPORT_FAVORITES' }); renderFavorites(); report('BOSBOT product watches imported'); })()));
handle((async () => { state = await send<PublicState>({ type: 'READ_STATE' }); render(); await bosbotStatus(); report('Ready'); })());
