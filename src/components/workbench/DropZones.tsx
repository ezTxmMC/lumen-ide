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
 * While a view is dragged, three targets appear over the editor: its left
 * edge, its right edge and its bottom edge. Dropping there moves the view into
 * that dock — also when the dock is closed or empty and has nothing else to
 * drop onto.
 */

import { useState } from 'react';
import { ArrowDownToLine, PanelLeft, PanelRight } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import type { Dock } from '@/core/views';
import { LAYER } from '../ui/layers';
import { carriesView, takeDroppedView, useDraggedView } from './drag';

const ZONES: { dock: Dock; label: string; icon: typeof PanelLeft; place: string; }[] = [
  { dock: 'left', label: 'shell.layout.dropLeft', icon: PanelLeft, place: 'top-2 bottom-20 left-2 w-24' },
  { dock: 'right', label: 'shell.layout.dropRight', icon: PanelRight, place: 'top-2 bottom-20 right-2 w-24' },
  { dock: 'bottom', label: 'shell.layout.dropBottom', icon: ArrowDownToLine, place: 'right-28 bottom-2 left-28 h-16' },
];

export function DropZones() {
  const t = useT();
  const dragging = useDraggedView();
  const [over, setOver] = useState<Dock | null>(null);

  if (!dragging) {
    return null;
  }

  return (
    <div className={`pointer-events-none absolute inset-0 ${LAYER.dropZones}`}>
      {ZONES.map(({ dock, label, icon: Icon, place }) => (
        <div
          key={dock}
          onDragOver={(event) => {
            if (!carriesView(event)) {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setOver(dock);
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(event) => {
            if (!carriesView(event)) {
              return;
            }
            event.preventDefault();
            setOver(null);
            const id = takeDroppedView(event);
            if (id) {
              useStore.getState().moveView(id, dock);
            }
          }}
          className={[
            'lm-anim-fade lm-transition pointer-events-auto absolute flex flex-col items-center justify-center gap-1.5 rounded-lumen border-2 border-dashed text-[11px]',
            place,
            over === dock ? 'border-accent bg-accent/15 text-accent' : 'border-edge-strong bg-bg/70 text-subtle',
          ].join(' ')}
        >
          <Icon size={18} />
          <span className="px-1 text-center leading-tight">{t(label)}</span>
        </div>
      ))}
    </div>
  );
}
