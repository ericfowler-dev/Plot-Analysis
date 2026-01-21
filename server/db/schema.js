import { getPool } from './pool.js';

export async function ensureIssuesTable() {
  const pool = getPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS issues (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      email TEXT,
      status TEXT DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      user_agent TEXT,
      source TEXT DEFAULT 'db'
    )
  `);
}

export async function ensureProfilesTables() {
  const pool = getPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      profile_id TEXT PRIMARY KEY,
      profile JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS profile_index (
      id INTEGER PRIMARY KEY DEFAULT 1,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export async function ensureConfiguratorAuditTable() {
  const pool = getPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS configurator_audit (
      id SERIAL PRIMARY KEY,
      version INTEGER,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      actor TEXT,
      action TEXT,
      details JSONB
    )
  `);
}

export async function ensureUploadsTable() {
  const pool = getPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id SERIAL PRIMARY KEY,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      file_type TEXT,
      size_bytes BIGINT,
      status TEXT DEFAULT 'processed',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      metadata JSONB
    )
  `);
}

export async function ensureBaselinesTables() {
  const pool = getPool();
  if (!pool) return;

  // Main baseline data storage
  await pool.query(`
    CREATE TABLE IF NOT EXISTS baseline_data (
      id INTEGER PRIMARY KEY DEFAULT 1,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Baseline index (groups, sizes, applications metadata)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS baseline_index (
      id INTEGER PRIMARY KEY DEFAULT 1,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export async function ensureAllTables() {
  console.log('Starting database table creation...');
  try {
    await Promise.all([
      ensureIssuesTable(),
      ensureProfilesTables(),
      ensureConfiguratorAuditTable(),
      ensureUploadsTable(),
      ensureBaselinesTables()
    ]);
    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Failed to create database tables:', error);
    throw error;
  }
}
