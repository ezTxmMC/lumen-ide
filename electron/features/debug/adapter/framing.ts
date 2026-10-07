/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */


/** Splits the buffer into messages and returns what is left. */
export function drainFrames(buffer: Buffer, emit: (message: unknown) => void): Buffer {
  let rest = buffer;
  for (;;) {
    const headerEnd = rest.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      return rest;
    }
    const header = rest.subarray(0, headerEnd).toString('ascii');
    const match = /content-length:\s*(\d+)/i.exec(header);
    if (!match) {
      rest = rest.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (rest.length < start + length) {
      return rest;
    }
    const body = rest.subarray(start, start + length).toString('utf8');
    rest = rest.subarray(start + length);
    try {
      emit(JSON.parse(body));
    } catch {
      // Skip broken JSON.
    }
  }
}

export function frame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]);
}
