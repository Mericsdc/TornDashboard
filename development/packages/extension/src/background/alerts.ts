import { emptyAlertMemory, evaluateAlerts, type AlertMemory, type PublicState, type Snapshot } from '@tcd/shared';
const ICON = chrome.runtime.getURL('icon.png');
let creating: Promise<void> | undefined;
export async function playWarning(): Promise<void> {
  const documentUrls = [chrome.runtime.getURL('offscreen.html')];
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls });
  if (!contexts.length) {
    creating ||= chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK], justification: 'Play the user-enabled chain and favorite stock warning sound' }).finally(() => { creating = undefined; });
    await creating;
  }
  const reply = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'PLAY_WARNING' }) as { ok?: boolean } | undefined;
  if (!reply?.ok) throw new Error('Sound playback failed. Check Chrome and system sound settings, then use Test warning sound.');
}
async function deliverAlerts(snapshot: Snapshot, state: PublicState, scope: string): Promise<void> {
  const stored = await chrome.storage.local.get<{ alertState?: { scope: string; memory: AlertMemory } }>('alertState');
  const prior = stored.alertState?.scope === scope ? stored.alertState.memory : emptyAlertMemory();
  const { memory, events } = evaluateAlerts(snapshot, state, prior, Date.now());
  if (JSON.stringify(prior) !== JSON.stringify(memory) || stored.alertState?.scope !== scope) await chrome.storage.local.set({ alertState: { scope, memory } });
  for (const event of events) {
    const outcomes = await Promise.allSettled([
      chrome.notifications.create(event.key, { type: 'basic', iconUrl: ICON, title: event.title, message: event.message, priority: 2 }),
      ...(state.settings.alerts.sound ? [playWarning()] : [])
    ]);
    const failed = outcomes.some(result => result.status === 'rejected');
    await chrome.storage.local.set({ alertDelivery: { at: Date.now(), title: event.title, failed, notificationFailed: outcomes[0]?.status === 'rejected', soundFailed: outcomes[1]?.status === 'rejected', reason: outcomes.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map(result => result.reason instanceof Error ? result.reason.message : 'Alert delivery unavailable').join(' · ').slice(0,200) } });
  }
  const chain = snapshot.chain, now = Date.now();
  const warnAt = chain?.expiresAt ? chain.expiresAt - 30000 : 0;
  if (state.settings.alerts.chain && chain?.count && warnAt > now && chain.observedAt && now - chain.observedAt <= 45000) {
    const existing = await chrome.alarms.get('chain-warning');
    if (!existing || Math.abs(existing.scheduledTime - warnAt) > 1000) await chrome.alarms.create('chain-warning', { when: warnAt });
  }
  else await chrome.alarms.clear('chain-warning');
}

let deliveryQueue: Promise<unknown> = Promise.resolve();
export function processAlerts(snapshot: Snapshot, state: PublicState, scope: string): Promise<void> {
  const task = deliveryQueue.then(() => deliverAlerts(snapshot, state, scope));
  deliveryQueue = task.catch(() => undefined);
  return task;
}
