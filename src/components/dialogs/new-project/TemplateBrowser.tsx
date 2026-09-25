/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Clock, LayoutGrid, LayoutList, Rows3, Search } from 'lucide-react';
import {
  ALL_CATEGORY, RECENT_CATEGORY, gridStep, type TemplateCategory,
} from '@/core/project/catalog';
import type { LanguageSpec, ProjectTemplate } from '@/core/types';
import { tr, useT } from '@/i18n';
import { Kbd } from '../../ui';
import { TemplateIcon, templateBadges } from './TemplateIcon';

const CARD_MIN_WIDTH = 232;

/** How many cards fit in a row of the grid, tracked as it resizes. */
function useGridColumns(grid: RefObject<HTMLDivElement | null>) {
  const [columns, setColumns] = useState(3);
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) {
      return;
    }
    const measure = () => setColumns(Math.max(1, Math.floor((element.clientWidth + 10) / (CARD_MIN_WIDTH + 10))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [grid]);

  return columns;
}

function CategoryRail({ templates, categories, category, recentCount, onCategory }: {
  templates: ProjectTemplate[];
  categories: TemplateCategory[];
  category: string;
  recentCount: number;
  onCategory: (id: string) => void;
}) {
  const t = useT();
  const railButton = (id: string, label: string, count: number, icon: ReactNode) => (
    <button
      key={id}
      type="button"
      onClick={() => onCategory(id)}
      className={[
        'lm-transition group flex w-full items-center gap-2 rounded-lumen-sm px-2 py-1.5 text-left text-[12.5px]',
        category === id ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
      ].join(' ')}
      aria-pressed={category === id}
    >
      <span className="flex w-4 shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[10.5px] tabular-nums text-subtle">{count}</span>
    </button>
  );

  return (
    <nav className="flex w-[220px] shrink-0 flex-col overflow-y-auto border-r border-edge p-2" aria-label={t('forms.newProject.categories')}>
      {railButton(ALL_CATEGORY, t('forms.newProject.all'), templates.length, <Rows3 size={13} />)}
      {recentCount > 0 && railButton(RECENT_CATEGORY, t('forms.newProject.recent'), recentCount, <Clock size={13} />)}
      <div className="mt-3 mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-subtle">{t('forms.newProject.categories')}</div>
      {categories.map((entry) => railButton(
        entry.id, entry.label, entry.count,
        <span className="font-mono text-[9.5px] font-bold" style={{ color: entry.color }}>{entry.icon ?? '•'}</span>,
      ))}
    </nav>
  );
}

function SearchBar({ searchRef, query, count, layout, onQuery, onLayout, onKeyDown }: {
  searchRef: RefObject<HTMLInputElement | null>;
  query: string;
  count: number;
  layout: 'grid' | 'list';
  onQuery: (text: string) => void;
  onLayout: (layout: 'grid' | 'list') => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
      <div className="flex flex-1 items-center gap-2 rounded-lumen-sm border border-edge bg-input px-2.5 py-1.5 focus-within:border-accent">
        <Search size={13} className="shrink-0 text-subtle" />
        <input
          ref={searchRef}
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('forms.newProject.searchTemplate')}
          spellCheck={false}
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-subtle"
        />
        <span className="shrink-0 text-[10.5px] tabular-nums text-subtle">{count}</span>
      </div>
      <div className="flex rounded-lumen-sm border border-edge p-0.5">
        {(['grid', 'list'] as const).map((mode) => {
          const Icon = mode === 'grid' ? LayoutGrid : LayoutList;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onLayout(mode)}
              title={t(mode === 'grid' ? 'forms.newProject.gridView' : 'forms.newProject.listView')}
              aria-pressed={layout === mode}
              className={`lm-transition rounded px-1.5 py-1 ${layout === mode ? 'bg-active text-fg' : 'text-subtle hover:text-fg'}`}
            >
              <Icon size={13} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HintBar() {
  const t = useT();
  return (
    <div className="flex items-center gap-3 border-t border-edge px-3 py-1.5 text-[10.5px] text-subtle">
      <span className="flex items-center gap-1"><Kbd>↑↓←→</Kbd> {t('forms.newProject.navigateHint')}</span>
      <span className="flex items-center gap-1"><Kbd>↵</Kbd> {t('forms.newProject.chooseHint')}</span>
      <span className="flex items-center gap-1"><Kbd>Esc</Kbd> {t('forms.newProject.closeHint')}</span>
    </div>
  );
}

interface KeysEnv {
  grid: RefObject<HTMLDivElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  visible: ProjectTemplate[];
  index: number;
  cols: number;
  selectedId: string | undefined;
  query: string;
  onSelect: (id: string) => void;
  onChoose: (id: string) => void;
  onQuery: (text: string) => void;
}

/** Arrow keys walk the grid, Enter chooses, typing on the grid searches. */
function useBrowserKeys({ grid, searchRef, visible, index, cols, selectedId, query, onSelect, onChoose, onQuery }: KeysEnv) {
  const focusCard = () => (grid.current?.querySelector('[data-selected="true"]') as HTMLElement | null)?.focus();

  const onGridKey = (event: ReactKeyboardEvent) => {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (visible[index]) {
        onChoose(visible[index].id);
      }
      return;
    }
    const next = gridStep(event.key, index, visible.length, cols);
    if (next !== null) {
      event.preventDefault();
      // Up from the first row goes back to the search.
      if (event.key === 'ArrowUp' && index < cols) {
        searchRef.current?.focus();
        return;
      }
      onSelect(visible[next].id);
      requestAnimationFrame(focusCard);
      return;
    }
    // Typing on the grid searches.
    const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (!printable) {
      return;
    }
    event.preventDefault();
    onQuery(query + event.key);
    searchRef.current?.focus();
  };

  const onSearchKey = (event: ReactKeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!visible.length) {
        return;
      }
      if (!visible.some((entry) => entry.id === selectedId)) {
        onSelect(visible[0].id);
      }
      requestAnimationFrame(focusCard);
      return;
    }
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    const target = visible.find((entry) => entry.id === selectedId) ?? visible[0];
    if (target) {
      onChoose(target.id);
    }
  };

  return { onGridKey, onSearchKey };
}

export function TemplateBrowser({
  templates, visible, categories, category, onCategory, recentCount, query, onQuery,
  selectedId, onSelect, onChoose, layout, onLayout, languages, searchRef,
}: {
  templates: ProjectTemplate[];
  visible: ProjectTemplate[];
  categories: TemplateCategory[];
  category: string;
  onCategory: (id: string) => void;
  recentCount: number;
  query: string;
  onQuery: (text: string) => void;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onChoose: (id: string) => void;
  layout: 'grid' | 'list';
  onLayout: (layout: 'grid' | 'list') => void;
  languages: LanguageSpec[];
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const t = useT();
  const grid = useRef<HTMLDivElement>(null);
  const columns = useGridColumns(grid);
  const cols = layout === 'list' ? 1 : columns;
  const index = Math.max(0, visible.findIndex((entry) => entry.id === selectedId));

  // Keep the selection on screen while the arrows walk the grid.
  useEffect(() => {
    grid.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, layout]);

  const { onGridKey, onSearchKey } = useBrowserKeys({
    grid, searchRef, visible, index, cols, selectedId, query, onSelect, onChoose, onQuery,
  });

  return (
    <div className="flex min-h-0 flex-1">
      <CategoryRail
        templates={templates}
        categories={categories}
        category={category}
        recentCount={recentCount}
        onCategory={onCategory}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <SearchBar
          searchRef={searchRef}
          query={query}
          count={visible.length}
          layout={layout}
          onQuery={onQuery}
          onLayout={onLayout}
          onKeyDown={onSearchKey}
        />

        <div
          ref={grid}
          role="listbox"
          aria-label={t('forms.newProject.title')}
          onKeyDown={onGridKey}
          className="min-h-0 flex-1 overflow-y-auto p-3"
        >
          <div key={`${category}|${layout}`} className="lm-stagger grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {visible.map((entry) => (
              <TemplateCard
                key={entry.id}
                template={entry}
                languages={languages}
                selected={entry.id === selectedId}
                compact={layout === 'list'}
                onSelect={() => onSelect(entry.id)}
                onChoose={() => onChoose(entry.id)}
              />
            ))}
          </div>
          {visible.length === 0 && (
            <p className="lm-anim-fade p-8 text-center text-[12.5px] text-subtle">
              {t(templates.length ? 'forms.newProject.noMatch' : 'forms.newProject.noTemplates')}
            </p>
          )}
        </div>
        <HintBar />
      </div>
    </div>
  );
}

function TemplateCard({ template, languages, selected, compact, onSelect, onChoose }: {
  template: ProjectTemplate;
  languages: LanguageSpec[];
  selected: boolean;
  compact: boolean;
  onSelect: () => void;
  onChoose: () => void;
}) {
  const badges = templateBadges(template, languages);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onDoubleClick={onChoose}
      className={[
        'lm-transition lm-lift flex min-w-0 gap-3 rounded-lumen border text-left outline-none',
        compact ? 'items-center px-3 py-2' : 'items-start px-3 py-3',
        selected
          ? 'border-accent bg-accent/10 shadow-[0_0_0_1px_var(--c-accent)]'
          : 'border-edge bg-surface/50 hover:border-edge-strong hover:bg-hover',
      ].join(' ')}
    >
      <TemplateIcon template={template} languages={languages} size={compact ? 28 : 34} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-fg">{tr(template.name)}</span>
          {compact && badges.map((badge) => <Badge key={badge} text={badge} />)}
        </span>
        {template.description && (
          <span className={`mt-0.5 text-[11.5px] leading-snug text-subtle ${compact ? 'block truncate' : 'line-clamp-2'}`}>
            {tr(template.description)}
          </span>
        )}
        {!compact && badges.length > 0 && (
          <span className="mt-2 flex flex-wrap gap-1">
            {badges.map((badge) => <Badge key={badge} text={badge} />)}
          </span>
        )}
      </span>
    </button>
  );
}

export function Badge({ text }: { text: string; }) {
  return <span className="shrink-0 rounded border border-edge bg-input px-1.5 py-px font-mono text-[10px] text-muted">{text}</span>;
}
