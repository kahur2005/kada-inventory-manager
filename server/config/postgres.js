const { Pool } = require('pg');

function requireSupabaseDbUrl() {
  const value = process.env.SUPABASE_DB_URL;
  if (!value) throw new Error('SUPABASE_DB_URL is required for migration commands');
  if (!/^postgres(ql)?:\/\//i.test(value)) throw new Error('SUPABASE_DB_URL must be a PostgreSQL connection string');
  return value;
}

function createPostgresPool(options = {}) {
  return new Pool({
    connectionString: requireSupabaseDbUrl(),
    max: Number(process.env.SUPABASE_DB_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    ...options,
  });
}

module.exports = { createPostgresPool, requireSupabaseDbUrl };
