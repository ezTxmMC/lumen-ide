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
 * The window below the title bar: navigation strips at the outer edges, a side
 * dock on either side of the editor, and the bottom dock under it.
 *
 *   ┌────┬──────────┬──────────────────────┬──────────┬────┐
 *   │nav │ left     │ editor               │ right    │nav │
 *   │    │ dock     ├──────────────────────┤ dock     │    │
 *   │    │          │ bottom dock          │          │    │
 *   └────┴──────────┴──────────────────────┴──────────┴────┘
 *
 * Which views sit where is the layout's business (`state/layout.ts`); this
 * component only arranges the docks.
 */

import { useState } from 'react';
import { useStore } from '@/state/store';
import { EditorArea } from '../editor/EditorArea';
import { NavStrip } from './NavStrip';
import { SideDock } from './SideDock';
import { BottomDock } from './BottomDock';
import { DropZones } from './DropZones';
import { registerBuiltinViews } from './builtin-views';

registerBuiltinViews();

export function Workbench() {
  const [maximizedWish, setMaximized] = useState(false);
  const bottomOpen = useStore((s) => s.layout.bottom.open);
  // Closing the bottom dock ends its maximised state; the editor comes back.
  const maximized = maximizedWish && bottomOpen;

  return (
    <div className="flex min-h-0 flex-1">
      <NavStrip side="left" />
      <SideDock side="left" />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Hidden rather than unmounted: the editors keep their state. */}
        <div className={maximized ? 'hidden' : 'min-h-0 flex-1'}>
          <EditorArea />
        </div>
        <BottomDock maximized={maximized} onToggleMaximized={() => setMaximized(!maximized)} />
        <DropZones />
      </main>

      <SideDock side="right" />
      <NavStrip side="right" />
    </div>
  );
}
