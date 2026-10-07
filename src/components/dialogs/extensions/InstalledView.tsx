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
 * “Installed”: every add-on that is present — built in, from an extension
 * server, or built by hand — by category, with switches and a detail area
 * (languages, language servers, project kinds, templates, commands, themes).
 * Extensions can be updated and removed here, hand-made add-ons edited,
 * duplicated, exported and deleted.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Blocks } from 'lucide-react';
import { useStore } from '@/state/store';
import { registry } from '@/core/registry';
import { useT } from '@/i18n';
import { userAddons } from '@/core/user-addons/manager';
import { extensions } from '@/core/extensions/manager';
import type { AvailableUpdate } from '@/core/extensions/catalog';
import { Empty } from '../../ui';
import { type Filter, type State, matchesFilter, matchesState, FilterBar, StateBar } from './InstalledFilters';
import { AddonGroups } from './AddonCards';
import { AddonDetails, LoadProblems } from './AddonDetails';

export function InstalledView({ query, initialFilter, updates }: {
  query: string;
  initialFilter?: string | null;
  updates: AvailableUpdate[];
}) {
  const t = useT();
  const registryVersion = useStore((s) => s.registryVersion);
  const openStudio = useStore((s) => s.openAddonStudio);
  useSyncExternalStore(userAddons.subscribe, userAddons.getVersion);
  useSyncExternalStore(extensions.subscribe, extensions.getVersion);

  const [filter, setFilter] = useState<Filter>('all');
  const [state, setState] = useState<State>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (initialFilter && initialFilter in matchesFilter) {
      setFilter(initialFilter as Filter);
    }
  }, [initialFilter]);

  const addons = useMemo(() => registry.all().filter((addon) => !addon.hidden), [registryVersion]);
  const updateIds = useMemo(() => new Set(updates.map((update) => update.id)), [updates]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return addons.filter((addon) => matchesFilter[filter](addon, updateIds)).filter((addon) => matchesState[state](addon)).filter((a) => {
      if (!needle) {
        return true;
      }
      return (
        a.name.toLowerCase().includes(needle)
        || a.id.toLowerCase().includes(needle)
        || (a.description ?? '').toLowerCase().includes(needle)
        || (a.languages ?? []).some((l) => l.name.toLowerCase().includes(needle) || l.extensions.some((e) => e.includes(needle)))
      );
    });
  }, [addons, filter, state, query, updateIds, registryVersion]);

  const selected = filtered.find((a) => a.id === selectedId) ?? filtered[0] ?? null;
  const activeCount = addons.filter((a) => registry.isActive(a.id)).length;

  const importAddon = async () => {
    const model = await userAddons.importFile();
    if (!model) {
      return;
    }
    setFilter('user');
    setSelectedId(model.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FilterBar
        filter={filter}
        addons={addons}
        updateIds={updateIds}
        onFilter={setFilter}
        onImport={() => void importAddon()}
        onOpenStudio={openStudio}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[380px] shrink-0 flex-col border-r border-edge">
          <StateBar state={state} addons={addons} onState={setState} />
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filtered.length === 0 && (
              <Empty
                icon={<Blocks size={24} strokeWidth={1.4} />}
                title={t('common.nothingFound')}
                hint={filter === 'user' ? t('addonStudio.dialog.userEmpty') : undefined}
              />
            )}
            {filter === 'user' && <LoadProblems />}
            <AddonGroups addons={filtered} selectedId={selected?.id ?? null} updateIds={updateIds} onSelect={setSelectedId} />
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto">
          {selected && (
            <AddonDetails
              key={selected.id}
              addon={selected}
              update={updates.find((entry) => entry.id === selected.id)}
              onSelect={setSelectedId}
            />
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-edge px-4 py-2">
        <span className="text-[11.5px] text-subtle">{t('addonStudio.dialog.activeCount', { active: activeCount, total: addons.length })}</span>
        <span className="flex-1" />
        <span className="text-[11.5px] text-subtle">{t('addonStudio.dialog.footerHint')}</span>
      </footer>
    </div>
  );
}
