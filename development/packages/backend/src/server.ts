import { loadEnvFile } from 'node:process';
import { buildApp } from './app';
import { configFromEnv } from './config';
try { loadEnvFile('.env'); } catch { /* .env is optional; system environment also works. */ }
const config = configFromEnv();
const app = await buildApp({ config, logger: true });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
await app.listen({ host: config.host, port: config.port });
