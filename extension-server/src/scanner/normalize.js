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
 * Making a command readable for the rules.
 *
 * The rules look for `rm -rf /`. A shell reads `r""m -rf /`, `\rm -rf /`,
 * `rm${IFS}-rf${IFS}/` and `$'\x72\x6d' -rf /` as the same thing, so the text
 * is brought to the form the shell would arrive at before any rule sees it.
 * Everything here is a pure string transformation.
 */

import { decodeBase64Text } from './base64.js';

/** A logical line longer than this is cut: no real command is that long, a payload may be. */
export const MAX_COMMAND_LENGTH = 4000;

const ANSI_ESCAPES = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"' };

/** `$'\x72\x6d'` — bash's quoting that spells characters by their code. */
function decodeAnsiC(body) {
  return body.replace(/\\(?:x([0-9a-fA-F]{1,2})|([0-7]{1,3})|u([0-9a-fA-F]{4})|([\s\S]))/g, (_all, hex, octal, unicode, other) => {
    if (hex) {
      return String.fromCharCode(parseInt(hex, 16));
    }
    if (octal) {
      return String.fromCharCode(parseInt(octal, 8) & 0xff);
    }
    if (unicode) {
      return String.fromCharCode(parseInt(unicode, 16));
    }
    return ANSI_ESCAPES[other] ?? other;
  });
}

/**
 * The tricks that rewrite the text before the shell even parses it. `tricks`
 * says whether any of them was used — innocent commands do not use them.
 */
export function normalizeBase(raw) {
  let tricks = false;
  let text = raw.replace(/\\\r?\n/g, ' ');

  const withoutIfs = text.replace(/\$\{IFS(?:%[^}]*)?\}|\$IFS(?:\$\d)?/g, ' ');
  tricks ||= withoutIfs !== text;
  text = withoutIfs;

  const withoutAnsi = text.replace(/\$'((?:[^'\\]|\\.)*)'/g, (_all, body) => decodeAnsiC(body).replace(/[\r\n]+/g, ' ; '));
  tricks ||= withoutAnsi !== text;
  text = withoutAnsi;

  // `{rm,-rf,/}` — brace expansion as a way to avoid typing a space.
  const withoutBraces = text.replace(/(^|\s)\{([^{}\s,]+(?:,[^{}\s,]+)+)\}(?=\s|$)/g, (_all, lead, body) => `${lead}${body.split(',').join(' ')}`);
  tricks ||= withoutBraces !== text;
  text = withoutBraces;

  return { text: text.replace(/[ \t\r\f\v]+/g, ' ').trim(), tricks };
}

/**
 * Remove the quotes a shell would remove: `r""m` and `r'm'` become `rm`, a
 * leading backslash (`\rm`) goes. Only the quote characters are dropped, never
 * what is between them, so nothing can be hidden by this step.
 */
export function dequote(text) {
  let out = '';
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (quote) {
      if (char === quote) {
        quote = '';
        continue;
      }
      if (char === '\\' && quote === '"' && (next === '"' || next === '\\' || next === '$' || next === '`')) {
        out += next;
        i++;
        continue;
      }
      out += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    // Only at the start of a word: `C:\Windows` keeps its backslashes.
    const atWordStart = out === '' || /[\s;|&(]/.test(out[out.length - 1]);
    if (char === '\\' && atWordStart && next && /[A-Za-z]/.test(next)) {
      continue;
    }
    out += char;
  }
  return out;
}

/** The parts of a line a shell runs one after the other (the pipe stays: `curl | sh` is one thing). */
export function splitSegments(text) {
  return text.split(/\|\||&&|[;&\n\r]/).map((part) => part.trim()).filter((part) => part.length > 2);
}

/** What stands in `$(…)`, backticks and `<(…)` — a command of its own. */
export function extractSubshells(text) {
  const found = [];
  for (const pattern of [/\$\(([^()]{2,})\)/g, /`([^`]{2,})`/g, /[<>]\(([^()]{2,})\)/g]) {
    for (const match of text.matchAll(pattern)) {
      found.push(match[1].trim());
    }
  }
  return found;
}

function unescapeQuoted(text) {
  return text.replace(/\\(["\\$`])/g, '$1');
}

/** The shells, `eval` and friends that run a string as a command. */
const PAYLOAD_PATTERNS = [
  /(?<![\w.-])(?:(?:ba|z|da|k|c|fi|a)?sh|busybox\s+sh)\s+(?:-[A-Za-z-]+\s+)*-[A-Za-z]*c\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S.*))/g,
  /(?<![\w.-])(?:powershell|pwsh)(?:\.exe)?\b[^|;]*?\s-c(?:ommand)?\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S.*))/gi,
  /(?<![\w.-])cmd(?:\.exe)?\s+(?:\/\w\s+)*\/[ck]\s+(?:"((?:[^"\\]|\\.)*)"|()()(\S.*))/gi,
  /(?<![\w.-])eval\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S.*))/g,
  /(?<![\w.-])su\s+(?:-\S+\s+)*-c\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S.*))/g,
];

/** Strings a command hands to another interpreter, ready to be scanned as commands of their own. */
export function extractPayloads(text) {
  const found = [];
  for (const pattern of PAYLOAD_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const payload = match[1] || match[2] || match[3] || match[4];
      if (payload && payload.length > 2) {
        found.push(unescapeQuoted(payload));
      }
    }
  }
  return found;
}

const DECODER_PRESENT = /base64\s+(?:--decode|-[A-Za-z]*[dD])\b|\bcertutil\b[^|;]*-decode\b/;
const EXECUTES_DECODED = /\|\s*(?:sudo\s+)?(?:\S*\/)?(?:(?:ba|z|da|k)?sh|python[\d.]*|perl|ruby|node|php|source|\.)(?=\s|$)|\beval\b|\bsource\b|<\(|\$\(\s*(?:echo|printf|base64|cat)/;
const ENCODED_POWERSHELL = /\b(?:powershell|pwsh)(?:\.exe)?\b[^|;]*\s-(?:e|ec|en|enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand)\s+["']?([A-Za-z0-9+/=]{12,})/gi;
const MAX_ENCODED_TOKENS = 8;

/**
 * Payloads hidden as Base64: `echo … | base64 -d | sh` and PowerShell's
 * `-EncodedCommand`. `executed` says the decoded text is run, not just printed.
 */
export function extractEncodedPayloads(text) {
  const found = [];
  if (DECODER_PRESENT.test(text)) {
    const executed = EXECUTES_DECODED.test(text);
    let tokens = 0;
    for (const match of text.matchAll(/[A-Za-z0-9+/]{8,}={0,2}/g)) {
      if (tokens++ >= MAX_ENCODED_TOKENS) {
        break;
      }
      const decoded = decodeBase64Text(match[0]);
      if (decoded) {
        found.push({ text: decoded, executed });
      }
    }
  }
  for (const match of text.matchAll(ENCODED_POWERSHELL)) {
    const decoded = decodeBase64Text(match[1], { utf16: true });
    if (decoded) {
      found.push({ text: decoded, executed: true });
    }
  }
  return found;
}

/** Quote an argument the way a shell would need it, so that `args` survive being joined. */
export function quoteArgument(argument) {
  const text = String(argument);
  if (text !== '' && !/[\s"'\\$`;&|<>()]/.test(text)) {
    return text;
  }
  return `"${text.replace(/(["\\])/g, '\\$1')}"`;
}
