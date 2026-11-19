import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!sqlHost && !databaseUrl) {
  throw new Error('SQL_HOST or DATABASE_URL must be set in environment variables.');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: sqlHost
    ? {
        host: sqlHost,
        user: user || '',
        password: password || '',
        database: sqlDbName || '',
        ssl: false,
      }
    : {
        url: databaseUrl!,
      },
  verbose: true,
});
