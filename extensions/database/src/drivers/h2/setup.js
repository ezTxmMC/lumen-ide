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
 * Preparing the H2 bridge: a working Java, the H2 jar (fetched from Maven
 * Central when missing) and the compiled bridge class.
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DriverError } from '../errors.js';
import { BRIDGE_CLASS } from './bridge-class.js';

export const DEFAULT_VERSION = '2.3.232';
const MAVEN = 'https://repo1.maven.org/maven2/com/h2database/h2';

/** A Java that runs: the setting, then JAVA_HOME, then the PATH. */
export async function findJava(ctx) {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  const candidates = [
    ctx.settings.get('javaPath'),
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', exe) : null,
    'java',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await runs(candidate)) {
      return candidate;
    }
  }
  throw new DriverError('noJava');
}

function runs(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ['-version'], { stdio: 'ignore', windowsHide: true });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Whether the file exists and has content; a missing file is not an error here. */
async function isNonEmptyFile(file) {
  try {
    return (await fs.stat(file)).size > 0;
  } catch {
    return false;
  }
}

/** The H2 jar in the extension's folder, fetched and checked against Maven's SHA-1 when missing. */
export async function ensureJar(dir, version) {
  if (!/^[0-9][0-9A-Za-z.-]*$/.test(version)) {
    throw new DriverError('h2Download', { error: `invalid version ${version}` });
  }
  const jar = path.join(dir, `h2-${version}.jar`);
  const present = await isNonEmptyFile(jar);
  if (present) {
    return jar;
  }
  try {
    const url = `${MAVEN}/${version}/h2-${version}.jar`;
    const [bytes, sha1] = await Promise.all([download(url), download(`${url}.sha1`)]);
    const expected = sha1.toString('utf8').trim().split(/\s+/)[0].toLowerCase();
    const actual = crypto.createHash('sha1').update(bytes).digest('hex');
    if (expected !== actual) {
      throw new Error(`checksum mismatch (${actual} ≠ ${expected})`);
    }
    const temp = `${jar}.${process.pid}.tmp`;
    await fs.writeFile(temp, bytes);
    await fs.rename(temp, jar);
    return jar;
  } catch (err) {
    if (err instanceof DriverError) {
      throw err;
    }
    throw new DriverError('h2Download', { error: err.message });
  }
}

/** Bridge.class next to the jar — rewritten only when the embedded one changed. */
export async function ensureBridge(dir) {
  const file = path.join(dir, 'Bridge.class');
  const bytes = Buffer.from(BRIDGE_CLASS, 'base64');
  const current = await fs.readFile(file).catch(() => null);
  if (current && current.equals(bytes)) {
    return;
  }
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, bytes);
  await fs.rename(temp, file);
}

/** The JDBC URL: a full `jdbc:h2:` URL as given, or the file without `.mv.db`. */
export function h2Url(connection) {
  if (connection.url) {
    return connection.url;
  }
  if (!connection.file) {
    throw new DriverError('noFile');
  }
  const base = connection.file.replace(/\.mv\.db$/i, '').replace(/\.h2\.db$/i, '');
  return `jdbc:h2:file:${base};IFEXISTS=TRUE`;
}
