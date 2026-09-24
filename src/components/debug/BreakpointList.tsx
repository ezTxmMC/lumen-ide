/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { CircleSlash, Trash2, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { breakpoints, type BreakpointEntry } from '@/core/debug/breakpoints';
import { debug } from '@/core/debug/manager';
import { editBreakpoint } from '@/core/debug/actions';
import { baseName, toRelative } from '@/core/debug/paths';
import { DebugSection, IconButton } from './shared';

function Dot({ bp }: { bp: BreakpointEntry; }) {
  const status = breakpoints.statusOf(bp.id);
  const unverified = bp.enabled && debug.hasSessions && status && !status.verified;
  const shape = bp.logMessage ? 'rotate-45 rounded-[1px]' : 'rounded-full';
  const fill = bp.enabled ? 'bg-bad' : 'border-[1.5px] border-subtle bg-transparent';
  return <span className={`inline-block size-[9px] shrink-0 ${shape} ${fill} ${unverified ? 'opacity-45' : ''}`} />;
}

export function BreakpointList() {
  const t = useT();
  const workspace = useStore((s) => s.workspace);
  const list = [...breakpoints.all()].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
  const groups = debug.exceptionFilterGroups();
  const anyEnabled = list.some((bp) => bp.enabled);

  return (
    <DebugSection
      id="breakpoints"
      title={t('debug.section.breakpoints')}
      count={list.length}
      actions={(
        <>
          <IconButton title={anyEnabled ? t('debug.cmd.disableAllBreakpoints') : t('debug.cmd.enableAllBreakpoints')} onClick={() => breakpoints.setAllEnabled(!anyEnabled)} disabled={!list.length}>
            <CircleSlash size={12} />
          </IconButton>
          <IconButton title={t('debug.cmd.removeAllBreakpoints')} onClick={() => breakpoints.removeAll()} disabled={!list.length} tone="hover:text-bad">
            <Trash2 size={12} />
          </IconButton>
        </>
      )}
    >
      {groups.map((group) => (
        <div key={group.type} className="px-2 pb-1">
          {groups.length > 1 && <div className="px-1 pt-1 text-[10.5px] text-subtle">{group.type}</div>}
          {group.filters.map((filter) => (
            <label key={filter.filter} className="lm-row lm-transition flex cursor-pointer items-center gap-2 px-1 text-[12px] text-muted hover:bg-hover hover:text-fg">
              <input
                type="checkbox"
                checked={filter.enabled}
                onChange={() => debug.toggleExceptionFilter(group.type, filter.filter)}
                className="accent-[var(--c-accent)]"
              />
              <span className="truncate">{filter.label}</span>
            </label>
          ))}
        </div>
      ))}

      {!list.length && <p className="px-3 py-1.5 text-[11.5px] leading-relaxed text-subtle">{t('debug.breakpoints.empty')}</p>}

      {list.map((bp) => {
        const status = breakpoints.statusOf(bp.id);
        const detail = [bp.condition, bp.hitCondition && `#${bp.hitCondition}`, bp.logMessage && `“${bp.logMessage}”`].filter(Boolean).join(' · ');
        const relative = workspace ? toRelative(workspace, bp.path) : bp.path;
        return (
          <div
            key={bp.id}
            className="lm-row lm-transition group mx-1 flex items-center gap-1.5 px-1.5 text-[12px] text-muted hover:bg-hover hover:text-fg"
            onClick={() => void useStore.getState().openAt(bp.path, bp.line, 0)}
            onDoubleClick={() => void editBreakpoint(bp.path, bp.line, 'condition')}
            title={[relative, status && !status.verified ? status.message ?? t('debug.bp.unverified') : ''].filter(Boolean).join('\n')}
          >
            <input
              type="checkbox"
              checked={bp.enabled}
              onClick={(e) => e.stopPropagation()}
              onChange={() => breakpoints.update(bp.id, { enabled: !bp.enabled })}
              className="shrink-0 accent-[var(--c-accent)]"
              aria-label={t('debug.bp.toggleEnabled')}
            />
            <Dot bp={bp} />
            <span className="min-w-0 truncate text-fg">{baseName(bp.path)}</span>
            <span className="shrink-0 font-mono text-[11px] text-subtle">:{bp.line + 1}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-subtle">{detail}</span>
            <span className="opacity-0 group-hover:opacity-100">
              <IconButton title={t('debug.menu.remove')} onClick={() => breakpoints.remove(bp.id)} tone="hover:text-bad">
                <X size={11} />
              </IconButton>
            </span>
          </div>
        );
      })}
    </DebugSection>
  );
}
