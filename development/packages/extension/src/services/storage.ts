import type { Favorite, Layout, Mode, PublicState, Settings, Snapshot } from '@tcd/shared';
import { send } from './protocol';

export interface DashboardStore {
  load(): Promise<PublicState>;
  settings(patch: Partial<Settings>): Promise<PublicState>;
  layout(mode: Mode, layout: Layout): Promise<PublicState>;
  favorites(favorites: Favorite[]): Promise<PublicState>;
  snapshot(): Promise<Snapshot>;
  checkAlerts?(): Promise<void>;
  openOptions(): Promise<void>;
  subscribe(listener: (refreshData?: boolean) => void): () => void;
}
export class ExtensionStore implements DashboardStore {
  load = () => send<PublicState>({ type: 'READ_STATE' });
  settings = (patch: Partial<Settings>) => send<PublicState>({ type: 'SAVE_SETTINGS', patch });
  layout = (mode: Mode, layout: Layout) => send<PublicState>({ type: 'SAVE_LAYOUT', mode, layout });
  favorites = (favorites: Favorite[]) => send<PublicState>({ type: 'SAVE_FAVORITES', favorites });
  snapshot = () => send<Snapshot>({ type: 'GET_SNAPSHOT' });
  checkAlerts = () => send<void>({ type: 'CHECK_ALERTS' });
  openOptions = () => send<void>({ type: 'OPEN_OPTIONS' });
  subscribe(listener: (refreshData?: boolean) => void): () => void {
    const handler = (message: unknown) => {
      if (typeof message === 'object' && message !== null && 'type' in message && (message.type === 'STATE_CHANGED' || message.type === 'DATA_CHANGED')) listener(message.type === 'DATA_CHANGED');
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }
}
