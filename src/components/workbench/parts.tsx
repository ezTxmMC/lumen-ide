/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Small pieces the docks share: badges, a view's menu, resize handles, tooltips. */

import { ArrowDownToLine, ExternalLink, PanelLeft, PanelRight, RotateCcw, Undo2, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { isViewPopped, popoutKey } from '@/state/popout';
import { formatBindingsFor } from '@/core/keybindings';
import { t, useT } from '@/i18n';
import type { Dock, ViewBadge, ViewDef } from '@/core/views';
import type { MenuItem } from '../ui/ContextMenu';
import { Button } from '../ui';
import { DOT } from './builtin-views';

/** The tooltip of a view: its title, its shortcut, and where it comes from. */
export function viewTooltip(view: ViewDef): string {
  const keys = view.command ? formatBindingsFor(view.command) : null;
  const title = keys ? `${view.title()} (${keys})` : view.title();
  const source = view.source?.();
  return source ? `${title} — ${source}` : title;
}

/** A badge on an icon in the navigation: a dot or a small counter. */
export function StripBadge({ badge }: { badge: ViewBadge | null; }) {
  if (!badge) {
    return null;
  }
  if (badge.text === DOT) {
    return <span className={`lm-anim-pop absolute top-1.5 right-1.5 size-1.5 rounded-full bg-current ${badge.tone ?? 'text-accent'}`} />;
  }
  return (
    <span className={`lm-anim-pop absolute top-0.5 right-0.5 min-w-[14px] rounded-full bg-bg px-1 text-center text-[9px] leading-[14px] font-semibold ${badge.tone ?? 'text-muted'}`}>
      {badge.text.length > 3 ? '99+' : badge.text}
    </span>
  );
}

/** A badge in a tab: the text, or a small dot. */
export function TabBadge({ badge }: { badge: ViewBadge | null; }) {
  if (!badge) {
    return null;
  }
  if (badge.text === DOT) {
    return <span className={`size-1.5 rounded-full bg-current ${badge.tone ?? 'text-accent'}`} />;
  }
  return <span className={`rounded-full bg-bg px-1.5 text-[10px] font-normal tracking-normal ${badge.tone ?? 'text-muted'}`}>{badge.text}</span>;
}

const MOVE_TARGETS: { dock: Dock; label: string; icon: typeof PanelLeft; }[] = [
  { dock: 'left', label: 'shell.layout.moveLeft', icon: PanelLeft },
  { dock: 'right', label: 'shell.layout.moveRight', icon: PanelRight },
  { dock: 'bottom', label: 'shell.layout.moveBottom', icon: ArrowDownToLine },
];

/** A small mark on the icon or tab of a view that is open in a window of its own. */
export function PoppedMark({ id, className = '' }: { id: string; className?: string; }) {
  const t = useT();
  const popped = useStore((s) => isViewPopped(s.popouts, id));
  if (!popped) {
    return null;
  }
  return <ExternalLink size={9} aria-label={t('popout.poppedOut')} className={`shrink-0 text-accent ${className}`} />;
}

/** The dock header's button to pop the active view out — or, while it is out, to bring it back. */
export function PopOutButton({ view }: { view: ViewDef; }) {
  const t = useT();
  const popped = useStore((s) => isViewPopped(s.popouts, view.id));
  const run = () => {
    const store = useStore.getState();
    if (popped) {
      store.dockBack(popoutKey('view', view.id));
      return;
    }
    store.popOutView(view.id);
  };
  return (
    <Button size="sm" title={t(popped ? 'popout.dockBack' : 'popout.popOut')} onClick={run}>
      {popped ? <Undo2 size={13} /> : <ExternalLink size={13} />}
    </Button>
  );
}

/** The context menu of a view's icon or tab: pop it out, move it, close its dock, reset. */
export function viewMenu(view: ViewDef, dock: Dock): MenuItem[] {
  const store = useStore.getState();
  const popped = isViewPopped(store.popouts, view.id);
  return [
    { header: view.title() },
    popped
      ? { label: t('popout.dockBack'), icon: Undo2, run: () => store.dockBack(popoutKey('view', view.id)) }
      : { label: t('popout.popOut'), icon: ExternalLink, run: () => store.popOutView(view.id) },
    'sep',
    ...MOVE_TARGETS.filter((target) => target.dock !== dock).map<MenuItem>((target) => ({
      label: t(target.label), icon: target.icon, run: () => store.moveView(view.id, target.dock),
    })),
    'sep',
    { label: t('shell.layout.closeDock'), icon: X, run: () => store.toggleDock(dock, false) },
    { label: t('shell.layout.reset'), icon: RotateCcw, run: () => store.resetLayout() },
  ];
}

/**
 * Drag to resize a dock. `edge` is the side of the dock the handle sits on;
 * dragging away from the dock makes it larger.
 */
export function ResizeHandle({ dock, edge }: { dock: Dock; edge: 'left' | 'right' | 'top'; }) {
  const vertical = edge === 'top';
  const start = (event: React.PointerEvent) => {
    event.preventDefault();
    const store = useStore.getState();
    const origin = vertical ? event.clientY : event.clientX;
    const initial = store.layout[dock].size;
    const direction = edge === 'right' ? 1 : -1;
    const bodyClass = vertical ? 'lm-resizing-row' : 'lm-resizing';
    document.body.classList.add(bodyClass);
    const move = (e: PointerEvent) => {
      const delta = (vertical ? e.clientY : e.clientX) - origin;
      useStore.getState().setDockSize(dock, initial + delta * direction);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove(bodyClass);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const shape = vertical ? 'h-[3px] w-full cursor-row-resize' : 'w-[3px] cursor-col-resize';
  return <div onPointerDown={start} className={`lm-transition shrink-0 hover:bg-accent ${shape}`} />;
}
