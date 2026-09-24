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
 * An agent's answer as Markdown.
 *
 * `renderMarkdown` builds DOM nodes and inserts every piece of text as text —
 * nothing an agent writes is ever parsed as HTML. Code blocks get a copy
 * button; links open in the system browser (the renderer wires that itself).
 */

import { useLayoutEffect, useRef } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import { useT } from '@/i18n';

const PROSE = [
  'lm-agent-md min-w-0 break-words text-[12.5px] leading-relaxed text-fg',
  '[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
  '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5',
  '[&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:font-semibold [&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:font-semibold',
  '[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-edge [&_blockquote]:pl-2 [&_blockquote]:text-muted',
  '[&_hr]:my-2 [&_hr]:border-edge [&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline',
  '[&_code]:font-mono [&_code]:text-[11.5px]',
  '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-input [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px',
  '[&_pre]:relative [&_pre]:my-1.5 [&_pre]:max-h-96 [&_pre]:overflow-auto [&_pre]:rounded-lumen-sm',
  '[&_pre]:border [&_pre]:border-edge [&_pre]:bg-input [&_pre]:px-2.5 [&_pre]:py-2 [&_pre]:leading-snug',
].join(' ');

const COPY_BUTTON = 'lm-transition absolute top-1 right-1 rounded-lumen-sm border border-edge bg-surface px-1.5 py-px text-[10px] text-subtle opacity-0 hover:text-fg';

/** Give every code block a copy button that shows while the block is hovered. */
function addCopyButtons(root: HTMLElement, labels: { copy: string; copied: string; }) {
  for (const pre of Array.from(root.querySelectorAll('pre'))) {
    const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = COPY_BUTTON;
    button.textContent = labels.copy;
    button.addEventListener('click', () => {
      void navigator.clipboard.writeText(code).then(() => {
        button.textContent = labels.copied;
        window.setTimeout(() => { button.textContent = labels.copy; }, 1200);
      });
    });
    pre.addEventListener('mouseenter', () => { button.style.opacity = '1'; });
    pre.addEventListener('mouseleave', () => { button.style.opacity = '0'; });
    pre.append(button);
  }
}

export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean; }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const copy = t('agent.copy');
  const copied = t('agent.copied');

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    element.replaceChildren();
    renderMarkdown(text, element);
    addCopyButtons(element, { copy, copied });
    if (!streaming) {
      return;
    }
    const cursor = document.createElement('span');
    cursor.className = 'lm-anim-pulse ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 rounded-sm bg-accent'
    ;(element.lastElementChild ?? element).append(cursor);
  }, [text, streaming, copy, copied]);

  return <div ref={ref} className={PROSE} />;
}
