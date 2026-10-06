import { z } from 'zod';
export const TRAVEL_PHASES = ['AT_HOME', 'OUTBOUND', 'ABROAD', 'RETURNING', 'LANDED'] as const;
const at = z.number().finite().nonnegative(), nullableTime = at.nullable(), qty = z.number().int().min(0).max(10000000);
export const InventorySnapshotSchema = z.object({
  items: z.record(z.string().regex(/^\d+$/), qty), coveredIds: z.array(z.number().int().positive()).max(2000),
  observedAt: at, source: z.enum(['api', 'page']), kind: z.enum(['inventory', 'travel-bag']), complete: z.boolean()
}).strict();
export type InventorySnapshot = z.infer<typeof InventorySnapshotSchema>;
export const PurchaseSchema = z.object({
  id: z.string().max(120), itemId: z.number().int().positive(), country: z.string().max(60),
  quantity: qty.refine(n => n > 0), unitCost: at.nullable(), totalCost: at.nullable(), observedAt: at,
  source: z.enum(['api-log', 'page-receipt', 'inventory-corroborated']), costSource: z.enum(['receipt', 'catalog', 'unknown'])
}).strict();
export type Purchase = z.infer<typeof PurchaseSchema>;
export const PriceSchema = z.object({ itemId: z.number().int().positive(), name: z.string().max(80), value: at.nullable(), observedAt: nullableTime,
  history: z.array(z.object({ at, value: at })).max(12) }).strict();
export type MarketPrice = z.infer<typeof PriceSchema>;
const shop = z.object({ itemId: z.number().int().positive(), name: z.string().max(80), cost: at.nullable(), observedAt: nullableTime }).strict();
export const TripSchema = z.object({
  tripId: z.string().max(120), country: z.string().max(60), startedAt: at,
  outbound: z.object({ departedAt: nullableTime, arrivedAt: nullableTime }).strict(),
  inbound: z.object({ departedAt: nullableTime, arrivesAt: nullableTime, arrivedAt: nullableTime }).strict(),
  inventoryBeforeShopping: InventorySnapshotSchema.nullable(), inventoryAtDeparture: InventorySnapshotSchema.nullable(),
  purchases: z.array(PurchaseSchema).max(300), marketPricesAtFinalization: z.array(PriceSchema).max(300).default([]), marketSnapshot: z.array(shop).max(300),
  estimatedProfit: z.number().nullable(), actualProfit: z.number().nullable(), actualRevenue: at.nullable(),
  finalizedAt: nullableTime, finalization: z.enum(['pending', 'complete', 'incomplete-evidence']),
  logsCheckedAt: nullableTime, logsComplete: z.boolean(), baselineMissing: z.boolean()
}).strict();
export type Trip = z.infer<typeof TripSchema>;
export const TravelViewSchema = z.object({
  state: z.enum(TRAVEL_PHASES), originCountry: z.string().max(60).nullable(), destinationCountry: z.string().max(60).nullable(),
  marketContextCountry: z.string().max(60).nullable(), departedAt: nullableTime, arrivalAt: nullableTime,
  observedAt: nullableTime, phaseObservedAt: at, source: z.enum(['api', 'page', 'cache']), pendingReturn: z.boolean(),
  homeConfirmedAt: nullableTime, method: z.string().max(20).nullable()
}).strict();
const bag = z.object({ total: z.number().int().min(1).max(100).nullable(), used: qty.nullable(), free: qty.nullable(), usedSource: z.enum(['page','purchases','inventory','unknown']).default('unknown'),
  source: z.enum(['page', 'cached', 'inferred', 'manual', 'unknown']), observedAt: nullableTime, exact: z.boolean() }).strict();
const bar = z.object({ current: at, maximum: at.refine(n => n > 0), increment: at, interval: at.refine(n => n > 0), nextTickAt: nullableTime, observedAt: at }).strict();
export const BarsSchema = z.object({ energy: bar, nerve: bar, life: bar }).strict();
export type ResourceBars = z.infer<typeof BarsSchema>;
export const TripProfitSchema = z.object({
  rows: z.array(z.object({ itemId: z.number().int().positive(), name: z.string(), quantity: qty, unitCost: at.nullable(),
    cost: at.nullable(), marketPrice: at.nullable(), priceObservedAt: nullableTime, marketValue: at.nullable(),
    profit: z.number().nullable(), roi: z.number().nullable(), confidence: z.enum(['high', 'medium', 'low']) })).max(300),
  quantity: qty, spent: at.nullable(), marketValue: at.nullable(), estimatedProfit: z.number().nullable(), actualProfit: z.number().nullable(),
  actualRevenue: at.nullable(), roi: z.number().nullable(), confidence: z.enum(['high', 'medium', 'low']),
  range: z.object({ low: z.number(), high: z.number() }).nullable(), roundTripMs: at.nullable(), oneWayMs: at.nullable(),
  profitPerHour: z.number().nullable(), oneWayProfitPerHour: z.number().nullable(), priceAgeMs: at.nullable(), unconfirmedAdditions: qty
}).strict();
export type TripProfit = z.infer<typeof TripProfitSchema>;
export const TravelAppSchema = z.object({
  version: z.literal(1), travel: TravelViewSchema, travelSession: TripSchema.nullable(), inventory: InventorySnapshotSchema.nullable(),
  marketPrices: z.record(z.string(), PriceSchema), bag, bars: BarsSchema.nullable(),
  knownCapacity: z.object({ total: z.number().int().min(1).max(100), method: z.string().max(20).nullable(), at }).nullable(),
  history: z.array(TripSchema).max(100), tripProfit: TripProfitSchema.nullable(), previewCountry: z.string().max(60).nullable(),
  quality: z.enum(['loading', 'fresh', 'cached', 'stale', 'error-with-cache', 'error-without-cache']),
  refreshedAt: nullableTime, logAccess: z.boolean(), notice: z.string().max(200).nullable()
}).strict();
export type TravelApp = z.infer<typeof TravelAppSchema>;
export const PageTravelSchema = z.object({
  state: z.enum(TRAVEL_PHASES).optional(), originCountry: z.string().max(60).optional(), destinationCountry: z.string().max(60).optional(),
  arrivalAt: at.optional(), selectedCountry: z.string().max(60).optional(), returnIntent: z.boolean().optional(),
  bag: z.object({ total: z.number().int().min(1).max(100).nullable(), used: qty.nullable() }).strict().optional(),
  inventory: InventorySnapshotSchema.optional(), receipt: PurchaseSchema.optional(),
  shop: z.array(z.object({ itemId: z.number().int().positive(), cost: at.nullable(), stock: qty.nullable() }).strict()).max(300).optional()
}).strict();
export type PageTravel = z.infer<typeof PageTravelSchema>;
export function emptyTravelApp(): TravelApp {
  return { version: 1, travel: { state: 'AT_HOME', originCountry: 'Torn', destinationCountry: 'Torn', marketContextCountry: null,
    departedAt: null, arrivalAt: null, observedAt: null, phaseObservedAt: 0, source: 'cache', pendingReturn: false, homeConfirmedAt: null, method: null },
  travelSession: null, inventory: null, marketPrices: {}, bag: { total: null, used: null, free: null, usedSource: 'unknown', source: 'unknown', observedAt: null, exact: false },
  bars: null, knownCapacity: null, history: [], tripProfit: null, previewCountry: null, quality: 'loading', refreshedAt: null, logAccess: false, notice: null };
}
