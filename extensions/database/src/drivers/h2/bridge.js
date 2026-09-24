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
 * The bridge process: requests and answers are lines on stdin/stdout, paired
 * up by id, with a timeout that ends the process when JDBC's own does not bite.
 */

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { DriverError } from '../errors.js';

/** Extra time the bridge gets past its own query timeout before the process is ended. */
const SAFETY_MS = 5000;
/** What is kept of the bridge's error output, for the message when it dies. */
const STDERR_TAIL = 4000;

/** A parameter as the bridge reads it: a type letter and the value as text. */
export function encodeParam(value) {
  if (value === null || value === undefined) {
    return 'n';
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return `d:${value}`;
  }
  if (typeof value === 'boolean') {
    return `b:${value}`;
  }
  if (value instanceof Uint8Array) {
    return `x:${Buffer.from(value).toString('hex')}`;
  }
  return `s:${value}`;
}

export const b64 = (text) => Buffer.from(String(text), 'utf8').toString('base64');

/** Starts the bridge; `send` makes one request, `isExited` tells whether the process is gone. */
export function startBridge(java, classPath) {
  const child = spawn(java, ['-cp', classPath, 'Bridge'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  let exited = false;
  let counter = 0;
  const waiting = new Map();

  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL); });
  child.stdin.on('error', () => {});
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let answer;
    try {
      answer = JSON.parse(line);
    } catch {
      return;
    }
    const entry = waiting.get(answer.id);
    if (!entry) {
      return;
    }
    waiting.delete(answer.id);
    clearTimeout(entry.timer);
    if (answer.ok) {
      entry.resolve(answer);
      return;
    }
    // H2's "statement was canceled or the session timed out".
    if (/\[57014-/.test(answer.error ?? '') && entry.seconds) {
      entry.reject(new DriverError('timeout', { seconds: entry.seconds }));
      return;
    }
    entry.reject(new Error(answer.error));
  });
  const died = (err) => {
    exited = true;
    const reason = err ?? new Error(stderr.trim() || 'The H2 bridge ended');
    for (const entry of waiting.values()) {
      clearTimeout(entry.timer);
      entry.reject(reason);
    }
    waiting.clear();
  };
  child.on('error', (err) => died(err));
  child.on('exit', () => died(null));

  /** One request; the bridge answers in order, the id pairs them up anyway. */
  function send(command, fields = [], { seconds = 0 } = {}) {
    if (exited) {
      return Promise.reject(new Error(stderr.trim() || 'The H2 bridge is not running'));
    }
    const id = String(++counter);
    return new Promise((resolve, reject) => {
      // Should JDBC's own timeout not bite, the process goes — nothing else stops it.
      const timer = seconds > 0
        ? setTimeout(() => {
          waiting.delete(id);
          reject(new DriverError('timeout', { seconds }));
          child.kill();
        }, seconds * 1000 + SAFETY_MS)
        : null;
      waiting.set(id, { resolve, reject, timer, seconds });
      child.stdin.write(`${[id, command, ...fields.map(b64)].join('\t')}\n`);
    });
  }

  return { child, send, isExited: () => exited };
}
