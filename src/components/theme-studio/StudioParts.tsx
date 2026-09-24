/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, type ComponentProps } from 'react';
import {
  Check, Contrast, Download, FlipHorizontal2, Moon, Palette, Redo2, RotateCcw, Save, Search, Sun, Trash2,
  Undo2, X,
} from 'lucide-react';
import { useT } from '@/i18n';
import { syntaxMinContrast, UI_MIN_CONTRAST } from '@/core/theme-colors';
import type { Theme, TokenKind, UIColorKey } from '@/core/types';
import { Button, Kbd } from '../ui';
import { ColorField, StyleToggle } from './ColorField';
import { ContrastTools, PaletteTools } from './tools';
import type { ThemeHistory } from './history';
import {
  colorOf, CONTRAST_AGAINST, splitKey, SYNTAX_GROUPS, syntaxStyle, TOKEN_SAMPLE, UI_GROUPS, withSyntaxStyle, type ColorKey,
} from './keys';

/* The presentational pieces of the Studio dialog; ThemeStudio keeps the state. */

export type Tab = 'ui' | 'syntax' | 'contrast' | 'palette';
export type Confirm = 'discard' | 'delete' | null;

export const TABS: { id: Tab; icon?: typeof Palette; }[] = [
  { id: 'ui' },
  { id: 'syntax' },
  { id: 'contrast', icon: Contrast },
  { id: 'palette', icon: Palette },
];

/** Shortcuts that belong to a text field while typing in it, such as undo. */
const isTextInput = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) {
    return false;
  }
  if (el.tagName === 'TEXTAREA') {
    return true;
  }
  return el.tagName === 'INPUT' && ['text', 'search', ''].includes((el as HTMLInputElement).type);
};

/* ------------------------------------------------------------------ *
 * Keyboard
 * ------------------------------------------------------------------ */

export interface ShortcutActions {
  confirm: Confirm;
  history: ThemeHistory;
  clearConfirm(): void;
  requestDiscard(): void;
  discard(): void;
  remove(): void;
  save(): void;
  saveKeepOpen(): void;
}

/** Studio shortcuts, captured before anything underneath the dialog sees them. */
export function useStudioShortcuts(active: boolean, actions: ShortcutActions) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (event: KeyboardEvent) => handleStudioKey(event, actions);
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
}

function handleStudioKey(event: KeyboardEvent, actions: ShortcutActions) {
  const { confirm, history } = actions;
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (confirm) {
      actions.clearConfirm();
      return;
    }
    actions.requestDiscard();
    return;
  }
  if (confirm && event.key === 'Enter') {
    event.preventDefault();
    if (confirm === 'discard') {
      actions.discard();
    }
    if (confirm === 'delete') {
      actions.remove();
    }
    return;
  }
  if (mod && event.key === 'Enter') {
    event.preventDefault();
    actions.save();
    return;
  }
  if (mod && key === 's') {
    event.preventDefault();
    actions.saveKeepOpen();
    return;
  }
  if (!mod || isTextInput(event.target)) {
    return;
  }
  const redo = (key === 'z' && event.shiftKey) || key === 'y';
  if (redo) {
    event.preventDefault();
    history.redo();
    return;
  }
  if (key === 'z') {
    event.preventDefault();
    history.undo();
  }
}

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

export function StudioHeader({
  draft, base, history, dirty, canDelete, invertOnSwitch, onSwitchType, onToggleInvert, onExport, onSaveKeepOpen,
  onDelete, onDiscard, onDone,
}: {
  draft: Theme;
  base: Theme;
  history: ThemeHistory;
  dirty: boolean;
  canDelete: boolean;
  invertOnSwitch: boolean;
  onSwitchType(type: Theme['type']): void;
  onToggleInvert(): void;
  onExport(): void;
  onSaveKeepOpen(): void;
  onDelete(): void;
  onDiscard(): void;
  onDone(): void;
}) {
  const t = useT();
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge px-4 py-2.5">
      <Palette size={16} className="shrink-0 text-accent" />
      <input
        value={draft.name}
        onChange={(e) => history.change({ ...draft, name: e.target.value }, 'name')}
        placeholder={t('themeStudio.studio.namePlaceholder')}
        aria-label={t('themeStudio.studio.namePlaceholder')}
        className="lm-transition min-w-[160px] flex-1 rounded-lumen-sm border border-transparent bg-transparent px-2 py-1 text-[15px] font-medium outline-none hover:border-edge focus:border-accent"
      />
      {dirty && <span className="lm-anim-fade shrink-0 rounded-full bg-warn/15 px-2 py-0.5 text-[10.5px] text-warn">{t('themeStudio.studio.unsaved')}</span>}

      <div className="flex shrink-0 items-center rounded-lumen-sm border border-edge p-0.5">
        {(['dark', 'light'] as const).map((type) => (
          <button
            key={type}
            onClick={() => onSwitchType(type)}
            className={[
              'lm-transition flex h-6 items-center gap-1 rounded-[4px] px-2 text-[11.5px]',
              draft.type === type ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-hover',
            ].join(' ')}
          >
            {type === 'dark' ? <Moon size={11} /> : <Sun size={11} />}
            {t(`common.${type}`)}
          </button>
        ))}
      </div>
      <InvertSwitch on={invertOnSwitch} onToggle={onToggleInvert} />

      <span className="mx-1 h-5 w-px bg-edge" />

      <Button size="sm" title={`${t('themeStudio.studio.undo')} (Ctrl+Z)`} disabled={!history.canUndo} onClick={() => history.undo()}>
        <Undo2 size={13} />
      </Button>
      <Button size="sm" title={`${t('themeStudio.studio.redo')} (Ctrl+Shift+Z)`} disabled={!history.canRedo} onClick={() => history.redo()}>
        <Redo2 size={13} />
      </Button>
      <Button size="sm" title={t('themeStudio.studio.resetAll')} disabled={!dirty} onClick={() => history.change(structuredClone(base), 'reset-all')}>
        <RotateCcw size={12} />
      </Button>
      <Button size="sm" title={t('themeStudio.studio.export')} onClick={onExport}>
        <Download size={12} />
      </Button>
      <Button size="sm" title={`${t('themeStudio.studio.saveKeepOpen')} (Ctrl+S)`} disabled={!dirty} onClick={onSaveKeepOpen}>
        <Save size={12} />
      </Button>
      {canDelete && (
        <Button size="sm" variant="danger" title={t('themeStudio.studio.delete')} onClick={onDelete}>
          <Trash2 size={12} />
        </Button>
      )}

      <Button size="sm" variant="outline" onClick={onDiscard}>
        <X size={12} /> {t('common.discard')}
      </Button>
      <Button size="sm" variant="solid" onClick={onDone}>
        <Check size={12} /> {t('common.done')}
      </Button>
    </header>
  );
}

function InvertSwitch({ on, onToggle }: { on: boolean; onToggle(): void; }) {
  const t = useT();
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      title={t('themeStudio.studio.invertHint')}
      className={[
        'lm-transition flex h-7 shrink-0 items-center gap-1.5 rounded-lumen-sm border px-2 text-[11.5px]',
        on ? 'border-accent/60 text-fg' : 'border-edge text-subtle hover:text-fg',
      ].join(' ')}
    >
      <FlipHorizontal2 size={12} className={on ? 'text-accent' : ''} />
      {t('themeStudio.studio.invert')}
      <span className={`lm-transition relative h-3 w-5 rounded-full ${on ? 'bg-accent' : 'bg-active'}`}>
        <span className="lm-transition absolute top-[2px] size-2 rounded-full bg-white" style={{ left: on ? 10 : 2 }} />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Sidebar
 * ------------------------------------------------------------------ */

export function StudioTabs({ tab, onTab }: { tab: Tab; onTab(tab: Tab): void; }) {
  const t = useT();
  return (
    <div className="flex shrink-0 gap-0.5 border-b border-edge p-1.5">
      {TABS.map(({ id, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onTab(id)}
          className={[
            'lm-transition flex flex-1 items-center justify-center gap-1 rounded-lumen-sm px-2 py-1 text-[12px]',
            tab === id ? 'bg-active text-fg' : 'text-muted hover:bg-hover',
          ].join(' ')}
        >
          {Icon && <Icon size={11} />}
          {t(`themeStudio.tabs.${id}`)}
        </button>
      ))}
    </div>
  );
}

export function ColorSearch({ query, onQuery }: { query: string; onQuery(query: string): void; }) {
  const t = useT();
  return (
    <label className="lm-transition mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-lumen-sm border border-edge bg-input px-2 py-1 focus-within:border-accent">
      <Search size={12} className="shrink-0 text-subtle" />
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={t('themeStudio.studio.searchColors')}
        className="w-full bg-transparent text-[12px] outline-none placeholder:text-subtle"
      />
      {query && (
        <button onClick={() => onQuery('')} className="text-subtle hover:text-fg" aria-label={t('common.close')}>
          <X size={11} />
        </button>
      )}
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Colour lists
 * ------------------------------------------------------------------ */

type FieldProps = Omit<ComponentProps<typeof ColorField>, 'contrast' | 'extra'>;

interface ListProps {
  draft: Theme;
  base: Theme;
  history: ThemeHistory;
  matches(key: ColorKey): boolean;
  fieldProps(key: ColorKey): FieldProps;
  onReset(keys: ColorKey[]): void;
}

const uiKeysOf = (group: (typeof UI_GROUPS)[number], matches: ListProps['matches']) =>
  group.keys.map((k) => `ui:${k}` as ColorKey).filter(matches);
const syntaxKeysOf = (group: (typeof SYNTAX_GROUPS)[number], matches: ListProps['matches']) =>
  group.kinds.map((k) => `syntax:${k}` as ColorKey).filter(matches);

/** Does the search leave nothing on this tab? */
export function listIsEmpty(tab: 'ui' | 'syntax', matches: ListProps['matches']): boolean {
  if (tab === 'ui') {
    return UI_GROUPS.every((group) => uiKeysOf(group, matches).length === 0);
  }
  return SYNTAX_GROUPS.every((group) => syntaxKeysOf(group, matches).length === 0);
}

function GroupHeader({ title, hint, keys, draft, base, onReset }: {
  title: string;
  hint: string;
  keys: ColorKey[];
  draft: Theme;
  base: Theme;
  onReset(keys: ColorKey[]): void;
}) {
  const t = useT();
  const changed = keys.some((key) => colorOf(draft, key) !== colorOf(base, key));
  return (
    <div className="mb-1 flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <h4 className="text-[10.5px] font-semibold tracking-[0.09em] text-subtle uppercase">{title}</h4>
        <p className="text-[11px] text-subtle">{hint}</p>
      </div>
      {changed && (
        <button
          onClick={() => onReset(keys)}
          title={t('themeStudio.studio.resetGroup')}
          className="lm-transition lm-anim-fade flex h-5 shrink-0 items-center gap-1 rounded-[4px] px-1.5 text-[10.5px] text-muted hover:bg-hover hover:text-fg"
        >
          <RotateCcw size={10} /> {t('common.reset')}
        </button>
      )}
    </div>
  );
}

export function UiColorList(props: ListProps) {
  const t = useT();
  const { draft, matches, fieldProps } = props;
  return (
    <>
      {UI_GROUPS.map((group) => {
        const keys = uiKeysOf(group, matches);
        if (!keys.length) {
          return null;
        }
        return (
          <section key={group.id} className="mb-3">
            <GroupHeader
              title={t(`themeStudio.groups.${group.id}`)}
              hint={t(`themeStudio.groups.${group.id}Hint`)}
              keys={keys}
              draft={draft}
              base={props.base}
              onReset={props.onReset}
            />
            {keys.map((key) => {
              const name = splitKey(key)[1] as UIColorKey;
              const against = CONTRAST_AGAINST[name];
              const contrast = against ? { against: draft.ui[against], min: UI_MIN_CONTRAST[name] ?? 4.5 } : undefined;
              return <ColorField key={key} {...fieldProps(key)} contrast={contrast} />;
            })}
          </section>
        );
      })}
    </>
  );
}

export function SyntaxColorList(props: ListProps) {
  const t = useT();
  const { draft, matches, fieldProps } = props;
  return (
    <>
      {SYNTAX_GROUPS.map((group) => {
        const keys = syntaxKeysOf(group, matches);
        if (!keys.length) {
          return null;
        }
        return (
          <section key={group.id} className="mb-3">
            <GroupHeader
              title={t(`themeStudio.syntaxGroups.${group.id}`)}
              hint={t(`themeStudio.syntaxGroups.${group.id}Hint`)}
              keys={keys}
              draft={draft}
              base={props.base}
              onReset={props.onReset}
            />
            {keys.map((key) => {
              const kind = splitKey(key)[1] as TokenKind;
              return (
                <ColorField
                  key={key}
                  {...fieldProps(key)}
                  contrast={{ against: draft.ui.bg, min: syntaxMinContrast(kind) }}
                  extra={<SyntaxStyleControls draft={draft} kind={kind} history={props.history} />}
                />
              );
            })}
          </section>
        );
      })}
    </>
  );
}

/** The sample chip and the italic / bold / underline toggles beside a syntax colour. */
function SyntaxStyleControls({ draft, kind, history }: { draft: Theme; kind: TokenKind; history: ThemeHistory; }) {
  const t = useT();
  const style = syntaxStyle(draft, kind);
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <span
        className="mr-1 max-w-[70px] truncate rounded-[3px] px-1 font-mono text-[10.5px]"
        style={{
          background: draft.ui.bg,
          color: style.color,
          fontStyle: style.italic ? 'italic' : undefined,
          fontWeight: style.bold ? 600 : undefined,
          textDecoration: style.underline ? 'underline' : undefined,
        }}
      >
        {TOKEN_SAMPLE[kind]}
      </span>
      <StyleToggle active={!!style.italic} title={t('themeStudio.studio.italic')} onClick={() => history.change(withSyntaxStyle(draft, kind, { italic: !style.italic }))}>
        <em>I</em>
      </StyleToggle>
      <StyleToggle active={!!style.bold} title={t('themeStudio.studio.bold')} onClick={() => history.change(withSyntaxStyle(draft, kind, { bold: !style.bold }))}>
        <strong>B</strong>
      </StyleToggle>
      <StyleToggle active={!!style.underline} title={t('themeStudio.studio.underline')} onClick={() => history.change(withSyntaxStyle(draft, kind, { underline: !style.underline }))}>
        <u>U</u>
      </StyleToggle>
    </span>
  );
}

export function StudioSidebar({ tab, onTab, query, onQuery, labelOf, onSelect, ...list }: ListProps & {
  tab: Tab;
  onTab(tab: Tab): void;
  query: string;
  onQuery(query: string): void;
  labelOf(key: ColorKey): string;
  onSelect(key: ColorKey): void;
}) {
  const t = useT();
  const { draft, history } = list;
  const emptySearch = (tab === 'ui' || tab === 'syntax') && listIsEmpty(tab, list.matches);
  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-r border-edge">
      <StudioTabs tab={tab} onTab={onTab} />
      {(tab === 'ui' || tab === 'syntax') && <ColorSearch query={query} onQuery={onQuery} />}

      <div key={tab} className="lm-anim-fade min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {tab === 'ui' && <UiColorList {...list} />}
        {tab === 'syntax' && <SyntaxColorList {...list} />}
        {emptySearch && <p className="px-2 py-6 text-center text-[12px] text-subtle">{t('common.nothingFound')}</p>}
        {tab === 'contrast' && (
          <ContrastTools draft={draft} change={history.change} labelOf={labelOf} onSelect={onSelect} />
        )}
        {tab === 'palette' && <PaletteTools draft={draft} change={history.change} />}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ *
 * Footer and confirmation
 * ------------------------------------------------------------------ */

export function StudioFooter() {
  const t = useT();
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-edge px-4 py-1.5 text-[11px] text-subtle">
      <span><Kbd>Esc</Kbd> {t('common.discard')}</span>
      <span><Kbd>Ctrl+Enter</Kbd> {t('common.done')}</span>
      <span><Kbd>Ctrl+S</Kbd> {t('themeStudio.studio.saveKeepOpen')}</span>
      <span><Kbd>Ctrl+Z</Kbd> / <Kbd>Ctrl+Shift+Z</Kbd> {t('themeStudio.studio.undoRedo')}</span>
      <span className="flex-1" />
      <span className="truncate">{t('themeStudio.studio.liveHint')}</span>
    </footer>
  );
}

export function ConfirmOverlay({ confirm, name, onCancel, onDiscard, onDelete }: {
  confirm: 'discard' | 'delete';
  name: string;
  onCancel(): void;
  onDiscard(): void;
  onDelete(): void;
}) {
  const t = useT();
  return (
    <div className="lm-anim-fade absolute inset-0 z-20 flex items-center justify-center bg-black/35" onMouseDown={(e) => { if (e.target === e.currentTarget) {
      onCancel();
    } }}>
      <div className="lm-glass lm-shadow lm-anim-pop w-[380px] rounded-lumen-lg border border-edge p-4">
        <h3 className="text-[14px] font-medium text-fg">
          {confirm === 'discard' ? t('themeStudio.studio.discardTitle') : t('common.confirmDelete', { name })}
        </h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
          {confirm === 'discard' ? t('themeStudio.studio.discardBody') : t('themeStudio.studio.deleteBody')}
        </p>
        <div className="mt-4 flex justify-end gap-1.5">
          <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={confirm === 'discard' ? onDiscard : onDelete}>
            {confirm === 'discard' ? t('common.discard') : t('common.delete')}
          </Button>
        </div>
      </div>
    </div>
  );
}
