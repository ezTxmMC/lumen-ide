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
 * Base64 without `atob`/`Buffer`.
 *
 * The scanner also runs inside the renderer and Electron's main process, where
 * neither is a given, and it has to decode hostile input without throwing —
 * so this is a small decoder of its own that answers `null` for anything that
 * is not Base64.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map([...ALPHABET].map((char, index) => [char, index]));
// URL-safe variants are decoded too: malware picks whichever the tool accepts.
LOOKUP.set('-', 62);
LOOKUP.set('_', 63);

/** Decoding is for scanning only; a payload longer than this is not worth the time. */
const MAX_ENCODED = 40000;

/** @returns {number[] | null} The bytes, or null when the text is not valid Base64. */
export function decodeBase64(input) {
  const clean = String(input).replace(/\s+/g, '').replace(/=+$/, '');
  if (!clean || clean.length > MAX_ENCODED || clean.length % 4 === 1) {
    return null;
  }
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = LOOKUP.get(char);
    if (value === undefined) {
      return null;
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  return bytes;
}

/** Continuation bytes the sequence starting with `lead` needs, or -1 for an invalid lead. */
function sequenceLength(lead) {
  if (lead < 0x80) {
    return 0;
  }
  if (lead >= 0xc2 && lead <= 0xdf) {
    return 1;
  }
  if (lead >= 0xe0 && lead <= 0xef) {
    return 2;
  }
  if (lead >= 0xf0 && lead <= 0xf4) {
    return 3;
  }
  return -1;
}

/** UTF-8 to text; invalid bytes become U+FFFD. */
export function bytesToUtf8(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const lead = bytes[i];
    const extra = sequenceLength(lead);
    if (extra === 0) {
      out += String.fromCharCode(lead);
      continue;
    }
    if (extra < 0 || i + extra >= bytes.length) {
      out += '�';
      continue;
    }
    let code = lead & (0x3f >> extra);
    for (let k = 1; k <= extra; k++) {
      code = (code << 6) | (bytes[i + k] & 0x3f);
    }
    i += extra;
    out += code > 0x10ffff ? '�' : String.fromCodePoint(code);
  }
  return out;
}

/** UTF-16LE to text — what PowerShell's `-EncodedCommand` carries. */
export function bytesToUtf16le(bytes) {
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
  }
  return out;
}

/** True when most characters are printable — a decoded payload that is text, not random bytes. */
export function looksTextual(text) {
  if (text.length < 3) {
    return false;
  }
  let printable = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code >= 32 && code < 127) || code === 9 || code === 10 || code === 13) {
      printable++;
    }
  }
  return printable / text.length >= 0.85;
}

/** Decode Base64 straight to text, `null` when it is not Base64 or not text. */
export function decodeBase64Text(input, { utf16 = false } = {}) {
  const bytes = decodeBase64(input);
  if (!bytes) {
    return null;
  }
  const text = utf16 ? bytesToUtf16le(bytes) : bytesToUtf8(bytes);
  if (!looksTextual(text)) {
    return null;
  }
  return text;
}
