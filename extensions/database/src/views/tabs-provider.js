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
 * The provider of the `data` editor view: routes rendering, actions and
 * closing to the tab instance behind each editor tab.
 */

import { errorText } from '../drivers/errors.js';

export function createProvider({ ctx, t, tabs, byKey }) {
  return {
    render(instance) {
      const tab = tabs.get(instance);
      // A tab restored from an earlier run has nothing behind it any more.
      if (!tab) {
        return { nodes: [{ type: 'empty', icon: 'database', title: t('tab.gone'), hint: t('tab.goneHint') }] };
      }
      return tab.render();
    },
    async onAction(event) {
      const tab = tabs.get(event.instance);
      if (!tab) {
        return;
      }
      try {
        await tab.onAction(event);
      } catch (err) {
        ctx.ui.notify(errorText(t, err), 'error');
      }
    },
    onClose(instance) {
      const tab = tabs.get(instance);
      if (!tab) {
        return;
      }
      tabs.delete(instance);
      if (byKey.get(tab.key) === instance) {
        byKey.delete(tab.key);
      }
      tab.dispose?.();
    },
  };
}
