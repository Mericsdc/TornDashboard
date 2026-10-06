import { FavoriteSchema, LayoutSchema, SettingsSchema } from './contracts';
import type { Layout, Mode, PublicState, WidgetId } from './contracts';
import { DEFAULT_FAVORITES, DEFAULT_SETTINGS, WIDGET_IDS } from './defaults';

export const PRESETS: Record<Mode, Layout> = {
  NORMAL: { left: ['chain'], right: ['travel-favorites', 'restock', 'company-addiction'] },
  TRAVEL: { left: ['travel-status'], right: ['travel-favorites', 'restock'] },
  WAR: { left: ['chain'], right: ['recommended-targets'] },
  CUSTOM: { left: ['war-status', 'chain', 'recommended-targets', 'hospital-timers'], right: ['travel-status', 'travel-favorites', 'restock', 'travel-market', 'travel-profit', 'company-addiction'] }
};
/** Built-in presets have fixed membership; CUSTOM retains arbitrary widget choices. */
export function presetLayout(layout: Layout, mode: Mode): Layout {
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
  if (settings.success) initial.settings = settings.data;
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
