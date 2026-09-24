/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The header, navigation and section pages of the Add-on Studio. */

import {
  AlertTriangle, Blocks, Braces, Check, Code2, Download, FolderTree, Hammer, Palette, Scissors, Settings2, Trash2, Workflow, X, Zap, PanelsTopLeft,
} from 'lucide-react';
import { useT } from '@/i18n';
import { userAddons } from '@/core/user-addons/manager';
import type { UserAddonModel } from '@/core/user-addons/schema';
import type { StudioSection, ValidationIssue } from '@/core/user-addons/validate';
import { Button } from '../ui';
import { LanguagesPage } from './LanguagesPage';
import { CommandsPage, EventsPage } from './GraphPages';
import { TemplatesPage } from './TemplatesPage';
import { KindsPage } from './KindsPage';
import { SnippetsPage } from './SnippetsPage';
import { PanelsPage } from './PanelsPage';
import { GeneralPage, JsonPage, ThemesPage } from './MetaPages';

export const NAV: { id: StudioSection; icon: typeof X; }[] = [
  { id: 'general', icon: Settings2 },
  { id: 'languages', icon: Code2 },
  { id: 'commands', icon: Zap },
  { id: 'events', icon: Workflow },
  { id: 'templates', icon: FolderTree },
  { id: 'kinds', icon: Hammer },
  { id: 'snippets', icon: Scissors },
  { id: 'panels', icon: PanelsTopLeft },
  { id: 'themes', icon: Palette },
  { id: 'json', icon: Braces },
];

const COUNTS: Partial<Record<StudioSection, (m: UserAddonModel) => number>> = {
  languages: (m) => m.languages.length,
  commands: (m) => m.commands.length,
  events: (m) => m.events.length,
  templates: (m) => m.templates.length,
  kinds: (m) => m.projectKinds.length,
  snippets: (m) => m.snippets.length,
  panels: (m) => m.panels?.length ?? 0,
  themes: (m) => m.themes.length,
};

export function StudioHeader({
  draft, dirty, saving, canDelete, blockingCount, onUpdate, onProblems, onDelete, onClose, onSave,
}: {
  draft: UserAddonModel;
  dirty: boolean;
  saving: boolean;
  canDelete: boolean;
  blockingCount: number;
  onUpdate: (fn: (model: UserAddonModel) => UserAddonModel) => void;
  onProblems: () => void;
  onDelete: () => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const t = useT();
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-edge px-4 py-2.5">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-lumen-sm bg-active font-mono text-[11px] font-bold"
        style={{ color: draft.color || 'var(--c-accent)' }}
      >
        {draft.icon || <Blocks size={14} />}
      </span>
      <input
        value={draft.name}
        onChange={(e) => onUpdate((m) => ({ ...m, name: e.target.value }))}
        placeholder={t('addonStudio.studio.namePlaceholder')}
        className="lm-transition min-w-0 flex-1 rounded-lumen-sm border border-transparent bg-transparent px-2 py-1 text-[15px] font-medium outline-none hover:border-edge focus:border-accent"
      />
      <label className="flex items-center gap-1 text-[11px] text-subtle">
        v
        <input
          value={draft.version}
          onChange={(e) => onUpdate((m) => ({ ...m, version: e.target.value }))}
          className="lm-transition w-[74px] rounded-lumen-sm border border-edge bg-input px-1.5 py-0.5 font-mono text-[11.5px] text-fg outline-none focus:border-accent"
        />
      </label>
      {dirty && <span title={t('addonStudio.studio.unsaved')} className="size-2 shrink-0 rounded-full bg-warn" />}
      {blockingCount > 0 && (
        <Button size="sm" onClick={onProblems} title={t('addonStudio.studio.problemsHint')}>
          <AlertTriangle size={12} className="text-bad" /> {blockingCount}
        </Button>
      )}

      <span className="mx-1 h-5 w-px bg-edge" />

      <Button size="sm" title={t('addonStudio.studio.export')} onClick={() => void userAddons.exportModel(draft)}>
        <Download size={12} />
      </Button>
      {canDelete && (
        <Button size="sm" variant="danger" title={t('common.delete')} onClick={onDelete}>
          <Trash2 size={12} />
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onClose} title={t('common.closeEsc')}>
        <X size={12} /> {dirty ? t('common.discard') : t('common.close')}
      </Button>
      <Button size="sm" variant="solid" disabled={saving} onClick={onSave} title={t('addonStudio.studio.saveHint')}>
        <Check size={12} /> {t('common.save')}
      </Button>
    </header>
  );
}

export function StudioNav({ draft, section, errorSections, onSection }: {
  draft: UserAddonModel;
  section: StudioSection;
  errorSections: Set<StudioSection>;
  onSection: (id: StudioSection) => void;
}) {
  const t = useT();
  return (
    <nav className="flex w-[184px] shrink-0 flex-col gap-0.5 border-r border-edge p-2">
      {NAV.map((entry, index) => {
        const active = entry.id === section;
        const Icon = entry.icon;
        const count = COUNTS[entry.id]?.(draft);
        return (
          <button
            key={entry.id}
            onClick={() => onSection(entry.id)}
            style={{ animationDelay: `calc(var(--duration) * ${index * 0.15})` }}
            className={[
              'lm-transition lm-anim-right flex h-8 items-center gap-2 rounded-lumen-sm px-2.5 text-left text-[12.5px]',
              active ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
            ].join(' ')}
          >
            <Icon size={13} className={active ? 'text-accent' : 'text-subtle'} />
            <span className="min-w-0 flex-1 truncate">{t(`addonStudio.nav.${entry.id}`)}</span>
            {errorSections.has(entry.id) && <span className="size-1.5 shrink-0 rounded-full bg-bad" />}
            {count !== undefined && <span className="shrink-0 font-mono text-[10px] text-subtle">{count}</span>}
          </button>
        );
      })}
      <span className="flex-1" />
      <p className="px-1 text-[10.5px] leading-relaxed text-subtle">{t('addonStudio.studio.footer')}</p>
    </nav>
  );
}

/** The page of the chosen section. */
export function StudioPage({ section, draft, issues, focus, onJump, onUpdate, onReplace }: {
  section: StudioSection;
  draft: UserAddonModel;
  issues: ValidationIssue[];
  focus: { index: number; token: number; } | null;
  onJump: (issue: ValidationIssue) => void;
  onUpdate: (fn: (model: UserAddonModel) => UserAddonModel) => void;
  onReplace: (model: UserAddonModel) => void;
}) {
  const of = (id: StudioSection) => issues.filter((i) => i.section === id);
  return (
    <div key={section} className="lm-anim-fade min-w-0 flex-1 overflow-hidden">
      {section === 'general' && (
        <div className="h-full overflow-y-auto">
          <GeneralPage model={draft} issues={issues} onJump={onJump} onChange={(patch) => onUpdate((m) => ({ ...m, ...patch }))} />
        </div>
      )}
      {section === 'languages' && (
        <LanguagesPage
          languages={draft.languages}
          issues={of('languages')}
          focus={focus}
          onChange={(languages) => onUpdate((m) => ({ ...m, languages }))}
        />
      )}
      {section === 'commands' && (
        <CommandsPage model={draft} issues={of('commands')} focus={focus} onChange={(commands) => onUpdate((m) => ({ ...m, commands }))} />
      )}
      {section === 'events' && (
        <EventsPage model={draft} issues={of('events')} focus={focus} onChange={(events) => onUpdate((m) => ({ ...m, events }))} />
      )}
      {section === 'templates' && (
        <TemplatesPage model={draft} issues={of('templates')} focus={focus} onChange={(templates) => onUpdate((m) => ({ ...m, templates }))} />
      )}
      {section === 'kinds' && (
        <KindsPage model={draft} issues={of('kinds')} focus={focus} onChange={(projectKinds) => onUpdate((m) => ({ ...m, projectKinds }))} />
      )}
      {section === 'snippets' && (
        <SnippetsPage model={draft} issues={of('snippets')} focus={focus} onChange={(snippets) => onUpdate((m) => ({ ...m, snippets }))} />
      )}
      {section === 'panels' && (
        <PanelsPage model={draft} issues={of('panels')} focus={focus} onChange={(panels) => onUpdate((m) => ({ ...m, panels }))} />
      )}
      {section === 'themes' && (
        <div className="h-full overflow-y-auto">
          <ThemesPage themes={draft.themes} onChange={(themes) => onUpdate((m) => ({ ...m, themes }))} />
        </div>
      )}
      {section === 'json' && <JsonPage model={draft} onReplace={onReplace} />}
    </div>
  );
}
