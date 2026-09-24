/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { Download, ExternalLink, RefreshCw, ZapOff } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { debug } from '@/core/debug/manager';
import { Button } from '../ui';

/** Notes about missing debug adapters — installing happens only on a click, in the terminal. */
export function MissingAdapters() {
  const t = useT();
  const missing = debug.missing;
  if (!missing.length) {
    return null;
  }
  return (
    <div className="lm-anim-fade shrink-0 border-b border-edge bg-surface px-3 py-2">
      <div className="mb-1 flex items-center gap-2">
        <ZapOff size={12} className="text-warn" />
        <span className="flex-1 text-[12px] text-fg">{t('debug.missing.title')}</span>
        <Button size="sm" title={t('debug.missing.recheck')} onClick={() => void debug.refreshAdapters()}>
          <RefreshCw size={11} /> {t('debug.missing.recheck')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {missing.map((entry) => (
          <div key={entry.label} className="min-w-[220px] flex-1 rounded-lumen-sm border border-dashed border-edge px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{entry.label}</span>
              <span className="shrink-0 text-[10.5px] text-subtle">{entry.language}</span>
            </div>
            {entry.install && <p className="mt-0.5 font-mono text-[10.5px] leading-snug text-subtle">{entry.install}</p>}
            <div className="mt-1 flex items-center gap-1">
              {entry.installCommand && (
                <Button
                  size="sm"
                  variant="outline"
                  title={entry.installCommand}
                  onClick={() => void useStore.getState().openTerminal({ command: entry.installCommand, title: entry.label })}
                >
                  <Download size={11} /> {t('debug.missing.install')}
                </Button>
              )}
              {entry.docs && (
                <Button size="sm" title={entry.docs} onClick={() => void window.lumen.shell.openExternal(entry.docs!)}>
                  <ExternalLink size={11} /> {t('debug.missing.docs')}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
