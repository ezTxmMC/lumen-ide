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
 * A small, safe Markdown renderer for hover text and language server
 * documentation. It produces DOM nodes, never HTML strings — text from a
 * server is only ever inserted as text.
 *
 * Supports: code fences, inline code, headings, lists, paragraphs, bold and
 * italic, links (as text with a title), rules and line breaks.
 */

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

/** A fenced code block starting at `start`; returns the index after the closing fence. */
function renderFence(lines: string[], start: number, marker: string, language: string, root: HTMLElement): number {
  const body: string[] = [];
  let i = start + 1;
  while (i < lines.length && !lines[i].trim().startsWith(marker)) {
    body.push(lines[i++]);
  }
  i++; // closing fence
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  if (language) {
    code.dataset.lang = language;
  }
  code.textContent = body.join('\n');
  pre.append(code);
  root.append(pre);
  return i;
}

/** A run of list items starting at `start`; returns the index after the list. */
function renderList(lines: string[], start: number, root: HTMLElement): number {
  const ordered = /^\s*\d/.test(lines[start]);
  const list = document.createElement(ordered ? 'ol' : 'ul');
  let i = start;
  while (i < lines.length) {
    const m = LIST_ITEM.exec(lines[i]);
    if (!m) {
      break;
    }
    const li = document.createElement('li');
    renderInline(m[1], li);
    list.append(li);
    i++;
  }
  root.append(list);
  return i;
}

/** A run of `>` lines starting at `start`; returns the index after the quote. */
function renderQuote(lines: string[], start: number, root: HTMLElement): number {
  const quote = document.createElement('blockquote');
  const parts: string[] = [];
  let i = start;
  while (i < lines.length && /^\s*>/.test(lines[i])) {
    parts.push(lines[i++].replace(/^\s*>\s?/, ''));
  }
  renderInline(parts.join('\n'), quote);
  root.append(quote);
  return i;
}

export function renderMarkdown(source: string, into?: HTMLElement): HTMLElement {
  const root = into ?? document.createElement('div');
  root.classList.add('lm-md');

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let paragraph: string[] = [];

  const flush = () => {
    if (!paragraph.length) {
      return;
    }
    const p = document.createElement('p');
    renderInline(paragraph.join('\n'), p);
    root.append(p);
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    const fence = /^\s*(```|~~~)\s*([\w+#.-]*)/.exec(line);
    if (fence) {
      flush();
      i = renderFence(lines, i, fence[1], fence[2], root);
      continue;
    }

    // Blank line
    if (line.trim() === '') { flush(); i++; continue; }

    // Rule
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      root.append(document.createElement('hr'));
      i++;
      continue;
    }

    // Heading
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(6, heading[1].length);
      const h = document.createElement(`h${Math.max(3, level)}`);
      renderInline(heading[2], h);
      root.append(h);
      i++;
      continue;
    }

    // List
    if (LIST_ITEM.test(line)) {
      flush();
      i = renderList(lines, i, root);
      continue;
    }

    // Quote
    if (/^\s*>/.test(line)) {
      flush();
      i = renderQuote(lines, i, root);
      continue;
    }

    paragraph.push(line);
    i++;
  }
  flush();
  return root;
}

/** Inline elements: code, bold, italic, links, hard breaks. */
export function renderInline(text: string, into: HTMLElement) {
  const pattern =
    /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*([^*]+)\*\*|__([^_]+)__|(?<![\w*])\*([^*\n]+)\*(?![\w*])|(?<![\w_])_([^_\n]+)_(?![\w_])|!?\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<>()]+)|(\\\\|\\[`*_{}[\]()#+\-.!])|(\n)/g;

  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const index = m.index ?? 0;
    if (index > last) {
      into.append(text.slice(last, index));
    }
    last = index + m[0].length;
    const node = inlineNode(m);
    if (node) {
      into.append(node);
    }
  }
  if (last < text.length) {
    into.append(text.slice(last));
  }
}

/** A node for one hit of the inline pattern (groups as in `renderInline`). */
function inlineNode(m: RegExpMatchArray): Node | string | null {
  if (m[2] !== undefined) {
    const code = document.createElement('code');
    code.textContent = m[2].trim();
    return code;
  }
  if (m[3] !== undefined || m[4] !== undefined) {
    const strong = document.createElement('strong');
    renderInline(m[3] ?? m[4], strong);
    return strong;
  }
  if (m[5] !== undefined || m[6] !== undefined) {
    const em = document.createElement('em');
    renderInline(m[5] ?? m[6], em);
    return em;
  }
  if (m[7] !== undefined) {
    const label = m[7] || m[8];
    if (!/^https?:\/\//.test(m[8])) {
      return label;
    }
    return externalLink(label, m[8]);
  }
  if (m[9] !== undefined || m[10] !== undefined) {
    const href = m[9] ?? m[10];
    return externalLink(href, href);
  }
  if (m[11] !== undefined) {
    return m[11].slice(1);
  }
  if (m[12] !== undefined) {
    return document.createElement('br');
  }
  return null;
}

function externalLink(label: string, href: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.textContent = label;
  a.href = href;
  a.title = href;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    void window.lumen.shell.openExternal(href);
  });
  return a;
}

/**
 * Markdown → plain text, for single-line displays such as the status bar and
 * tooltips without HTML. Strips fences, rules, link brackets and emphasis.
 */
export function markdownToText(input: string): string {
  return input
    .replace(/^```[\w-]*\n?/gm, '')      // opening code fence
    .replace(/^```\s*$/gm, '')           // closing code fence
    .replace(/^\s*(?:---|\*\*\*|___)\s*$/gm, '─────')  // Trennlinie
    .replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, (_m, text: string, url: string) =>
      text || url)                       // Links auf ihren Text reduzieren
    .replace(/`([^`]+)`/g, '$1')         // Inline-Code
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // fett
    .replace(/(?<![*\w])\*([^*\n]+)\*(?!\w)/g, '$1')  // kursiv
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
