import { canonicalCountry, migrateState, presetLayout, SettingsSchema, StateSchema, type PublicState, type Snapshot } from '@tcd/shared';
import { MessageSchema } from '../services/message-schema';
import type { Reply } from '../services/protocol';
import { processAlerts, playWarning } from './alerts';
import { senderRole } from './access';
import { TornApi } from '../services/torn-api';
import { requireTornAccess, testTornConnection, TORN_API_PERMISSION } from '../services/torn-connection';
import { TravelDataStore } from './travel-store';
const ready = Promise.all([chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }), chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })]);
let queue: Promise<unknown> = ready, api: TornApi | undefined, cached: Snapshot | undefined;
let cachedOwner: number | undefined;
type Credential = { key: string; userId: number; remember: boolean };
async function readState(): Promise<PublicState> {
  const raw = await chrome.storage.local.get(['state', 'personalApiV4', 'compactTravelV5']);
  const valid = StateSchema.safeParse(raw.state);
  if (raw.personalApiV4 && raw.compactTravelV5 && valid.success) return valid.data;
  const state = migrateState(raw.state);
  await chrome.storage.local.set({ state, personalApiV4: true, compactTravelV5: true });
  await chrome.storage.local.remove(['bosbotDevice', 'bosbotOnlyV3']); await chrome.storage.session.remove(['bosbotPair', 'credentials']);
  return state;
}
async function credential(): Promise<Credential | undefined> {
  return (await chrome.storage.session.get<{ tornCredential?: Credential }>('tornCredential')).tornCredential || (await chrome.storage.local.get<{ tornCredential?: Credential }>('tornCredential')).tornCredential;
}
async function broadcast(type: string): Promise<void> {
  await chrome.runtime.sendMessage({ type }).catch(() => undefined);
  const tabs = await chrome.tabs.query({ url: ['https://www.torn.com/*','https://torn.com/*'] });
  await Promise.allSettled(tabs.flatMap(tab => tab.id === undefined ? [] : [chrome.tabs.sendMessage(tab.id, { type })]));
}
async function writeState(state: PublicState): Promise<PublicState> { const value = StateSchema.parse(state); await chrome.storage.local.set({ state: value }); await broadcast('STATE_CHANGED'); return value; }
function commitData(work: () => Promise<void>): Promise<unknown> { const task = queue.then(work); queue = task.catch(() => undefined); return task; }
const travelData = new TravelDataStore(credential, () => api, commitData, () => broadcast('DATA_CHANGED'), async (data, state, owner) => { cached = data; cachedOwner = owner; await processAlerts(data, state, `torn/${owner}`); });
async function snapshot(state: PublicState): Promise<Snapshot> {
  const auth = await credential(); if (!auth) throw new Error('Connect your personal Torn API in Options.');
  api ||= new TornApi(auth.key);
  cached = await travelData.read(state); cachedOwner = auth.userId;
  const favorites = [...new Map(state.favorites.map(f => { const country = canonicalCountry(f.country) || f.country, item = cached!.stocks.find(s => s.country === country && s.name.toLowerCase() === f.name.toLowerCase()); const favorite = item ? { ...f, country, itemId: item.itemId, name: item.name } : { ...f, country }; return [`${country}:${favorite.itemId}`, favorite] as const; })).values()];
  if (JSON.stringify(favorites) !== JSON.stringify(state.favorites)) await writeState({ ...state, favorites });
  return cached;
}
async function pollAlerts(): Promise<void> { try { await snapshot(await readState()); } catch { /* Missing or stale data never creates warnings. */ } }
chrome.alarms.onAlarm.addListener(alarm => { if (['chain-warning','torn-refresh'].includes(alarm.name)) { const task = queue.then(pollAlerts); queue = task.catch(() => undefined); } });
async function startPolling(): Promise<void> { await ready; await chrome.alarms.clear('bosbot-refresh'); if (!await chrome.alarms.get('torn-refresh')) await chrome.alarms.create('torn-refresh', { periodInMinutes: 0.5 }); }
chrome.runtime.onStartup.addListener(() => { void startPolling(); }); chrome.runtime.onInstalled.addListener(() => { void startPolling(); }); void startPolling();
async function handle(raw: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const role = senderRole(sender, chrome.runtime.id); if (!role) throw new Error('Sender is not authorized');
  const parsed = MessageSchema.safeParse(raw); if (!parsed.success) throw new Error('Invalid request');
  const message = parsed.data;
  if (['SAVE_KEY','KEY_STATUS','DISCONNECT_KEY','REFRESH_DATA','TEST_CONNECTION','TEST_SOUND','RESET_STATE'].includes(message.type) && role !== 'options') throw new Error('Open extension options for this action');
  const state = await readState();
  switch (message.type) {
    case 'READ_STATE': return state;
    case 'GET_SNAPSHOT': return snapshot(state);
    case 'TRAVEL_HINT': if ('origin' in message && 'destination' in message) return travelData.page(state, { state: message.destination === 'Torn' ? 'RETURNING' : 'OUTBOUND', originCountry: message.origin, destinationCountry: message.destination }); return null;
    case 'CHAIN_OBSERVATION': return travelData.chain(state, message.observation);
    case 'TRAVEL_OBSERVATION': return travelData.page(state, message.observation);
    case 'CHECK_ALERTS': { const auth = await credential(); if (cached && auth && cachedOwner === auth.userId) await processAlerts(cached, state, `torn/${auth.userId}`); return null; }
    case 'SAVE_KEY': {
      if (!('key' in message && 'remember' in message)) throw new Error('Invalid key request');
      await requireTornAccess();
      const previous = await credential(), next = new TornApi(message.key), info = await next.connect();
      cached = undefined; cachedOwner = undefined;
      await chrome.storage.local.remove(['tornCredential','alertState']); await chrome.storage.session.remove('tornCredential');
      const value: Credential = { key: message.key, userId: info.user.id, remember: message.remember };
      await (message.remember ? chrome.storage.local : chrome.storage.session).set({ tornCredential: value });
      api = next; cached = undefined; travelData.reset(); await broadcast(previous?.userId === info.user.id ? 'DATA_CHANGED' : 'ACCOUNT_CHANGED'); return { connected: true, userId: info.user.id, access: info.access.type };
    }
    case 'KEY_STATUS': { const auth = await credential(); return { connected: Boolean(auth), userId: auth?.userId, remember: auth?.remember, access: api?.info?.access.type, hasApiAccess: await chrome.permissions.contains({ origins: [TORN_API_PERMISSION] }) }; }
    case 'TEST_CONNECTION': await requireTornAccess(); await testTornConnection(); return null;
    case 'DISCONNECT_KEY': cached = undefined; cachedOwner = undefined; await chrome.storage.local.remove(['tornCredential','alertState']); await chrome.storage.session.remove('tornCredential'); api = undefined; cached = undefined; travelData.reset(); await chrome.alarms.clear('chain-warning'); await broadcast('ACCOUNT_CHANGED'); return null;
    case 'REFRESH_DATA': { const data = await snapshot(state); travelData.requestRefresh(state, true); return data; } // Respects shared endpoint caches.
    case 'OPEN_OPTIONS': await chrome.runtime.openOptionsPage(); return null;
    case 'TEST_SOUND': await playWarning(); return null;
    case 'SAVE_SETTINGS': {
      if (!('patch' in message)) throw new Error('Invalid settings');
      if (role !== 'options' && ('stockProvider' in message.patch || 'backendUrl' in message.patch || 'dataSource' in message.patch)) throw new Error('Connection settings require extension options');
      return writeState({ ...state, settings: SettingsSchema.parse({ ...state.settings, ...message.patch, dataSource: 'torn' }) });
    }
    case 'SAVE_LAYOUT': if ('mode' in message && 'layout' in message) return writeState({ ...state, layouts: { ...state.layouts, [message.mode]: presetLayout(message.layout, message.mode) } }); return null;
    case 'SAVE_FAVORITES': if ('favorites' in message) return writeState({ ...state, favorites: message.favorites }); return null;
    case 'RESET_STATE': { const next = migrateState(null); next.favorites = state.favorites; await chrome.storage.local.remove('alertState'); return writeState(next); }
  }
}
chrome.runtime.onMessage.addListener((raw: unknown, sender, respond) => {
  if (typeof raw === 'object' && raw !== null && 'type' in raw && ['DATA_CHANGED','STATE_CHANGED','ACCOUNT_CHANGED'].includes(String(raw.type))) return false;
  if (typeof raw === 'object' && raw !== null && 'target' in raw && raw.target === 'offscreen') return false;
  const alert = typeof raw === 'object' && raw !== null && 'type' in raw && raw.type === 'CHECK_ALERTS';
  const task = (alert ? ready : queue).then(() => handle(raw, sender)); if (!alert) queue = task.catch(() => undefined);
  void task.then(data => respond({ ok: true, data } satisfies Reply<unknown>)).catch(error => respond({ ok: false, error: error instanceof Error && !error.message.includes('[') ? error.message : 'Invalid data or unavailable connection' } satisfies Reply<never>)); return true;
});
chrome.action.onClicked.addListener(() => { void chrome.runtime.openOptionsPage(); });
