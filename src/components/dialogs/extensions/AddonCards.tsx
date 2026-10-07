/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { Lock, Package, RefreshCw, Sparkles, TriangleAlert, Zap } from 'lucide-react';
import { useStore } from '@/state/store';
import { registry } from '@/core/registry';
import { useT } from '@/i18n';
import { extensions } from '@/core/extensions/manager';
import type { Addon } from '@/core/types';
import { Badge } from './AddonSections';
import { groupOf, GROUPS } from './InstalledFilters';

/** The list, in groups by origin — headings only when more than one group has something to show. */
export function AddonGroups({ addons, selectedId, updateIds, onSelect }: {
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

export function Switch({ addon }: { addon: Addon; }) {
  const t = useT();
  const toggleAddon = useStore((s) => s.toggleAddon);
  const active = registry.isActive(addon.id);
  const blocked = registry.blockedReason(addon.id);
  return (
    <button
      role="switch"
      aria-checked={active}
      disabled={addon.builtin || Boolean(blocked)}
      onClick={(e) => {
        e.stopPropagation();
        toggleAddon(addon.id);
      }}
      title={blocked ?? (addon.builtin ? t('addonStudio.dialog.builtinHint') : undefined)}
      aria-label={t(active ? 'addonStudio.dialog.disable' : 'addonStudio.dialog.enable', { name: addon.name })}
      className={[
        'lm-transition relative mt-0.5 h-[18px] w-[31px] shrink-0 rounded-full',
        addon.builtin || blocked ? 'cursor-not-allowed opacity-35' : '',
        active ? 'bg-accent' : 'bg-active',
      ].join(' ')}
    >
      <span className="lm-transition absolute top-[3px] size-3 rounded-full bg-white" style={{ left: active ? 16 : 3 }} />
    </button>
  );
}

export function AddonIcon({ addon, size = 28 }: { addon: Addon; size?: number; }) {
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
        {registry.blockedReason(addon.id) && (
          <Badge className="text-warn" title={registry.blockedReason(addon.id) ?? undefined}>
            <TriangleAlert size={8} /> {t('extensions.requiresApp', { required: extensions.get(addon.id)?.manifest.minAppVersion ?? '' })}
          </Badge>
        )}
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
