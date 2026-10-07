/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useMemo } from 'react';
import { Zap, ZapOff, Download, ExternalLink, RotateCw } from 'lucide-react';
import { useStore } from '@/state/store';
import { registry } from '@/core/registry';
import { lsp } from '@/core/lsp/manager';
import { installServer } from '@/lib/project/run';
import { statusTone } from '@/lib/status';
import { tr, useT } from '@/i18n';
import { Button } from '../../ui';
import { Collapsible } from './ProjectSections';

const STATE_LABEL = new Set(['idle', 'checking', 'starting', 'ready', 'unavailable', 'failed', 'stopped']);

export function LanguageServers() {
  const t = useT();
  const project = useStore((s) => s.project);
  const config = useStore((s) => s.projectConfig);
  const registryVersion = useStore((s) => s.registryVersion);
  const lspVersion = useStore((s) => s.lspVersion);
  const setPreferred = useStore((s) => s.setPreferredLsp);
  const showPanel = useStore((s) => s.showPanel);
  const tabs = useStore((s) => s.tabs);

  const languages = useMemo(() => {
    const ids = new Set<string>(project?.languages ?? []);
    for (const t of tabs) {
      if (t.languageId) {
        ids.add(t.languageId);
      }
    }
    return registry.languages().filter((l) => ids.has(l.id) && l.lsp?.length);
  }, [project?.languages, tabs, registryVersion]);

  const servers = useMemo(() => lsp.list(), [lspVersion]);

  if (!languages.length) {
    return null;
  }

  return (
    <Collapsible title={t('panels.tabs.lsp')} count={languages.length}>
      <div className="space-y-1.5">
        {languages.map((language) => {
          const status = lsp.status(language);
          const entry = servers.find((s) => language.lsp!.some((c) => c.command === s.config.command));
          const preferred = config.lsp[language.id] ?? '';
          const chosen = language.lsp!.find((c) => c.label === (entry?.label ?? preferred)) ?? language.lsp![0];
          const ready = status.status === 'ready';
          return (
            <div key={language.id} className="rounded-lumen-sm border border-edge px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] font-bold" style={{ color: language.color }}>{language.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{language.name}</span>
                <span className={`flex items-center gap-1 text-[10.5px] ${statusTone(status.status)}`}>
                  {ready ? <Zap size={9} /> : <ZapOff size={9} />}
                  {STATE_LABEL.has(status.status) && t(`project.state.${status.status}`)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1">
                <select
                  value={preferred}
                  onChange={(e) => void setPreferred(language.id, e.target.value || null)}
                  className="min-w-0 flex-1 rounded-lumen-sm border border-edge bg-input px-1.5 py-0.5 text-[11px]"
                  title={t('project.preferredServer')}
                >
                  <option value="">{t('project.automaticWith', { label: language.lsp![0].label })}</option>
                  {language.lsp!.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                </select>
                {entry && (
                  <Button size="sm" title={t('project.restart')} onClick={() => void lsp.restartClient(entry.id).then(() => showPanel('lsp'))}>
                    <RotateCw size={11} />
                  </Button>
                )}
                {!entry && status.status === 'unavailable' && (
                  <Button size="sm" title={lsp.installHint(chosen) ? t('project.installNamed', { command: lsp.installHint(chosen)! }) : tr(chosen.install)} onClick={() => void installServer(chosen)}>
                    <Download size={11} />
                  </Button>
                )}
                {chosen.docs && (
                  <Button size="sm" title={t('project.docs')} onClick={() => void window.lumen.shell.openExternal(chosen.docs!)}>
                    <ExternalLink size={11} />
                  </Button>
                )}
              </div>
              {status.status === 'unavailable' && chosen.install && (
                <p className="mt-1 text-[10.5px] leading-snug text-subtle">{tr(chosen.install)}</p>
              )}
              {status.busy && <p className="mt-1 truncate text-[10.5px] text-accent">{status.busy}</p>}
            </div>
          );
        })}
      </div>
    </Collapsible>
  );
}
