// Migration: SQLite dev.db → Supabase PostgreSQL
// Run: node scripts/migrate-sqlite-to-pg.mjs

import { createRequire } from 'module';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../prisma/dev.db');

const sqlite = new Database(dbPath, { readonly: true });
const prisma = new PrismaClient();

// Fetch PostgreSQL column types for a table
const pgColTypes = {};
async function loadColTypes(tableName) {
  if (pgColTypes[tableName]) return pgColTypes[tableName];
  const rows = await prisma.$queryRawUnsafe(
    `SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    tableName
  );
  const map = {};
  for (const r of rows) {
    map[r.column_name] = r.data_type === 'USER-DEFINED' ? r.udt_name : r.data_type;
  }
  pgColTypes[tableName] = map;
  return map;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;

function convertValue(v, pgType) {
  if (v === null || v === undefined) return null;

  // Boolean columns: SQLite stores 0/1
  if (pgType === 'boolean') {
    return v === 1 || v === '1' || v === true;
  }

  // Timestamp columns: SQLite stores ISO strings
  if (pgType && (pgType.includes('timestamp') || pgType === 'date')) {
    if (typeof v === 'string' && ISO_DATE_RE.test(v)) return new Date(v);
    if (typeof v === 'number') return new Date(v); // epoch ms
    return null;
  }

  return v;
}

async function migrate() {
  const tables = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '_prisma_%'
       ORDER BY name`
    )
    .all();

  console.log(`Found ${tables.length} tables to migrate\n`);

  await prisma.$executeRawUnsafe(`SET session_replication_role = replica`);

  let totalRows = 0;
  let totalErrors = 0;

  for (const { name } of tables) {
    const rows = sqlite.prepare(`SELECT * FROM "${name}"`).all();
    if (rows.length === 0) {
      console.log(`  ${name}: empty, skipping`);
      continue;
    }

    const colTypes = await loadColTypes(name);
    if (Object.keys(colTypes).length === 0) {
      console.log(`  ${name}: not found in PostgreSQL, skipping`);
      continue;
    }

    console.log(`  ${name}: ${rows.length} rows...`);
    let inserted = 0;
    let errors = 0;

    for (const row of rows) {
      const columns = Object.keys(row);
      const values = columns.map(col => convertValue(row[col], colTypes[col]));

      const colList = columns.map(c => `"${c}"`).join(', ');
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "${name}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          ...values
        );
        inserted++;
      } catch (e) {
        errors++;
        if (errors <= 2) {
          console.error(`    ⚠ ${name}: ${e.message.slice(0, 150)}`);
        }
      }
    }

    totalRows += inserted;
    totalErrors += errors;
    console.log(`    ✓ ${inserted} inserted, ${errors} errors`);
  }

  await prisma.$executeRawUnsafe(`SET session_replication_role = DEFAULT`);
  console.log(`\nDone! ${totalRows} rows migrated, ${totalErrors} errors`);
}

migrate()
  .catch(e => { console.error('Migration failed:', e); process.exit(1); })
  .finally(() => { sqlite.close(); prisma.$disconnect(); });
