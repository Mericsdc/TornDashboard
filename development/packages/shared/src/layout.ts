import type { Layout, Mode, PublicState, WidgetId } from './contracts';
import { DEFAULT_FAVORITES, DEFAULT_SETTINGS, WIDGET_IDS } from './defaults';

export const PRESETS: Record<Mode, Layout> = {
  NORMAL: { left: ['chain', 'travel-status'], right: ['travel-favorites', 'restock', 'company-addiction'] },
  TRAVEL: { left: ['travel-status', 'travel-market'], right: ['travel-profit', 'travel-favorites', 'restock', 'chain'] },
  WAR: { left: ['recommended-targets', 'hospital-timers', 'chain'], right: ['war-status', 'travel-favorites', 'restock'] }
};
export function defaultState(): PublicState {
  return structuredClone({ version: 1 as const, settings: DEFAULT_SETTINGS, layouts: PRESETS, favorites: DEFAULT_FAVORITES });
}
export function reconcileLayout(layout: Layout, fallback: Layout): Layout {
  const used = new Set<WidgetId>();
  const result: Layout = { left: [], right: [] };
  for (const side of ['left', 'right'] as const) {
    for (const id of layout[side]) if (WIDGET_IDS.includes(id) && !used.has(id)) { used.add(id); result[side].push(id); }
  }
  for (const side of ['left', 'right'] as const) {
    for (const id of fallback[side]) if (!used.has(id)) { used.add(id); result[side].push(id); }
  }
  return result;
}
export function moveWidget(layout: Layout, id: WidgetId, side: 'left' | 'right', index: number): Layout {
  const result = { left: layout.left.filter(v => v !== id), right: layout.right.filter(v => v !== id) };
  result[side].splice(Math.max(0, Math.min(index, result[side].length)), 0, id);
  return result;
}
