/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The detail sections of an add-on: what it brings, by kind of content. */

import { Zap } from 'lucide-react';
import { useStore } from '@/state/store';
import { formatBindingsFor } from '@/core/keybindings';
import { useT } from '@/i18n';
import type { Addon } from '@/core/types';

export function Badge({ children, title, className = '' }: { children: React.ReactNode; title?: string; className?: string; }) {
  return (
    <span title={title} className={`flex items-center gap-0.5 rounded-full border border-edge px-1.5 py-px text-[10px] text-muted ${className}`}>
      {children}
    </span>
  );
}

export function DetailSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode; }) {
  return (
    <section className="border-t border-edge px-5 py-3">
      <h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
        {title}{count !== undefined ? ` · ${count}` : ''}
      </h4>
      {children}
    </section>
  );
}

export function LanguagesSection({ languages }: { languages: NonNullable<Addon['languages']>; }) {
  const t = useT();
  return (
    <DetailSection title={t('addonStudio.nav.languages')} count={languages.length}>
      {languages.map((lang) => (
        <div key={lang.id} className="mb-2.5 rounded-lumen-sm border border-edge p-2.5">
          <div className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: lang.color ?? 'var(--c-border-strong)' }} />
            <span className="text-[12.5px] font-medium text-fg">{lang.name}</span>
            <span className="font-mono text-[10.5px] text-subtle">{lang.id}</span>
            <span className="flex-1" />
            {(lang.snippets?.length ?? 0) > 0 && <Badge>{t('addonStudio.dialog.snippets', { count: lang.snippets?.length ?? 0 })}</Badge>}
            {lang.tokenizer && <Badge>{t('addonStudio.dialog.customTokenizer')}</Badge>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[...lang.extensions, ...(lang.filenames ?? [])].map((ext) => (
              <span key={ext} className="rounded-[4px] bg-input px-1.5 py-px font-mono text-[10.5px] text-muted">{ext}</span>
            ))}
          </div>
          {(lang.run?.length ?? 0) > 0 && (
            <div className="mt-1.5 text-[11.5px] text-subtle">
              {t('addonStudio.languages.run')}: {lang.run?.map((r) => r.label).join(', ')}
            </div>
          )}
          {lang.lsp?.map((server) => (
            <div key={`${server.label}${server.command}`} className="mt-1.5 flex items-start gap-1.5 text-[11.5px]">
              <Zap size={11} className="mt-0.5 shrink-0 text-accent" />
              <div className="min-w-0">
                <span className="text-muted">{server.label}</span>
                <span className="ml-1.5 font-mono text-[10.5px] text-subtle">{[server.command, ...(server.args ?? [])].join(' ')}</span>
                {server.install && <div className="text-subtle">{server.install}</div>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </DetailSection>
  );
}

export function KindsSection({ kinds }: { kinds: NonNullable<Addon['projectKinds']>; }) {
  const t = useT();
  return (
    <DetailSection title={t('addonStudio.dialog.projectKinds')} count={kinds.length}>
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((kind) => (
          <span key={kind.id} title={kind.markers.join(', ')} className="flex items-center gap-1 rounded-lumen-sm border border-edge px-2 py-1 text-[11.5px] text-muted">
            <span className="size-2 rounded-full" style={{ background: kind.color ?? 'var(--c-accent)' }} />
            {kind.name}
            <span className="font-mono text-[10px] text-subtle">{kind.markers.slice(0, 2).join(' ')}</span>
          </span>
        ))}
      </div>
    </DetailSection>
  );
}

export function TemplatesSection({ templates }: { templates: NonNullable<Addon['projectTemplates']>; }) {
  const t = useT();
  return (
    <DetailSection title={t('addonStudio.nav.templates')} count={templates.length}>
      {templates.map((tpl) => (
        <div key={tpl.id} className="mb-1 text-[12px]">
          <span className="text-fg">{tpl.name}</span>
          {tpl.description && <span className="ml-2 text-subtle">{tpl.description}</span>}
        </div>
      ))}
    </DetailSection>
  );
}

export function CommandsSection({ commands }: { commands: NonNullable<Addon['commands']>; }) {
  const t = useT();
  return (
    <DetailSection title={t('addonStudio.nav.commands')} count={commands.length}>
      {commands.map((command) => (
        <div key={command.id} className="mb-1 flex items-center gap-2 text-[12px]">
          <span className="min-w-0 flex-1 truncate text-fg">{command.title}</span>
          {formatBindingsFor(command.id) && (
            <kbd className="rounded border border-edge bg-input px-1.5 py-px font-mono text-[10.5px] text-muted">{formatBindingsFor(command.id)}</kbd>
          )}
        </div>
      ))}
    </DetailSection>
  );
}

export function ThemesSection({ themes, active }: { themes: NonNullable<Addon['themes']>; active: boolean; }) {
  const t = useT();
  const setTheme = useStore((s) => s.setTheme);
  const themeId = useStore((s) => s.themeId);
  return (
    <DetailSection title={t('addonStudio.nav.themes')} count={themes.length}>
      <div className="grid grid-cols-2 gap-1.5">
        {themes.map((theme) => (
          <button
            key={theme.id}
            disabled={!active}
            onClick={() => setTheme(theme.id)}
            className={[
              'lm-transition flex items-center gap-2 rounded-lumen-sm border px-2 py-1.5 text-left disabled:opacity-50',
              theme.id === themeId ? 'border-accent' : 'border-edge hover:border-edge-strong',
            ].join(' ')}
          >
            <span className="flex overflow-hidden rounded-[4px] border border-edge">
              {[theme.ui.bg, theme.ui.accent, theme.ui.text].map((c, i) => <span key={i} className="block h-5 w-3.5" style={{ background: c }} />)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{theme.name}</span>
            <span className="text-[10.5px] text-subtle">{t(theme.type === 'dark' ? 'common.dark' : 'common.light')}</span>
          </button>
        ))}
      </div>
    </DetailSection>
  );
}
