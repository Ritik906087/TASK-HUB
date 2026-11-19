import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

function isTransientIdleError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { message?: string; code?: string };
  const msg = e.message || '';
  return (
    msg.includes('Connection terminated unexpectedly') ||
    msg.includes('terminating connection due to administrator command') ||
    e.code === 'ECONNRESET' ||
    e.code === 'EPIPE' ||
    e.code === '57P01'
  );
}

export const createPool = () => {
  if (!global._postgresPool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    const baseConfig = {
      max: 5,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5000,
      allowExitOnIdle: true,
    };

    if (process.env.SQL_HOST) {
      global._postgresPool = new Pool({
        ...baseConfig,
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
      });
    } else if (connectionString) {
      const useSsl =
        process.env.DB_SSL !== 'false' &&
        !connectionString.includes('localhost') &&
        !connectionString.includes('127.0.0.1');
      global._postgresPool = new Pool({
        ...baseConfig,
        connectionString,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      });
    } else {
      global._postgresPool = new Pool(baseConfig);
    }

    global._postgresPool.on('error', (err) => {
      if (isTransientIdleError(err)) {
        // Cloud SQL scale-to-zero / idle proxy closes stale sockets; pg.Pool automatically replaces them on next query.
        return;
      }
      console.error('SQL pool error:', err?.message || err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
export { pool };
