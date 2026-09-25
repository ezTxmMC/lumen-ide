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
import {
  Blocks, Code2, Copy, Download, FolderOpen, Hammer, Lock, Package, Palette, Pencil, Plus, RefreshCw, Sparkles, Trash2, Upload, User, Wrench, Zap,
} from 'lucide-react';
import { useStore } from '@/state/store';
import { registry } from '@/core/registry';
import { useT } from '@/i18n';
import { userAddons } from '@/core/user-addons/manager';
import { extensions } from '@/core/extensions/manager';
import type { AvailableUpdate } from '@/core/extensions/catalog';
import { hostOf } from '@/core/extensions/trust';
import { installExtension } from '@/core/extensions/flow';
import type { Addon } from '@/core/types';
import { Button, Empty } from '../ui';
import {
  Badge, CommandsSection, DetailSection, KindsSection, LanguagesSection, TemplatesSection, ThemesSection,
} from './AddonSections';

type Filter = 'all' | 'language' | 'theme' | 'tool' | 'extension' | 'user' | 'updates';
type State = 'all' | 'on' | 'off';
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

const matchesFilter: Record<Filter, (addon: Addon, updateIds: Set<string>) => boolean> = {
  all: () => true,
  language: (addon) => categoryOf(addon) === 'language',
  theme: (addon) => categoryOf(addon) === 'theme',
  tool: (addon) => categoryOf(addon) === 'tool',
  extension: (addon) => extensions.has(addon.id),
  user: (addon) => Boolean(addon.user) && !extensions.has(addon.id),
  updates: (addon, updateIds) => updateIds.has(addon.id),
};

const matchesState: Record<State, (addon: Addon) => boolean> = {
  all: () => true,
  on: (addon) => registry.isActive(addon.id),
  off: (addon) => !registry.isActive(addon.id),
};

/** Where an add-on came from: a server, the user's own folder, or Lumen itself. */
function groupOf(addon: Addon): Group {
  if (extensions.has(addon.id)) {
    return 'server';
  }
  return addon.user ? 'user' : 'builtin';
}

const GROUPS: { id: Group; label: string; }[] = [
  { id: 'server', label: 'extensions.groupServer' },
  { id: 'user', label: 'extensions.groupUser' },
  { id: 'builtin', label: 'extensions.groupBuiltin' },
];

function FilterBar({ filter, addons, updateIds, onFilter, onImport, onOpenStudio }: {
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

/* ------------------------------------------------------------------ */

/** Enabled / disabled, above the list. */
function StateBar({ state, addons, onState }: { state: State; addons: Addon[]; onState: (state: State) => void; }) {
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

/** The list, in groups by origin — headings only when more than one group has something to show. */
function AddonGroups({ addons, selectedId, updateIds, onSelect }: {
  addons: Addon[];
  selectedId: string | null;
  updateIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const groups = GROUPS
    .map(({ id, label }) => ({ id, label, list: addons.filter((addon) => groupOf(addon) === id) }))
    .filter((group) => group.list.length > 0);
  const headings = groups.length > 1;
  let index = 0;
  return (
    <>
      {groups.map((group) => (
        <section key={group.id} className="mb-2">
          {headings && (
            <div className="mb-1.5 flex items-center gap-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
              {t(group.label)}
              <span className="font-mono font-normal">{group.list.length}</span>
            </div>
          )}
          {group.list.map((addon) => (
            <AddonCard
              key={addon.id}
              addon={addon}
              index={index++}
              selected={selectedId === addon.id}
              hasUpdate={updateIds.has(addon.id)}
              onSelect={() => onSelect(addon.id)}
            />
          ))}
        </section>
      ))}
    </>
  );
}

function Switch({ addon }: { addon: Addon; }) {
  const t = useT();
  const toggleAddon = useStore((s) => s.toggleAddon);
  const active = registry.isActive(addon.id);
  return (
    <button
      role="switch"
      aria-checked={active}
      disabled={addon.builtin}
      onClick={(e) => {
        e.stopPropagation();
        toggleAddon(addon.id);
      }}
      title={addon.builtin ? t('addonStudio.dialog.builtinHint') : undefined}
      aria-label={t(active ? 'addonStudio.dialog.disable' : 'addonStudio.dialog.enable', { name: addon.name })}
      className={[
        'lm-transition relative mt-0.5 h-[18px] w-[31px] shrink-0 rounded-full',
        addon.builtin ? 'cursor-not-allowed opacity-35' : '',
        active ? 'bg-accent' : 'bg-active',
      ].join(' ')}
    >
      <span className="lm-transition absolute top-[3px] size-3 rounded-full bg-white" style={{ left: active ? 16 : 3 }} />
    </button>
  );
}

function AddonIcon({ addon, size = 28 }: { addon: Addon; size?: number; }) {
  return (
    <span
      className="lm-transition flex shrink-0 items-center justify-center rounded-lumen-sm bg-active font-mono font-bold"
      style={{ width: size, height: size, fontSize: size * 0.4, color: addon.languages?.[0]?.color ?? 'var(--c-accent)' }}
    >
      {addon.icon ?? addon.name.slice(0, 2)}
    </span>
  );
}

const snippetCount = (addon: Addon) => (addon.languages ?? []).reduce((n, l) => n + (l.snippets?.length ?? 0), 0);

function AddonCard({ addon, index, selected, hasUpdate, onSelect }: { addon: Addon; index: number; selected: boolean; hasUpdate: boolean; onSelect: () => void; }) {
  const t = useT();
  const active = registry.isActive(addon.id);
  const snippets = snippetCount(addon);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') {
          return;
        }
        e.preventDefault();
        onSelect();
      }}
      style={{ animationDelay: `calc(var(--duration) * ${Math.min(index, 12) * 0.08})` }}
      className={[
        'lm-transition lm-anim-up mb-1.5 cursor-pointer rounded-lumen border p-2.5 outline-none focus-visible:border-accent',
        selected ? 'border-accent bg-active' : 'border-edge bg-surface hover:border-edge-strong',
        active ? '' : 'opacity-65',
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5">
        <AddonIcon addon={addon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{addon.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-subtle">v{addon.version}</span>
          </div>
          {addon.description && <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-subtle">{addon.description}</p>}
        </div>
        <Switch addon={addon} />
      </div>
      <div className="mt-1.5 ml-[38px] flex flex-wrap items-center gap-1">
        {hasUpdate && <Badge className="text-good"><RefreshCw size={8} /> {t('extensions.updateBadge')}</Badge>}
        {addon.builtin && <Badge title={t('addonStudio.dialog.builtinHint')}><Lock size={8} /> {t('common.builtin')}</Badge>}
        {extensions.has(addon.id) && <Badge className="text-accent"><Package size={8} /> {t('extensions.extensionBadge')}</Badge>}
        {addon.user && !extensions.has(addon.id) && <Badge className="text-accent"><Sparkles size={8} /> {t('addonStudio.dialog.userBadge')}</Badge>}
        {addon.languages?.slice(0, 4).map((l) => (
          <span key={l.id} className="rounded-full border border-edge px-1.5 py-px text-[10px]" style={{ color: l.color ?? 'var(--c-text-muted)' }}>
            {l.name}
          </span>
        ))}
        {(addon.languages?.length ?? 0) > 4 && <Badge>+{(addon.languages?.length ?? 0) - 4}</Badge>}
        {addon.languages?.some((l) => l.lsp?.length) && <Badge className="text-accent"><Zap size={8} /> LSP</Badge>}
        {snippets > 0 && <Badge title={t('addonStudio.dialog.snippetsHint')}>{t('addonStudio.dialog.snippets', { count: snippets })}</Badge>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Updating and removing an extension. */
function useExtensionActions(addon: Addon, update: AvailableUpdate | undefined) {
  const t = useT();
  const notify = useStore((s) => s.notify);
  const extension = extensions.get(addon.id);
  const [busy, setBusy] = useState(false);

  const updateExtension = async () => {
    if (!update) {
      return;
    }
    setBusy(true);
    try {
      await installExtension(update.server.url, update.id, update.to, () => {
        notify(t('extensions.updated', { names: update.name }), 'success');
      });
    } catch (err) {
      notify(t('extensions.updateFailed', { name: update.name, error: (err as Error).message }), 'error');
    } finally {
      setBusy(false);
    }
  };

  const uninstallExtension = async () => {
    if (!extension) {
      return;
    }
    if (!confirm(t('common.confirmDelete', { name: extension.manifest.name }))) {
      return;
    }
    setBusy(true);
    try {
      await extensions.uninstall(extension.manifest.id);
      notify(t('extensions.removedNotice', { name: extension.manifest.name }), 'info');
    } finally {
      setBusy(false);
    }
  };

  return { extension, busy, updateExtension, uninstallExtension };
}

function AddonHeader({ addon, extension }: { addon: Addon; extension: ReturnType<typeof extensions.get>; }) {
  const t = useT();
  const active = registry.isActive(addon.id);
  return (
    <div className="flex items-start gap-3 px-5 pt-4 pb-3">
      <AddonIcon addon={addon} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate text-[16px] font-medium text-fg">{addon.name}</h3>
          <span className="font-mono text-[11px] text-subtle">v{addon.version}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-subtle">
          <span className="font-mono">{addon.id}</span>
          {addon.author && <span>{t('common.author')}: {addon.author}</span>}
          <span>{t(active ? 'common.enabled' : 'common.disabled')}</span>
          {extension?.server && <span>{t('extensions.fromServer', { server: hostOf(extension.server) ?? extension.server })}</span>}
        </div>
        {addon.description && <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{addon.description}</p>}
      </div>
      <Switch addon={addon} />
    </div>
  );
}

function AddonActions({ addon, update, onSelect }: { addon: Addon; update?: AvailableUpdate; onSelect: (id: string) => void; }) {
  const t = useT();
  const openStudio = useStore((s) => s.openAddonStudio);
  const notify = useStore((s) => s.notify);
  const model = addon.user ? userAddons.get(addon.id) : undefined;
  const { extension, busy, updateExtension, uninstallExtension } = useExtensionActions(addon, update);

  const copyAsUser = async () => {
    const copy = await userAddons.copyFromAddon(addon);
    if (!copy) {
      return;
    }
    notify(t('addonStudio.dialog.copied', { name: copy.name }), 'success');
    openStudio(copy.id);
  };

  return (
    <div className="flex flex-wrap gap-1.5 px-5 pb-3">
      {update && (
        <Button size="sm" variant="solid" disabled={busy} onClick={() => void updateExtension()}>
          <RefreshCw size={12} className={busy ? 'lm-anim-spin' : ''} />
          {t('extensions.updateTo', { version: update.to })}
        </Button>
      )}
      {extension && (
        <Button size="sm" variant="danger" disabled={busy} onClick={() => void uninstallExtension()}>
          <Trash2 size={12} /> {t('extensions.uninstall')}
        </Button>
      )}
      {model && !extension && (
        <>
          <Button size="sm" variant="solid" onClick={() => openStudio(model.id)}><Pencil size={12} /> {t('common.edit')}</Button>
          <Button size="sm" variant="outline" onClick={async () => {
            const copy = await userAddons.duplicate(model.id);
            if (copy) {
              onSelect(copy.id);
            }
          }}>
            <Copy size={12} /> {t('common.duplicate')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void userAddons.exportModel(model)}><Download size={12} /> {t('common.export')}</Button>
          <Button size="sm" variant="danger" onClick={async () => {
            if (!confirm(t('common.confirmDelete', { name: model.name }))) {
              return;
            }
            await userAddons.remove(model.id);
            notify(t('addonStudio.dialog.deleted', { name: model.name }), 'info');
          }}>
            <Trash2 size={12} /> {t('common.delete')}
          </Button>
        </>
      )}
      {!addon.user && ((addon.languages?.length ?? 0) > 0 || (addon.themes?.length ?? 0) > 0) && (
        <Button size="sm" variant="outline" onClick={() => void copyAsUser()} title={t('addonStudio.dialog.copyAsUserHint')}>
          <Copy size={12} /> {t('addonStudio.dialog.copyAsUser')}
        </Button>
      )}
    </div>
  );
}

function AddonDetails({ addon, update, onSelect }: { addon: Addon; update?: AvailableUpdate; onSelect: (id: string) => void; }) {
  const t = useT();
  const openStudio = useStore((s) => s.openAddonStudio);
  const closeDialog = useStore((s) => s.closeDialog);
  const active = registry.isActive(addon.id);
  const model = addon.user ? userAddons.get(addon.id) : undefined;
  const extension = extensions.get(addon.id);

  const languages = addon.languages ?? [];
  const kinds = addon.projectKinds ?? [];
  const templates = addon.projectTemplates ?? [];
  const commands = addon.commands ?? [];
  const themes = addon.themes ?? [];

  return (
    <div className="lm-anim-fade">
      <AddonHeader addon={addon} extension={extension} />
      {update && (
        <div className="mx-5 mb-3 flex items-center gap-2 rounded-lumen-sm border border-accent/40 bg-accent/10 px-3 py-1.5 text-[12px] text-fg">
          <RefreshCw size={12} className="shrink-0 text-good" />
          {t('extensions.updateBanner', { from: update.from, to: update.to })}
        </div>
      )}
      <AddonActions addon={addon} update={update} onSelect={onSelect} />

      {languages.length > 0 && <LanguagesSection languages={languages} />}

      {kinds.length > 0 && <KindsSection kinds={kinds} />}

      {templates.length > 0 && <TemplatesSection templates={templates} />}

      {commands.length > 0 && <CommandsSection commands={commands} />}

      {themes.length > 0 && <ThemesSection themes={themes} active={active} />}

      {!languages.length && !kinds.length && !templates.length && !commands.length && !themes.length && (
        <DetailSection title={t('addonStudio.dialog.contents')}>
          <p className="text-[12px] text-subtle">{t('addonStudio.dialog.noContents')}</p>
          {model && (
            <Button size="sm" variant="outline" className="mt-2" onClick={() => { closeDialog(); openStudio(model.id); }}>
              <Pencil size={12} /> {t('common.edit')}
            </Button>
          )}
        </DetailSection>
      )}
    </div>
  );
}

function LoadProblems() {
  const t = useT();
  const problems = userAddons.problems();
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lumen-sm border border-dashed border-edge px-2.5 py-1.5">
      <div className="min-w-0 flex-1 text-[11.5px] text-subtle">
        {problems.length === 0 && t('addonStudio.dialog.folderHint')}
        {problems.map((p) => (
          <div key={p.file} className="truncate text-bad" title={p.message}>{p.file}: {p.message}</div>
        ))}
      </div>
      <Button size="sm" title={t('addonStudio.dialog.openFolder')} onClick={async () => {
        const dir = await window.lumen.userAddons.dir();
        void window.lumen.shell.showItemInFolder(dir);
      }}>
        <FolderOpen size={12} />
      </Button>
    </div>
  );
}
