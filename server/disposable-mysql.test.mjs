import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaStatements } from './test-support/disposable-mysql.mjs';

test('fresh-schema loader preserves trigger bodies and separates schema selection',()=>{
  const statements=schemaStatements(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
  const triggers=statements.filter(sql=>sql.startsWith('CREATE TRIGGER'));
  assert.equal(triggers.length,2);
  assert.ok(triggers.every(sql=>sql.includes("SIGNAL SQLSTATE '45000'") && sql.endsWith('END')));
  assert.equal(statements.filter(sql=>sql.startsWith('CREATE DATABASE')).length,1);
  assert.equal(statements.filter(sql=>sql.startsWith('USE ')).length,1);
  assert.ok(statements.some(sql=>sql.startsWith('CREATE TABLE IF NOT EXISTS password_reset_tokens')));
});
