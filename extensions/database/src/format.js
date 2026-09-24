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
 * Values between the drivers and the interface: what a cell shows, what a
 * typed cell means, and results written out as CSV or JSON.
 *
 * Pure functions — `test.mjs` covers them.
 */

/** Longest text a cell carries to the interface; the full value stays here for exports. */
const MAX_CELL_CHARS = 2000;
/** Bytes of a binary value shown as hex before it is cut short. */
const MAX_HEX_BYTES = 48;

const isBytes = (value) => value instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(value));

export function toHex(bytes, limit = Infinity) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const shown = view.subarray(0, Math.min(view.length, limit));
  const hex = Array.from(shown, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `0x${hex}${view.length > shown.length ? '…' : ''}`;
}

/** A date as the database would print it: `2024-05-01 13:45:12.345` (UTC for timestamps with zone). */
function formatDate(value) {
  if (Number.isNaN(value.getTime())) {
    return String(value);
  }
  return value.toISOString().replace('T', ' ').replace(/\.000Z$|Z$/, '');
}

/** Anything JSON can carry, with the types JSON cannot (bigint, bytes, dates) turned into text. */
export function jsonSafe(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return formatDate(value);
  }
  if (isBytes(value)) {
    return toHex(value);
  }
  if (Array.isArray(value)) {
    return value.map(jsonSafe);
  }
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') {
      return value.toHexString();
    }
    if (typeof value.toJSON === 'function' && !(value.constructor === Object)) {
      return jsonSafe(value.toJSON());
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonSafe(entry)]));
  }
  return value;
}

/** Full text of a value — for exports and for editing a cell. `null` stays `null`. */
export function valueText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return formatDate(value);
  }
  if (isBytes(value)) {
    return toHex(value);
  }
  return JSON.stringify(jsonSafe(value));
}

/** What a grid cell shows: numbers stay numbers (right-aligned), long text and bytes are cut short. */
export function toCell(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (isBytes(value)) {
    return toHex(value, MAX_HEX_BYTES);
  }
  const text = valueText(value);
  return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : text;
}

/** SQL types whose values are numbers. */
const NUMERIC_TYPE = /int|serial|float|double|real|decimal|numeric|number|money|bit\b/i;
const BINARY_TYPE = /blob|binary|bytea|image/i;

export const isNumericType = (type) => NUMERIC_TYPE.test(String(type ?? ''));
export const isBinaryType = (type) => BINARY_TYPE.test(String(type ?? ''));

/**
 * What the user typed into a cell, as a parameter for the database. Text goes
 * as text — every server casts it to the column's type — except where the
 * driver cannot: numbers for SQLite's numeric affinity, `0x…` for binary
 * columns.
 */
export function parseInput(text, column = {}, dialect = '') {
  if (text === null || text === undefined) {
    return null;
  }
  const type = column.type ?? '';
  if (isBinaryType(type) && /^0x([0-9a-f]{2})*$/i.test(text)) {
    return Buffer.from(text.slice(2), 'hex');
  }
  if (dialect === 'sqlite' && isNumericType(type) && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(text.trim())) {
    const number = Number(text);
    if (Number.isSafeInteger(number) || !/^-?\d+$/.test(text.trim())) {
      return number;
    }
    return BigInt(text.trim());
  }
  return text;
}

/* ------------------------------------------------------------------ *
 * Exports
 * ------------------------------------------------------------------ */

function csvField(value, separator) {
  const text = valueText(value);
  if (text === null) {
    return '';
  }
  if (text.includes(separator) || /["\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** RFC 4180: a header line, CRLF between records, quotes where needed. NULL is an empty field. */
export function toCsv(columns, rows, separator = ',') {
  const lines = [columns.map((column) => csvField(column.name ?? column, separator)).join(separator)];
  for (const row of rows) {
    lines.push(row.map((value) => csvField(value, separator)).join(separator));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** An array of objects, one per row; duplicate column names get a suffix so nothing is lost. */
export function toJson(columns, rows) {
  const names = uniqueNames(columns.map((column) => column.name ?? String(column)));
  const objects = rows.map((row) => Object.fromEntries(names.map((name, index) => [name, jsonSafe(row[index])])));
  return `${JSON.stringify(objects, null, 2)}\n`;
}

export function uniqueNames(names) {
  const seen = new Map();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count ? `${name}_${count + 1}` : name;
  });
}

/** Separators by setting value. */
export const CSV_SEPARATORS = { comma: ',', semicolon: ';', tab: '\t' };

/** Milliseconds as “12 ms” or “1.4 s”. */
export function formatDuration(ms) {
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}
