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
 * HTML pages shipped by an extension.
 *
 * Lumen shows them sandboxed and without scripts, so none of this can do harm
 * there — but the same page opened elsewhere, or by a future Lumen with a
 * looser sandbox, could. Anything that loads from the network or runs script
 * is therefore reported at `medium`, and a page of plain markup stays clean.
 */

import { extensionRule } from './define.js';

const HTML = ['html'];
const EXTERNAL = String.raw`["']?\s*(?:https?:)?\/\/`;

export const HTML_RULES = [
  extensionRule('SEC-HTML-001', 'medium', 'supply-chain', 'Page loads a remote script',
    'A `<script src="http…">` runs code from another server whenever the page is shown.',
    new RegExp(String.raw`<script\b[^>]*\bsrc\s*=\s*${EXTERNAL}`, 'i'), HTML),
  extensionRule('SEC-HTML-002', 'medium', 'obfuscation', 'Page contains an inline script',
    'An inline `<script>` runs code the extension author wrote straight into the page.',
    /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i, HTML),
  extensionRule('SEC-HTML-003', 'medium', 'obfuscation', 'Page uses an inline event handler',
    'An `onclick=`-style attribute runs script from inside the markup.',
    /<[a-z][\w-]*\b[^>]*\son[a-z]{3,20}\s*=/i, HTML),
  extensionRule('SEC-HTML-004', 'medium', 'obfuscation', 'Page links to a javascript: URL',
    'A `javascript:` link runs script when it is activated.',
    /\b(?:href|src|action|formaction|data)\s*=\s*["']?\s*javascript:/i, HTML),
  extensionRule('SEC-HTML-005', 'medium', 'supply-chain', 'Page embeds a remote frame',
    'An `<iframe src="http…">` shows another site inside the page, which can be swapped for a phishing page.',
    new RegExp(String.raw`<iframe\b[^>]*\bsrc\s*=\s*${EXTERNAL}`, 'i'), HTML),
  extensionRule('SEC-HTML-006', 'medium', 'exfiltration', 'Page redirects to an external address',
    'A `<meta http-equiv="refresh">` that points off-site can send the viewer to a phishing page.',
    new RegExp(String.raw`<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*url\s*=\s*${EXTERNAL}`, 'i'), HTML),
  extensionRule('SEC-HTML-007', 'medium', 'exfiltration', 'Page contains a form that posts off-site',
    'A `<form action="http…">` sends whatever the viewer types to another server.',
    new RegExp(String.raw`<form\b[^>]*\baction\s*=\s*${EXTERNAL}`, 'i'), HTML),
  extensionRule('SEC-HTML-008', 'medium', 'supply-chain', 'Page uses an HTML import',
    '`<link rel="import">` pulls in another document, with its scripts, as part of this one.',
    /<link\b[^>]*\brel\s*=\s*["']?import\b/i, HTML),
  extensionRule('SEC-HTML-009', 'medium', 'supply-chain', 'Page embeds a remote object',
    'An `<object>` or `<embed>` with an external source loads content from another server.',
    new RegExp(String.raw`<(?:object|embed)\b[^>]*\b(?:data|src)\s*=\s*${EXTERNAL}`, 'i'), HTML),
];
