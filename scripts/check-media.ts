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
 * Tests the file-kind logic of the non-text viewers (`src/lib/media-kind.ts`):
 * extension mapping, sniffing by magic bytes, the `lumen-file://` URLs, byte
 * ranges for video seeking, and the hex dump.
 */

import {
  formatBytes, hexRows, isSvgPath, mediaKindForPath, mediaUrl, mimeTypeForPath, parseRange, pathFromMediaUrl,
  sniffMediaKind,
} from '@/lib/media-kind';

let failures = 0;
let passed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
    return;
  }
  failures++;
  console.log(`✗ ${name}`, detail ?? '');
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((value) => (typeof value === 'string' ? [...value].map((c) => c.charCodeAt(0)) : [value])));

/* Extensions */
check('png is an image', mediaKindForPath('/p/logo.PNG') === 'image');
check('svg is an image and text', mediaKindForPath('/p/icon.svg') === 'image' && isSvgPath('/p/icon.svg'));
check('mp4/webm are video', mediaKindForPath('a.mp4') === 'video' && mediaKindForPath('a.webm') === 'video');
check('flac/opus are audio', mediaKindForPath('a.flac') === 'audio' && mediaKindForPath('a.opus') === 'audio');
check('pdf', mediaKindForPath('C:\\docs\\a.pdf') === 'pdf');
check('woff2 is a font', mediaKindForPath('f.woff2') === 'font');
check('jar/class are binary', mediaKindForPath('lib.jar') === 'binary' && mediaKindForPath('A.class') === 'binary');
check('source files go to the editor', mediaKindForPath('main.ts') === null && mediaKindForPath('Makefile') === null);
check('dotfiles have no extension', mediaKindForPath('/p/.png') === null);

/* Sniffing */
check('sniff png', sniffMediaKind(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)) === 'image');
check('sniff jpeg', sniffMediaKind(bytes(0xff, 0xd8, 0xff, 0xe0)) === 'image');
check('sniff webp', sniffMediaKind(bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 ')) === 'image');
check('sniff wav', sniffMediaKind(bytes('RIFF', 0, 0, 0, 0, 'WAVEfmt ')) === 'audio');
check('sniff pdf', sniffMediaKind(bytes('%PDF-1.7\n')) === 'pdf');
check('sniff mp4', sniffMediaKind(bytes(0, 0, 0, 0x20, 'ftypisom')) === 'video');
check('sniff m4a', sniffMediaKind(bytes(0, 0, 0, 0x20, 'ftypM4A ')) === 'audio');
check('sniff webm', sniffMediaKind(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x01)) === 'video');
check('sniff woff2', sniffMediaKind(bytes('wOF2', 0, 1)) === 'font');
check('NUL bytes are binary', sniffMediaKind(bytes('PK', 3, 4, 0, 0)) === 'binary');
check('text stays text', sniffMediaKind(bytes('const a = 1\n\tlet b = "x"\r\n')) === null);
check('empty stays text', sniffMediaKind(new Uint8Array()) === null);
check('control-heavy is binary', sniffMediaKind(bytes(1, 2, 3, 4, 5, 6, 'ab')) === 'binary');

/* URLs */
for (const path of ['/home/me/My Pics/ä#1?.png', 'C:\\Users\\me\\a b.mp4', '/x/100%.gif']) {
  check(`url round trip ${path}`, pathFromMediaUrl(mediaUrl(path, 3)) === path, mediaUrl(path, 3));
}
check('url parses as standard URL', new URL(mediaUrl('/a/b c.png')).host === 'local');
check('foreign urls are rejected', pathFromMediaUrl('file:///etc/passwd') === null);
check('mime of mp4', mimeTypeForPath('a.MP4') === 'video/mp4' && mimeTypeForPath('a.xyz') === 'application/octet-stream');

/* Ranges */
check('no range', parseRange(null, 100) === null);
check('open range', same(parseRange('bytes=10-', 100), { start: 10, end: 99 }));
check('closed range', same(parseRange('bytes=0-0', 100), { start: 0, end: 0 }));
check('range clamps its end', same(parseRange('bytes=90-500', 100), { start: 90, end: 99 }));
check('suffix range', same(parseRange('bytes=-20', 100), { start: 80, end: 99 }));
check('range beyond the end', parseRange('bytes=100-', 100) === 'invalid');
check('inverted range', parseRange('bytes=50-10', 100) === 'invalid');
check('multi-range is ignored', parseRange('bytes=0-1,5-6', 100) === null);

/* Presentation */
check('bytes', formatBytes(512) === '512 B' && formatBytes(1536) === '1.5 KB' && formatBytes(5 * 1024 * 1024) === '5.0 MB');
const rows = hexRows(bytes('Hello, binary!\x00\x01', 0xff, 'AB'));
check('hex rows', rows.length === 2 && rows[0].offset === '00000000' && rows[1].offset === '00000010', rows);
check('hex ascii column', rows[0].ascii === 'Hello, binary!..' && rows[1].ascii === '.AB', rows);
check('hex column is padded', rows[1].hex.length === rows[0].hex.length && rows[1].hex.startsWith('ff 41 42'), rows[1]);

console.log(`\n${passed} passed, ${failures} failed`);
if (failures) {
  process.exit(1);
}
