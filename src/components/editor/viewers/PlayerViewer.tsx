/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import type { Tab } from '@/state/store';
import { mediaUrl } from '@/lib/media-kind';
import { useT } from '@/i18n';
import { InfoBar, InfoItem, useFileInfo, ViewerFallback } from './chrome';

interface Facts {
  duration: number;
  width: number;
  height: number;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '–';
  }
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${s}`;
  }
  return `${m}:${s}`;
}

/** Video and audio with the native controls, framed in Lumen's look. */
export function PlayerViewer({ tab, kind }: { tab: Tab; kind: 'video' | 'audio'; }) {
  const t = useT();
  const path = tab.path ?? '';
  const revision = tab.revision ?? 0;
  const info = useFileInfo(path, revision);
  const src = mediaUrl(path, revision);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [src]);

  const onMetadata = (event: React.SyntheticEvent<HTMLMediaElement>) => {
    const media = event.currentTarget;
    const video = media instanceof HTMLVideoElement ? media : null;
    setFacts({ duration: media.duration, width: video?.videoWidth ?? 0, height: video?.videoHeight ?? 0 });
  };
  const onError = () => setFailed(true);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg" data-viewer={kind}>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6">
        {failed && (
          <ViewerFallback
            path={path}
            title={t(kind === 'video' ? 'media.videoUnsupported' : 'media.audioUnsupported')}
            hint={t('media.codecHint')}
          />
        )}
        {!failed && kind === 'video' && (
          <video
            key={src}
            src={src}
            controls
            preload="metadata"
            onLoadedMetadata={onMetadata}
            onError={onError}
            className="lm-shadow lm-anim-fade max-h-full max-w-full rounded-lumen border border-edge bg-black"
          />
        )}
        {!failed && kind === 'audio' && (
          <div className="lm-glass lm-shadow lm-anim-fade flex w-full max-w-lg flex-col items-center gap-4 rounded-lumen border border-edge px-6 py-6">
            <div className="flex size-16 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Music size={28} />
            </div>
            <div className="max-w-full truncate text-[13px] font-medium text-fg">{tab.name}</div>
            <audio
              key={src}
              src={src}
              controls
              preload="metadata"
              onLoadedMetadata={onMetadata}
              onError={onError}
              className="w-full"
            />
          </div>
        )}
      </div>
      <InfoBar tab={tab} info={info}>
        {facts && <InfoItem label={t('media.duration')} value={formatDuration(facts.duration)} />}
        {facts && facts.width > 0 && <InfoItem label={t('media.dimensions')} value={`${facts.width} × ${facts.height}`} />}
      </InfoBar>
    </div>
  );
}
