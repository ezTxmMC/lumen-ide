#!/usr/bin/env node
/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * Tries the H2 driver against a throwaway database: needs Java on the PATH and
 * (on the first run) the network, to fetch the H2 jar from Maven Central.
 *
 *   node extensions/database/test-h2.mjs [scratch dir]
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openH2 } from './src/drivers/h2/index.js';

const scratch = process.argv[2] ?? path.join(os.tmpdir(), 'lumen-h2-test');
await fs.mkdir(scratch, { recursive: true });
await fs.rm(path.join(scratch, 'test.mv.db'), { force: true });
await fs.rm(path.join(scratch, 'test.trace.db'), { force: true });
const ctx = {
  settings: { get: () => undefined },
  storage: { dir: async () => scratch },
};

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`✓ ${name}\n`);
}

// Create the database through a plain URL (the file form insists it exists).
const base = path.join(scratch, 'test');
const creator = await openH2({ url: `jdbc:h2:file:${base}` }, { password: '', ctx });
await creator.query('CREATE TABLE PEOPLE (ID INT PRIMARY KEY, NAME VARCHAR(40) NOT NULL, SCORE DECIMAL(10,2), NOTE VARCHAR(100))');
await creator.query('CREATE INDEX PEOPLE_NAME ON PEOPLE (NAME)');
await creator.query('CREATE VIEW HIGH AS SELECT * FROM PEOPLE WHERE SCORE > 5');
await creator.close();

const db = await openH2({ file: `${base}.mv.db` }, { password: '', ctx });

await test('insert with parameters', async () => {
  for (let i = 1; i <= 5; i++) {
    const result = await db.query('INSERT INTO PEOPLE VALUES (?, ?, ?, ?)', [i, `name ${i}\t"quoted"`, i * 2.5, i === 3 ? null : 'x']);
    assert.equal(result.affected, 1);
  }
});

await test('select values and types', async () => {
  const result = await db.query('SELECT ID, NAME, SCORE, NOTE, X\'CAFE\' AS B, TRUE AS T FROM PEOPLE ORDER BY ID');
  assert.deepEqual(result.columns.map((column) => column.name), ['ID', 'NAME', 'SCORE', 'NOTE', 'B', 'T']);
  assert.equal(result.rows.length, 5);
  assert.deepEqual(result.rows[0], [1, 'name 1\t"quoted"', '2.50', 'x', '0xcafe', true]);
  assert.equal(result.rows[2][3], null);
  assert.equal(result.truncated, false);
});

await test('maxRows truncates', async () => {
  const result = await db.query('SELECT * FROM PEOPLE', [], { maxRows: 2 });
  assert.equal(result.rows.length, 2);
  assert.equal(result.truncated, true);
});

await test('tree', async () => {
  const tree = await db.tree();
  const pub = tree.find((schema) => schema.name === 'PUBLIC');
  assert.ok(pub);
  assert.deepEqual(pub.tables, [{ name: 'HIGH', kind: 'view' }, { name: 'PEOPLE', kind: 'table' }]);
  assert.ok(!tree.some((schema) => schema.name === 'INFORMATION_SCHEMA'));
});

await test('columns', async () => {
  const columns = await db.columns('PUBLIC', 'PEOPLE');
  assert.deepEqual(columns.map((column) => [column.name, column.pk, column.nullable]), [
    ['ID', true, false], ['NAME', false, false], ['SCORE', false, true], ['NOTE', false, true],
  ]);
  assert.equal(columns[1].type, 'CHARACTER VARYING(40)');
});

await test('indexes', async () => {
  const indexes = await db.indexes('PUBLIC', 'PEOPLE');
  const byName = Object.fromEntries(indexes.map((index) => [index.name, index]));
  assert.deepEqual(byName.PEOPLE_NAME.columns, ['NAME']);
  assert.ok(indexes.some((index) => index.primary && index.columns[0] === 'ID'));
});

await test('transaction commits', async () => {
  const result = await db.transaction([
    { sql: 'UPDATE PEOPLE SET NAME = ? WHERE ID = ?', params: ['changed', 1] },
    { sql: 'DELETE FROM PEOPLE WHERE ID = ?', params: [5] },
  ]);
  assert.equal(result.affected, 2);
  assert.equal((await db.query('SELECT COUNT(*) FROM PEOPLE')).rows[0][0], 4);
});

await test('transaction rolls back on error', async () => {
  await assert.rejects(db.transaction([
    { sql: 'UPDATE PEOPLE SET NAME = ? WHERE ID = ?', params: ['lost', 2] },
    { sql: 'INSERT INTO PEOPLE (ID, NAME) VALUES (?, ?)', params: [1, 'duplicate'] },
  ]));
  assert.equal((await db.query('SELECT NAME FROM PEOPLE WHERE ID = 2')).rows[0][0], 'name 2\t"quoted"');
});

await test('timeout', async () => {
  const started = Date.now();
  await assert.rejects(
    db.query('SELECT COUNT(*) FROM SYSTEM_RANGE(1, 100000) A, SYSTEM_RANGE(1, 100000) B WHERE MOD(A.X * B.X, 7) = 3', [], { timeoutMs: 1000 }),
    (err) => err.code === 'timeout',
  );
  assert.ok(Date.now() - started < 6000);
  // The connection survives a timed-out statement.
  assert.equal((await db.query('SELECT 1')).rows[0][0], 1);
});

await test('errors carry the message', async () => {
  await assert.rejects(db.query('SELECT * FROM NOPE'), /NOPE/);
});

await db.close();
process.stdout.write(`\n${passed} passed\n`);
