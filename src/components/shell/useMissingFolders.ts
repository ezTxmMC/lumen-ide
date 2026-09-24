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
import type { RecentProject } from '@/state/store';

/** Folders of recent projects that are gone (moved, an unplugged drive), so lists can dim them. */
export function useMissingFolders(recent: RecentProject[]): Set<string> {
  const [missing, setMissing] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    void Promise.all(recent.map(async (entry) => [entry.path, await window.lumen.fs.exists(entry.path).catch(() => false)] as const))
      .then((results) => {
        if (cancelled) {
          return;
        }
        setMissing(new Set(results.filter(([, exists]) => !exists).map(([path]) => path)));
      });
    return () => { cancelled = true; };
  }, [recent]);
  return missing;
}
