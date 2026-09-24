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
 * Lumen's main window, rebuilt from the app's own components at their real
 * sizes: TitleBar, ActivityBar, Sidebar/Explorer, the tab bar of EditorArea,
 * the CodeMirror view with its gutter, indent guides and minimap, and the
 * StatusBar. Class names follow the app's, so a change there is easy to carry
 * over. Rendered at 1:1 — `Scaled` only shrinks it when the page is narrower.
 */

import type { CSSProperties, ReactNode } from 'react';
import {
  Blocks, Bug, ChevronDown, ChevronRight, ChevronsDownUp, CircleAlert, Command, Ellipsis, ExternalLink, FilePlus, Files,
  FlaskConical, FolderGit2, FolderInput, FolderKanban, FolderPlus, Hammer, Keyboard, Link2, ListTree, Maximize2, Minus,
  Package, Palette, PanelBottom, PanelLeft, PanelRight, Play, RefreshCw, Search, Settings, Square,
  SquareSplitHorizontal, SquareTerminal, TerminalSquare, X, Zap,
} from 'lucide-react';
import { fileIcon, folderIcon, IconGlyph } from './icons';
import { lumenScene, type Scene, type TabSpec, type TreeRow } from './scene';
import { syntaxColor, syntaxStyle, themeVars, type Theme } from './themes';
import { indentOf, type Line } from './tokenize';

export const WINDOW_WIDTH = 1200;
export const WINDOW_HEIGHT = 760;

const FONT_SIZE = 13;
const LINE_HEIGHT = 1.6;
const LINE_PX = FONT_SIZE * LINE_HEIGHT;
const SIDEBAR_WIDTH = 260;
const PANEL_HEIGHT = 176;
const MENUS = ['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help'];
const MINIMAP_WIDTH = 96;
const CODE_FONT = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace";
const UI_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Inter', sans-serif";

export function EditorWindow({ theme, scene = lumenScene, width = WINDOW_WIDTH, height = WINDOW_HEIGHT }: {
  theme: Theme;
  scene?: Scene;
  width?: number;
  height?: number;
}) {
  const style: CSSProperties = {
    ...themeVars(theme),
    width,
    height,
    fontFamily: UI_FONT,
    fontSize: 13,
    WebkitFontSmoothing: 'antialiased',
  };
  return (
    <div
      className="lm-shot flex flex-col overflow-hidden bg-bg text-left leading-normal text-fg select-none"
      style={style}
      role="img"
      aria-label={`Lumen with ${scene.workspace} open, in the ${theme.name} theme`}
    >
      <TitleBar scene={scene} />
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        <Sidebar scene={scene} />
        <main className="flex min-w-0 flex-1 flex-col">
          <EditorTabs tabs={scene.tabs} />
          <CodeView theme={theme} scene={scene} />
          <BottomPanel scene={scene} />
        </main>
      </div>
      <StatusBar scene={scene} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * TitleBar
 * ------------------------------------------------------------------ */

function ToolButton({ children, className = '' }: { children: ReactNode; className?: string; }) {
  return (
    <span className={`inline-flex h-6 items-center justify-center gap-1.5 rounded-lumen-sm px-2 text-[11.5px] font-medium text-muted ${className}`}>
      {children}
    </span>
  );
}

function TitleBar({ scene }: { scene: Scene; }) {
  const active = scene.tabs.find((tab) => tab.active);
  const title = [active?.name, scene.workspace, 'Lumen'].filter(Boolean).join(' — ');
  return (
    <header className="flex h-9 shrink-0 items-center gap-1 border-b border-edge bg-surface px-2">
      <div className="flex shrink-0 items-center">
        {MENUS.map((menu) => (
          <span key={menu} className="flex h-6 items-center rounded-lumen-sm px-2 text-[12px] text-muted">{menu}</span>
        ))}
      </div>
      <span className="mx-1 h-4 w-px shrink-0 bg-edge" />

      <span className="flex h-6 max-w-[220px] items-center gap-1.5 rounded-lumen-sm border border-edge px-2 text-[11.5px] text-muted">
        <FolderGit2 size={12} className="shrink-0 opacity-80" />
        <span className="truncate">{scene.workspace}</span>
        <ChevronDown size={11} className="shrink-0 opacity-70" />
      </span>

      <div className="ml-1 flex items-center gap-0.5">
        <ToolButton><Hammer size={14} /></ToolButton>
        <ToolButton><Play size={14} /></ToolButton>
        <ToolButton><FlaskConical size={14} /></ToolButton>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden px-2">
        <span className="flex h-6 max-w-[440px] min-w-0 flex-1 items-center gap-2 rounded-lumen-sm border border-transparent px-2 text-[12px] text-subtle">
          <Command size={11} className="shrink-0 opacity-60" />
          <span className="truncate">{title}</span>
        </span>
        <span className="ml-1 flex h-6 shrink-0 items-center gap-1 rounded-lumen-sm px-1.5 text-[11px] text-subtle">
          <Search size={12} />
          <span className="font-mono text-[10px] opacity-70">⇧⇧</span>
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <ToolButton className="text-accent"><PanelLeft size={14} /></ToolButton>
        <ToolButton className="text-accent"><PanelBottom size={14} /></ToolButton>
        <ToolButton><PanelRight size={14} /></ToolButton>
      </div>

      <div className="ml-1 flex items-center">
        <span className="flex h-7 w-10 items-center justify-center rounded-lumen-sm text-muted"><Minus size={13} /></span>
        <span className="flex h-7 w-10 items-center justify-center rounded-lumen-sm text-muted"><Square size={11} /></span>
        <span className="flex h-7 w-10 items-center justify-center rounded-lumen-sm text-muted"><X size={14} /></span>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * ActivityBar
 * ------------------------------------------------------------------ */

const VIEWS = [Files, Search, FolderKanban, ListTree, Bug];
const DIALOGS = [Package, Palette, Keyboard, Settings];

function ActivityButton({ Icon, active = false, badge = false }: { Icon: typeof Files; active?: boolean; badge?: boolean; }) {
  return (
    <span
      className={[
        'relative flex size-9 items-center justify-center rounded-lumen',
        active ? 'text-accent' : 'text-subtle',
      ].join(' ')}
    >
      <Icon size={17} strokeWidth={active ? 2.1 : 1.8} />
      {badge && !active && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent" />}
    </span>
  );
}

function ActivityBar() {
  return (
    <nav className="relative flex w-11 shrink-0 flex-col items-center gap-0.5 border-r border-edge bg-surface py-2">
      {/* The active-item bar: offsetTop 8 + half the 36px button − 8. */}
      <span aria-hidden className="absolute left-0 h-4 w-[2px] rounded-full bg-accent" style={{ top: 18 }} />
      {VIEWS.map((Icon, index) => (
        <ActivityButton key={index} Icon={Icon} active={index === 0} badge={Icon === FolderKanban} />
      ))}
      <div className="flex-1" />
      {DIALOGS.map((Icon, index) => <ActivityButton key={index} Icon={Icon} />)}
    </nav>
  );
}

/* ------------------------------------------------------------------ *
 * Sidebar → Explorer
 * ------------------------------------------------------------------ */

function Sidebar({ scene }: { scene: Scene; }) {
  return (
    <aside className="flex shrink-0 border-r border-edge bg-surface" style={{ width: SIDEBAR_WIDTH }}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center gap-1 pr-1 pl-3 text-[10.5px] font-semibold tracking-[0.09em] text-subtle uppercase">
          <span className="flex-1">Explorer</span>
          <ToolButton className="!px-1"><ExternalLink size={12} /></ToolButton>
          <ToolButton className="!px-1"><Ellipsis size={13} /></ToolButton>
          <ToolButton className="!px-1"><X size={13} /></ToolButton>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1 border-b border-edge px-2 py-1.5">
            <span className="flex-1 truncate text-[11px] font-semibold tracking-[0.07em] text-muted uppercase">
              {scene.workspace}
            </span>
            <ToolButton><FolderInput size={13} /></ToolButton>
            <ToolButton><FilePlus size={13} /></ToolButton>
            <ToolButton><FolderPlus size={13} /></ToolButton>
            <ToolButton><RefreshCw size={13} /></ToolButton>
            <ToolButton><ChevronsDownUp size={13} /></ToolButton>
          </div>
          <div className="flex-1 overflow-hidden py-1">
            {scene.tree.map((row, index) => <TreeItem key={`${row.name}-${index}`} row={row} />)}
          </div>
        </div>
      </div>
      <div className="w-[3px] shrink-0" />
    </aside>
  );
}

function TreeItem({ row }: { row: TreeRow; }) {
  return (
    <div
      className={['lm-row mx-1 text-[12.5px]', row.selected ? 'bg-active text-fg' : 'text-muted'].join(' ')}
      style={{ paddingLeft: 6 + row.depth * 12 }}
    >
      {row.folder && (
        <>
          <ChevronRight size={13} className="shrink-0 opacity-70" style={{ transform: row.open ? 'rotate(90deg)' : 'none' }} />
          <IconGlyph icon={folderIcon(row.name, Boolean(row.open))} size={14} />
        </>
      )}
      {!row.folder && (
        <span className="flex w-[15px] shrink-0 justify-center">
          <IconGlyph icon={fileIcon(row.name)} size={13} />
        </span>
      )}
      <span className="flex-1 truncate">{row.name}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The tab bar of the editor group
 * ------------------------------------------------------------------ */

function EditorTabs({ tabs }: { tabs: TabSpec[]; }) {
  return (
    <div className="lm-scroll-fade flex h-9 shrink-0 items-stretch border-b border-edge bg-surface">
      <div className="flex min-w-0 flex-1 items-stretch gap-px overflow-hidden">
        {tabs.map((tab) => {
          const glyph = fileIcon(tab.name);
          return (
            <div
              key={tab.name}
              className={[
                'relative flex max-w-[220px] min-w-[110px] shrink-0 items-center gap-1.5 px-3',
                tab.active ? 'bg-bg text-fg' : 'text-subtle',
              ].join(' ')}
            >
              {tab.active && <span className="absolute inset-x-0 top-0 h-[2px] bg-accent" />}
              <IconGlyph icon={tab.active ? glyph : { ...glyph, color: undefined }} size={12} />
              <span className="truncate text-[12.5px]">{tab.name}</span>
              <span className="ml-auto flex size-4 shrink-0 items-center justify-center rounded-sm">
                {tab.dirty && <span className="size-[7px] rounded-full bg-accent" />}
                {!tab.dirty && <X size={11} className="opacity-0" />}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 px-1">
        <ToolButton><SquareSplitHorizontal size={13} /></ToolButton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The CodeMirror view
 * ------------------------------------------------------------------ */

/** Lines whose last token opens a bracket that closes further down — where the fold gutter puts a marker. */
function foldable(lines: Line[], index: number) {
  const tokens = lines[index].filter((token) => token.text.trim());
  const last = tokens.at(-1);
  if (!last) {
    return false;
  }
  if (last.kind === 'comment' && last.text.trimStart().startsWith('/**') && !last.text.includes('*/')) {
    return true;
  }
  return last.kind === 'punctuation' && '{(['.includes(last.text);
}

function FoldMarker() {
  return (
    <span className="inline-flex h-full w-[14px] items-center justify-center" style={{ opacity: 0.55, transform: 'rotate(90deg)' }}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M3.5 2 L7 5 L3.5 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function CodeView({ theme, scene }: { theme: Theme; scene: Scene; }) {
  const visible = Math.ceil((WINDOW_HEIGHT - 36 - 36 - 24 - PANEL_HEIGHT) / LINE_PX) + 1;
  const first = scene.firstLine;
  const rows = scene.lines.slice(first - 1, first - 1 + visible);
  const digits = String(scene.lines.length).length;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-bg" style={{ fontSize: FONT_SIZE }}>
      <div className="flex" style={{ marginRight: MINIMAP_WIDTH, fontFamily: CODE_FONT, lineHeight: LINE_HEIGHT }}>
        {/* Gutters: line numbers and fold markers, on the editor background. */}
        <div className="shrink-0 bg-bg" style={{ color: 'var(--c-gutter)', paddingRight: 6 }}>
          {rows.map((_, index) => {
            const number = first + index;
            const current = number === scene.cursor.line;
            return (
              <div key={number} className="flex" style={{ height: LINE_PX }}>
                <span
                  className="box-border text-right whitespace-nowrap"
                  style={{ minWidth: 38, padding: '0 4px 0 12px', width: `calc(${digits}ch + 16px)`, color: current ? 'var(--c-text)' : undefined }}
                >
                  {number}
                </span>
                <span className="inline-flex w-[16px] justify-center">{foldable(scene.lines, number - 1) && <FoldMarker />}</span>
              </div>
            );
          })}
        </div>

        <div className="min-w-0 flex-1 overflow-hidden" style={{ fontVariantLigatures: 'normal', caretColor: 'var(--c-cursor)' }}>
          {rows.map((line, index) => {
            const number = first + index;
            const current = number === scene.cursor.line;
            const indent = indentOf(line);
            const hasText = line.some((token) => token.text.trim());
            const guides = indent > 0 && hasText;
            return (
              <div
                key={number}
                className="lm-code-line relative whitespace-pre"
                data-indent={guides ? '' : undefined}
                style={{
                  height: LINE_PX,
                  padding: '0 2px 0 6px',
                  backgroundColor: current ? 'var(--c-line-highlight)' : undefined,
                  ['--indent-w' as string]: `${indent}ch`,
                }}
              >
                {line.map((token, t) => (
                  <span key={t} style={token.kind ? syntaxStyle(theme, token.kind) : { color: 'var(--c-text)' }}>{token.text}</span>
                ))}
                {current && (
                  <span
                    className="absolute top-0"
                    style={{ left: `calc(6px + ${scene.cursor.column - 1}ch)`, height: LINE_PX, borderLeft: '2px solid var(--c-cursor)' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Minimap theme={theme} scene={scene} />
    </div>
  );
}

/** The minimap as components/minimap.ts paints it: 2 px a line, 1 px a character, runs in their token's colour. */
function Minimap({ theme, scene }: { theme: Theme; scene: Scene; }) {
  const rects: ReactNode[] = [];
  scene.lines.forEach((line, index) => {
    const y = index * 2;
    let column = 0;
    for (const token of line) {
      const color = token.kind ? syntaxColor(theme, token.kind) : theme.ui.text;
      // Words become runs; spaces break them.
      for (const part of token.text.split(/( +)/)) {
        if (!part) {
          continue;
        }
        if (part.startsWith(' ')) {
          column += part.length;
          continue;
        }
        const width = Math.min(part.length, 160 - column);
        if (width > 0) {
          rects.push(<rect key={`${index}-${column}`} x={column} y={y} width={width} height={1.4} fill={color} />);
        }
        column += part.length;
      }
    }
  });
  const height = scene.lines.length * 2;
  return (
    <div
      className="absolute inset-y-0 right-0 overflow-hidden"
      style={{ width: MINIMAP_WIDTH, backgroundColor: theme.ui.bg, boxShadow: `inset 1px 0 0 ${theme.ui.border}99` }}
      aria-hidden
    >
      <svg width={MINIMAP_WIDTH} height={height} className="block" style={{ opacity: 0.92 }}>
        <rect x={0} y={(scene.cursor.line - 1) * 2} width={MINIMAP_WIDTH} height={2} fill={theme.ui.accent} fillOpacity={0.22} />
        {rects}
      </svg>
    </div>
  );
}


/* ------------------------------------------------------------------ *
 * The bottom dock
 * ------------------------------------------------------------------ */

const PANEL_TABS = [
  { name: 'Output', Icon: TerminalSquare, active: true, badge: '•', tone: 'var(--c-accent)' },
  { name: 'Terminal', Icon: SquareTerminal, badge: '2', tone: 'var(--c-success)' },
  { name: 'Problems', Icon: CircleAlert },
  { name: 'References', Icon: Link2 },
  { name: 'Debug', Icon: Bug },
  { name: 'LSP', Icon: Zap, badge: '3', tone: 'var(--c-success)' },
];

const OUTPUT: { text: string; tone?: string; }[] = [
  { text: '$ npm run build', tone: 'var(--c-text-muted)' },
  { text: '> lumen@0.5.3 build' },
  { text: '> tsc --noEmit && vite build' },
  { text: 'vite v8 building for production…', tone: 'var(--c-text-muted)' },
  { text: '✓ 1842 modules transformed.', tone: 'var(--c-success)' },
  { text: 'dist/assets/index.js   1.92 MB │ gzip: 512 kB', tone: 'var(--c-text-muted)' },
  { text: '✓ built in 6.4s', tone: 'var(--c-success)' },
];

function BottomPanel({ scene }: { scene: Scene; }) {
  return (
    <div className="flex shrink-0 flex-col border-t border-edge bg-surface" style={{ height: PANEL_HEIGHT }}>
      <div className="flex h-8 shrink-0 items-center gap-0.5 px-2">
        {PANEL_TABS.map(({ name, Icon, active, badge, tone }) => (
          <span
            key={name}
            className={[
              'flex h-6 shrink-0 items-center gap-1.5 rounded-lumen-sm px-2 text-[11px] font-semibold tracking-[0.06em] uppercase',
              active ? 'bg-active text-fg' : 'text-subtle',
            ].join(' ')}
          >
            <Icon size={11} />
            {name}
            {badge && <span className="text-[10px] font-normal tracking-normal normal-case" style={{ color: tone }}>{badge}</span>}
          </span>
        ))}
        <span className="flex-1" />
        <ToolButton><ExternalLink size={12} /></ToolButton>
        <ToolButton><Maximize2 size={12} /></ToolButton>
        <ToolButton><X size={13} /></ToolButton>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-3 py-1 text-[12px] leading-[1.7]" style={{ fontFamily: CODE_FONT }} aria-label={scene.workspace}>
        {OUTPUT.map((line) => (
          <div key={line.text} className="whitespace-pre" style={{ color: line.tone ?? 'var(--c-text)' }}>{line.text}</div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * StatusBar
 * ------------------------------------------------------------------ */

function StatusBar({ scene }: { scene: Scene; }) {
  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-edge bg-surface px-3 text-[11px] text-subtle">
      <span className="flex items-center gap-1 rounded px-1">
        <FolderKanban size={10} style={{ color: scene.kind.color }} />
        <span className="max-w-[180px] truncate">{scene.workspace}</span>
        <span className="text-subtle">· {scene.kind.name}</span>
      </span>

      <span className="flex min-w-0 items-center gap-0.5 truncate">
        {scene.breadcrumb.map((node, index) => (
          <span key={node.name} className="flex items-center gap-0.5">
            {index > 0 && <ChevronRight size={9} className="opacity-60" />}
            <span className="font-mono text-[9px] font-bold" style={{ color: `var(--s-${node.tone})` }}>{node.glyph}</span>
            <span className="max-w-[140px] truncate text-muted">{node.name}</span>
          </span>
        ))}
      </span>

      <span className="flex-1" />

      <span className="flex items-center gap-1 rounded px-1 text-ok">
        <Zap size={10} />
        {scene.server.split(/[\s-]/)[0]}
      </span>
      <span className="rounded px-1 tabular-nums">Ln {scene.cursor.line}, Col {scene.cursor.column}</span>
      <span>Spaces: {scene.language.indent}</span>
      <span className="rounded px-1" style={{ color: scene.language.color }}>{scene.language.name}</span>
      <span className="flex items-center gap-1 rounded px-1">
        <Blocks size={10} /> {scene.addons}
      </span>
      <span>{FONT_SIZE}px</span>
    </footer>
  );
}
