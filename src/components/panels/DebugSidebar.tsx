/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { Bug, ChevronDown, Eye, EyeOff, Loader2, Pause, Play, Settings2, Square } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { debug } from '@/core/debug/manager';
import { openLaunchConfigFile } from '@/core/debug/config';
import { formatBindingsFor } from '@/core/keybindings';
import { useDebugVersion, DebugSection, IconButton } from '../debug/shared';
import { ScopeList } from '../debug/VariableTree';
import { WatchList } from '../debug/WatchList';
import { CallStack } from '../debug/CallStack';
import { BreakpointList } from '../debug/BreakpointList';
import { Button } from '../ui';

const withKeys = (label: string, id: string) => {
  const keys = formatBindingsFor(id);
  return keys ? `${label} (${keys})` : label;
};

function StartBar() {
  const t = useT();
  const workspace = useStore((s) => s.workspace);
  const starting = debug.starting;
  return (
    <div className="shrink-0 px-3 pb-2">
      <div className="flex items-center gap-1">
        <Button variant="solid" className="flex-1" disabled={starting} onClick={() => void debug.start()} title={withKeys(t('debug.cmd.start'), 'debug.start')}>
          {starting ? <Loader2 size={13} className="lm-anim-spin" /> : <Play size={13} />}
          {t('debug.sidebar.start')}
        </Button>
        <Button variant="outline" disabled={starting} onClick={() => void debug.start({ pick: true })} title={t('debug.cmd.selectAndStart')}>
          <ChevronDown size={13} />
        </Button>
        <Button variant="outline" disabled={!workspace} onClick={() => void openLaunchConfigFile()} title={t('debug.cmd.openConfig')}>
          <Settings2 size={13} />
        </Button>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-subtle">{t('debug.sidebar.hint')}</p>
    </div>
  );
}

function SessionBar() {
  const t = useT();
  const session = debug.focusedSession() ?? debug.sessions[0];
  const stopped = debug.isStopped;
  const progress = session ? [...session.progress.values()][0] : undefined;
  const status = stopped ? t('debug.sidebar.paused') : t('debug.sidebar.running');
  return (
    <div className="shrink-0 px-3 pb-2">
      <div className="flex items-center gap-2 rounded-lumen-sm border border-edge bg-input px-2 py-1.5">
        <span className={`size-2 shrink-0 rounded-full ${stopped ? 'bg-warn' : 'lm-anim-pulse bg-ok'}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] text-fg">{session?.name}</div>
          <div className="truncate text-[10.5px] text-subtle">
            {progress ? `${progress.title}${progress.message ? ` · ${progress.message}` : ''}` : status}
          </div>
        </div>
        {stopped && <IconButton title={withKeys(t('debug.cmd.continue'), 'debug.continue')} onClick={() => void debug.continue()}><Play size={12} /></IconButton>}
        {!stopped && <IconButton title={withKeys(t('debug.cmd.pause'), 'debug.pause')} onClick={() => void debug.pause()}><Pause size={12} /></IconButton>}
        <IconButton title={withKeys(t('debug.cmd.stop'), 'debug.stop')} onClick={() => void debug.stopAll()} tone="hover:text-bad"><Square size={11} /></IconButton>
      </div>
    </div>
  );
}

/** The “run and debug” sidebar. */
export function DebugSidebar() {
  const t = useT();
  useDebugVersion();
  const active = debug.hasSessions;
  const session = debug.focusedSession();
  const frame = debug.focusedFrame();
  const showInline = debug.showInline;

  return (
    <div className="flex h-full flex-col">
      {active ? <SessionBar /> : <StartBar />}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <DebugSection
          id="variables"
          title={t('debug.section.variables')}
          actions={(
            <IconButton title={showInline ? t('debug.cmd.hideInlineValues') : t('debug.cmd.showInlineValues')} onClick={() => debug.setShowInline(!showInline)}>
              {showInline ? <Eye size={12} /> : <EyeOff size={12} />}
            </IconButton>
          )}
        >
          {session && frame && debug.isStopped && (
            <ScopeList sessionId={session.id} frameId={frame.id} generation={debug.generation} />
          )}
          {!(session && frame && debug.isStopped) && (
            <p className="flex items-center gap-2 px-3 py-1.5 text-[11.5px] text-subtle">
              <Bug size={12} className="opacity-60" /> {t(active ? 'debug.variables.running' : 'debug.variables.idle')}
            </p>
          )}
        </DebugSection>
        <WatchList />
        <CallStack />
        <BreakpointList />
      </div>
    </div>
  );
}
