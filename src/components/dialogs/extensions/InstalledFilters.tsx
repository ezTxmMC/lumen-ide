/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { Blocks, Code2, Hammer, Package, Palette, Plus, RefreshCw, Upload, User, Wrench } from 'lucide-react';
import { registry } from '@/core/registry';
import { useT } from '@/i18n';
import { extensions } from '@/core/extensions/manager';
import type { Addon } from '@/core/types';
import { Button } from '../../ui';

export type Filter = 'all' | 'language' | 'theme' | 'tool' | 'extension' | 'user' | 'updates';

export type State = 'all' | 'on' | 'off';

type Group = 'server' | 'user' | 'builtin';

const FILTER_ICONS: Record<Filter, typeof Blocks> = {
  all: Blocks,
  language: Code2,
  theme: Palette,
  tool: Wrench,
  extension: Package,
  user: User,
  updates: RefreshCw,
};

/** An add-on's category — stated, or inferred from its contents. */
function categoryOf(addon: Addon): 'language' | 'theme' | 'tool' {
  if (addon.category) {
    return addon.category;
  }
  if (addon.languages?.length) {
    return 'language';
  }
  if (addon.themes?.length && !addon.commands?.length) {
    return 'theme';
  }
  return 'tool';
}

export const matchesFilter: Record<Filter, (addon: Addon, updateIds: Set<string>) => boolean> = {
  all: () => true,
  language: (addon) => categoryOf(addon) === 'language',
  theme: (addon) => categoryOf(addon) === 'theme',
  tool: (addon) => categoryOf(addon) === 'tool',
  extension: (addon) => extensions.has(addon.id),
  user: (addon) => Boolean(addon.user) && !extensions.has(addon.id),
  updates: (addon, updateIds) => updateIds.has(addon.id),
};

export const matchesState: Record<State, (addon: Addon) => boolean> = {
  all: () => true,
  on: (addon) => registry.isActive(addon.id),
  off: (addon) => !registry.isActive(addon.id),
};

/** Where an add-on came from: a server, the user's own folder, or Lumen itself. */
export function groupOf(addon: Addon): Group {
  if (extensions.has(addon.id)) {
    return 'server';
  }
  return addon.user ? 'user' : 'builtin';
}

export const GROUPS: { id: Group; label: string; }[] = [
  { id: 'server', label: 'extensions.groupServer' },
  { id: 'user', label: 'extensions.groupUser' },
  { id: 'builtin', label: 'extensions.groupBuiltin' },
];

export function FilterBar({ filter, addons, updateIds, onFilter, onImport, onOpenStudio }: {
  filter: Filter;
  addons: Addon[];
  updateIds: Set<string>;
  onFilter: (id: Filter) => void;
  onImport: () => void;
  onOpenStudio: (id: string | null, starter?: 'toolkit') => void;
}) {
  const t = useT();
  const filterLabel = (id: Filter) => {
    if (id === 'extension') {
      return t('extensions.extensionBadge');
    }
    if (id === 'updates') {
      return t('extensions.updates');
    }
    return t(`addonStudio.dialog.nav.${id}`);
  };
  const ids = (Object.keys(matchesFilter) as Filter[]).filter((id) => id !== 'updates' || updateIds.size > 0);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-edge px-3 py-2">
      {ids.map((id) => {
        const FilterIcon = FILTER_ICONS[id];
        return (
          <button
            key={id}
            onClick={() => onFilter(id)}
            className={[
              'lm-transition flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px]',
              id === filter ? 'border-accent bg-active text-fg' : 'border-edge text-muted hover:border-edge-strong',
            ].join(' ')}
          >
            <FilterIcon size={11} />
            {filterLabel(id)}
            <span className="font-mono text-[10px] text-subtle">{addons.filter((addon) => matchesFilter[id](addon, updateIds)).length}</span>
          </button>
        );
      })}
      <span className="flex-1" />
      <Button size="sm" variant="outline" onClick={() => onImport()} title={t('addonStudio.dialog.importHint')}>
        <Upload size={12} /> {t('common.import')}
      </Button>
      <Button size="sm" variant="outline" onClick={() => onOpenStudio(null, 'toolkit')} title={t('studioProject.starter.hint')}>
        <Hammer size={12} /> {t('studioProject.starter.button')}
      </Button>
      <Button size="sm" variant="solid" onClick={() => onOpenStudio(null)}>
        <Plus size={12} /> {t('addonStudio.dialog.new')}
      </Button>
    </div>
  );
}

/** Enabled / disabled, above the list. */
export function StateBar({ state, addons, onState }: { state: State; addons: Addon[]; onState: (state: State) => void; }) {
  const t = useT();
  const labels: Record<State, string> = { all: t('addonStudio.dialog.nav.all'), on: t('common.enabled'), off: t('common.disabled') };
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-edge px-2 py-1.5">
      {(Object.keys(labels) as State[]).map((id) => (
        <button
          key={id}
          onClick={() => onState(id)}
          className={[
            'lm-transition flex items-center gap-1 rounded-lumen-sm px-2 py-0.5 text-[11.5px]',
            id === state ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
          ].join(' ')}
        >
          {labels[id]}
          <span className="font-mono text-[10px] text-subtle">{addons.filter(matchesState[id]).length}</span>
        </button>
      ))}
    </div>
  );
}
