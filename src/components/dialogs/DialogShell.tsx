/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { useStore, type DialogId } from '@/state/store';
import { useT } from '@/i18n';
import { Button } from '../ui';
import { usePresence } from '@/hooks/usePresence';

export interface DialogSection {
  id: string;
  label: string;
  icon?: typeof X;
  /** A small number or marker beside the entry. */
  badge?: string;
}

/** Esc closes the dialog — unless a studio is open above it or a shortcut is being recorded. */
function useEscapeToClose(open: boolean, close: () => void, studioOpen: boolean) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || studioOpen) {
        return;
      }
      if ((event.target as HTMLElement | null)?.closest?.('[data-keybinding-recorder]')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close, studioOpen]);
}

function ShellHeader({ title, icon: Icon, search, onSearch, searchPlaceholder, headerExtra, onClose }: {
  title: string;
  icon: typeof X;
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  headerExtra?: ReactNode;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-edge px-4 py-2.5">
      <Icon size={16} className="shrink-0 text-accent" />
      <h2 className="shrink-0 text-[14px] font-medium text-fg">{title}</h2>
      {onSearch && (
        <label className="lm-transition ml-2 flex max-w-[360px] flex-1 items-center gap-2 rounded-lumen-sm border border-edge bg-input px-2 py-1 focus-within:border-accent">
          <Search size={12} className="shrink-0 text-subtle" />
          <input
            autoFocus
            value={search ?? ''}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder ?? t('common.searchPlaceholder')}
            className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-subtle"
          />
        </label>
      )}
      <span className="flex-1" />
      {headerExtra}
      <Button size="sm" title={t('common.closeEsc')} onClick={onClose}>
        <X size={14} />
      </Button>
    </header>
  );
}

function SectionNav({ sections, section, onSection }: {
  sections: DialogSection[];
  section?: string;
  onSection?: (id: string) => void;
}) {
  return (
    <nav className="flex w-[200px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-edge p-2">
  {sections.map((entry, index) => {
    const active = entry.id === section;
    const EntryIcon = entry.icon;
    return (
      <button
        key={entry.id}
        onClick={() => onSection?.(entry.id)}
        style={{ animationDelay: `calc(var(--duration) * ${index * 0.15})` }}
        className={[
          'lm-transition lm-anim-right flex h-8 items-center gap-2 rounded-lumen-sm px-2.5 text-left text-[12.5px]',
          active ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
        ].join(' ')}
      >
        {EntryIcon && <EntryIcon size={13} className={active ? 'text-accent' : 'text-subtle'} />}
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        {entry.badge && <span className="shrink-0 font-mono text-[10px] text-subtle">{entry.badge}</span>}
      </button>
    );
  })}
</nav>
  );
}

/**
 * The shared frame of the large dialogs (settings, themes, add-ons, keyboard
 * shortcuts, SDKs): a header with title and search, navigation on the left,
 * content on the right. Esc, or a click beside it, closes.
 */
export function DialogShell({
  id, title, icon: Icon, sections, section, onSection, search, onSearch, searchPlaceholder,
  headerExtra, footer, children, wide = false,
}: {
  id: DialogId;
  title: string;
  icon: typeof X;
  sections?: DialogSection[];
  section?: string;
  onSection?: (id: string) => void;
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Wide content, as themes and shortcuts need. */
  wide?: boolean;
}) {
  const open = useStore((s) => s.dialog === id);
  const { visible, closing } = usePresence(open);
  const close = useStore((s) => s.closeDialog);
  const studioOpen = useStore((s) => Boolean(s.editingThemeId || s.addonStudio));

  useEscapeToClose(open, close, studioOpen);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={`lm-anim-fade fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4 ${closing ? 'lm-closing' : ''}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) {
        close();
      } }}
    >
      <div
        role="dialog"
        aria-label={title}
        className={[
          'lm-glass lm-shadow lm-anim-dialog flex h-full max-h-[860px] w-full flex-col overflow-hidden rounded-lumen-lg border border-edge',
          wide ? 'max-w-[1180px]' : 'max-w-[980px]',
        ].join(' ')}
      >
        <ShellHeader
          title={title}
          icon={Icon}
          search={search}
          onSearch={onSearch}
          searchPlaceholder={searchPlaceholder}
          headerExtra={headerExtra}
          onClose={close}
        />

        <div className="flex min-h-0 flex-1">
          {sections && sections.length > 0 && <SectionNav sections={sections} section={section} onSection={onSection} />}
          <div key={section} className="lm-anim-fade min-w-0 flex-1 overflow-y-auto">
            {children}
          </div>
        </div>

        {footer && (
          <footer className="flex shrink-0 items-center gap-2 border-t border-edge px-4 py-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
