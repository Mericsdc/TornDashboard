import { z } from 'zod';
import { FavoriteSchema, LayoutSchema, MODES, SettingsSchema } from '@tcd/shared';
export const MessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('READ_STATE') }).strict(),
  z.object({ type: z.literal('GET_SNAPSHOT') }).strict(),
  z.object({ type: z.literal('SAVE_SETTINGS'), patch: SettingsSchema.omit({ bosbotUrl: true, alerts: true, market: true }).partial().extend({ bosbotUrl: SettingsSchema.shape.bosbotUrl.removeDefault().optional(), alerts: SettingsSchema.shape.alerts.removeDefault().optional(), market: SettingsSchema.shape.market.removeDefault().optional() }).strict() }).strict(),
  z.object({ type: z.literal('SAVE_LAYOUT'), mode: z.enum(MODES), layout: LayoutSchema }).strict(),
  z.object({ type: z.literal('SAVE_FAVORITES'), favorites: z.array(FavoriteSchema).max(50) }).strict(),
  z.object({ type: z.literal('OPEN_OPTIONS') }).strict(),
  z.object({ type: z.literal('BOSBOT_CONNECT') }).strict(),
  z.object({ type: z.literal('BOSBOT_POLL') }).strict(),
  z.object({ type: z.literal('BOSBOT_REFRESH') }).strict(),
  z.object({ type: z.literal('BOSBOT_STATUS') }).strict(),
  z.object({ type: z.literal('BOSBOT_DISCONNECT') }).strict(),
  z.object({ type: z.literal('BOSBOT_IMPORT_FAVORITES') }).strict(),
  z.object({ type: z.literal('CHECK_ALERTS') }).strict(),
  z.object({ type: z.literal('TEST_SOUND') }).strict(),
  z.object({ type: z.literal('RESET_STATE') }).strict()
]);
export type Message = z.infer<typeof MessageSchema>;
