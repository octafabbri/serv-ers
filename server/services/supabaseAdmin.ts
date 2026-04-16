import { Pool } from 'pg';

let pool: Pool | null = null;

export function getSupabaseAdmin(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set in server environment');
  }

  const sslRequired = process.env.DATABASE_URL?.includes('sslmode=require');

  pool = new Pool({
    connectionString,
    ssl: sslRequired ? { rejectUnauthorized: false } : false,
    max: 10,
  });

  return pool;
}
