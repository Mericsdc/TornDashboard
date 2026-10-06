import type { Favorite, ScoreWeights, Settings } from './contracts';
export const MODES = ['NORMAL', 'TRAVEL', 'WAR', 'CUSTOM'] as const;
export const WIDGET_IDS = ['war-status', 'recommended-targets', 'hospital-timers', 'chain', 'travel-status', 'travel-favorites', 'restock', 'travel-market', 'travel-profit', 'company-addiction'] as const;
// Accepted only to migrate installed layouts; retired widgets are never registered or offered.
export const RETIRED_WIDGET_IDS = ['travel-status','travel-market','restock'] as const;
export const ACTIVE_WIDGET_IDS = WIDGET_IDS.filter(id => !RETIRED_WIDGET_IDS.some(retired => retired === id));
export const DEFAULT_WEIGHTS: ScoreWeights = { availability: 0.45, activity: 0.15, history: 0.3, level: 0.1 };
export const DEFAULT_SETTINGS: Settings = {
  panelWidth: 280, opacity: 0.98, gap: 10, density: 'compact', theme: 'liquid-glass',
  animation: true, autoSwitching: true, rememberPositions: true, mode: 'NORMAL',
  alerts: { chain: true, stock: true, sound: true, restockReminder: true },
  market: { country: 'auto', search: '', inStock: false, favoritesOnly: false, category: 'all', sort: 'profit' },
  dataSource: 'torn', mockScenario: 'normal', weights: DEFAULT_WEIGHTS, disabledWidgets: [],
  bosbotUrl: 'https://lrx-server.tail2b0396.ts.net:8443',
  stockProvider: 'off', bag: { capacity: null, budget: null, roundTripMinutes: null, feePercent: 0, favoritesOnly: false },
  travelCapacityOverride: null,
  backendUrl: 'http://127.0.0.1:4318'
};
export const DEFAULT_FAVORITES: Favorite[] = [];
