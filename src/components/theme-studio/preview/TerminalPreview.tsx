/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { ReactNode } from 'react';
import { useT } from '@/i18n';
import { xtermTheme } from '@/lib/terminals';
import type { Theme } from '@/core/types';
import { uses, type ColorKey } from '../keys';

type Ansi = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white';
const ANSI: Ansi[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

/** Where the theme's ANSI colour comes from (see `xtermTheme`). */
const SOURCE: Record<Ansi, ColorKey | null> = {
  black: null,
  red: 'ui:danger',
  green: 'ui:success',
  yellow: 'ui:warning',
  blue: 'syntax:function',
  magenta: 'syntax:keyword',
  cyan: 'syntax:type',
  white: 'ui:textMuted',
};

const brightKey = (name: Ansi) => `bright${name[0].toUpperCase()}${name.slice(1)}` as `bright${Capitalize<Ansi>}`;

/** A terminal in the ANSI colours the theme hands to xterm.js. */
export function TerminalPreview({ theme }: { theme: Theme; }) {
  const t = useT();
  const x = xtermTheme(theme);
  const color = (name: Ansi, bright = false) => (bright ? x[brightKey(name)] : x[name]) ?? x.foreground ?? theme.ui.text;
  const paint = (name: Ansi, text: ReactNode, bright = false, bold = false) => {
    const source = SOURCE[name];
    return (
      <span {...(source ? uses(source) : {})} style={{ color: color(name, bright), fontWeight: bold ? 700 : undefined }}>
        {text}
      </span>
    );
  };

  return (
    <div
      {...uses('ui:bgElevated', 'ui:text')}
      className="flex h-full min-h-[380px] flex-col overflow-hidden rounded-lumen border"
      style={{ background: x.background, color: x.foreground, borderColor: theme.ui.border }}
    >
      <div {...uses('ui:border')} className="flex h-8 shrink-0 items-center gap-3 border-b px-3 text-[10.5px] tracking-[0.06em] uppercase" style={{ borderColor: theme.ui.border }}>
        <span {...uses('ui:text', 'ui:accent')} className="flex h-full items-center border-b-2" style={{ color: theme.ui.text, borderColor: theme.ui.accent }}>zsh</span>
        <span {...uses('ui:textMuted')} style={{ color: theme.ui.textMuted }}>node</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[12.5px] leading-[1.6] whitespace-pre">
        <div>{paint('green', '➜ ', false, true)}{paint('cyan', '~/lumen-app ', false, true)}{paint('blue', 'git:(')}{paint('red', 'main')}{paint('blue', ')')} {paint('yellow', '✗')} ls -la</div>
        <div>{paint('blue', 'drwxr-xr-x', true)}  lumen  staff   {paint('blue', 'src/', false, true)}</div>
        <div>{paint('white', '-rw-r--r--')}  lumen  staff   package.json</div>
        <div>{paint('green', '-rwxr-xr-x', true)}  lumen  staff   {paint('green', 'deploy.sh', false, true)}</div>
        <div>{paint('magenta', 'lrwxr-xr-x')}  lumen  staff   {paint('cyan', 'node_modules/.bin', true)} → ../bin</div>
        <div> </div>
        <div>{paint('green', '➜ ', false, true)}{paint('cyan', '~/lumen-app ', false, true)}git status --short</div>
        <div>{paint('green', ' M')} src/page.tsx</div>
        <div>{paint('red', '??')} src/theme.json</div>
        <div> </div>
        <div>{paint('green', '➜ ', false, true)}{paint('cyan', '~/lumen-app ', false, true)}npm test</div>
        <div>{paint('green', ' ✓', true)} {paint('white', 'theme-colors')} {paint('black', '(891)', true)}</div>
        <div>{paint('red', ' ✗', true)} {paint('white', 'contrast')} {paint('red', t('themeStudio.preview.termFailed'))}</div>
        <div>{paint('yellow', ' ⚠', true)} {paint('yellow', t('themeStudio.preview.termWarning'))}</div>
        <div>
          {paint('green', '➜ ', false, true)}{paint('cyan', '~/lumen-app ', false, true)}
          <span {...uses('ui:selection')} style={{ background: x.selectionBackground }}>{t('themeStudio.preview.termSelected')}</span>{' '}
          <span {...uses('ui:cursor')} className="inline-block h-[1.1em] w-[0.6em] align-middle" style={{ background: x.cursor }} />
        </div>
      </div>

      {/* Farbtabelle: normal und hell */}
      <div {...uses('ui:border')} className="grid shrink-0 grid-cols-8 gap-1 border-t p-2" style={{ borderColor: theme.ui.border }}>
        {[false, true].flatMap((bright) => ANSI.map((name) => {
          const source = SOURCE[name];
          return (
            <div
              key={`${name}-${bright}`}
              {...(source ? uses(source) : {})}
              title={`${bright ? 'bright ' : ''}${name}${source ? ` ← ${source}` : ''}`}
              className="flex h-7 items-end rounded-[4px] px-1 pb-0.5 font-mono text-[9px]"
              style={{ background: color(name, bright), color: bright ? x.background : x.foreground }}
            >
              <span className="rounded-sm px-0.5" style={{ background: x.background, color: x.foreground, opacity: 0.85 }}>
                {bright ? name.slice(0, 3).toUpperCase() : name.slice(0, 3)}
              </span>
            </div>
          );
        }))}
      </div>
    </div>
  );
}
