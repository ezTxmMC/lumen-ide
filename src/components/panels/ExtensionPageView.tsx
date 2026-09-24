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
 * A page contributed by an extension.
 *
 * The content comes from a foreign server, so it is never hung into the
 * application's own document but into a sealed frame: `<iframe sandbox>` with
 * no `allow-scripts`, no `allow-same-origin` and no `allow-popups`. Inside
 * there is no JavaScript, no access to Lumen and none to the clipboard — not
 * even when the HTML carries a `<script>`.
 *
 * Markdown is translated to HTML beforehand by the application's own renderer,
 * which escapes everything and lets only the markup it knows through.
 *
 * The frame cannot open outward links itself, since `allow-popups` is absent.
 * A click filter catches them instead and hands them to the system browser,
 * the way the editor treats any other link.
 */

import { useEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import type { ExtensionPage } from '@/core/extensions/types';

/** Pass the interface colours into the frame — it inherits nothing. */
function themeVariables(): string {
  const style = getComputedStyle(document.documentElement);
  const names = ['--c-bg', '--c-fg', '--c-text-muted', '--c-text-subtle', '--c-edge', '--c-accent', '--c-bg-input', '--c-bg-elevated'];
  return names.map((name) => `${name}: ${style.getPropertyValue(name).trim() || 'inherit'};`).join(' ');
}

const PAGE_STYLE = `
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 12px 14px 32px;
    background: var(--c-bg, #0e1014); color: var(--c-fg, #e6e8ec);
    font: 12.5px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    overflow-wrap: anywhere;
  }
  h1 { font-size: 16px; } h2 { font-size: 14px; } h3 { font-size: 13px; }
  h1, h2, h3, h4 { margin: 18px 0 6px; line-height: 1.3; }
  h1:first-child, h2:first-child { margin-top: 0; }
  p, ul, ol { margin: 0 0 10px; }
  ul, ol { padding-left: 20px; }
  a { color: var(--c-accent, #8b95ff); }
  code {
    background: var(--c-bg-input, #181b21); padding: 1px 4px;
    border-radius: 4px; font: 11.5px/1.5 ui-monospace, monospace;
  }
  pre {
    background: var(--c-bg-input, #181b21); padding: 10px 12px;
    border-radius: 8px; overflow-x: auto;
  }
  pre code { background: none; padding: 0; }
  blockquote {
    margin: 0 0 10px; padding-left: 12px;
    border-left: 3px solid var(--c-edge, #23262d); color: var(--c-text-muted, #a3a9b5);
  }
  hr { border: none; border-top: 1px solid var(--c-edge, #23262d); margin: 16px 0; }
  img { max-width: 100%; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid var(--c-edge, #23262d); padding: 4px 8px; text-align: left; }
`;

/** Translate Markdown, leave HTML alone — the frame seals off both. */
function pageHtml(page: ExtensionPage): string {
  if (page.format === 'html') {
    return page.content;
  }
  return renderMarkdown(page.content).innerHTML;
}

export function ExtensionPageView({ page }: { page: ExtensionPage; }) {
  const frame = useRef<HTMLIFrameElement>(null);

  const document_ = useMemo(() => `<!doctype html>
<html><head><meta charset="utf-8">
<style>:root { ${themeVariables()} } ${PAGE_STYLE}</style>
</head><body>${pageHtml(page)}</body></html>`, [page]);

  // Open outward links in the system browser. The frame may not open windows
  // of its own, so without this every link would do nothing.
  useEffect(() => {
    const element = frame.current;
    if (!element) {
      return;
    }
    const onLoad = () => {
      const inner = element.contentDocument;
      if (!inner) {
        return;
      }
      inner.addEventListener('click', (event) => {
        const anchor = (event.target as HTMLElement | null)?.closest?.('a');
        const href = anchor?.getAttribute('href');
        if (!href) {
          return;
        }
        event.preventDefault();
        if (!/^https?:\/\//i.test(href)) {
          return;
        }
        void window.lumen.shell.openExternal(href);
      });
    };
    element.addEventListener('load', onLoad);
    return () => element.removeEventListener('load', onLoad);
  }, [document_]);

  return (
    <iframe
      ref={frame}
      title={page.title}
      srcDoc={document_}
      // No `allow-scripts`, no `allow-same-origin`: the content stays a
      // document without rights — it can neither run code nor see Lumen.
      sandbox=""
      className="size-full border-0 bg-bg"
    />
  );
}
