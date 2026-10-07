/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


import net from 'node:net';

export function freePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function connectOnce(host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const fail = (err: Error) => {
      socket.destroy();
      reject(err);
    };
    socket.once('error', fail);
    socket.once('connect', () => {
      socket.off('error', fail);
      resolve(socket);
    });
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function connectWithRetry(
  host: string, port: number, timeout: number, gaveUp: () => string | null,
): Promise<net.Socket> {
  const deadline = Date.now() + timeout;
  let lastError: Error | null = null;
  while (Date.now() < deadline) {
    const reason = gaveUp();
    if (reason) {
      throw new Error(reason);
    }
    try {
      return await connectOnce(host, port);
    } catch (err) {
      lastError = err as Error;
      await wait(150);
    }
  }
  throw new Error(`No connection to ${host}:${port} (${lastError?.message ?? 'timed out'})`);
}
