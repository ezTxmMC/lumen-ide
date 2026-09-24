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
 * The connection to the SQLite helper process: messages by id, a timeout
 * that ends the helper, and the helper started again on the next call.
 */

import { spawn } from 'node:child_process';
import { DriverError } from './errors.js';
import { WORKER } from './sqlite-worker.js';

export function createWorkerClient(file, readOnly) {
  let worker = null;
  let counter = 0;
  const waiting = new Map();

  function start() {
    const child = spawn(process.execPath, ['-e', WORKER], {
      // Lumen's binary runs as plain Node; under Node itself the variable does nothing.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', LUMEN_SQLITE: JSON.stringify({ path: file, readOnly: Boolean(readOnly) }) },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      serialization: 'advanced',
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
    worker = child;
    child.on('message', ({ id, ok, result, error }) => {
      const entry = waiting.get(id);
      if (!entry) {
        return;
      }
      waiting.delete(id);
      clearTimeout(entry.timer);
      idle();
      if (ok) {
        entry.resolve(result);
      }
      if (!ok) {
        entry.reject(new Error(error));
      }
    });
    child.on('error', (err) => failAll(child, err));
    child.on('exit', () => {
      if (worker === child) {
        worker = null;
      }
      failAll(child, stderr.trim() ? new Error(stderr.trim().split('\n').pop()) : new DriverError('workerGone'));
    });
    idle();
  }

  // An idle helper must not keep Node alive (the tests); a busy one must.
  function idle() {
    if (waiting.size) {
      return;
    }
    worker?.unref();
    worker?.channel?.unref?.();
  }

  /** A helper ended: what it was still working on fails — not what a newer one is doing. */
  function failAll(child, err) {
    for (const [id, entry] of waiting) {
      if (entry.child !== child) {
        continue;
      }
      waiting.delete(id);
      clearTimeout(entry.timer);
      entry.reject(err);
    }
  }

  function call(message, timeoutMs) {
    if (!worker) {
      start();
    }
    const child = worker;
    const id = ++counter;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0
        ? setTimeout(() => {
          waiting.delete(id);
          idle();
          reject(new DriverError('timeout', { seconds: Math.round(timeoutMs / 1000) }));
          // The only way to stop a synchronous query: end the helper.
          child.kill('SIGKILL');
          if (worker === child) {
            worker = null;
          }
        }, timeoutMs)
        : null;
      waiting.set(id, { resolve, reject, timer, child });
      child.ref();
      child.channel?.ref?.();
      child.send({ id, ...message });
    });
  }

  /** Ends the helper politely; nothing to do when none is running. */
  async function close() {
    if (!worker) {
      return;
    }
    const child = worker;
    await call({ op: 'close' }, 2000).catch(() => {});
    child.disconnect?.();
    child.kill();
    worker = null;
  }

  return { call, close };
}
