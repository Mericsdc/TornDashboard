import { FavoriteSchema, LayoutSchema, SettingsSchema } from './contracts';
import type { Layout, Mode, PublicState, WidgetId } from './contracts';
import { DEFAULT_FAVORITES, DEFAULT_SETTINGS, WIDGET_IDS, RETIRED_WIDGET_IDS } from './defaults';

export const PRESETS: Record<Mode, Layout> = {
  NORMAL: { left: ['chain'], right: ['travel-favorites', 'company-addiction'] },
  TRAVEL: { left: ['travel-profit'], right: ['travel-favorites'] },
  WAR: { left: ['chain'], right: ['recommended-targets'] },
  CUSTOM: { left: ['war-status', 'chain', 'recommended-targets', 'hospital-timers'], right: ['travel-favorites', 'travel-profit', 'company-addiction'] }
};
/** Built-in presets have fixed membership; CUSTOM retains arbitrary widget choices. */
export function presetLayout(layout: Layout, mode: Mode): Layout {
  const hasWatch = [...layout.left,...layout.right].includes('travel-favorites');
  const compact = (ids: WidgetId[]) => ids.flatMap(id => id === 'restock' ? hasWatch ? [] : ['travel-favorites' as const] : id === 'travel-market' || id === 'travel-status' ? [] : [id]);
  layout = {left:compact(layout.left),right:compact(layout.right)};
  const allowed = new Set([...PRESETS[mode].left, ...PRESETS[mode].right]);
  return reconcileLayout({ left: layout.left.filter(id => allowed.has(id)), right: layout.right.filter(id => allowed.has(id)) }, PRESETS[mode]);
}
/** Preserve old positions and watches before tightening the built-in preset membership. */
export function migrateState(raw: unknown): PublicState {
  const initial = defaultState();
  if (!raw || typeof raw !== 'object') return initial;
  const value = raw as Partial<PublicState>;
  const settings = SettingsSchema.safeParse({ ...initial.settings, ...value.settings, dataSource: 'torn' });
  const favorites = FavoriteSchema.array().max(50).safeParse(value.favorites);
  if (settings.success) { initial.settings = settings.data; initial.settings.disabledWidgets = initial.settings.disabledWidgets.filter(id => !RETIRED_WIDGET_IDS.some(retired => retired === id)); }
  if (favorites.success) initial.favorites = favorites.data;
  for (const mode of ['NORMAL', 'TRAVEL', 'WAR', 'CUSTOM'] as const) {
    const parsed = LayoutSchema.safeParse(value.layouts?.[mode]);
    if (parsed.success) initial.layouts[mode] = presetLayout(parsed.data, mode);
  }
  if (!value.layouts?.CUSTOM) {
    const old = LayoutSchema.safeParse(value.layouts?.[settings.success ? settings.data.mode : 'NORMAL']);
    if (old.success) initial.layouts.CUSTOM = reconcileLayout(old.data, PRESETS.CUSTOM);
  }
  return initial;
}
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
