/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { memo, useState } from 'react';
import { Check, CopyPlus, Download, Pencil, Trash2 } from 'lucide-react';
import { useT } from '@/i18n';
import { syntaxColor } from '@/core/theme-colors';
import type { Theme } from '@/core/types';
import { CodeLines } from './preview/IdePreview';

/** A shrunken IDE as the preview image on a theme card. */
export function MiniIde({ theme }: { theme: Theme; }) {
  const ui = theme.ui;
  return (
    <div className="pointer-events-none flex h-full flex-col overflow-hidden" style={{ background: ui.bg, color: ui.text }}>
      <div className="flex h-4 shrink-0 items-center gap-1 border-b px-1.5" style={{ background: ui.bgElevated, borderColor: ui.border }}>
        {[ui.danger, ui.warning, ui.success].map((color, i) => (
          <span key={i} className="size-1.5 rounded-full" style={{ background: color }} />
        ))}
        <span className="mx-auto h-1.5 w-16 rounded-full" style={{ background: ui.bgInput, border: `1px solid ${ui.border}` }} />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-5 shrink-0 flex-col items-center gap-1.5 border-r pt-1.5" style={{ background: ui.bgElevated, borderColor: ui.border }}>
          <span className="h-1.5 w-2.5 rounded-sm" style={{ background: ui.accent }} />
          {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-2.5 rounded-sm" style={{ background: ui.textSubtle, opacity: 0.6 }} />)}
        </div>
        <div className="flex w-[70px] shrink-0 flex-col gap-[3px] border-r p-1.5" style={{ background: ui.bgElevated, borderColor: ui.border }}>
          {[62, 80, 54, 70, 46].map((width, i) => (
            <span
              key={i}
              className="flex h-[9px] items-center rounded-[2px] px-[3px]"
              style={{ background: i === 1 ? ui.bgActive : undefined, marginLeft: i > 0 ? 5 : 0 }}
            >
              <span className="h-[3px] rounded-full" style={{ width: `${width}%`, background: i === 1 ? ui.text : ui.textMuted, opacity: i === 1 ? 1 : 0.6 }} />
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-3.5 shrink-0 items-stretch border-b" style={{ background: ui.bgElevated, borderColor: ui.border }}>
            <span className="w-12" style={{ background: ui.bg, borderTop: `1.5px solid ${ui.accent}` }} />
            <span className="w-10 border-r" style={{ borderColor: ui.border }} />
          </div>
          <CodeLines theme={theme} compact />
        </div>
      </div>
      <div className="flex h-3 shrink-0 items-center border-t" style={{ background: ui.bgElevated, borderColor: ui.border }}>
        <span className="h-full w-8" style={{ background: ui.accent }} />
      </div>
    </div>
  );
}

function CardAction({ title, icon, run, danger = false }: { title: string; icon: React.ReactNode; run(): void; danger?: boolean; }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); run(); }}
      className={[
        'lm-transition flex size-7 items-center justify-center rounded-lumen-sm border border-edge lm-glass',
        danger ? 'text-bad hover:bg-bad/15' : 'text-muted hover:bg-hover hover:text-fg',
      ].join(' ')}
    >
      {icon}
    </button>
  );
}

/** Actions on hover. */
function CardActions({ custom, onEdit, onDuplicate, onExport, onAskDelete }: {
  custom: boolean;
  onEdit(): void;
  onDuplicate(): void;
  onExport(): void;
  onAskDelete(): void;
}) {
  const t = useT();
  return (
    <div className="lm-transition absolute top-2 right-2 flex gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
      <CardAction title={custom ? t('common.edit') : t('themeStudio.dialog.editCopy')} icon={<Pencil size={13} />} run={onEdit} />
      <CardAction title={t('common.duplicate')} icon={<CopyPlus size={13} />} run={onDuplicate} />
      <CardAction title={t('common.export')} icon={<Download size={13} />} run={onExport} />
      {custom && <CardAction title={t('common.delete')} icon={<Trash2 size={13} />} run={onAskDelete} danger />}
    </div>
  );
}

function DeleteConfirm({ name, onCancel, onDelete }: { name: string; onCancel(): void; onDelete(): void; }) {
  const t = useT();
  return (
    <div
      className="lm-anim-fade absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 p-3 text-center"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[12.5px] font-medium text-white">{t('common.confirmDelete', { name: name })}</span>
      <div className="flex gap-1.5">
        <button onClick={onCancel} className="lm-transition h-7 rounded-lumen-sm bg-white/15 px-3 text-[12px] text-white hover:bg-white/25">
          {t('common.cancel')}
        </button>
        <button onClick={onDelete} className="lm-transition h-7 rounded-lumen-sm bg-bad px-3 text-[12px] font-medium text-white hover:opacity-90">
          {t('common.delete')}
        </button>
      </div>
    </div>
  );
}

function CardFooter({ theme, custom }: { theme: Theme; custom: boolean; }) {
  const t = useT();
  const swatches = (['keyword', 'string', 'function', 'type', 'number', 'comment'] as const).map((kind) => syntaxColor(theme, kind));
  return (
    <div className="flex items-center gap-2 border-t border-edge bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-fg" title={theme.name}>{theme.name}</div>
        <div className="truncate text-[11px] text-subtle">
          {t(`common.${theme.type}`)}
          {theme.author ? ` · ${theme.author}` : ''}
          {custom ? ` · ${t('common.custom')}` : ''}
        </div>
      </div>
      <div className="flex shrink-0 -space-x-1">
        <span className="size-3.5 rounded-full border-2" style={{ background: theme.ui.accent, borderColor: theme.ui.bgElevated }} />
        {swatches.map((color, i) => (
          <span key={i} className="size-3.5 rounded-full border-2" style={{ background: color, borderColor: theme.ui.bgElevated }} />
        ))}
      </div>
    </div>
  );
}

function ThemeCardView({
  theme, active, custom, index, onSelect, onEdit, onDuplicate, onExport, onDelete,
}: {
  theme: Theme;
  active: boolean;
  custom: boolean;
  index: number;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);

  return (
    // Fade in on the outer element, so hovering's lift is not overridden by the animation.
    <div className="lm-anim-up" style={{ animationDelay: `calc(var(--duration) * ${Math.min(index, 12) * 0.25})` }}>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={active}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) {
            return;
          }
          if (e.key !== 'Enter' && e.key !== ' ') {
            return;
          }
          e.preventDefault();
          onSelect();
        }}
        className={[
          'lm-ts-card lm-transition group relative flex cursor-pointer flex-col overflow-hidden rounded-lumen border text-left',
          active ? 'border-accent lm-glow' : 'border-edge hover:border-edge-strong',
        ].join(' ')}
      >
        <div className="relative h-[150px] overflow-hidden">
          <MiniIde theme={theme} />
          {active && (
            <span className="lm-anim-pop absolute top-2 left-2 flex h-6 items-center gap-1 rounded-full bg-accent px-2 text-[11px] font-medium text-accent-fg">
              <Check size={12} /> {t('themeStudio.dialog.active')}
            </span>
          )}

          <CardActions custom={custom} onEdit={onEdit} onDuplicate={onDuplicate} onExport={onExport} onAskDelete={() => setConfirming(true)} />

          {confirming && (
            <DeleteConfirm name={theme.name} onCancel={() => setConfirming(false)} onDelete={() => { setConfirming(false); onDelete(); }} />
          )}
        </div>

        <CardFooter theme={theme} custom={custom} />
      </div>
    </div>
  );
}

/** Redraw only when the theme itself changes — editing in the Studio changes one card. */
export const ThemeCard = memo(ThemeCardView, (a, b) =>
  a.theme === b.theme && a.active === b.active && a.custom === b.custom && a.index === b.index);
