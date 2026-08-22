import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.js';

export function createDatabase(connectionString = process.env.DATABASE_URL) {
  if (connectionString === undefined) {
    throw new Error('DATABASE_URL is required to connect to PostGIS.');
  }

  const client = postgres(connectionString);
  return drizzle(client, { schema });
}
