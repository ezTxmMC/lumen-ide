/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Error classes and type coercion for the graph interpreter. */

import type { PinType } from './schema';

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class GraphError extends Error {
  constructor(message: string, public nodeId?: string) {
    super(message);
    this.name = 'GraphError';
  }
}

/** The stop node: ends execution without an error. */
export class StopSignal extends Error {
  constructor() {
    super('stop');
    this.name = 'StopSignal';
  }
}

/* ------------------------------------------------------------------ *
 * Type coercion
 * ------------------------------------------------------------------ */

export function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map(toText).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  const parsed = Number(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'string') {
    return !['', 'false', '0', 'nein', 'no'].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function toList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined || value === '') {
    return [];
  }
  return [value];
}

const COERCE: Record<PinType, (value: unknown) => unknown> = {
  exec: (value) => value,
  any: (value) => value,
  string: toText,
  number: toNumber,
  boolean: toBoolean,
  list: toList,
};

export function coerce(value: unknown, type: PinType): unknown {
  return COERCE[type](value);
}

