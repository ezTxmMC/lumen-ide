/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import {
  AlertTriangle, Blocks, Bug, ChevronDown, ChevronRight, Circle, FileCode2, Files, GitBranch, Search,
  Settings, X, XCircle,
} from 'lucide-react';
import { useT } from '@/i18n';
import { readableOn } from '@/core/theme';
import type { Theme, TokenKind } from '@/core/types';
import { tokenCss, uses, type ColorKey } from '../keys';

type Span = [TokenKind, string];

/** Code in the IDE preview; line 6 is the active line. */
export const PREVIEW_LINES: Span[][] = [
  [['comment', '// ']],
  [['keyword', 'import'], ['punctuation', ' { '], ['variable', 'load'], ['punctuation', ' } '], ['keyword', 'from'], ['string', " 'api'"]],
  [],
  [['meta', '@Route'], ['punctuation', '('], ['string', '"/start"'], ['punctuation', ')']],
  [['keyword', 'export '], ['keyword', 'async '], ['keyword', 'function '], ['function', 'page'], ['punctuation', '('], ['variable', 'id'], ['operator', ': '], ['type', 'number'], ['punctuation', ') {']],
  [['punctuation', '  '], ['keyword', 'const '], ['variable', 'data'], ['operator', ' = '], ['keyword', 'await '], ['builtin', 'fetch'], ['punctuation', '('], ['string', '`/api/'], ['escape', '${id}'], ['string', '\\n`'], ['punctuation', ')']],
  [['punctuation', '  '], ['control', 'if'], ['punctuation', ' ('], ['operator', '!'], ['variable', 'data'], ['property', '.ok'], ['punctuation', ') '], ['control', 'return'], ['punctuation', ' '], ['constant', 'null']],
  [['punctuation', '  '], ['keyword', 'const '], ['variable', 'rx'], ['operator', ' = '], ['regexp', '/^\\d{3}$/'], ['punctuation', '; '], ['invalid', '@@']],
  [['punctuation', '  '], ['control', 'return'], ['punctuation', ' <'], ['tag', 'div'], ['punctuation', ' '], ['attribute', 'class'], ['operator', '='], ['string', '"card"'], ['punctuation', '>'], ['number', '42'], ['punctuation', '</'], ['tag', 'div'], ['punctuation', '>']],
  [['punctuation', '}']],
];

const ACTIVE_LINE = 5;

export function CodeLines({ theme, compact = false }: { theme: Theme; compact?: boolean; }) {
  const t = useT();
  const ui = theme.ui;
  return (
    <div className={`min-w-0 flex-1 overflow-hidden py-2 font-mono ${compact ? 'text-[8.5px] leading-[1.55]' : 'text-[12px] leading-[1.7]'}`}>
      {PREVIEW_LINES.map((line, index) => {
        const active = index === ACTIVE_LINE;
        return (
          <div
            key={index}
            className="flex pr-2"
            {...(active ? uses('ui:lineHighlight') : {})}
            style={{ background: active ? ui.lineHighlight : undefined }}
          >
            <span
              {...uses(active ? 'ui:text' : 'ui:gutter')}
              className={`shrink-0 pr-3 text-right tabular-nums ${compact ? 'w-6' : 'w-10'}`}
              style={{ color: active ? ui.text : ui.gutter }}
            >
              {index + 1}
            </span>
            <span className="whitespace-pre">
              {line.map(([kind, text], i) => {
                const selected = index === 6 && kind === 'variable';
                const bracket = index === 4 && i === line.length - 1;
                const squiggle = index === 7 && kind === 'invalid';
                return (
                  <span
                    key={i}
                    {...uses(`syntax:${kind}`, ...(selected ? ['ui:selection' as ColorKey] : []), ...(squiggle ? ['ui:danger' as ColorKey] : []))}
                    style={{
                      ...tokenCss(theme, kind),
                      background: selected ? ui.selection : undefined,
                      textDecoration: squiggle ? `underline wavy ${ui.danger}` : tokenCss(theme, kind).textDecoration,
                      textDecorationSkipInk: squiggle ? 'none' : undefined,
                    }}
                  >
                    {bracket && !compact
                      ? <>{') '}<span {...uses('ui:accent', 'ui:bgActive')} style={{ background: ui.bgActive, outline: `1px solid ${ui.accent}`, borderRadius: 2 }}>{'{'}</span></>
                      : text}
                    {index === 0 && t('themeStudio.preview.codeComment')}
                  </span>
                );
              })}
              {active && (
                <span
                  {...uses('ui:cursor')}
                  className="inline-block w-[2px] align-middle"
                  style={{ background: ui.cursor, height: '1.15em' }}
                />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TitleBar({ theme }: { theme: Theme; }) {
  const t = useT();
  const ui = theme.ui;
  return (
    <div {...uses('ui:bgElevated')} className="flex h-8 shrink-0 items-center gap-3 border-b px-3" style={{ background: ui.bgElevated, borderColor: ui.border }}>
      <span {...uses('ui:accent')} className="size-3 rounded-full" style={{ background: ui.accent }} />
      {['menuFile', 'menuEdit', 'menuView', 'menuRun'].map((m) => (
        <span key={m} {...uses('ui:textMuted')} style={{ color: ui.textMuted }}>{t(`themeStudio.preview.${m}`)}</span>
      ))}
      <span className="flex-1" />
      <span {...uses('ui:bgInput', 'ui:border', 'ui:textSubtle')} className="flex h-5 w-56 items-center gap-1.5 rounded-md border px-2 text-[11px]" style={{ background: ui.bgInput, borderColor: ui.border, color: ui.textSubtle }}>
        <Search size={11} /> {t('themeStudio.preview.searchEverywhere')}
      </span>
      <span className="flex-1" />
      <span {...uses('ui:textSubtle')} style={{ color: ui.textSubtle }}>page.tsx — {theme.name}</span>
    </div>

  );
}

function ActivityBar({ theme }: { theme: Theme; }) {
  const ui = theme.ui;
  return (
    <div {...uses('ui:bgElevated')} className="flex w-10 shrink-0 flex-col items-center gap-3 border-r py-2.5" style={{ background: ui.bgElevated, borderColor: ui.border }}>
      {[Files, Search, GitBranch, Bug, Blocks].map((Icon, i) => (
        <span key={i} className="relative flex w-full justify-center">
          {i === 0 && <span {...uses('ui:accent')} className="absolute top-0 left-0 h-full w-[2px] rounded-r" style={{ background: ui.accent }} />}
          <Icon size={16} {...uses(i === 0 ? 'ui:text' : 'ui:textSubtle')} style={{ color: i === 0 ? ui.text : ui.textSubtle }} />
        </span>
      ))}
      <span className="flex-1" />
      <Settings size={15} {...uses('ui:textSubtle')} style={{ color: ui.textSubtle }} />
    </div>

  );
}

function ExplorerTree({ theme }: { theme: Theme; }) {
  const t = useT();
  const ui = theme.ui;

  const tree: { name: string; depth: number; folder?: boolean; open?: boolean; state?: 'selected' | 'hover' | 'modified' | 'error'; }[] = [
    { name: 'lumen-app', depth: 0, folder: true, open: true },
    { name: 'src', depth: 1, folder: true, open: true },
    { name: 'page.tsx', depth: 2, state: 'selected' },
    { name: 'api.ts', depth: 2, state: 'modified' },
    { name: 'store.ts', depth: 2, state: 'error' },
    { name: 'style.css', depth: 2, state: 'hover' },
    { name: 'public', depth: 1, folder: true },
    { name: 'package.json', depth: 1 },
    { name: 'README.md', depth: 1 },
  ];

  const rowStyle = (state?: string) => {
    if (state === 'selected') {
      return { background: ui.bgActive, color: ui.text };
    }
    if (state === 'hover') {
      return { background: ui.bgHover, color: ui.text };
    }
    if (state === 'modified') {
      return { color: ui.warning };
    }
    if (state === 'error') {
      return { color: ui.danger };
    }
    return { color: ui.textMuted };
  };
  const rowKeys = (state?: string): ColorKey[] => {
    if (state === 'selected') {
      return ['ui:bgActive', 'ui:text'];
    }
    if (state === 'hover') {
      return ['ui:bgHover', 'ui:text'];
    }
    if (state === 'modified') {
      return ['ui:warning'];
    }
    if (state === 'error') {
      return ['ui:danger'];
    }
    return ['ui:textMuted'];
  };

  return (
    <div {...uses('ui:bgElevated')} className="flex w-44 shrink-0 flex-col border-r py-1.5" style={{ background: ui.bgElevated, borderColor: ui.border }}>
      <div {...uses('ui:textSubtle')} className="px-3 pb-1.5 text-[9.5px] font-semibold tracking-[0.1em] uppercase" style={{ color: ui.textSubtle }}>
        {t('themeStudio.preview.explorer')}
      </div>
      {tree.map((row) => (
        <div
          key={row.name}
          {...uses(...rowKeys(row.state))}
          className="mx-1 flex h-[22px] items-center gap-1 rounded-[4px] pr-2 text-[11.5px]"
          style={{ ...rowStyle(row.state), paddingLeft: 6 + row.depth * 10 }}
        >
          {row.folder && (row.open ? <ChevronDown size={11} /> : <ChevronRight size={11} />)}
          {!row.folder && <FileCode2 size={11} style={{ opacity: 0.8 }} />}
          <span className="min-w-0 flex-1 truncate">{row.name}</span>
          {row.state === 'modified' && <span className="text-[10px]">M</span>}
          {row.state === 'error' && <span className="text-[10px]">2</span>}
        </div>
      ))}
    </div>

  );
}

function BottomPanel({ theme }: { theme: Theme; }) {
  const t = useT();
  const ui = theme.ui;
  return (
    <div {...uses('ui:bgElevated', 'ui:border')} className="flex h-[118px] shrink-0 flex-col border-t" style={{ background: ui.bgElevated, borderColor: ui.border }}>
      <div className="flex h-7 shrink-0 items-center gap-4 px-3 text-[10.5px] tracking-[0.06em] uppercase">
        <span {...uses('ui:text', 'ui:accent')} className="flex h-full items-center border-b-2" style={{ color: ui.text, borderColor: ui.accent }}>
          {t('themeStudio.preview.terminal')}
        </span>
        <span {...uses('ui:textMuted')} className="flex items-center gap-1" style={{ color: ui.textMuted }}>
          {t('themeStudio.preview.problems')}
          <span {...uses('ui:danger')} className="rounded-full px-1.5 text-[9.5px] font-semibold" style={{ background: ui.danger, color: readableOn(ui.danger) }}>2</span>
        </span>
        <span {...uses('ui:textMuted')} style={{ color: ui.textMuted }}>{t('themeStudio.preview.output')}</span>
      </div>
      <div className="flex min-h-0 flex-1 gap-4 px-3 pb-2 font-mono text-[11px] leading-[1.6]">
        <div className="min-w-0 flex-1">
          <div><span {...uses('ui:success')} style={{ color: ui.success }}>➜</span> <span {...uses('ui:accent')} style={{ color: ui.accent }}>lumen-app</span> <span {...uses('ui:textMuted')} style={{ color: ui.textMuted }}>git:(main)</span> npm test</div>
          <div {...uses('ui:success')} style={{ color: ui.success }}>✓ 24 passed</div>
          <div {...uses('ui:warning')} style={{ color: ui.warning }}>⚠ 1 skipped</div>
          <div><span {...uses('ui:success')} style={{ color: ui.success }}>➜</span> <span {...uses('ui:cursor')} className="inline-block h-3 w-[7px] align-middle" style={{ background: ui.cursor }} /></div>
        </div>
        <div className="w-[46%] min-w-0 font-sans text-[11px]">
          <div {...uses('ui:bgActive')} className="flex items-center gap-1.5 rounded-[4px] px-1.5 py-0.5" style={{ background: ui.bgActive }}>
            <XCircle size={11} {...uses('ui:danger')} style={{ color: ui.danger }} />
            <span className="truncate">{t('themeStudio.preview.problemError')}</span>
            <span {...uses('ui:textSubtle')} className="ml-auto shrink-0" style={{ color: ui.textSubtle }}>8:22</span>
          </div>
          <div className="flex items-center gap-1.5 px-1.5 py-0.5">
            <AlertTriangle size={11} {...uses('ui:warning')} style={{ color: ui.warning }} />
            <span className="truncate" {...uses('ui:textMuted')} style={{ color: ui.textMuted }}>{t('themeStudio.preview.problemWarning')}</span>
            <span {...uses('ui:textSubtle')} className="ml-auto shrink-0" style={{ color: ui.textSubtle }}>2:10</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBar({ theme }: { theme: Theme; }) {
  const ui = theme.ui;
  return (
    <div {...uses('ui:bgElevated', 'ui:textSubtle')} className="flex h-6 shrink-0 items-center gap-3 border-t pr-3 text-[10.5px]" style={{ background: ui.bgElevated, borderColor: ui.border, color: ui.textSubtle }}>
      <span {...uses('ui:accent', 'ui:accentText')} className="flex h-full items-center gap-1 px-2.5" style={{ background: ui.accent, color: ui.accentText }}>
        <GitBranch size={11} /> main
      </span>
      <span className="flex items-center gap-1" {...uses('ui:danger')} style={{ color: ui.danger }}><XCircle size={10} /> 2</span>
      <span className="flex items-center gap-1" {...uses('ui:warning')} style={{ color: ui.warning }}><AlertTriangle size={10} /> 1</span>
      <span className="flex-1" />
      <span>Ln 6, Col 14</span>
      <span>UTF-8</span>
      <span {...uses('ui:textMuted')} style={{ color: ui.textMuted }}>TypeScript</span>
    </div>
  );
}

function EditorArea({ theme }: { theme: Theme; }) {
  const ui = theme.ui;
  const tabs = [
    { name: 'page.tsx', active: true },
    { name: 'api.ts', modified: true },
    { name: 'store.ts' },
  ];

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div {...uses('ui:bgElevated', 'ui:border')} className="flex h-8 shrink-0 items-stretch border-b" style={{ background: ui.bgElevated, borderColor: ui.border }}>
        {tabs.map((tab) => (
          <div
            key={tab.name}
            {...uses(...(tab.active ? ['ui:bg', 'ui:text', 'ui:accent'] as ColorKey[] : ['ui:textMuted'] as ColorKey[]))}
            className="relative flex items-center gap-2 border-r px-3 text-[11.5px]"
            style={{
              background: tab.active ? ui.bg : 'transparent',
              color: tab.active ? ui.text : ui.textMuted,
              borderColor: ui.border,
            }}
          >
            {tab.active && <span className="absolute top-0 right-0 left-0 h-[2px]" style={{ background: ui.accent }} />}
            <FileCode2 size={11} />
            {tab.name}
            {tab.modified
              ? <Circle size={7} fill={ui.text} {...uses('ui:text')} style={{ color: ui.text }} />
              : <X size={11} {...uses('ui:textSubtle')} style={{ color: ui.textSubtle }} />}
          </div>
        ))}
      </div>

      <div {...uses('ui:textSubtle')} className="flex h-6 shrink-0 items-center gap-1 px-3 text-[10.5px]" style={{ color: ui.textSubtle }}>
        src <ChevronRight size={10} /> page.tsx <ChevronRight size={10} /> <span style={{ color: ui.textMuted }}>page</span>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <CodeLines theme={theme} />
        {/* Bildlaufleiste */}
        <span {...uses('ui:scrollbar')} className="absolute top-2 right-1 h-16 w-[6px] rounded-full" style={{ background: ui.scrollbar }} />
      </div>

      <BottomPanel theme={theme} />
    </div>
  );
}

/** The whole IDE: title bar, activity bar, explorer, tabs, editor, panel, status bar. */
export function IdePreview({ theme }: { theme: Theme; }) {
  const ui = theme.ui;

  return (
    <div
      {...uses('ui:bg', 'ui:border')}
      className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-lumen border text-[12px]"
      style={{ background: ui.bg, borderColor: ui.border, color: ui.text }}
    >
      <TitleBar theme={theme} />

      <div className="flex min-h-0 flex-1">
        <ActivityBar theme={theme} />
        <ExplorerTree theme={theme} />
        <EditorArea theme={theme} />
      </div>

      <StatusBar theme={theme} />
    </div>
  );
}
