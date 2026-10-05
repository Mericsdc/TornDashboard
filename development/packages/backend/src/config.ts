import { z } from 'zod';
const EnvironmentSchema = z.object({
  HOST: z.string().default('127.0.0.1'), PORT: z.coerce.number().int().min(1).max(65535).default(4318),
  DATABASE_URL: z.string().optional(), REDIS_URL: z.string().optional(), COMPANION_TOKEN: z.string().default(''), ALLOWED_ORIGINS: z.string().default('')
});
export interface Config { host: string; port: number; databaseUrl?: string; redisUrl?: string; token: string; allowedOrigins: string[] }
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvironmentSchema.parse(env);
  const local = ['127.0.0.1', 'localhost', '::1'].includes(parsed.HOST);
  if (!local && parsed.COMPANION_TOKEN.length < 32) throw new Error('Non-loopback binding requires COMPANION_TOKEN of at least 32 characters');
  const allowedOrigins = parsed.ALLOWED_ORIGINS.split(',').map(v => v.trim()).filter(Boolean);
  if (!local && !allowedOrigins.length) throw new Error('Non-loopback binding requires explicit ALLOWED_ORIGINS');
  return { host: parsed.HOST, port: parsed.PORT, databaseUrl: parsed.DATABASE_URL || undefined, redisUrl: parsed.REDIS_URL || undefined, token: parsed.COMPANION_TOKEN, allowedOrigins };
}
export function originAllowed(origin: string | undefined, config: Config): boolean {
  if (!origin) return true; // CLI and extension-worker REST requests may omit Origin; bearer auth still applies.
  if (config.allowedOrigins.length) return config.allowedOrigins.includes(origin);
  return ['127.0.0.1', 'localhost', '::1'].includes(config.host) && /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}
