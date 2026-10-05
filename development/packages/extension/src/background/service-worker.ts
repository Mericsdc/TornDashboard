import { defaultState, PRESETS, reconcileLayout, SettingsSchema, StateSchema, type PublicState, type Snapshot } from '@tcd/shared';
import type { Reply } from '../services/protocol';
import { MessageSchema } from '../services/message-schema';
import { processAlerts, playWarning } from './alerts';
import { BosbotApi, type BosbotDevice, type BosbotPair } from '../services/bosbot-api';
import { senderRole } from './access';

const ready = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
]);
let queue: Promise<unknown> = ready;
let bosbotSnapshot: { origin: string; deviceId: string; receivedAt: number; value: Snapshot } | undefined;
async function readState(): Promise<PublicState> {
  const raw = await chrome.storage.local.get(['state', 'bosbotOnlyV3']);
  const parsed = StateSchema.safeParse(raw.state);
  if (parsed.success && raw.bosbotOnlyV3) return parsed.data;
  if (parsed.success) {
    const state = parsed.data;
    state.settings.dataSource = 'bosbot'; state.settings.autoSwitching = true; state.settings.theme = 'liquid-glass';
    for (const mode of ['NORMAL', 'TRAVEL', 'WAR'] as const) state.layouts[mode] = reconcileLayout(state.layouts[mode], PRESETS[mode]);
    await chrome.storage.local.set({ state, bosbotOnlyV3: true });
    await chrome.storage.session.remove('credentials');
    return state;
  }
  const state = defaultState(); await chrome.storage.local.set({ state, bosbotOnlyV3: true }); return state;
}
async function broadcast(type: string): Promise<void> {
  const tabs = await chrome.tabs.query({ url: ['https://www.torn.com/*', 'https://torn.com/*'] });
  await Promise.allSettled(tabs.flatMap(tab => tab.id === undefined ? [] : [chrome.tabs.sendMessage(tab.id, { type })]));
}
async function writeState(state: PublicState): Promise<PublicState> {
  const parsed = StateSchema.parse(state); await chrome.storage.local.set({ state: parsed });
  await broadcast('STATE_CHANGED'); return parsed;
}
async function getSnapshot(state: PublicState): Promise<Snapshot> {
  const device = (await chrome.storage.local.get<{ bosbotDevice?: BosbotDevice }>('bosbotDevice')).bosbotDevice;
  if (!device || device.origin !== new URL(state.settings.bosbotUrl).origin || device.expiresAt <= Date.now()) throw new Error('Connect your BOSBOT account in extension settings');
  let snapshot: Snapshot;
  if (bosbotSnapshot && bosbotSnapshot.origin === device.origin && bosbotSnapshot.deviceId === device.deviceId && Date.now() - bosbotSnapshot.receivedAt < 10000) snapshot = bosbotSnapshot.value;
  else {
    snapshot = await new BosbotApi(device.origin, chrome.runtime.id, device.token).snapshot();
    bosbotSnapshot = { origin: device.origin, deviceId: device.deviceId, receivedAt: Date.now(), value: snapshot };
  }
  const corrected = state.favorites.map(favorite => {
    const observed = snapshot.stocks.find(item => item.country === favorite.country && item.name.toLowerCase() === favorite.name.toLowerCase());
    return observed ? { ...favorite, itemId: observed.itemId, name: observed.name } : favorite;
  });
  if (JSON.stringify(corrected) !== JSON.stringify(state.favorites)) { state = await writeState({ ...state, favorites: corrected }); }
  await processAlerts(snapshot, state, device.origin + '/' + device.deviceId);
  return snapshot;
}
async function pollAlerts(): Promise<void> {
  await ready;
  try { await getSnapshot(await readState()); } catch { /* Unreachable or unauthorized data never generates an alert. */ }
}
chrome.alarms.onAlarm.addListener(alarm => {
  if (!['chain-warning', 'bosbot-refresh'].includes(alarm.name)) return;
  const task = queue.then(pollAlerts); queue = task.catch(() => undefined);
});
async function startPolling(): Promise<void> {
  if (!await chrome.alarms.get('bosbot-refresh')) await chrome.alarms.create('bosbot-refresh', { periodInMinutes: 0.5 });
}
chrome.runtime.onStartup.addListener(() => { void startPolling(); });
chrome.runtime.onInstalled.addListener(() => { void startPolling(); });
void startPolling();
async function handle(raw: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const role = senderRole(sender, chrome.runtime.id);
  if (!role) throw new Error('Sender is not authorized');
  const parsed = MessageSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Invalid request');
  const message = parsed.data;
  const optionsOnly = ['TEST_SOUND', 'RESET_STATE', 'BOSBOT_CONNECT', 'BOSBOT_POLL', 'BOSBOT_STATUS', 'BOSBOT_REFRESH', 'BOSBOT_DISCONNECT', 'BOSBOT_IMPORT_FAVORITES'];
  if (optionsOnly.includes(message.type) && role !== 'options') throw new Error('Open extension options for this action');
  const state = await readState();
  switch (message.type) {
    case 'READ_STATE': return state;
    case 'GET_SNAPSHOT': return getSnapshot(state);
    case 'CHECK_ALERTS': {
      if (bosbotSnapshot) { const device = (await chrome.storage.local.get('bosbotDevice')).bosbotDevice as BosbotDevice | undefined; if (device && device.expiresAt > Date.now() && device.deviceId === bosbotSnapshot.deviceId && device.origin === new URL(state.settings.bosbotUrl).origin) await processAlerts(bosbotSnapshot.value, state, device.origin + '/' + device.deviceId); }
      return null;
    }
    case 'TEST_SOUND': await playWarning(); return { played: true };
    case 'OPEN_OPTIONS': await chrome.runtime.openOptionsPage(); return null;
    case 'SAVE_SETTINGS': {
      if (role !== 'options' && ('bosbotUrl' in message.patch || 'backendUrl' in message.patch || 'dataSource' in message.patch)) throw new Error('Connection settings require extension options');
      const settings = SettingsSchema.parse({ ...state.settings, ...message.patch, dataSource: 'bosbot' });
      if (settings.bosbotUrl !== state.settings.bosbotUrl) await chrome.storage.session.remove('bosbotPair');
      return writeState({ ...state, settings });
    }
    case 'SAVE_LAYOUT': return writeState({ ...state, layouts: { ...state.layouts, [message.mode]: message.layout } });
    case 'SAVE_FAVORITES': return writeState({ ...state, favorites: message.favorites });
    case 'BOSBOT_CONNECT': {
      const pair = await new BosbotApi(state.settings.bosbotUrl, chrome.runtime.id).start();
      await chrome.storage.session.set({ bosbotPair: pair });
      await chrome.tabs.create({ url: pair.verificationUrl });
      return { status: 'pending', expiresAt: pair.expiresAt, extensionId: chrome.runtime.id };
    }
    case 'BOSBOT_POLL': {
      const pair = (await chrome.storage.session.get<{ bosbotPair?: BosbotPair }>('bosbotPair')).bosbotPair;
      if (!pair || pair.expiresAt <= Date.now() || pair.origin !== new URL(state.settings.bosbotUrl).origin) return { status: 'expired' };
      const result = await new BosbotApi(pair.origin, chrome.runtime.id).poll(pair);
      if (result.status === 'approved') {
        bosbotSnapshot = undefined;
        await chrome.storage.local.set({ bosbotDevice: { origin: pair.origin, token: result.token, deviceId: result.deviceId, expiresAt: result.expiresAt } satisfies BosbotDevice });
        await chrome.storage.session.remove('bosbotPair');
        const connectedState = { ...state, settings: { ...state.settings, dataSource: 'bosbot' as const } };
        try { const snapshot = await getSnapshot(connectedState); if (!connectedState.favorites.length) connectedState.favorites = snapshot.favorites || []; } catch { /* Connection is retained; unavailable observations remain unknown. */ }
        await writeState(connectedState);
        await broadcast('DATA_CHANGED');
      }
      return { status: result.status }; // The device token never leaves the worker.
    }
    case 'BOSBOT_REFRESH': {
      const delay = 1100 - (Date.now() - (bosbotSnapshot?.receivedAt || 0));
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      bosbotSnapshot = undefined; const snapshot = await getSnapshot(state); await broadcast('DATA_CHANGED'); return snapshot;
    }
    case 'BOSBOT_STATUS': {
      const device = (await chrome.storage.local.get<{ bosbotDevice?: BosbotDevice }>('bosbotDevice')).bosbotDevice;
      const pair = (await chrome.storage.session.get<{ bosbotPair?: BosbotPair }>('bosbotPair')).bosbotPair;
      let online = false, error: string | undefined;
      if (device && device.origin === new URL(state.settings.bosbotUrl).origin && device.expiresAt > Date.now()) { try { await getSnapshot(state); online = true; } catch (reason) { error = reason instanceof Error ? reason.message : 'BOSBOT unavailable'; } }
      const delivery = (await chrome.storage.local.get('alertDelivery')).alertDelivery;
      return { online, error, alertDelivery: delivery, pending: Boolean(pair && pair.origin === new URL(state.settings.bosbotUrl).origin && pair.expiresAt > Date.now()), connected: Boolean(device && device.origin === new URL(state.settings.bosbotUrl).origin && device.expiresAt > Date.now()), expiresAt: device?.expiresAt, extensionId: chrome.runtime.id };
    }
    case 'BOSBOT_DISCONNECT': {
      const device = (await chrome.storage.local.get<{ bosbotDevice?: BosbotDevice }>('bosbotDevice')).bosbotDevice;
      let revoked = !device;
      if (device) { try { await new BosbotApi(device.origin, chrome.runtime.id, device.token).disconnect(); revoked = true; } catch { /* Local removal is still possible while the server is offline. */ } }
      bosbotSnapshot = undefined;
      await chrome.storage.local.remove('bosbotDevice'); await chrome.storage.session.remove('bosbotPair');
      await broadcast('DATA_CHANGED'); return { revoked };
    }
    case 'BOSBOT_IMPORT_FAVORITES': {
      if (state.settings.dataSource !== 'bosbot') throw new Error('Connect to BOSBOT first');
      const snapshot = await getSnapshot(state);
      if (snapshot.issues?.stocks) throw new Error('BOSBOT favorites are temporarily unavailable');
      const favorites = snapshot.favorites || [];
      const merged = [...state.favorites.filter(f => !favorites.some(v => (v.itemId === f.itemId || v.name.toLowerCase() === f.name.toLowerCase()) && v.country === f.country)), ...favorites];
      return writeState({ ...state, favorites: merged.slice(-50) });
    }
    case 'RESET_STATE': await chrome.storage.local.remove('alertState'); return writeState(defaultState());

  }
}
chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  if (typeof raw === 'object' && raw !== null && 'target' in raw && raw.target === 'offscreen') return false;
  // Serialized mutations prevent two Torn tabs from overwriting one another's settings.
  const alertTick = typeof raw === 'object' && raw !== null && 'type' in raw && raw.type === 'CHECK_ALERTS';
  // Timer ticks bypass slow network reads; the alert broker serializes its own deduplication.
  const task = (alertTick ? ready : queue).then(() => handle(raw, sender));
  if (!alertTick) queue = task.catch(() => undefined);
  void task.then(data => sendResponse({ ok: true, data } satisfies Reply<unknown>))
    .catch(error => sendResponse({ ok: false, error: error instanceof Error && !error.message.includes('[') ? error.message : 'Request failed validation or connection' } satisfies Reply<never>));
  return true;
});
chrome.action.onClicked.addListener(() => { void chrome.runtime.openOptionsPage(); });
