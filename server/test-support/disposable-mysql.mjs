import mysql from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Supports this repository's multiline DDL and DELIMITER-based trigger definitions.
export function schemaStatements(source) {
  let delimiter = ';', buffer = '';
  const statements = [];
  for (const line of source.split(/\r?\n/)) {
    const change = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (change) { delimiter = change[1]; continue; }
    buffer += `${line}\n`;
    if (line.trimEnd().endsWith(delimiter)) {
      const end = buffer.lastIndexOf(delimiter);
      const sql = buffer.slice(0, end).replace(/^\s*(?:--[^\n]*(?:\n|$)\s*)*/, '').trim();
      if (sql) statements.push(sql);
      buffer = '';
    }
  }
  if (buffer.replace(/--[^\n]*/g, '').trim()) throw new Error('Unterminated schema statement.');
  return statements;
}

export async function disposableMysql() {
  // Never accept DB_NAME or a caller-supplied schema name: cleanup can only drop
  // the random schema this invocation successfully created itself.
  const name = `song_showdown_test_${randomBytes(12).toString('hex')}`;
  const config = {
    host: process.env.TEST_DB_HOST || process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.TEST_DB_PORT || process.env.DB_PORT || 8889),
    user: process.env.TEST_DB_USER || process.env.DB_USER || 'root',
    password: process.env.TEST_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    connectTimeout: 5000
  };
  const admin = await mysql.createConnection(config);
  let pool, created = false, disposed = false;
  async function dispose() {
    if (disposed) return;
    disposed = true;
    try { if (pool) await pool.end(); }
    finally {
      try { if (created) await admin.query(`DROP DATABASE \`${name}\``); }
      finally { await admin.end(); }
    }
  }
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    created = true;
    await admin.changeUser({database: name});
    const source = await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8');
    for (const sql of schemaStatements(source)) {
      // Select the generated schema instead of the source file's application DB.
      if (/^(?:CREATE DATABASE|USE)\b/i.test(sql)) continue;
      await admin.query(sql);
    }
    pool = mysql.createPool({...config, database: name, connectionLimit: 10, decimalNumbers: true});
    return {pool, name, dispose};
  } catch (error) {
    await dispose();
    throw error;
  }
}
