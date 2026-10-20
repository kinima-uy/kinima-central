import pg from 'pg';

const { Pool } = pg;

export function createKinimaPool({ max = 5 } = {}) {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const ssl = process.env.PGSSL === 'false'
    ? false
    : process.env.PGSSL === 'true'
      ? { rejectUnauthorized: true }
      : undefined;

  return new Pool({
    ...(connectionString ? { connectionString } : {
      host: process.env.PGHOST || '127.0.0.1',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'kinima'
    }),
    ...(ssl === undefined ? {} : { ssl }),
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
}
