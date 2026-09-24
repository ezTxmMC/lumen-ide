/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Code2, Palette, Plus, Shapes, Sparkles, SwatchBook, Upload } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { registry } from '@/core/registry';
import type { Theme } from '@/core/types';
import { Button, Empty } from '../ui';
import { DialogShell } from './DialogShell';
import { ThemeCard } from '../theme-studio/ThemeCard';
import { EffectsSection } from '../theme-studio/EffectsSection';
import { CssSection } from '../theme-studio/CssSection';
import { IconPacksSection } from '../icon-studio/IconPacksSection';

type Section = 'themes' | 'icons' | 'effects' | 'css';
type Filter = 'all' | 'dark' | 'light' | 'custom';

const SECTIONS: Section[] = ['themes', 'icons', 'effects', 'css'];
const FILTERS: Filter[] = ['all', 'dark', 'light', 'custom'];

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown; };

/** Switches the theme with a soft cross-fade, when animations are on and the browser can. */
function activateSmoothly(apply: () => void, animations: boolean) {
  const doc = document as TransitionDocument;
  if (!animations || typeof doc.startViewTransition !== 'function') {
    apply();
    return;
  }
  doc.startViewTransition(() => flushSync(apply));
}

function ThemeToolbar({ filter, themes, matchesFilter, onFilter, onImport, onNew }: {
  filter: Filter;
  themes: Theme[];
  matchesFilter: Record<Filter, (theme: Theme) => boolean>;
  onFilter: (filter: Filter) => void;
  onImport: () => void;
  onNew: () => void;
}) {
  const t = useT();
  return (
  <div className="mb-3 flex flex-wrap items-center gap-2">
    <div className="flex items-center gap-0.5 rounded-lumen-sm border border-edge p-0.5" role="tablist">
      {FILTERS.map((id) => {
        const count = themes.filter(matchesFilter[id]).length;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            onClick={() => onFilter(id)}
            className={[
              'lm-transition flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 text-[12px]',
              filter === id ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-hover hover:text-fg',
            ].join(' ')}
          >
            {t(`themeStudio.dialog.filter.${id}`)}
            <span className="font-mono text-[10px] opacity-70">{count}</span>
          </button>
        );
      })}
    </div>
    <span className="flex-1" />
    <Button size="sm" variant="outline" onClick={() => onImport()}>
      <Upload size={12} /> {t('common.import')}
    </Button>
    <Button size="sm" variant="solid" onClick={() => onNew()}>
      <Plus size={12} /> {t('themeStudio.dialog.newTheme')}
    </Button>
  </div>
  );
}

function NewThemeCard({ onNew }: { onNew: () => void; }) {
  const t = useT();
  return (
    <button
      onClick={onNew}
      className="lm-transition lm-anim-up flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lumen border border-dashed border-edge text-[12.5px] text-subtle hover:border-accent hover:text-fg"
    >
      <Plus size={20} />
      {t('themeStudio.dialog.newTheme')}
      <span className="px-6 text-center text-[11px] text-subtle">{t('themeStudio.dialog.newThemeHint')}</span>
    </button>
  );
}

function ThemesSection({ query }: { query: string; }) {
  const t = useT();
  const themeId = useStore((s) => s.themeId);
  const setTheme = useStore((s) => s.setTheme);
  const effects = useStore((s) => s.effects);
  const registryVersion = useStore((s) => s.registryVersion);
  const customThemes = useStore((s) => s.customThemes);
  const openStudio = useStore((s) => s.openThemeStudio);
  const duplicateTheme = useStore((s) => s.duplicateTheme);
  const deleteTheme = useStore((s) => s.deleteCustomTheme);
  const importTheme = useStore((s) => s.importTheme);
  const exportTheme = useStore((s) => s.exportTheme);
  const [filter, setFilter] = useState<Filter>('all');

  const themes = useMemo(() => registry.themes(), [registryVersion]);
  const customIds = useMemo(() => new Set(customThemes.map((theme) => theme.id)), [customThemes]);

  const matchesFilter: Record<Filter, (theme: Theme) => boolean> = {
    all: () => true,
    dark: (theme) => theme.type === 'dark',
    light: (theme) => theme.type === 'light',
    custom: (theme) => customIds.has(theme.id),
  };
  const needle = query.trim().toLowerCase();
  const visible = themes
    .filter(matchesFilter[filter])
    .filter((theme) => !needle || `${theme.name} ${theme.author ?? ''} ${theme.id}`.toLowerCase().includes(needle));

  return (
    <div className="px-4 py-3">
      <ThemeToolbar
        filter={filter}
        themes={themes}
        matchesFilter={matchesFilter}
        onFilter={setFilter}
        onImport={() => void importTheme()}
        onNew={() => openStudio()}
      />

      {visible.length === 0 && needle && (
        <Empty
          icon={<SwatchBook size={28} />}
          title={t('common.nothingFound')}
        />
      )}

      <div key={filter} className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
        {visible.map((theme, index) => {
          const custom = customIds.has(theme.id);
          return (
            <ThemeCard
              key={theme.id}
              theme={theme}
              index={index}
              active={theme.id === themeId}
              custom={custom}
              onSelect={() => {
                if (theme.id === themeId) {
                  return;
                }
                activateSmoothly(() => setTheme(theme.id), effects.animations);
              }}
              onEdit={() => openStudio(theme.id)}
              onDuplicate={() => {
                const id = duplicateTheme(theme.id);
                if (id) {
                  openStudio(id);
                }
              }}
              onExport={() => void exportTheme(theme.id)}
              onDelete={() => deleteTheme(theme.id)}
            />
          );
        })}

        <NewThemeCard onNew={() => openStudio()} />
      </div>
    </div>
  );
}

/** Themes & effects: the theme gallery, icon packs, effects with a live demo, and custom CSS. */
export function ThemesDialog() {
  const t = useT();
  const dialogSection = useStore((s) => s.dialogSection);
  const openDialog = useStore((s) => s.openDialog);
  const customCount = useStore((s) => s.customThemes.length);
  const customIconCount = useStore((s) => s.customIconPacks.length);
  const hasCss = useStore((s) => Boolean(s.effects.customCss.trim()));
  const [query, setQuery] = useState('');

  const section: Section = SECTIONS.includes(dialogSection as Section) ? (dialogSection as Section) : 'themes';
  const icons: Record<Section, typeof Palette> = { themes: SwatchBook, icons: Shapes, effects: Sparkles, css: Code2 };
  const badges: Record<Section, string | undefined> = {
    themes: customCount ? String(customCount) : undefined,
    icons: customIconCount ? String(customIconCount) : undefined,
    effects: undefined,
    css: hasCss ? '●' : undefined,
  };

  const SEARCH_PLACEHOLDER: Record<Section, string> = {
    themes: t('themeStudio.dialog.searchThemes'),
    icons: t('iconPacks.dialog.search'),
    effects: t('themeStudio.dialog.searchEffects'),
    css: '',
  };

  return (
    <DialogShell
      id="themes"
      title={t('themeStudio.dialog.title')}
      icon={Palette}
      wide
      sections={SECTIONS.map((id) => ({ id, label: t(`themeStudio.dialog.sections.${id}`), icon: icons[id], badge: badges[id] }))}
      section={section}
      onSection={(id) => {
        setQuery('');
        openDialog('themes', id);
      }}
      search={section === 'css' ? undefined : query}
      onSearch={section === 'css' ? undefined : setQuery}
      searchPlaceholder={SEARCH_PLACEHOLDER[section]}
    >
      {section === 'themes' && <ThemesSection query={query} />}
      {section === 'icons' && <IconPacksSection query={query} />}
      {section === 'effects' && <EffectsSection query={query} />}
      {section === 'css' && <CssSection />}
    </DialogShell>
  );
}
