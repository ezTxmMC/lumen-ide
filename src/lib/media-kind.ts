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
 * Which viewer a file opens in: the text editor, or one of the non-text
 * viewers (images, video, audio, PDF, fonts, a hex dump for everything else
 * binary). Decided by the extension first; for files whose extension says
 * nothing, by the first bytes.
 */

export type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'font' | 'binary';

const BY_EXTENSION: Record<string, MediaKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', jfif: 'image', gif: 'image', webp: 'image', avif: 'image',
  bmp: 'image', ico: 'image', cur: 'image', svg: 'image', apng: 'image',
  // Chromium does not decode TIFF — the viewer falls back to its "no preview" card.
  tif: 'image', tiff: 'image',

  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video', mkv: 'video',

  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', flac: 'audio', m4a: 'audio', aac: 'audio', opus: 'audio',

  pdf: 'pdf',

  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',

  zip: 'binary', jar: 'binary', war: 'binary', ear: 'binary', class: 'binary', exe: 'binary', dll: 'binary',
  so: 'binary', dylib: 'binary', o: 'binary', a: 'binary', lib: 'binary', obj: 'binary', bin: 'binary',
  wasm: 'binary', pyc: 'binary', gz: 'binary', tgz: 'binary', bz2: 'binary', xz: 'binary', zst: 'binary',
  '7z': 'binary', rar: 'binary', tar: 'binary', iso: 'binary', dmg: 'binary', deb: 'binary', rpm: 'binary',
  msi: 'binary', apk: 'binary', aab: 'binary', sqlite: 'binary', sqlite3: 'binary', db: 'binary',
  psd: 'binary', xcf: 'binary', blend: 'binary', avi: 'binary', wmv: 'binary', eot: 'binary',
  docx: 'binary', xlsx: 'binary', pptx: 'binary', odt: 'binary', ods: 'binary', odp: 'binary',
  doc: 'binary', xls: 'binary', ppt: 'binary', nbt: 'binary', mca: 'binary', dat: 'binary',
};

export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return name.slice(dot + 1).toLowerCase();
}

/** The viewer for a path by its extension — `null` means "try it as text". */
export function mediaKindForPath(path: string): MediaKind | null {
  return BY_EXTENSION[extensionOf(path)] ?? null;
}

/** SVG is both an image and text: it previews by default and can switch to the editor. */
export const isSvgPath = (path: string) => extensionOf(path) === 'svg';

const ascii = (bytes: Uint8Array, offset: number, text: string) =>
  [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0));

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, i) => bytes[i] === byte);

interface Signature {
  kind: MediaKind;
  test: (bytes: Uint8Array) => boolean;
}

const SIGNATURES: Signature[] = [
  { kind: 'image', test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { kind: 'image', test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { kind: 'image', test: (b) => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a') },
  { kind: 'image', test: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP') },
  { kind: 'image', test: (b) => ascii(b, 4, 'ftyp') && (ascii(b, 8, 'avif') || ascii(b, 8, 'avis')) },
  { kind: 'image', test: (b) => startsWith(b, [0x00, 0x00, 0x01, 0x00]) && b[4] > 0 && b[5] === 0 },
  { kind: 'pdf', test: (b) => ascii(b, 0, '%PDF-') },
  { kind: 'audio', test: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE') },
  { kind: 'audio', test: (b) => ascii(b, 0, 'fLaC') || ascii(b, 0, 'OggS') || ascii(b, 0, 'ID3') },
  { kind: 'audio', test: (b) => ascii(b, 4, 'ftyp') && (ascii(b, 8, 'M4A ') || ascii(b, 8, 'M4B ')) },
  { kind: 'video', test: (b) => ascii(b, 4, 'ftyp') },
  { kind: 'video', test: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) },
  { kind: 'font', test: (b) => ascii(b, 0, 'wOFF') || ascii(b, 0, 'wOF2') || ascii(b, 0, 'OTTO') },
  { kind: 'font', test: (b) => startsWith(b, [0x00, 0x01, 0x00, 0x00, 0x00]) },
];

/**
 * The viewer the first bytes of a file point to. Anything with a NUL byte or
 * mostly control characters counts as binary; `null` means "looks like text".
 */
export function sniffMediaKind(head: Uint8Array): MediaKind | null {
  const known = SIGNATURES.find((signature) => signature.test(head));
  if (known) {
    return known.kind;
  }
  if (head.includes(0)) {
    return 'binary';
  }
  const sample = head.subarray(0, 4096);
  let control = 0;
  for (const byte of sample) {
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20) || byte === 0x7f) {
      control++;
    }
  }
  if (sample.length > 0 && control / sample.length > 0.1) {
    return 'binary';
  }
  return null;
}

/** The MIME type a file is served with — media elements and the PDF viewer rely on it. */
const MIME: Record<string, string> = {
  png: 'image/png', apng: 'image/apng', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
  cur: 'image/x-icon', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg',
  mkv: 'video/x-matroska', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/ogg', pdf: 'application/pdf',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
};

export function mimeTypeForPath(path: string): string {
  return MIME[extensionOf(path)] ?? 'application/octet-stream';
}

/* ------------------------------------------------------------------ *
 * Addressing local files
 * ------------------------------------------------------------------ */

export const MEDIA_SCHEME = 'lumen-file';

/**
 * The URL a local file is served under. The whole path is one encoded
 * segment, so drive letters and backslashes survive URL normalisation;
 * `revision` busts the cache after the file changed on disk.
 */
export function mediaUrl(path: string, revision = 0): string {
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(path)}${revision ? `?v=${revision}` : ''}`;
}

/** The inverse of `mediaUrl` — `null` for URLs of any other shape. */
export function pathFromMediaUrl(url: string): string | null {
  const prefix = `${MEDIA_SCHEME}://local/`;
  if (!url.startsWith(prefix)) {
    return null;
  }
  const encoded = url.slice(prefix.length).split(/[?#]/)[0];
  try {
    const path = decodeURIComponent(encoded);
    return path || null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Byte ranges (video seeking)
 * ------------------------------------------------------------------ */

export interface ByteRange {
  start: number;
  /** Inclusive, as in the `Content-Range` header. */
  end: number;
}

/**
 * Parses a single-range `Range: bytes=…` header against a file of `size`
 * bytes. `null` for no (or a multi-range) header, `'invalid'` when the range
 * cannot be satisfied.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | 'invalid' {
  if (!header) {
    return null;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return null;
  }
  const [, from, to] = match;
  if (!from && !to) {
    return 'invalid';
  }
  if (!from) {
    const suffix = Number(to);
    if (suffix === 0) {
      return 'invalid';
    }
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  const end = to ? Math.min(Number(to), size - 1) : size - 1;
  if (start >= size || end < start) {
    return 'invalid';
  }
  return { start, end };
}

/* ------------------------------------------------------------------ *
 * Presentation helpers
 * ------------------------------------------------------------------ */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export interface HexRow {
  offset: string;
  hex: string;
  ascii: string;
}

/** Classic hex dump rows: offset | 16 bytes in hex | printable ASCII. */
export function hexRows(bytes: Uint8Array, width = 16): HexRow[] {
  const rows: HexRow[] = [];
  for (let offset = 0; offset < bytes.length; offset += width) {
    const chunk = bytes.subarray(offset, offset + width);
    const hex = [...chunk].map((byte) => byte.toString(16).padStart(2, '0'));
    rows.push({
      offset: offset.toString(16).padStart(8, '0'),
      hex: hex.join(' ').padEnd(width * 3 - 1, ' '),
      ascii: [...chunk].map((byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.')).join(''),
    });
  }
  return rows;
}
