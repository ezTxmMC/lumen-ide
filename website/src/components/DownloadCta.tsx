/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useMemo } from 'react';
import { Link } from 'react-router';
import { detectOs, fileKind, formatSize, OS_NAME, primaryDownload, useRelease } from '@/lib/release';
import { OsIcon } from './OsIcon';

function DownloadGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
    </svg>
  );
}

/** One button for the visitor's own system, straight from latest.json — and the way to all the others. */
export function DownloadCta({ secondary }: { secondary?: { to: string; label: string; }; }) {
  const { release } = useRelease();
  const os = useMemo(detectOs, []);
  const primary = primaryDownload(release, os);
  const fill = 'inline-flex items-center gap-2.5 rounded-[10px] bg-[#7c8cff] px-[22px] py-3 text-[16px] font-semibold text-[#0b0d10] transition-colors hover:bg-[#95a2ff] active:translate-y-px';
  const ghost = 'inline-flex items-center rounded-[10px] border border-white/20 px-[22px] py-3 text-[16px] font-semibold text-[#eef0f6] transition-colors hover:bg-white/[0.07]';

  return (
    <div className="grid justify-items-center gap-3">
      <div className="flex flex-wrap justify-center gap-3">
        {primary && (
          <a className={fill} href={primary.url}>
            <OsIcon os={primary.os} size={17} />
            Download for {OS_NAME[primary.os]}
          </a>
        )}
        {!primary && (
          <Link className={fill} to="/download">
            <DownloadGlyph />
            Download for free
          </Link>
        )}
        {secondary && <Link className={ghost} to={secondary.to}>{secondary.label}</Link>}
      </div>
      <span className="font-mono text-[12px] text-[#737d9c]">
        {primary && `v${release?.version} · ${fileKind(primary.file.name)} · ${formatSize(primary.file.size)} · `}
        {primary && <Link to="/download" className="underline decoration-white/25 underline-offset-2 hover:text-[#c3cbff]">other platforms</Link>}
        {!primary && (release ? `v${release.version} · Linux · Windows · macOS · no account` : 'Linux · Windows · macOS · no account')}
      </span>
    </div>
  );
}
