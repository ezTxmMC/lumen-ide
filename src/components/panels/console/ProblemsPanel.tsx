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
import { CircleAlert, TriangleAlert, Info, Lightbulb, Filter } from 'lucide-react';
import { useStore, relativeToWorkspace } from '@/state/store';
import { lsp } from '@/core/lsp/manager';
import { fileGlyph } from '@/lib/files/file-icon';
import { IconGlyph } from '../../icons/FileIcon';
import { diagnosticParts } from '@/core/lsp/diagnostic-text';
import type { Diagnostic } from '@/core/lsp/protocol';
import { useT } from '@/i18n';
import { Checkbox, Empty } from '../../ui';

const SEVERITY = {
  1: { icon: CircleAlert, tone: 'text-bad', label: 'panels.problems.error' },
  2: { icon: TriangleAlert, tone: 'text-warn', label: 'panels.problems.warning' },
  3: { icon: Info, tone: 'text-accent', label: 'panels.problems.info' },
  4: { icon: Lightbulb, tone: 'text-subtle', label: 'panels.problems.hint' },
} as const;

/** Deprecated code is struck through, unnecessary code faded. */
function tagTone(parts: { deprecated: boolean; unnecessary: boolean; }): string {
  if (parts.deprecated) {
    return 'line-through';
  }
  if (parts.unnecessary) {
    return 'opacity-60';
  }
  return '';
}

/** One problem: severity, message, code (a link where the server explains it), source — and the related places beneath. */
function ProblemRow({ path, diagnostic: d }: { path: string; diagnostic: Diagnostic; }) {
  const t = useT();
  const openAt = useStore((s) => s.openAt);
  const parts = diagnosticParts(d);
  const sev = SEVERITY[(d.severity ?? 1) as 1 | 2 | 3 | 4];
  const Icon = sev.icon;
  const open = () => void openAt(path, d.range.start.line, d.range.start.character, d.range.end.line, d.range.end.character);
  const tone = tagTone(parts);
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        } }}
        className="lm-transition flex w-full cursor-pointer items-start gap-2 px-3 py-[3px] text-left hover:bg-hover"
        title={`${t(sev.label)}${parts.source ? ` · ${parts.source}` : ''}${parts.code ? ` [${parts.code}]` : ''}\n${d.message}`}
      >
        <Icon size={12} className={`mt-[3px] shrink-0 ${sev.tone}`} />
        <span className={`min-w-0 flex-1 truncate text-[11.5px] text-muted ${tone}`}>
          {d.message.split('\n')[0]}
          {parts.code !== undefined && (
            parts.href
              ? (
                <a
                  role="link"
                  className="ml-1.5 text-[10px] text-accent underline"
                  onClick={(e) => { e.stopPropagation(); void window.lumen.shell.openExternal(parts.href!); }}
                >[{parts.code}]</a>
              )
              : <span className="ml-1.5 text-[10px] text-subtle">[{parts.code}]</span>
          )}
          {parts.source && <span className="ml-1.5 text-[10px] text-subtle">{parts.source}</span>}
        </span>
        <span className="shrink-0 font-mono text-[10.5px] text-subtle tabular-nums">
          {d.range.start.line + 1}:{d.range.start.character + 1}
        </span>
      </div>
      {parts.related.map((entry, index) => (
        <div
          key={index}
          role="button"
          tabIndex={0}
          onClick={() => void openAt(entry.path, entry.line, entry.character)}
          onKeyDown={(e) => { if (e.key === 'Enter') {
            void openAt(entry.path, entry.line, entry.character);
          } }}
          className="lm-transition flex cursor-pointer items-start gap-2 py-[2px] pl-[34px] pr-3 text-[11px] text-subtle hover:bg-hover"
        >
          <span className="min-w-0 flex-1 truncate">↳ {entry.message}</span>
          <span className="shrink-0 font-mono text-[10px]">{entry.name}:{entry.line + 1}</span>
        </div>
      ))}
    </>
  );
}

export function ProblemsPanel() {
  const t = useT();
  const lspVersion = useStore((s) => s.lspVersion);
  const workspace = useStore((s) => s.workspace);
  const activePath = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null);
  const [onlyActive, setOnlyActive] = useState(false);
  const [hideHints, setHideHints] = useState(true);

  const files = useMemo(() => lsp.allDiagnostics(), [lspVersion]);
  const visible = useMemo(
    () => files
      .filter((f) => !onlyActive || f.path === activePath)
      .map((f) => ({
        ...f,
        diagnostics: f.diagnostics
          .filter((d) => !hideHints || (d.severity ?? 1) <= 3)
          .sort((a, b) => (a.severity ?? 1) - (b.severity ?? 1) || a.range.start.line - b.range.start.line),
      }))
      .filter((f) => f.diagnostics.length > 0),
    [files, onlyActive, hideHints, activePath],
  );
  const total = visible.reduce((n, f) => n + f.diagnostics.length, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-1 text-[11px] text-subtle">
        <Filter size={11} />
        <Checkbox checked={onlyActive} onChange={setOnlyActive}>{t('panels.problems.onlyActive')}</Checkbox>
        <Checkbox checked={hideHints} onChange={setHideHints}>{t('panels.problems.hideHints')}</Checkbox>
        <span className="ml-auto">{t('panels.problems.messages', { count: total })} {t('search.inFiles', { count: visible.length })}</span>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {visible.length === 0 && (
          <Empty
            title={t('panels.problems.empty')}
            hint={t('panels.problems.emptyHint')}
          />
        )}
        {visible.map((file) => {
          const glyph = fileGlyph(file.path.split(/[\\/]/).pop() ?? file.path);
          return (
            <div key={file.path} className="mb-1">
              <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-0.5 text-[11px] font-medium text-muted" title={file.path}>
                <IconGlyph icon={glyph} size={12} />
                <span className="truncate">{relativeToWorkspace(file.path, workspace)}</span>
                <span className="text-subtle">{file.diagnostics.length}</span>
              </div>
              {file.diagnostics.map((d, i) => (
                <ProblemRow key={`${d.range.start.line}-${d.range.start.character}-${i}`} path={file.path} diagnostic={d} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
