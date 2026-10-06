import { z } from 'zod';
import { MODES, WIDGET_IDS } from './defaults';
import { TravelAppSchema } from './trip-model';

export type Mode = typeof MODES[number];
export type WidgetId = typeof WIDGET_IDS[number];
export type Position = 'left' | 'right';
export type Layout = { left: WidgetId[]; right: WidgetId[] };

export const WeightsSchema = z.object({
  availability: z.number().min(0).max(10), activity: z.number().min(0).max(10),
  history: z.number().min(0).max(10), level: z.number().min(0).max(10)
}).strict().refine(w => Object.values(w).some(v => v > 0), 'At least one weight must be positive');
export type ScoreWeights = z.infer<typeof WeightsSchema>;
export const SettingsSchema = z.object({
  panelWidth: z.number().int().min(220).max(420), opacity: z.number().min(0.55).max(1),
  gap: z.number().int().min(4).max(24), density: z.enum(['compact', 'comfortable']),
  theme: z.enum(['torn-dark', 'slate', 'liquid-glass']), animation: z.boolean(), autoSwitching: z.boolean(),
  rememberPositions: z.boolean(), mode: z.enum(MODES), dataSource: z.enum(['mock', 'companion', 'bosbot', 'torn']),
  stockProvider: z.enum(['off', 'yata']).default('off'),
  travelCapacityOverride: z.number().int().min(1).max(100).nullable().default(null),
  bag: z.object({ capacity: z.number().int().min(1).max(100).nullable(), budget: z.number().min(0).max(1e12).nullable(), roundTripMinutes: z.number().min(1).max(2880).nullable(), feePercent: z.number().min(0).max(100), favoritesOnly: z.boolean() }).strict().default({ capacity: null, budget: null, roundTripMinutes: null, feePercent: 0, favoritesOnly: false }),
  mockScenario: z.enum(['normal', 'travel', 'war']), weights: WeightsSchema,
  alerts: z.object({ chain: z.boolean(), stock: z.boolean(), sound: z.boolean(), restockReminder: z.boolean() }).strict().default({ chain: true, stock: true, sound: true, restockReminder: true }),
  market: z.object({ country: z.string().max(60), search: z.string().max(80), inStock: z.boolean(), favoritesOnly: z.boolean(), category: z.enum(['all', 'flowers', 'plushies', 'other']), sort: z.enum(['profit', 'roi', 'stock', 'name']) }).strict().default({ country: 'auto', search: '', inStock: false, favoritesOnly: false, category: 'all', sort: 'profit' }),
  disabledWidgets: z.array(z.enum(WIDGET_IDS)).max(WIDGET_IDS.length),
  bosbotUrl: z.string().max(250).refine(value => {
    try { const url = new URL(value); return !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' &&
      (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && ['4318', '8765'].includes(url.port))); }
    catch { return false; }
  }, 'Use a secure BOSBOT origin').default('https://lrx-server.tail2b0396.ts.net:8443'),
  backendUrl: z.string().max(250).refine(value => {
    try { const url = new URL(value); return !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' &&
      (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '4318')); }
    catch { return false; }
  }, 'Use an HTTPS origin or local HTTP origin')
}).strict();
export type Settings = z.infer<typeof SettingsSchema>;
export const LayoutSchema = z.object({ left: z.array(z.enum(WIDGET_IDS)).max(WIDGET_IDS.length), right: z.array(z.enum(WIDGET_IDS)).max(WIDGET_IDS.length) }).strict()
  .refine(v => new Set([...v.left, ...v.right]).size === v.left.length + v.right.length, 'Duplicate widget');
export const FavoriteSchema = z.object({ itemId: z.number().int().positive(), name: z.string().min(1).max(80),
  country: z.string().min(1).max(60), minimumStock: z.number().int().min(1).max(10000), alert: z.boolean() }).strict();
export type Favorite = z.infer<typeof FavoriteSchema>;
export const StateSchema = z.object({ version: z.literal(1), settings: SettingsSchema,
  layouts: z.object({ NORMAL: LayoutSchema, TRAVEL: LayoutSchema, WAR: LayoutSchema, CUSTOM: LayoutSchema }).strict(),
  favorites: z.array(FavoriteSchema).max(50) }).strict();
export type PublicState = z.infer<typeof StateSchema>;

export const TargetSchema = z.object({
  id: z.number().int().positive(), name: z.string().max(80), level: z.number().int().positive().nullable(),
  status: z.enum(['Okay', 'Hospital', 'Traveling', 'Abroad', 'Federal', 'Unknown']),
  activity: z.enum(['online', 'idle', 'offline', 'unknown']), observedAt: z.number().int().nonnegative(),
  hospitalUntil: z.number().int().nonnegative().nullable(), wins: z.number().int().nonnegative().nullable(),
  losses: z.number().int().nonnegative().nullable(), battleStats: z.number().nonnegative().nullable(),
  statsSource: z.string().max(80).nullable().optional(),
  recommendation: z.object({ score: z.number(), reasons: z.array(z.string().max(200)).max(10), confidence: z.enum(['low', 'medium', 'high']), label: z.string().max(80) }).optional()
}).strict();
export type Target = z.infer<typeof TargetSchema>;
export const ObservationSchema = z.object({ itemId: z.number().int().positive(), country: z.string().min(1).max(60),
  stock: z.number().int().min(0).max(10000000), observedAt: z.number().int().nonnegative(),
  source: z.enum(['mock', 'manual', 'provider']) }).strict();
export type StockObservation = z.infer<typeof ObservationSchema>;
export const RestockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unknown'), reason: z.string() }),
  z.object({ kind: z.literal('estimated'), earliest: z.number(), latest: z.number(), confidence: z.enum(['low', 'medium', 'high']),
    samples: z.number().int(), lastSeenRestock: z.number(), intervalHistory: z.array(z.number()) }),
  z.object({ kind: z.literal('exact'), at: z.number(), source: z.string() })
]);
export type RestockEstimate = z.infer<typeof RestockSchema>;
export const StockSchema = z.object({ itemId: z.number().int().positive(), name: z.string().max(80), country: z.string().max(60),
  cost: z.number().positive().nullable().optional(), costObservedAt: z.number().nonnegative().nullable().optional(), tornValue: z.number().positive().nullable().optional(), priceObservedAt: z.number().nullable().optional(),
  stock: z.number().int().nonnegative().nullable(), observedAt: z.number().nonnegative().nullable(), restock: RestockSchema }).strict();
export type StockItem = z.infer<typeof StockSchema>;
export const SnapshotSchema = z.object({ source: z.enum(['mock', 'live']), generatedAt: z.number(), provider: z.enum(['bosbot', 'torn']).optional(), stockProvider: z.enum(['yata', 'off']).optional(), issues: z.record(z.string(), z.string().max(200)).optional(), favorites: z.array(FavoriteSchema).max(50).optional(),
  war: z.object({ id: z.number().int().positive().nullable().optional(), opponentId: z.number().int().positive().nullable().optional(), active: z.boolean(), opponent: z.string(), score: z.number().nonnegative().nullable(), enemyScore: z.number().nonnegative().nullable().optional(), targetScore: z.number().nonnegative().nullable(), endsAt: z.number().nullable(), observedAt: z.number().optional() }).nullable(),
  chain: z.object({ id: z.number().int().positive().nullable().optional(), startedAt: z.number().nullable().optional(), count: z.number().nonnegative(), goal: z.number().positive(), expiresAt: z.number().nullable(), observedAt: z.number().optional(), source: z.enum(['api','page']).optional(), status: z.enum(['active','ended','inactive','cooldown']).optional(), lastCount: z.number().nonnegative().optional() }).nullable(),
  travel: z.object({ active: z.boolean(), destination: z.string(), origin: z.string(), arrivesAt: z.number().nullable(), departedAt: z.number().nullable().optional(), capacity: z.number().int().min(1).max(100).nullable().optional(), state: z.string().max(30).optional(), description: z.string().max(150).optional(), observedAt: z.number().optional() }).nullable(),
  travelApp: TravelAppSchema.optional(),
  company: z.object({ isDirector: z.boolean(), name: z.string().max(100), observedAt: z.number().nullable(), employees: z.array(z.object({ id: z.number().int().positive(), name: z.string().max(80), addictionEffect: z.number().nullable() }).strict()).max(100) }).strict().nullable().optional(),
  player: z.object({ level: z.number().positive().nullable() }), targets: z.array(TargetSchema).max(200), stocks: z.array(StockSchema).max(2000)
}).strict();
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Scenario = 'normal' | 'travel' | 'war';
