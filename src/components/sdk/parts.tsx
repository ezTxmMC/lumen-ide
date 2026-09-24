/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Small building blocks of the SDK interface: brand, badge, progress. */

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { locale, useT } from '@/i18n';
import type { InstallProgress } from '@/core/sdk';
import { Button } from '../ui';

export function formatBytes(bytes: number): string {
  if (!bytes) {
    return '—';
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toLocaleString(locale(), { maximumFractionDigits: 2 })} GB`;
  }
  return `${mb.toLocaleString(locale(), { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
}

/** The distribution's coloured glyph. */
export function DistributionMark({ name, color, size = 32 }: { name: string; color: string; size?: number; }) {
  const initials = name.split(/\s+/).filter((word) => /^[A-Za-z]/.test(word)).slice(-2).map((word) => word[0]).join('');
  return (
    <span
      className="lm-transition flex shrink-0 items-center justify-center rounded-lumen-sm font-mono text-[11px] font-bold"
      style={{
        width: size,
        height: size,
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {initials || 'J'}
    </span>
  );
}

const BADGE_TONES = {
  neutral: 'border-edge text-muted',
  accent: 'border-accent/40 bg-accent/10 text-accent',
  ok: 'border-ok/40 bg-ok/10 text-ok',
  warn: 'border-warn/40 bg-warn/10 text-warn',
};

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: keyof typeof BADGE_TONES; title?: string; }) {
  return (
    <span title={title} className={`inline-flex h-[17px] shrink-0 items-center rounded-full border px-1.5 text-[10px] font-medium ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

/** Text for the current phase of an installation. */
function progressText(progress: InstallProgress, t: ReturnType<typeof useT>): string {
  if (progress.phase === 'download' && progress.total > 0) {
    return t('sdk.progress.download', {
      received: formatBytes(progress.received), total: formatBytes(progress.total), speed: formatBytes(progress.speed),
    });
  }
  if (progress.phase === 'download') {
    return t('sdk.progress.downloadUnknown', { received: formatBytes(progress.received), speed: formatBytes(progress.speed) });
  }
  if (progress.phase === 'error') {
    return t('sdk.progress.error', { message: progress.error ?? '' });
  }
  return t(`sdk.progress.${progress.phase}`);
}

export function InstallProgressBar({ progress, onCancel }: { progress: InstallProgress; onCancel: () => void; }) {
  const t = useT();
  const failed = progress.phase === 'error';
  const indeterminate = progress.phase !== 'download' || progress.total <= 0;
  const percent = indeterminate ? 100 : Math.min(100, Math.round((progress.received / progress.total) * 100));
  return (
    <div className="lm-anim-fade flex w-full flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-active">
          <div
            className={[
              'absolute inset-y-0 left-0 rounded-full transition-[width] duration-200',
              failed ? 'bg-bad' : 'bg-accent',
              indeterminate && !failed ? 'lm-anim-pulse' : '',
            ].join(' ')}
            style={{ width: `${percent}%` }}
          />
        </div>
        {!indeterminate && <span className="w-9 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-muted">{percent} %</span>}
        <Button size="sm" title={failed ? t('common.close') : t('common.cancel')} onClick={onCancel}>
          <X size={12} />
        </Button>
      </div>
      <div className={`truncate text-[11px] ${failed ? 'text-bad' : 'text-subtle'}`} title={progress.error}>
        {progressText(progress, t)}
      </div>
    </div>
  );
}
