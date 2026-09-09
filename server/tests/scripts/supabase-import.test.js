const path = require('path');
const { execFileSync } = require('child_process');
const { requireSupabaseDbUrl } = require('../../config/postgres');

test('database URL configuration is explicit and server-side', () => {
  const previous = process.env.SUPABASE_DB_URL;
  delete process.env.SUPABASE_DB_URL;
  expect(() => requireSupabaseDbUrl()).toThrow('SUPABASE_DB_URL is required');
  process.env.SUPABASE_DB_URL = 'mysql://not-postgres';
  expect(() => requireSupabaseDbUrl()).toThrow('PostgreSQL connection string');
  if (previous === undefined) delete process.env.SUPABASE_DB_URL;
  else process.env.SUPABASE_DB_URL = previous;
});

test('import refuses to run without an Auth mapping file', () => {
  const script = path.resolve(__dirname, '../../scripts/import-supabase.js');
  expect(() => execFileSync(process.execPath, [script], { encoding: 'utf8', stdio: 'pipe' })).toThrow(/Auth mapping JSON file is required/);
});
