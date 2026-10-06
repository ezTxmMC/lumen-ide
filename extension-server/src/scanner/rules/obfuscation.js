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
 * Code written so that nobody can read it.
 *
 * Minified code is not obfuscated code: shrinking names is routine, decoding a
 * four-hundred-character blob and running it is not. These rules therefore
 * look for the *combination* — a big encoded blob handed to something that
 * decodes or evaluates it. They work on the whole text (`scope: 'text'`)
 * because a minified bundle is a single line.
 *
 * Embedded binary resources (WebAssembly, fonts, images) are Base64 too, and
 * perfectly legitimate; they are recognised by their well-known first bytes.
 */

import { extensionRule, projectRule } from './define.js';

/** The Base64 form of the magic numbers of WebAssembly, PNG, JPEG, GIF, WOFF, TrueType, PDF, ZIP and gzip. */
const BINARY_RESOURCE = /^(?:AGFzbQ|iVBOR|\/9j\/|R0lGOD|d09GM|d09GR|AAEAAA|JVBER|UEsDB|H4sI)/;
const isScript = (match) => !BINARY_RESOURCE.test(match[1] ?? '');

/**
 * A run of escapes that spells readable text is obfuscation; a run that is a
 * code-page table (`\xA0\xA1\xA2…`) is data. Most of the bytes of text are ASCII.
 */
function spellsText(match) {
  const bytes = match[0].match(/\\x[0-9a-fA-F]{2}/g) ?? [];
  const printable = bytes.filter((escape) => {
    const code = parseInt(escape.slice(2), 16);
    return code >= 0x20 && code < 0x7f;
  });
  return printable.length >= bytes.length * 0.6;
}

const CODE_KINDS = ['js', 'powershell', 'python', 'shell'];
const BLOB = String.raw`[A-Za-z0-9+/=]{400,}`;

/** One rule written once for the extension and once for the project: severity differs, the pattern does not. */
function pair(extensionId, projectId, extensionSeverity, projectSeverity, category, title, message, pattern, extra = {}) {
  return [
    extensionRule(extensionId, extensionSeverity, category, title, message, pattern, CODE_KINDS, { scope: 'text', ...extra }),
    projectRule(projectId, projectSeverity, category, title, message, pattern, CODE_KINDS, { scope: 'text', ...extra }),
  ];
}

export const OBFUSCATION_TEXT_RULES = [
  ...pair('SEC-OBF-001', 'SEC-OBF-002', 'high', 'high', 'obfuscation', 'Encoded blob passed to eval or Function',
    'A long Base64 literal handed straight to `eval` or `Function` hides the code that will run.',
    new RegExp(String.raw`\b(?:eval|Function)\s*\(\s*["'\`](${BLOB})`), { confirm: isScript }),
  ...pair('SEC-OBF-003', 'SEC-OBF-004', 'medium', 'medium', 'obfuscation', 'Large Base64 blob decoded at run time',
    'A Base64 literal of 400+ characters decoded with `atob`, `Buffer.from(…, "base64")` or `FromBase64String` carries a payload that is not readable in the source.',
    new RegExp(String.raw`(?:\batob\s*\(\s*["'\`](${BLOB})|\bBuffer\.from\(\s*["'\`](${BLOB})["'\`]\s*,\s*["']base64|\bFromBase64String\s*\(\s*["'\`](${BLOB}))`),
    { confirm: (match) => isScript([match[0], match[1] ?? match[2] ?? match[3]]) }),
  ...pair('SEC-OBF-005', 'SEC-OBF-006', 'medium', 'medium', 'obfuscation', 'Large hex blob decoded at run time',
    'A hex string of 400+ characters turned into bytes or code at run time hides what it carries.',
    /(?:Buffer\.from\(\s*["'`][0-9a-fA-F]{400,}["'`]\s*,\s*["']hex|\bunhexlify\s*\(\s*["'][0-9a-fA-F]{400,}|\bbytes\.fromhex\s*\(\s*["'][0-9a-fA-F]{400,})/),
  ...pair('SEC-OBF-007', 'SEC-OBF-008', 'high', 'high', 'obfuscation', 'Decoded text evaluated',
    '`eval(atob(…))` and friends run code that was kept in an encoded form to avoid being read.',
    /\beval\s*\(\s*(?:atob|unescape|decodeURIComponent|Buffer\.from)\s*\(/),
  ...pair('SEC-OBF-009', 'SEC-OBF-010', 'high', 'high', 'obfuscation', 'Function built from decoded text',
    '`new Function(atob(…))` compiles a decoded string as code, hiding it from review.',
    /\bnew\s+Function\s*\(\s*(?:atob|unescape|decodeURIComponent|Buffer\.from)\s*\(/),
  ...pair('SEC-OBF-011', 'SEC-OBF-012', 'medium', 'medium', 'obfuscation', 'Long String.fromCharCode chain',
    'Spelling a string out as thirty or more character codes is a way to hide it from searches.',
    /String\.fromCharCode\((?:\s*\d+\s*,){29,}\s*\d+\s*\)|(?:String\.fromCharCode\(\s*\d+\s*\)\s*\+\s*){29,}/),
  ...pair('SEC-OBF-013', 'SEC-OBF-014', 'medium', 'medium', 'obfuscation', 'Long run of hex escapes',
    'Forty or more `\\x..` escapes in a row spell a string that is meant not to be read.',
    /(?:\\x[0-9a-fA-F]{2}){40,}/, { confirm: spellsText }),
  ...pair('SEC-OBF-015', 'SEC-OBF-016', 'high', 'medium', 'obfuscation', 'Obfuscator signature',
    'Many `_0x1a2b` identifiers are the fingerprint of javascript-obfuscator, a tool whose only purpose is to make code unreadable.',
    /\b_0x[0-9a-f]{4,6}\b/, { minMatches: 20 }),
  ...pair('SEC-OBF-017', 'SEC-OBF-018', 'medium', 'medium', 'obfuscation', 'Packed JavaScript',
    'Dean Edwards\' packer (`eval(function(p,a,c,k,e,d)`) is used to hide code and is common in malware droppers.',
    /\beval\(function\(p,a,c,k,e,[dr]\)/),
  projectRule('SEC-OBF-019', 'high', 'obfuscation', 'PowerShell evaluates decoded text',
    'Feeding `FromBase64String` output to `Invoke-Expression` hides the script that actually runs.',
    /(?:\b(?:iex|Invoke-Expression)\b[^\n]{0,80}FromBase64String|FromBase64String[^\n]{0,200}\|\s*(?:iex|Invoke-Expression)\b)/i, ['powershell']),
  projectRule('SEC-OBF-020', 'high', 'obfuscation', 'Python executes decoded or compiled data',
    '`exec(base64.b64decode(…))` and similar hide the code that really runs.',
    /\b(?:exec|eval)\s*\(\s*(?:base64\.b64decode|bytes\.fromhex|codecs\.decode|zlib\.decompress|marshal\.loads|compile)\s*\(|__import__\(\s*['"](?:base64|zlib|marshal)['"]\s*\)/, ['python']),
];
