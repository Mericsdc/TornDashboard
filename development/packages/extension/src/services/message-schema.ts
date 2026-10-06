import { z } from 'zod';
import { FavoriteSchema, LayoutSchema, MODES, SettingsSchema, COUNTRIES } from '@tcd/shared';
export const MessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('READ_STATE') }).strict(), z.object({ type: z.literal('GET_SNAPSHOT') }).strict(),
  z.object({ type: z.literal('SAVE_SETTINGS'), patch: SettingsSchema.omit({ bosbotUrl: true, alerts: true, market: true, stockProvider: true, bag: true }).partial().extend({ alerts: SettingsSchema.shape.alerts.removeDefault().optional(), market: SettingsSchema.shape.market.removeDefault().optional(), stockProvider: SettingsSchema.shape.stockProvider.removeDefault().optional(), bag: SettingsSchema.shape.bag.removeDefault().optional() }).strict() }).strict(),
  z.object({ type: z.literal('SAVE_LAYOUT'), mode: z.enum(MODES), layout: LayoutSchema }).strict(),
  z.object({ type: z.literal('SAVE_FAVORITES'), favorites: z.array(FavoriteSchema).max(50) }).strict(),
  z.object({ type: z.literal('SAVE_KEY'), key: z.string().regex(/^[a-zA-Z0-9]{16}$/), remember: z.boolean() }).strict(),
  z.object({ type: z.literal('KEY_STATUS') }).strict(), z.object({ type: z.literal('DISCONNECT_KEY') }).strict(),
  z.object({ type: z.literal('TEST_CONNECTION') }).strict(),
  z.object({ type: z.literal('TRAVEL_HINT'), origin: z.enum([...COUNTRIES, 'Torn']), destination: z.enum([...COUNTRIES, 'Torn']) }).strict(),
  z.object({ type: z.literal('OPEN_OPTIONS') }).strict(), z.object({ type: z.literal('REFRESH_DATA') }).strict(), z.object({ type: z.literal('CHECK_ALERTS') }).strict(), z.object({ type: z.literal('TEST_SOUND') }).strict(), z.object({ type: z.literal('RESET_STATE') }).strict()
]);
export type Message = z.infer<typeof MessageSchema>;
