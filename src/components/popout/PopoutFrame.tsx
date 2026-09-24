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
 * What fills a pop-out window: a small header — title, the view's own toolbar,
 * dock back, and the window buttons a frameless window lacks — over the view
 * or the editor group itself.
 */

import { useSyncExternalStore } from 'react';
import { Minus, Square, Undo2, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { viewRegistry } from '@/core/views';
import { controlPopout } from '@/core/popout/windows';
import type { PopoutEntry } from '@/state/popout';
import { GroupView } from '../editor/EditorArea';
import { Button } from '../ui';
import { useBadgeTick } from '../workbench/useDock';

const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

export function PopoutFrame({ entry }: { entry: PopoutEntry; }) {
  const t = useT();
  const platform = useStore((s) => s.platform);
  const isMac = platform === 'darwin';
  const title = useFrameTitle(entry);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex h-8 shrink-0 items-center gap-1 border-b border-edge bg-surface pr-1 pl-3" style={drag}>
        {isMac && <div className="w-14 shrink-0" />}
        {/* A view's title is a label; a file name keeps its case. */}
        <span className={`min-w-0 flex-1 truncate text-[10.5px] font-semibold tracking-[0.09em] text-subtle ${entry.kind === 'view' ? 'uppercase' : ''}`}>{title}</span>
        <div className="flex items-center gap-0.5" style={noDrag}>
          {entry.kind === 'view' && <ViewToolbar id={entry.ref} />}
          <Button size="sm" title={t('popout.dockBack')} onClick={() => useStore.getState().dockBack(entry.key)}>
            <Undo2 size={13} />
          </Button>
          {!isMac && <WindowButtons entry={entry} />}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <FrameBody entry={entry} />
      </div>
    </div>
  );
}

/** The window's title: the view's, or what the group shows. */
export function useFrameTitle(entry: PopoutEntry): string {
  const t = useT();
  useSyncExternalStore(viewRegistry.subscribe, viewRegistry.getVersion);
  const tabName = useStore((s) => {
    if (entry.kind !== 'group') {
      return null;
    }
    const group = s.groups.find((g) => g.id === entry.ref);
    return s.tabs.find((tab) => tab.id === group?.activeTabId)?.name ?? null;
  });
  if (entry.kind === 'view') {
    return viewRegistry.get(entry.ref)?.title() ?? entry.ref;
  }
  return tabName ?? t('popout.editor');
}

function ViewToolbar({ id }: { id: string; }) {
  useSyncExternalStore(viewRegistry.subscribe, viewRegistry.getVersion);
  useBadgeTick();
  return <>{viewRegistry.get(id)?.toolbar?.()}</>;
}

function FrameBody({ entry }: { entry: PopoutEntry; }) {
  useSyncExternalStore(viewRegistry.subscribe, viewRegistry.getVersion);
  useBadgeTick();
  const group = useStore((s) => s.groups.find((g) => g.id === entry.ref) ?? null);
  if (entry.kind === 'group') {
    return group ? <GroupView group={group} popped /> : null;
  }
  const view = viewRegistry.get(entry.ref);
  if (!view) {
    return null;
  }
  return <div key={view.id} className="min-h-0 flex-1">{view.render()}</div>;
}

function WindowButtons({ entry }: { entry: PopoutEntry; }) {
  const t = useT();
  return (
    <>
      <WindowButton label={t('titlebar.minimize')} onClick={() => void controlPopout(entry.key, 'minimize')}>
        <Minus size={13} />
      </WindowButton>
      <WindowButton label={t('titlebar.maximize')} onClick={() => void controlPopout(entry.key, 'toggleMaximize')}>
        <Square size={11} />
      </WindowButton>
      <WindowButton label={t('popout.dockBack')} danger onClick={() => useStore.getState().dockBack(entry.key)}>
        <X size={14} />
      </WindowButton>
    </>
  );
}

function WindowButton({ children, onClick, label, danger }: { children: React.ReactNode; onClick: () => void; label: string; danger?: boolean; }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={[
        'lm-transition flex h-6 w-9 items-center justify-center rounded-lumen-sm text-muted',
        danger ? 'hover:bg-bad hover:text-white' : 'hover:bg-hover hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

