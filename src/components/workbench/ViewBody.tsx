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
 * The body of the view a dock shows: the view itself — or, while the view is
 * open in a window of its own, a note saying so, with the way back.
 */

import { AppWindow } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { isViewPopped, popoutKey } from '@/state/popout';
import type { ViewDef } from '@/core/views';
import { Button, Empty } from '../ui';

export function ViewBody({ view }: { view: ViewDef; }) {
  const t = useT();
  const popped = useStore((s) => isViewPopped(s.popouts, view.id));
  if (!popped) {
    return <>{view.render()}</>;
  }

  const key = popoutKey('view', view.id);
  return (
    <Empty
      icon={<AppWindow size={22} strokeWidth={1.4} />}
      title={t('popout.placeholderTitle')}
      hint={t('popout.placeholderHint')}
      action={(
        <div className="flex items-center justify-center gap-1.5">
          <Button variant="outline" onClick={() => useStore.getState().dockBack(key)}>{t('popout.bringBack')}</Button>
          <Button onClick={() => useStore.getState().focusPopout(key)}>{t('popout.focusWindow')}</Button>
        </div>
      )}
    />
  );
}
