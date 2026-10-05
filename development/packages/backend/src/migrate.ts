import { loadEnvFile } from 'node:process';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
try { loadEnvFile('.env'); } catch { /* Environment variables can also be supplied by the host. */ }
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for migration');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try { await pool.query(await readFile('packages/backend/migrations/001-stock-observations.sql', 'utf8')); console.log('Stock observation schema ready'); }
finally { await pool.end(); }
