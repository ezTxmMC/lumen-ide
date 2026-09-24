/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { Addon, LanguageSpec } from '@/core/types';
import { htmlSiteTemplate } from '../lib/web-project';
import { npmKind } from '../lib/node-project';
import { htmlTokenizer } from '../lib/html-tokenizer';
import { LSP_PACKAGES, SYSTEM_PACKAGES } from '../lib/lsp-packages';
import { localizeSnippets } from '../lib/localize';
import { t } from '@/i18n';

const TAGS = [
  'html', 'head', 'body', 'title', 'meta', 'link', 'script', 'style', 'div',
  'span', 'p', 'a', 'img', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr',
  'th', 'td', 'form', 'input', 'button', 'select', 'option', 'textarea', 'label',
  'header', 'footer', 'main', 'nav', 'section', 'article', 'aside', 'figure',
  'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'strong', 'em',
  'code', 'pre', 'blockquote', 'canvas', 'svg', 'video', 'audio', 'source',
  'iframe', 'dialog', 'details', 'summary', 'template', 'slot', 'picture',
];

const ATTRS = [
  'class', 'id', 'style', 'href', 'src', 'alt', 'title', 'type', 'name', 'value',
  'placeholder', 'disabled', 'checked', 'readonly', 'required', 'target', 'rel',
  'width', 'height', 'loading', 'srcset', 'sizes', 'colspan', 'rowspan',
  'aria-label', 'aria-hidden', 'role', 'tabindex', 'data-', 'lang', 'charset',
  'content', 'defer', 'async', 'crossorigin', 'autocomplete', 'for',
];

export const htmlSpec: LanguageSpec = {
  id: 'html',
  name: 'HTML',
  extensions: ['.html', '.htm', '.xhtml', '.vue', '.svelte'],
  icon: '<>',
  color: '#e34c26',
  comments: { block: ['<!--', '-->'] },
  tokenizer: htmlTokenizer as never,
  completions: [...TAGS, ...ATTRS],
  indentOpen: /<(?!\/|.*\/>)[^>]*>\s*$/,
  indentClose: /^\s*<\//,
  snippets: localizeSnippets([
    {
      label: 'html5',
      detail: 'addons.snippets.html.html5',
      body:
        '<!doctype html>\n<html lang="de">\n<head>\n  <meta charset="UTF-8">\n' +
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '  <title>${Titel}</title>\n</head>\n<body>\n  $0\n</body>\n</html>',
    },
    { label: 'a', detail: 'Link', body: '<a href="${url}">$0</a>' },
    { label: 'img', detail: 'addons.snippets.html.img', body: '<img src="${src}" alt="${alt}">' },
    { label: 'form', detail: 'addons.snippets.html.form', body: '<form action="${/}" method="${post}">\n  $0\n</form>' },
    { label: 'input', detail: 'addons.snippets.html.input', body: '<label for="${id}">${Beschriftung}</label>\n<input id="${id}" name="${id}" type="${text}">$0' },
    { label: 'select', detail: 'addons.snippets.html.select', body: '<select name="${name}">\n  <option value="${wert}">${Text}</option>$0\n</select>' },
    { label: 'button', detail: 'addons.snippets.html.button', body: '<button type="${button}">$0</button>' },
    { label: 'ul', detail: 'addons.snippets.html.ul', body: '<ul>\n  <li>$0</li>\n</ul>' },
    { label: 'table', detail: 'addons.snippets.html.table', body: '<table>\n  <thead>\n    <tr><th>${Spalte}</th></tr>\n  </thead>\n  <tbody>\n    <tr><td>$0</td></tr>\n  </tbody>\n</table>' },
    { label: 'video', detail: 'Video', body: '<video src="${datei.mp4}" controls playsinline></video>$0' },
    { label: 'picture', detail: 'addons.snippets.html.picture', body: '<picture>\n  <source srcset="${bild.avif}" type="image/avif">\n  <img src="${bild.jpg}" alt="${alt}" loading="lazy">\n</picture>$0' },
    { label: 'meta', detail: 'addons.snippets.html.meta', body: '<meta property="og:title" content="${Titel}">\n<meta property="og:description" content="${Beschreibung}">\n<meta property="og:image" content="${bild.png}">$0' },
    { label: 'link', detail: 'Stylesheet', body: '<link rel="stylesheet" href="${stil.css}">' },
    { label: 'script', detail: 'addons.snippets.html.script', body: '<script type="module" src="${app.js}"></script>' },
    { label: 'details', detail: 'addons.snippets.html.details', body: '<details>\n  <summary>${Titel}</summary>\n  $0\n</details>' },
    { label: 'dialog', detail: 'Dialog', body: '<dialog id="${id}">\n  $0\n  <form method="dialog"><button>Schließen</button></form>\n</dialog>' },
    { label: 'section', detail: 'addons.snippets.html.section', body: '<section aria-labelledby="${id}">\n  <h2 id="${id}">${Titel}</h2>\n  $0\n</section>' },
    { label: 'svg', detail: 'addons.snippets.html.svg', body: '<svg viewBox="0 0 ${24} ${24}" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">\n  $0\n</svg>' },
  ]),
  lsp: [
    {
      label: 'vscode-html-language-server',
      command: 'vscode-html-language-server',
      args: ['--stdio'],
      languageId: 'html',
      rootMarkers: ['package.json', '.git'],
      settings: { html: { format: { wrapLineLength: 100 } } },
      install: 'npm i -g vscode-langservers-extracted',
      package: LSP_PACKAGES.langserversExtracted,
      systemPackages: SYSTEM_PACKAGES.langserversExtracted,
    },
    {
      label: 'superhtml',
      command: 'superhtml',
      args: ['lsp'],
      languageId: 'html',
      install: 'https://github.com/kristoff-it/superhtml',
      package: LSP_PACKAGES.superhtml,
    },
  ],
};

export const htmlAddon: Addon = {
  id: 'lang.html',
  name: 'HTML',
  version: '1.0.0',
  get description() {
    return t('addons.htmlDescription');
  },
  icon: '<>',
  builtin: true,
  category: 'language',
  languages: [htmlSpec],
  projectKinds: [npmKind],
  projectTemplates: [htmlSiteTemplate],
};
