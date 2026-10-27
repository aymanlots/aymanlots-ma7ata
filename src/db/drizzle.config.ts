import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

const host = process.env.SQL_HOST;
const database = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;

if (!host || !database || !user || !password) {
  throw new Error(
    `Missing required database environment variables: ${[
      !host && 'SQL_HOST',
      !database && 'SQL_DB_NAME',
      !user && 'SQL_ADMIN_USER',
      !password && 'SQL_ADMIN_PASSWORD',
    ]
      .filter(Boolean)
      .join(', ')}`
  );
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host,
    database,
    user,
    password,
    ssl: false,
  },
});
