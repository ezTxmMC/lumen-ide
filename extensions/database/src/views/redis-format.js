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
 * Text forms of Redis values for the key list and the command line.
 */

import { jsonSafe } from '../format.js';

/** “12 s”, “5 min”, “3 h”, “2 d” — or nothing for a key without expiry. */
export function formatTtl(ms) {
  if (ms < 0) {
    return '';
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 120) {
    return `${seconds} s`;
  }
  if (seconds < 7200) {
    return `${Math.round(seconds / 60)} min`;
  }
  if (seconds < 172_800) {
    return `${Math.round(seconds / 3600)} h`;
  }
  return `${Math.round(seconds / 86_400)} d`;
}

/** A reply of any shape as text for the command line's output. */
export function replyText(reply) {
  if (reply === null || reply === undefined) {
    return '(nil)';
  }
  if (Buffer.isBuffer(reply)) {
    return reply.toString('utf8');
  }
  if (Array.isArray(reply)) {
    if (!reply.length) {
      return '(empty)';
    }
    return reply.map((entry, index) => `${index + 1}) ${replyText(entry)}`).join('\n');
  }
  if (typeof reply === 'object') {
    return JSON.stringify(jsonSafe(reply), null, 2);
  }
  return String(reply);
}
