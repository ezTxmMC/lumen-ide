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
 * The bottom dock: views as tabs — output, terminal, problems … and whatever
 * was dragged here. Tabs reorder by dragging and can be dragged out into a
 * side dock; views from the side docks can be dropped onto the tab bar.
 */

import { useRef, useState } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { isViewPopped } from '@/state/popout';
import { useT } from '@/i18n';
import { formatBindingsFor } from '@/core/keybindings';
import type { ViewDef } from '@/core/views';
import { ContextMenu, type MenuItem } from '../ui/ContextMenu';
import { Button } from '../ui';
import { carriesView, dropIndex, takeDroppedView, useDraggedView, viewDragSource } from './drag';
import { useBadgeTick, useDock } from './useDock';
import { PoppedMark, PopOutButton, ResizeHandle, TabBadge, viewMenu, viewTooltip } from './parts';
import { ViewBody } from './ViewBody';

function withKeys(label: string, command: string) {
  const keys = formatBindingsFor(command);
  return keys ? `${label} (${keys})` : label;
}

export function BottomDock({ maximized, onToggleMaximized }: { maximized: boolean; onToggleMaximized: () => void; }) {
  const t = useT();
  const { views, active, open, size } = useDock('bottom');
  const dragging = useDraggedView();
  useBadgeTick();
  const tabs = useRef(new Map<string, HTMLElement>());
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; } | null>(null);
  const popped = useStore((s) => Boolean(active && isViewPopped(s.popouts, active.id)));

  if (!open || !active) {
    return null;
  }

  const tabElements = () => views.map((view) => tabs.current.get(view.id)).filter((el): el is HTMLElement => Boolean(el));

  const onDragOver = (event: React.DragEvent) => {
    if (!carriesView(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropAt(dropIndex(tabElements(), event.clientX, 'x'));
  };

  const onDrop = (event: React.DragEvent) => {
    if (!carriesView(event)) {
      return;
    }
    event.preventDefault();
    const id = takeDroppedView(event);
    const index = dropAt ?? views.length;
    setDropAt(null);
    if (id) {
      useStore.getState().moveView(id, 'bottom', index);
    }
  };

  return (
    <div
      data-dock="bottom"
      className={`lm-anim-panel flex shrink-0 flex-col border-t border-edge bg-surface ${maximized ? 'min-h-0 flex-1' : ''}`}
      style={maximized ? undefined : { height: size }}
    >
      {!maximized && <ResizeHandle dock="bottom" edge="top" />}

      <div
        className={`flex h-8 shrink-0 items-center gap-0.5 px-2 ${dragging ? 'bg-accent/5' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={() => setDropAt(null)}
        onDrop={onDrop}
      >
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {views.map((view, index) => (
            <Tab
              key={view.id}
              view={view}
              active={view.id === active.id}
              dropBefore={dropAt === index}
              register={(el) => { if (el) {
                tabs.current.set(view.id, el);
              } }}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ x: event.clientX, y: event.clientY, items: viewMenu(view, 'bottom') });
              }}
            />
          ))}
          {dropAt !== null && dropAt >= views.length && <span className="h-4 w-[2px] shrink-0 rounded-full bg-accent" />}
        </div>

        <span className="min-w-2 flex-1" />

        {!popped && active.toolbar?.()}
        <PopOutButton view={active} />
        <Button size="sm" title={t(maximized ? 'shell.layout.restore' : 'shell.layout.maximize')} onClick={onToggleMaximized}>
          {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </Button>
        <Button size="sm" title={withKeys(t('common.close'), 'view.panel')} onClick={() => useStore.getState().toggleDock('bottom', false)}>
          <X size={13} />
        </Button>
      </div>

      <div key={active.id} className="lm-anim-fade min-h-0 flex-1">
        <ViewBody view={active} />
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

function Tab({ view, active, dropBefore, register, onContextMenu }: {
  view: ViewDef;
  active: boolean;
  dropBefore: boolean;
  register: (el: HTMLElement | null) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const Icon = view.icon;
  return (
    <>
      {dropBefore && <span className="h-4 w-[2px] shrink-0 rounded-full bg-accent" />}
      <button
        ref={register}
        {...viewDragSource(view.id)}
        onClick={() => useStore.getState().showView(view.id)}
        onContextMenu={onContextMenu}
        title={viewTooltip(view)}
        className={[
          'lm-transition flex h-6 shrink-0 items-center gap-1.5 rounded-lumen-sm px-2 text-[11px] font-semibold uppercase tracking-[0.06em]',
          active ? 'bg-active text-fg' : 'text-subtle hover:bg-hover hover:text-muted',
        ].join(' ')}
      >
        <Icon size={11} />
        {view.title()}
        <PoppedMark id={view.id} />
        <TabBadge badge={view.badge?.() ?? null} />
      </button>
    </>
  );
}
