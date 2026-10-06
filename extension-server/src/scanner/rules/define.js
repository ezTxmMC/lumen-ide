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
 * How a rule is written down.
 *
 * Rules are data: an id that never changes (users acknowledge findings by it),
 * a severity, and a regular expression. Three helpers fix the usual
 * combinations so a rule file reads as a table.
 *
 * Every pattern here must stay linear: no nested quantifiers, no more than a
 * few unbounded wildcards, and lines are cut to 400 characters before a rule
 * sees them. `test/scanner.js` throws pathological input at every rule.
 */

/** The file kinds in which shell-like commands appear. `any` is what an unknown text file counts as. */
export const SCRIPT_KINDS = ['shell', 'powershell', 'batch', 'python', 'any'];

/**
 * A rule about commands: runs on terminal commands and on script files, with
 * the command normalised and unwrapped first (`scope: 'command'`).
 *
 * `hint` is a cheap regex source a text must contain for the rule to be worth
 * running — it lets most lines of a large file skip most rules.
 */
export function commandRule(id, severity, category, title, message, pattern, extra = {}) {
  return Object.freeze({
    id, severity, category, title, message, pattern,
    targets: ['command', 'project'],
    languages: SCRIPT_KINDS,
    scope: 'command',
    ...extra,
  });
}

/** A rule about files in a project: line by line, in the kinds named. */
export function projectRule(id, severity, category, title, message, pattern, languages, extra = {}) {
  return Object.freeze({
    id, severity, category, title, message, pattern, languages,
    targets: ['project'],
    scope: 'line',
    ...extra,
  });
}

/** A rule about an extension: its code, its pages and the data it ships. */
export function extensionRule(id, severity, category, title, message, pattern, languages, extra = {}) {
  return Object.freeze({
    id, severity, category, title, message, pattern, languages,
    targets: ['extension'],
    scope: 'line',
    ...extra,
  });
}

/** Where `192.168.1.5`-style addresses are not a destination worth flagging. */
export function isPublicAddress(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) {
    return false;
  }
  if (a === 169 && b === 254) {
    return false;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return false;
  }
  if (a === 192 && b === 168) {
    return false;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return false;
  }
  return true;
}

/** Text that sends something somewhere — a command that also reads secrets is exfiltration, not housekeeping. */
export const NETWORK_SINK = /\b(?:curl|wget|nc|ncat|netcat|socat|telnet|ftp|tftp|openssl\s+s_client)\b|\/dev\/(?:tcp|udp)\/|transfer\.sh|pastebin|webhook|discord(?:app)?\.com|api\.telegram|ngrok|https?:\/\//i;

/** What a payload in a startup file or crontab looks like — as opposed to `export PATH=…`. */
export const PAYLOAD_WORDS = /\b(?:curl|wget|base64|eval|nc|ncat|netcat|socat)\b|\/dev\/tcp\/|\bpython[\d.]*\s+-c\b|\b(?:ba)?sh\s+-c\b|https?:\/\//i;
