/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Download, ExternalLink, RefreshCw, Wrench } from 'lucide-react';
import { useStore } from '@/state/store';
import { registry } from '@/core/registry';
import { lsp } from '@/core/lsp/manager';
import { toolConfig, tools, toolsOf, type ToolState } from '@/core/tools';
import { openToolsInstall } from '@/lib/project/lsp-install';
import { useT } from '@/i18n';
import { Button } from '../../ui';
import { Collapsible } from './ProjectSections';

const TONE: Record<ToolState, string> = { ok: 'text-ok', missing: 'text-warn', outdated: 'text-warn', broken: 'text-bad' };

/** The programs the project's languages need besides their servers (`novusc`) — found, missing or out of date. */
export function LanguageTools() {
  const t = useT();
  const project = useStore((s) => s.project);
  const tabs = useStore((s) => s.tabs);
  const registryVersion = useStore((s) => s.registryVersion);
  useStore((s) => s.lspVersion);
  useSyncExternalStore(tools.subscribe, tools.getVersion);

  const declared = useMemo(() => {
    const ids = new Set<string>(project?.languages ?? []);
    for (const tab of tabs) {
      if (tab.languageId) {
        ids.add(tab.languageId);
      }
    }
    return toolsOf(registry.languages().filter((language) => ids.has(language.id)));
  }, [project?.languages, tabs, registryVersion]);

  useEffect(() => {
    void tools.check(declared);
  }, [declared]);

  if (!declared.length) {
    return null;
  }

  return (
    <Collapsible title={t('lsp.tools.title')} count={declared.length}>
      <div className="space-y-1.5">
        {declared.map((tool) => {
          const status = tools.status(tool.id);
          const state = status?.state;
          const config = toolConfig(tool);
          const canInstall = lsp.canInstall(config);
          const action = state === 'outdated' ? 'update' : 'install';
          return (
            <div key={tool.id} className="rounded-lumen-sm border border-edge px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <Wrench size={11} className="shrink-0 text-subtle" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{tool.label}</span>
                {state && <span className={`text-[10.5px] ${TONE[state]}`}>{t(`lsp.tools.state.${state}`)}</span>}
                {(state === 'missing' || state === 'broken' || state === 'outdated') && canInstall && (
                  <Button size="sm" title={t(`lsp.tools.${action}`, { name: tool.label })} onClick={() => openToolsInstall(tool.label, [config])}>
                    {state === 'outdated' ? <RefreshCw size={11} /> : <Download size={11} />}
                  </Button>
                )}
                {tool.docs && (
                  <Button size="sm" title={t('project.docs')} onClick={() => void window.lumen.shell.openExternal(tool.docs!)}>
                    <ExternalLink size={11} />
                  </Button>
                )}
              </div>
              {status?.path && <p className="mt-1 truncate font-mono text-[10.5px] text-subtle" title={status.path}>{status.path}</p>}
              {state === 'outdated' && status?.pinnedVersion && (
                <p className="mt-1 text-[10.5px] text-subtle">{t('lsp.tools.versions', { installed: status.installedVersion ?? '?', pinned: status.pinnedVersion })}</p>
              )}
              {state === 'missing' && !canInstall && tool.install && <p className="mt-1 text-[10.5px] leading-snug text-subtle">{tool.install}</p>}
            </div>
          );
        })}
      </div>
    </Collapsible>
  );
}
