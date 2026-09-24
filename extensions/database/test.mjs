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
 * Tests for the Database extension: value formatting, SQL building, pending
 * changes, exports, parsers, the translations — and the SQLite driver against
 * a real file.
 *
 *   node extensions/database/test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jsonSafe, parseInput, toCell, toCsv, toJson, toHex, uniqueNames, valueText } from './src/format.js';
import {
  countRows, deleteStatement, inlineParams, insertStatement, qualified, quoteIdent, returnsRows, selectAll, selectPage, splitStatements, updateStatement,
} from './src/sql.js';
import { addRow, clearPending, createPending, pendingCount, pendingStatements, setCell, toggleDelete } from './src/pending.js';
import { describe, redactUrl, typeOfFile } from './src/connections.js';
import { parseMssqlConnectionString } from './src/drivers/mssql.js';
import { splitCommand } from './src/drivers/redis.js';
import { formatTtl, replyText } from './src/views/redis.js';
import { fieldPairs } from './src/views/redis-key.js';
import { keysOf, createT } from './src/i18n/index.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ------------------------------------------------------------------ *
 * Values
 * ------------------------------------------------------------------ */

test('cells: numbers stay numbers, null stays null, bytes become hex', () => {
  assert.equal(toCell(42), 42);
  assert.equal(toCell(null), null);
  assert.equal(toCell(undefined), null);
  assert.equal(toCell(true), true);
  assert.equal(toCell(12345678901234567890n), '12345678901234567890');
  assert.equal(toCell(new Uint8Array([0, 255, 16])), '0x00ff10');
  assert.equal(toCell(Buffer.alloc(100)).endsWith('…'), true);
  assert.equal(toCell({ a: 1 }), '{"a":1}');
  assert.equal(toCell(new Date('2024-05-01T13:45:12.000Z')), '2024-05-01 13:45:12');
  assert.equal(toCell('x'.repeat(5000)).length, 2001);
});

test('value text: full values for exports and editing', () => {
  assert.equal(valueText(null), null);
  assert.equal(valueText('a\tb'), 'a\tb');
  assert.equal(valueText(new Date('2024-05-01T13:45:12.345Z')), '2024-05-01 13:45:12.345');
  assert.equal(valueText([1, 2n]), '[1,"2"]');
  assert.equal(toHex(Buffer.from('hi')), '0x6869');
  assert.deepEqual(jsonSafe({ id: 1n, when: new Date(0), nested: [Buffer.from([1])] }), { id: '1', when: '1970-01-01 00:00:00', nested: ['0x01'] });
});

test('typed input: numbers for SQLite, bytes from 0x, text for the rest', () => {
  assert.equal(parseInput('42', { type: 'INTEGER' }, 'sqlite'), 42);
  assert.equal(parseInput('4.5', { type: 'REAL' }, 'sqlite'), 4.5);
  assert.equal(parseInput('9007199254740993', { type: 'INTEGER' }, 'sqlite'), 9007199254740993n);
  assert.equal(parseInput('abc', { type: 'INTEGER' }, 'sqlite'), 'abc');
  assert.equal(parseInput('42', { type: 'int4' }, 'postgres'), '42');
  assert.deepEqual(parseInput('0x0aff', { type: 'BLOB' }, 'sqlite'), Buffer.from([10, 255]));
  assert.equal(parseInput(null, { type: 'TEXT' }, 'sqlite'), null);
  assert.equal(parseInput('', { type: 'TEXT' }, 'sqlite'), '');
});

test('CSV: quotes where needed, NULL empty, CRLF', () => {
  const csv = toCsv([{ name: 'id' }, { name: 'text' }], [[1, 'plain'], [2, 'with, comma'], [3, 'say "hi"'], [4, null], [5, 'two\nlines']]);
  assert.equal(csv, 'id,text\r\n1,plain\r\n2,"with, comma"\r\n3,"say ""hi"""\r\n4,\r\n5,"two\nlines"\r\n');
  assert.equal(toCsv([{ name: 'a;b' }], [['x;y']], ';'), '"a;b"\r\n"x;y"\r\n');
});

test('JSON export: objects per row, duplicate names kept apart', () => {
  const json = JSON.parse(toJson([{ name: 'id' }, { name: 'id' }, { name: 'data' }], [[1, 2, Buffer.from([1])]]));
  assert.deepEqual(json, [{ id: 1, id_2: 2, data: '0x01' }]);
  assert.deepEqual(uniqueNames(['a', 'a', 'b', 'a']), ['a', 'a_2', 'b', 'a_3']);
});

/* ------------------------------------------------------------------ *
 * SQL
 * ------------------------------------------------------------------ */

test('quoting per dialect', () => {
  assert.equal(quoteIdent('sqlite', 'we"ird'), '"we""ird"');
  assert.equal(quoteIdent('mysql', 'we`ird'), '`we``ird`');
  assert.equal(quoteIdent('mssql', 'we]ird'), '[we]]ird]');
  assert.equal(qualified('postgres', 'public', 'users'), '"public"."users"');
  assert.equal(qualified('sqlite', null, 'users'), '"users"');
});

test('paging per dialect', () => {
  const base = { schema: 'main', table: 't', offset: 20, limit: 10 };
  assert.equal(selectPage('sqlite', base), 'SELECT * FROM "main"."t" LIMIT 10 OFFSET 20');
  assert.equal(
    selectPage('postgres', { ...base, schema: 'public', filter: 'a > 1', sort: { column: 'b', direction: 'desc' }, extra: ['ctid::text AS "__lumen_ctid"'] }),
    'SELECT ctid::text AS "__lumen_ctid", * FROM "public"."t" WHERE a > 1 ORDER BY "b" DESC LIMIT 10 OFFSET 20',
  );
  assert.equal(selectPage('mssql', { ...base, schema: 'dbo' }), 'SELECT * FROM [dbo].[t] ORDER BY (SELECT NULL) OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY');
  assert.equal(selectPage('mysql', { ...base, schema: 'shop', sort: { column: 'id', direction: 'asc' } }), 'SELECT * FROM `shop`.`t` ORDER BY `id` ASC LIMIT 10 OFFSET 20');
  assert.equal(countRows('h2', { schema: 'PUBLIC', table: 'T', filter: ' ' }), 'SELECT COUNT(*) FROM "PUBLIC"."T"');
  assert.equal(selectAll('mssql', { schema: 'dbo', table: 't', filter: 'a = 1', sort: { column: 'b', direction: 'desc' } }), 'SELECT * FROM [dbo].[t] WHERE a = 1 ORDER BY [b] DESC');
});

test('statements with parameters, keys with NULL, row ids', () => {
  assert.deepEqual(updateStatement('postgres', { schema: 'public', table: 't' }, { id: 7 }, { a: 'x', b: null }), {
    sql: 'UPDATE "public"."t" SET "a" = $1, "b" = $2 WHERE "id" = $3', params: ['x', null, 7],
  });
  assert.deepEqual(updateStatement('mssql', { schema: 'dbo', table: 't' }, { a: 1, b: null }, { c: 2 }), {
    sql: 'UPDATE [dbo].[t] SET [c] = @p1 WHERE [a] = @p2 AND [b] IS NULL', params: [2, 1],
  });
  assert.deepEqual(deleteStatement('sqlite', { schema: 'main', table: 't' }, { __lumen_rowid: 5 }), {
    sql: 'DELETE FROM "main"."t" WHERE rowid = ?', params: [5],
  });
  assert.deepEqual(deleteStatement('postgres', { schema: 'public', table: 't' }, { __lumen_ctid: '(0,1)' }), {
    sql: 'DELETE FROM "public"."t" WHERE ctid = $1::tid', params: ['(0,1)'],
  });
  assert.deepEqual(insertStatement('mysql', { schema: 's', table: 't' }, { a: 1, b: 'x' }), {
    sql: 'INSERT INTO `s`.`t` (`a`, `b`) VALUES (?, ?)', params: [1, 'x'],
  });
  assert.equal(insertStatement('postgres', { table: 't' }, {}).sql, 'INSERT INTO "t" DEFAULT VALUES');
  assert.equal(insertStatement('mysql', { table: 't' }, {}).sql, 'INSERT INTO `t` () VALUES ()');
});

test('parameters inlined for showing', () => {
  assert.equal(inlineParams('sqlite', 'UPDATE t SET a = ? WHERE id = ?', ["it's", 3]), "UPDATE t SET a = 'it''s' WHERE id = 3");
  assert.equal(inlineParams('postgres', 'SELECT $2, $1', [null, true]), 'SELECT TRUE, NULL');
  assert.equal(inlineParams('mssql', 'SELECT @p1', ['ä']), "SELECT N'ä'");
  assert.equal(inlineParams('mysql', 'SELECT ?', ['a\\b']), "SELECT 'a\\\\b'");
  assert.equal(inlineParams('sqlite', 'SELECT ?', [Buffer.from([255])]), "SELECT X'ff'");
});

test('splitting scripts', () => {
  assert.deepEqual(splitStatements('SELECT 1; SELECT 2;\n\n-- only a comment\n'), ['SELECT 1', 'SELECT 2']);
  assert.deepEqual(splitStatements("INSERT INTO t VALUES ('a;b'); SELECT \"x;y\" FROM t"), ["INSERT INTO t VALUES ('a;b')", 'SELECT "x;y" FROM t']);
  assert.deepEqual(splitStatements('SELECT 1 /* ; */; -- ; \nSELECT 2'), ['SELECT 1 /* ; */', '-- ; \nSELECT 2']);
  assert.deepEqual(
    splitStatements('CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql; SELECT f()', 'postgres'),
    ['CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql', 'SELECT f()'],
  );
  assert.deepEqual(splitStatements('SELECT 1\nGO\nSELECT [a;b] FROM t\ngo', 'mssql'), ['SELECT 1', 'SELECT [a;b] FROM t']);
  assert.deepEqual(splitStatements("SELECT 'it\\'s; fine'; SELECT 2", 'mysql'), ["SELECT 'it\\'s; fine'", 'SELECT 2']);
  assert.deepEqual(splitStatements("SELECT 'it''s; fine'"), ["SELECT 'it''s; fine'"]);
  assert.equal(returnsRows('  -- note\n select 1'), true);
  assert.equal(returnsRows('UPDATE t SET a = 1'), false);
});

/* ------------------------------------------------------------------ *
 * Pending changes
 * ------------------------------------------------------------------ */

test('pending: edits, reverting an edit, new rows, deletes, order of statements', () => {
  const pending = createPending();
  setCell(pending, 'k1', 'name', 'Bob', 'Alice');
  setCell(pending, 'k2', 'name', 'Same', 'Same');
  assert.equal(pendingCount(pending), 1);
  setCell(pending, 'k1', 'name', 'Alice', 'Alice');
  assert.equal(pendingCount(pending), 0, 'setting the original value drops the edit');
  setCell(pending, 'k1', 'name', 'Carol', 'Alice');
  const fresh = addRow(pending);
  setCell(pending, fresh, 'name', 'New', undefined);
  toggleDelete(pending, ['k3']);
  const keys = { k1: { id: 1 }, k3: { id: 3 } };
  const list = pendingStatements(pending, { dialect: 'sqlite', schema: 'main', table: 'people', keyOf: (id) => keys[id] });
  assert.deepEqual(list.map((s) => s.sql), [
    'DELETE FROM "main"."people" WHERE "id" = ?',
    'UPDATE "main"."people" SET "name" = ? WHERE "id" = ?',
    'INSERT INTO "main"."people" ("name") VALUES (?)',
  ]);
  assert.deepEqual(list.map((s) => s.params), [[3], ['Carol', 1], ['New']]);
  toggleDelete(pending, [fresh, 'k3']);
  assert.equal(pending.inserts.length, 0, 'a deleted new row is gone');
  assert.equal(pending.deletes.size, 0, 'deleting twice restores');
  clearPending(pending);
  assert.equal(pendingCount(pending), 0);
});

/* ------------------------------------------------------------------ *
 * Connections and parsers
 * ------------------------------------------------------------------ */

test('connections: file types, descriptions, redacted strings', () => {
  assert.equal(typeOfFile('/a/b/data.MV.DB'), 'h2');
  assert.equal(typeOfFile('x.sqlite3'), 'sqlite');
  assert.equal(typeOfFile('x.db'), 'sqlite');
  assert.equal(typeOfFile('x.txt'), null);
  assert.equal(describe({ type: 'postgres', host: 'db', port: '5432', database: 'app' }), 'db:5432/app');
  assert.equal(redactUrl('postgres://me:secret@host/db'), 'postgres://me:•••@host/db');
  assert.equal(redactUrl('Server=x;Password=abc;User Id=sa'), 'Server=x;Password=•••;User Id=sa');
});

test('SQL Server connection strings', () => {
  assert.deepEqual(parseMssqlConnectionString('Server=tcp:db.example.net,1444;Initial Catalog=app;User ID=sa;Password=p;Encrypt=True;TrustServerCertificate=yes'), {
    host: 'db.example.net', port: 1444, database: 'app', user: 'sa', password: 'p', encrypt: true, trustServerCertificate: true,
  });
  assert.deepEqual(parseMssqlConnectionString('Data Source=HOST\\SQLEXPRESS;Database=x'), { host: 'HOST', instance: 'SQLEXPRESS', database: 'x' });
});

test('Redis: command lines, TTLs, replies, stream fields', () => {
  assert.deepEqual(splitCommand('SET "a key" \'b c\' plain'), ['SET', 'a key', 'b c', 'plain']);
  assert.deepEqual(splitCommand('SET k "line\\nbreak"'), ['SET', 'k', 'line\nbreak']);
  assert.equal(formatTtl(-1), '');
  assert.equal(formatTtl(30_000), '30 s');
  assert.equal(formatTtl(600_000), '10 min');
  assert.equal(formatTtl(3 * 86_400_000), '3 d');
  assert.equal(replyText(['a', null, ['b']]), '1) a\n2) (nil)\n3) 1) b');
  assert.deepEqual(fieldPairs('a 1 b 2 c'), [['a', '1'], ['b', '2']]);
});

/* ------------------------------------------------------------------ *
 * Translations
 * ------------------------------------------------------------------ */

test('translations: every language has every key, with the same placeholders', () => {
  const english = keysOf('en');
  const t = createT({ locale: () => 'en' });
  for (const language of ['es', 'fr', 'it', 'nl', 'pl', 'pt']) {
    const keys = keysOf(language);
    const missing = english.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !english.includes(key));
    assert.deepEqual(missing, [], `${language}: missing ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `${language}: unknown ${extra.join(', ')}`);
    const local = createT({ locale: () => language });
    for (const key of english) {
      const wanted = (t(key).match(/\{\w+\}/g) ?? []).sort().join();
      const found = (local(key).match(/\{\w+\}/g) ?? []).sort().join();
      assert.equal(found, wanted, `${language}.${key}: placeholders`);
    }
  }
});

test('every key the code uses exists', () => {
  const english = new Set(keysOf('en'));
  const files = ['main.js', ...walk(path.join(import.meta.dirname, 'src'))];
  const missing = [];
  for (const file of files) {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, file), 'utf8');
    for (const match of source.matchAll(/\bt\('([a-zA-Z]+(?:\.[a-zA-Z]+)+)'/g)) {
      if (!english.has(match[1])) {
        missing.push(`${path.basename(file)}: ${match[1]}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(full);
    }
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

/* ------------------------------------------------------------------ *
 * SQLite against a real file
 * ------------------------------------------------------------------ */

test('SQLite driver: tree, columns, paging, a committed edit', async () => {
  let sqlite;
  try {
    sqlite = await import('node:sqlite');
  } catch {
    process.stdout.write('  (skipped: this Node has no node:sqlite)\n');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-db-test-'));
  const file = path.join(dir, 'shop.sqlite');
  const setup = new sqlite.DatabaseSync(file);
  setup.exec(`CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER, photo BLOB);
    CREATE TABLE notes (body TEXT);
    CREATE VIEW adults AS SELECT * FROM people WHERE age >= 18;
    CREATE INDEX people_name ON people (name);
    INSERT INTO people (name, age) VALUES ('Ada', 36), ('Linus', 12), ('Grace', 45);
    INSERT INTO notes VALUES ('first'), ('second');`);
  setup.close();

  const { openSqlite } = await import('./src/drivers/sqlite.js');
  const db = await openSqlite({ file });
  try {
    const tree = await db.tree();
    assert.deepEqual(tree, [{ name: 'main', tables: [{ name: 'adults', kind: 'view' }, { name: 'notes', kind: 'table' }, { name: 'people', kind: 'table' }] }]);
    const columns = await db.columns('main', 'people');
    assert.deepEqual(columns.map((column) => [column.name, column.type, column.pk, column.nullable]), [
      ['id', 'INTEGER', true, true], ['name', 'TEXT', false, false], ['age', 'INTEGER', false, true], ['photo', 'BLOB', false, true],
    ]);
    const indexes = await db.indexes('main', 'people');
    assert.deepEqual(indexes.map((index) => [index.name, index.columns]), [['people_name', ['name']]]);

    const page = await db.query(selectPage('sqlite', { schema: 'main', table: 'people', sort: { column: 'age', direction: 'desc' }, limit: 2 }));
    assert.deepEqual(page.rows.map((row) => row[1]), ['Grace', 'Ada']);
    const truncated = await db.query('SELECT * FROM people', [], { maxRows: 2 });
    assert.equal(truncated.truncated, true);

    // A table without a primary key is addressed by rowid.
    const notes = await db.query(selectPage('sqlite', { schema: 'main', table: 'notes', extra: ['rowid AS "__lumen_rowid"'] }));
    assert.deepEqual(notes.rows, [[1, 'first'], [2, 'second']]);

    const pending = createPending();
    setCell(pending, 'k1', 'age', parseInput('37', { type: 'INTEGER' }, 'sqlite'), 36);
    setCell(pending, 'n1', 'body', 'edited', 'first');
    const keys = { k1: { id: 1 }, n1: { __lumen_rowid: 1 } };
    const statements = [
      ...pendingStatements({ ...pending, edits: new Map([['k1', pending.edits.get('k1')]]) }, { dialect: 'sqlite', schema: 'main', table: 'people', keyOf: (id) => keys[id] }),
      ...pendingStatements({ ...pending, edits: new Map([['n1', pending.edits.get('n1')]]) }, { dialect: 'sqlite', schema: 'main', table: 'notes', keyOf: (id) => keys[id] }),
    ];
    const result = await db.transaction(statements);
    assert.equal(result.affected, 2);

    // A failing statement rolls the whole transaction back.
    await assert.rejects(db.transaction([
      { sql: 'UPDATE people SET age = 99 WHERE id = 2', params: [] },
      { sql: 'INSERT INTO people (id, name) VALUES (1, ?)', params: ['duplicate'] },
    ]));
    const check = new sqlite.DatabaseSync(file);
    assert.equal(check.prepare('SELECT age FROM people WHERE id = 1').get().age, 37);
    assert.equal(check.prepare('SELECT age FROM people WHERE id = 2').get().age, 12);
    assert.equal(check.prepare('SELECT body FROM notes WHERE rowid = 1').get().body, 'edited');
    check.close();

    // A query past its timeout is stopped, and the driver keeps working.
    await assert.rejects(db.query('WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n) SELECT count(*) FROM n', [], { timeoutMs: 300 }), /timeout/);
    assert.equal((await db.query('SELECT count(*) FROM people')).rows[0][0], 3);
  } finally {
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    process.stdout.write(`✓ ${name}\n`);
  } catch (err) {
    failed++;
    process.stdout.write(`✗ ${name}\n  ${err.stack?.split('\n').slice(0, 6).join('\n  ')}\n`);
  }
}
process.stdout.write(`\n${tests.length - failed} passed, ${failed} failed\n`);
if (failed) {
  process.exit(1);
}
