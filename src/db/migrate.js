const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function getMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

async function hasMigration(client, id) {
  const { rowCount } = await client.query('select 1 from schema_migrations where id = $1', [id]);
  return rowCount > 0;
}

async function applyMigration(client, filename) {
  const migrationPath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(migrationPath, 'utf8');

  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('insert into schema_migrations (id) values ($1)', [filename]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const files = await getMigrationFiles();

    for (const filename of files) {
      const alreadyApplied = await hasMigration(client, filename);
      if (alreadyApplied) {
        // eslint-disable-next-line no-console
        console.log(`skip ${filename}`);
        continue;
      }

      // eslint-disable-next-line no-console
      console.log(`apply ${filename}`);
      await applyMigration(client, filename);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  runMigrations,
};
