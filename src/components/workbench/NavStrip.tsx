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
 * The strip of icons at the outer edge of a side dock — the panel
 * navigation. Each icon opens its view; icons can be dragged to reorder them,
 * onto the other strip, or into the bottom panel.
 *
 * The strip on the navigation side (`layout.navSide`) also carries the global
 * buttons: extensions, themes, shortcuts, settings. The other one only shows
 * while its dock holds views — or while a view is being dragged, as a place to
 * drop it.
 */

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Keyboard, Package, Palette, Settings } from 'lucide-react';
import { useStore, type DialogId } from '@/state/store';
import { formatBindingsFor, keybindings } from '@/core/keybindings';
import { useT } from '@/i18n';
import type { ViewDef } from '@/core/views';
import { ContextMenu, type MenuItem } from '../ui/ContextMenu';
import { carriesView, dropIndex, takeDroppedView, useDraggedView, viewDragSource } from './drag';
import { useBadgeTick, useDock } from './useDock';
import { PoppedMark, StripBadge, viewMenu, viewTooltip } from './parts';

/** The lower icons: these open large dialogs rather than a view. */
const DIALOGS: { id: DialogId; icon: typeof Package; label: string; command: string; }[] = [
  { id: 'extensions', icon: Package, label: 'extensions.title', command: 'view.extensions' },
  { id: 'themes', icon: Palette, label: 'shell.dialog.themes', command: 'view.themes' },
  { id: 'keybindings', icon: Keyboard, label: 'shell.dialog.keybindings', command: 'view.keybindings' },
  // Settings last, at the very bottom — where VS Code keeps its gear.
  { id: 'settings', icon: Settings, label: 'shell.dialog.settings', command: 'view.settings' },
];

function withHint(label: string, command: string) {
  const hint = formatBindingsFor(command);
  return hint ? `${label} (${hint})` : label;
}

/** The global buttons at the bottom of the primary strip. */
function DialogButtons() {
  const t = useT();
  const dialog = useStore((s) => s.dialog);
  return (
    <>
      {DIALOGS.map(({ id, icon: Icon, label, command }) => (
        <button
          key={id}
          onClick={() => (dialog === id ? useStore.getState().closeDialog() : useStore.getState().openDialog(id))}
          title={withHint(t(label), command)}
          aria-label={t(label)}
          aria-pressed={dialog === id}
          className={[
            'lm-transition lm-press relative flex size-9 items-center justify-center rounded-lumen',
            dialog === id ? 'text-accent' : 'text-subtle hover:bg-hover hover:text-fg',
          ].join(' ')}
        >
          <Icon size={17} strokeWidth={dialog === id ? 2.1 : 1.8} className="lm-icon-pop" />
        </button>
      ))}
    </>
  );
}

/** A sliding active-item bar rather than hard jumps. */
function useActiveIndicator(activeId: string | null, buttons: React.MutableRefObject<Map<string, HTMLButtonElement>>, viewCount: number) {
  const [indicator, setIndicator] = useState<{ top: number; visible: boolean; }>({ top: 0, visible: false });
  useLayoutEffect(() => {
    const el = activeId ? buttons.current.get(activeId) : null;
    if (!el) {
      setIndicator((current) => ({ ...current, visible: false }));
      return;
    }
    setIndicator({ top: el.offsetTop + el.offsetHeight / 2 - 8, visible: true });
  }, [activeId, viewCount, buttons]);
  return indicator;
}

export function NavStrip({ side }: { side: 'left' | 'right'; }) {
  const t = useT();
  const primary = useStore((s) => s.layout.navSide === side);
  const { views, active, open } = useDock(side);
  const dragging = useDraggedView();
  useBadgeTick();
  useSyncExternalStore(keybindings.subscribe, keybindings.getVersion);

  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; } | null>(null);
  const activeId = open ? active?.id ?? null : null;

  const indicator = useActiveIndicator(activeId, buttons, views.length);

  if (!primary && !views.length && !dragging) {
    return null;
  }

  const iconElements = () => views.map((view) => buttons.current.get(view.id)).filter((el): el is HTMLButtonElement => Boolean(el));

  const onDragOver = (event: React.DragEvent) => {
    if (!carriesView(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropAt(dropIndex(iconElements(), event.clientY, 'y'));
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
      useStore.getState().moveView(id, side, index);
    }
  };

  const border = side === 'left' ? 'border-r' : 'border-l';
  const edge = side === 'left' ? 'left-0' : 'right-0';
  const highlight = dragging ? 'bg-accent/5' : '';

  return (
    <nav
      className={`relative flex w-11 shrink-0 flex-col items-center gap-0.5 ${border} border-edge bg-surface py-2 ${highlight}`}
      onDragOver={onDragOver}
      onDragLeave={() => setDropAt(null)}
      onDrop={onDrop}
    >
      <span
        aria-hidden
        className={`lm-indicator absolute ${edge} h-4 w-[2px] rounded-full bg-accent`}
        style={{ top: indicator.top, opacity: indicator.visible ? 1 : 0 }}
      />
      {views.map((view, index) => (
        <StripButton
          key={view.id}
          view={view}
          active={view.id === activeId}
          dropBefore={dropAt === index}
          register={(el) => { if (el) {
            buttons.current.set(view.id, el);
          } }}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY, items: viewMenu(view, side) });
          }}
        />
      ))}
      {dropAt !== null && dropAt >= views.length && <DropLine />}
      {!views.length && dragging && (
        <div className="mx-1 mt-1 rounded-lumen-sm border border-dashed border-accent px-0.5 py-3 text-center text-[9px] leading-tight text-accent">
          {t('shell.layout.empty')}
        </div>
      )}

      <div className="flex-1" />

      {primary && <DialogButtons />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </nav>
  );
}

function DropLine() {
  return <span aria-hidden className="h-[2px] w-7 shrink-0 rounded-full bg-accent" />;
}

function StripButton({ view, active, dropBefore, register, onContextMenu }: {
  view: ViewDef;
  active: boolean;
  dropBefore: boolean;
  register: (el: HTMLButtonElement | null) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const Icon = view.icon;
  const badge = view.badge?.() ?? null;
  return (
    <>
      {dropBefore && <DropLine />}
      <button
        ref={register}
        {...viewDragSource(view.id)}
        onClick={() => useStore.getState().toggleView(view.id)}
        onContextMenu={onContextMenu}
        title={viewTooltip(view)}
        aria-label={view.title()}
        aria-pressed={active}
        className={[
          'lm-transition lm-press relative flex size-9 shrink-0 items-center justify-center rounded-lumen',
          active ? 'text-accent' : 'text-subtle hover:bg-hover hover:text-fg',
        ].join(' ')}
      >
        <Icon size={17} strokeWidth={active ? 2.1 : 1.8} className="lm-icon-pop" />
        {!active && <StripBadge badge={badge} />}
        <PoppedMark id={view.id} className="absolute right-1 bottom-1" />
      </button>
    </>
  );
}
