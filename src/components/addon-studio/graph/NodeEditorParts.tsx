/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useT } from '@/i18n';
import { PIN_COLORS, type PinDef } from '@/core/user-addons/catalog';
import type { Graph } from '@/core/user-addons/schema';

/** The presentational building blocks of the node editor. */

export function EdgeView({
  d, pinType, selected, hot, onDown,
}: {
  d: string;
  pinType: PinDef['type'];
  selected: boolean;
  hot: boolean;
  onDown: (event: React.MouseEvent) => void;
}) {
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onMouseDown={onDown}
      />
      <path
        d={d}
        fill="none"
        stroke={selected ? 'var(--c-accent)' : PIN_COLORS[pinType]}
        strokeOpacity={selected || hot ? 1 : 0.75}
        strokeWidth={(pinType === 'exec' ? 2.6 : 2) + (selected || hot ? 1 : 0)}
        style={{ pointerEvents: 'none', filter: hot ? 'drop-shadow(0 0 4px var(--c-accent))' : undefined }}
      />
    </g>
  );
}

export function CommentFrame({
  comment, selected, editing, onMoveStart, onEditStart, onEditEnd, onEditFinish, onText, onResizeStart,
}: {
  comment: NonNullable<Graph['comments']>[number];
  selected: boolean;
  editing: boolean;
  onMoveStart: (event: React.MouseEvent) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  onEditFinish: () => void;
  onText: (text: string) => void;
  onResizeStart: (event: React.MouseEvent) => void;
}) {
  const t = useT();
  return (
    <div
      className="absolute rounded-lumen border-2"
      style={{
        left: comment.x,
        top: comment.y,
        width: comment.w,
        height: comment.h,
        borderColor: selected ? 'var(--c-accent)' : `${comment.color ?? '#8b939f'}66`,
        background: `${comment.color ?? '#8b939f'}14`,
        pointerEvents: 'none',
      }}
    >
      <div
        className="flex h-7 cursor-move items-center px-2 text-[12px] font-medium text-muted"
        style={{ pointerEvents: 'auto', background: `${comment.color ?? '#8b939f'}26` }}
        onMouseDown={onMoveStart}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEditStart();
        }}
      >
        {editing && (
          <input
            autoFocus
            value={comment.text}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => onText(e.target.value)}
            onBlur={onEditEnd}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== 'Escape') {
                return;
              }
              e.stopPropagation();
              onEditFinish();
            }}
            className="w-full bg-transparent text-[12px] text-fg outline-none"
          />
        )}
        {!editing && <span className="truncate">{comment.text || t('addonStudio.graph.commentDefault')}</span>}
      </div>
      <div
        className="absolute right-0 bottom-0 size-3 cursor-nwse-resize"
        style={{ pointerEvents: 'auto', background: `linear-gradient(135deg, transparent 50%, ${selected ? 'var(--c-accent)' : '#8b939f88'} 50%)` }}
        onMouseDown={onResizeStart}
      />
    </div>
  );
}

export function ToolButton({
  title, onClick, children, disabled, active,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
/** Only for redrawing after history changes. */
  version?: number;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'lm-transition flex size-6 items-center justify-center rounded-[4px] disabled:opacity-35',
        active ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
