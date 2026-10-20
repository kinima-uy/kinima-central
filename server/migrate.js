import { readFile } from 'node:fs/promises';
import { createKinimaPool } from './db.js';

const pool = createKinimaPool({ max: 1 });
try {
  const schema = await readFile(new URL('../database/schema.postgresql.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  console.log('Esquema Kinima aplicado a PostgreSQL.');
} catch (error) {
  console.error(`No se pudo aplicar el esquema: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
