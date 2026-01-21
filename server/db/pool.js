import pg from 'pg';

const { Pool } = pg;

// Prefer env var; do not hardcode secrets
const connectionString = process.env.DATABASE_URL;

let pool = null;

if (connectionString) {
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
}

export function getPool() {
  return pool;
}
