import type { Favorite, Layout, Mode, PublicState, Settings, Snapshot } from '@tcd/shared';
import { canonicalCountry, COUNTRIES } from '@tcd/shared';
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
  snapshot = async () => {
    if (/(?:sid=travel|travelagency)/i.test(location.href)) {
      const main=document.querySelector('#mainContainer, #main-content, main, .content-wrapper');
      const text=main?.textContent?.slice(0,30000)||'';
      const names=[...COUNTRIES,'Torn','Dubai','United Arab Emirates','UK'].sort((a,b)=>b.length-a.length).join('|');
      const match=text.match(new RegExp(`(${names})\\s*(?:to|→)\\s*(${names})`,'i'));
      const origin=canonicalCountry(match?.[1]),destination=canonicalCountry(match?.[2]);
      if(origin&&destination)await send({type:'TRAVEL_HINT',origin:origin as typeof COUNTRIES[number] | 'Torn',destination:destination as typeof COUNTRIES[number] | 'Torn'});
    }
    return send<Snapshot>({type:'GET_SNAPSHOT'});
  };
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
