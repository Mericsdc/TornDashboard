import type { Favorite, Layout, Mode, PublicState, Settings, Snapshot } from '@tcd/shared';
import { pageChain } from '@tcd/shared';
import { ChainPageObserver } from './chain-page-observer';
import { TravelPageObserver } from './travel-page-observer';
import { send } from './protocol';

export interface DashboardStore {
  load(): Promise<PublicState>;
  settings(patch: Partial<Settings>): Promise<PublicState>;
  layout(mode: Mode, layout: Layout): Promise<PublicState>;
  favorites(favorites: Favorite[]): Promise<PublicState>;
  snapshot(): Promise<Snapshot>;
  nativeChain?(chain: Snapshot['chain'], now: number): Snapshot['chain'];
  checkAlerts?(): Promise<void>;
  openOptions(): Promise<void>;
  subscribe(listener: (refreshData?: boolean, clearAccount?: boolean) => void): () => void;
}
export class ExtensionStore implements DashboardStore {
  private chainPage = new ChainPageObserver(observation => { void send({type:'CHAIN_OBSERVATION',observation}).catch(() => undefined); });
  nativeChain = (chain: Snapshot['chain'], now: number): Snapshot['chain'] => {
    const observation=this.chainPage.current(now);return observation ? pageChain(chain,observation,now) ?? chain : chain;
  };
  private page = new TravelPageObserver(observation => { void send({ type: 'TRAVEL_OBSERVATION', observation }).catch(() => undefined); });
  load = () => send<PublicState>({ type: 'READ_STATE' });
  settings = (patch: Partial<Settings>) => send<PublicState>({ type: 'SAVE_SETTINGS', patch });
  layout = (mode: Mode, layout: Layout) => send<PublicState>({ type: 'SAVE_LAYOUT', mode, layout });
  favorites = (favorites: Favorite[]) => send<PublicState>({ type: 'SAVE_FAVORITES', favorites });
  snapshot = async () => { const snapshot = await send<Snapshot>({type:'GET_SNAPSHOT'}); this.page.setSnapshot(snapshot); return snapshot; };
  checkAlerts = () => send<void>({ type: 'CHECK_ALERTS' });
  openOptions = () => send<void>({ type: 'OPEN_OPTIONS' });
  subscribe(listener: (refreshData?: boolean, clearAccount?: boolean) => void): () => void {
    const handler = (message: unknown) => {
      if (typeof message === 'object' && message !== null && 'type' in message && ['STATE_CHANGED', 'DATA_CHANGED', 'ACCOUNT_CHANGED'].includes(String(message.type))) listener(message.type !== 'STATE_CHANGED', message.type === 'ACCOUNT_CHANGED');
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => { chrome.runtime.onMessage.removeListener(handler); this.page.destroy(); this.chainPage.destroy(); };
  }
}
