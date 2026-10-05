import { describe, expect, it } from 'vitest';
import { createMockSnapshot, defaultState, DEFAULT_WEIGHTS, estimateRestock, LayoutSchema, mockObservations, moveWidget, rankTargets, reconcileLayout, scoreTarget, SettingsSchema, type Target } from '@tcd/shared';
import { ModeManager } from '../../packages/extension/src/core/mode-manager';
import { senderRole } from '../../packages/extension/src/background/access';
const now = 1800000000000;
const target: Target = { id: 1, name: '<img src=x>', level: 35, status: 'Okay', activity: 'offline', observedAt: now, hospitalUntil: null, wins: null, losses: null, battleStats: null };
describe('target evidence', () => {
  it('excludes hospital, traveling, unknown and stale status; never invents stats', () => {
    for (const status of ['Hospital', 'Traveling', 'Abroad', 'Unknown'] as const) expect(scoreTarget({ ...target, status }, 37, DEFAULT_WEIGHTS, now).eligible).toBe(false);
    expect(scoreTarget({ ...target, observedAt: now - 121000 }, 37, DEFAULT_WEIGHTS, now).eligible).toBe(false);
    const result = scoreTarget(target, 37, DEFAULT_WEIGHTS, now);
    expect(result.confidence).toBe(70); expect(result.reasons).toContain('Battle stats: unknown • Fair fight: unknown');
  });
  it('changes ranking with configured weights without treating level as strength', () => {
    const second = { ...target, id: 2, activity: 'online' as const, wins: 9, losses: 0 };
    expect(rankTargets([target, second], 37, { availability: 0, activity: 1, history: 0, level: 0 }, now)[0]?.target.id).toBe(1);
    expect(rankTargets([target, second], 37, { availability: 0, activity: 0, history: 1, level: 0 }, now)[0]?.target.id).toBe(2);
  });
  it('lowers evidence confidence when history and level are missing', () => {
    expect(scoreTarget({ ...target, level: null, activity: 'unknown' }, null, DEFAULT_WEIGHTS, now).confidence).toBe(45);
  });
});
describe('restock history', () => {
  it('requires repeated observed events and always produces an estimate', () => {
    expect(estimateRestock([], now).kind).toBe('unknown');
    const rows = mockObservations(206, 'Switzerland', now); const result = estimateRestock(rows.reverse(), now);
    expect(result.kind).toBe('estimated');
    if (result.kind === 'estimated') { expect(result.samples).toBe(6); expect(result.earliest).toBeLessThan(result.latest); expect(result.confidence).toBe('high'); }
  });
  it('rejects stale, expired, future and long unobserved gaps', () => {
    const rows = mockObservations(206, 'Switzerland', now);
    expect(estimateRestock(rows, now + 30 * 60000).kind).toBe('unknown');
    expect(estimateRestock(rows.map(v => ({ ...v, observedAt: v.observedAt + 86400000 })), now).kind).toBe('unknown');
    const sparse = rows.map(v => ({ ...v, observedAt: v.observedAt - (v.stock === 0 ? 20 * 60000 : 0) }));
    expect(estimateRestock(sparse, now).kind).toBe('unknown');
  });
  it('deduplicates repeated observations rather than adding interval evidence', () => {
    const rows = mockObservations(206, 'Switzerland', now); expect(estimateRestock([...rows, ...rows], now)).toEqual(estimateRestock(rows, now));
  });
});
describe('layout, settings and mode', () => {
  it('moves across panels without duplicates and restores unknown-free presets', () => {
    const state = defaultState(); const result = moveWidget(state.layouts.WAR, 'chain', 'right', 0);
    expect(result.right[0]).toBe('chain'); expect(result.left).not.toContain('chain'); expect(LayoutSchema.safeParse({ left: ['chain'], right: ['chain'] }).success).toBe(false);
    expect(reconcileLayout({ left: [], right: [] }, state.layouts.WAR)).toEqual(state.layouts.WAR);
  });
  it('prioritizes active war only when automatic switching is enabled', () => {
    const manager = new ModeManager(); const settings = defaultState().settings;
    expect(manager.resolve({ ...settings, autoSwitching: false }, createMockSnapshot('war', now))).toBe('NORMAL');
    expect(manager.resolve({ ...settings, autoSwitching: true }, createMockSnapshot('war', now))).toBe('WAR');
    expect(manager.resolve({ ...settings, autoSwitching: true }, createMockSnapshot('travel', now))).toBe('TRAVEL');
  });
  it('rejects unsafe URLs, extra settings and all-zero scoring weights', () => {
    const settings = defaultState().settings;
    for (const backendUrl of ['http://example.com', 'https://user:secret@example.com', 'https://example.com/?key=secret', 'http://127.0.0.1:9999']) expect(SettingsSchema.safeParse({ ...settings, backendUrl }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...settings, tornKey: 'no' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...settings, weights: { availability: 0, activity: 0, level: 0, history: 0 } }).success).toBe(false);
  });
});
describe('worker sender boundary', () => {
  const id = 'a'.repeat(32);
  it('only accepts same-extension options and main-frame Torn scripts', () => {
    expect(senderRole({ id, url: `chrome-extension://${id}/options.html` }, id)).toBe('options');
    expect(senderRole({ id, url: 'https://www.torn.com/index.php', frameId: 0, tab: { id: 1 } as chrome.tabs.Tab }, id)).toBe('content');
    for (const url of ['https://evil.torn.com', 'http://torn.com', 'https://www.torn.com.evil.com']) expect(senderRole({ id, url, frameId: 0, tab: { id: 1 } as chrome.tabs.Tab }, id)).toBeNull();
    expect(senderRole({ id: 'evil', url: `chrome-extension://${id}/options.html` }, id)).toBeNull();
  });
});


describe('partial setting migration', () => {
  it('does not silently inject connection settings into a content mode change', async () => {
    const { MessageSchema } = await import('../../packages/extension/src/services/message-schema');
    expect(MessageSchema.parse({ type: 'SAVE_SETTINGS', patch: { mode: 'WAR' } })).toEqual({ type: 'SAVE_SETTINGS', patch: { mode: 'WAR' } });
  });
  it('keeps old layouts and settings when migrating the BOSBOT origin default', async () => {
    const { StateSchema, SnapshotSchema } = await import('@tcd/shared');
    const state = defaultState(); const settings: Partial<typeof state.settings> = { ...state.settings }; delete settings.bosbotUrl;
    const result = StateSchema.parse({ ...state, settings });
    expect(result.layouts).toEqual(state.layouts); expect(result.settings.bosbotUrl).toContain('https://');
    const unknown = SnapshotSchema.parse({ source: 'live', provider: 'bosbot', generatedAt: Date.now(), war: null, chain: null, travel: null, player: { level: null }, targets: [], stocks: [] });
    expect(new ModeManager().resolve({ ...state.settings, autoSwitching: true }, unknown)).toBe('NORMAL');
  });
});
