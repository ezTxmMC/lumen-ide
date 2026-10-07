/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { ExtensionSummary } from '@/core/extensions/types';
import { useT } from '@/i18n';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useCallback } from 'react';

/** How a server's standing reads in the list. */
export function trustLabel(official: boolean, trusted: boolean): string {
  if (official) {
    return "extensions.serverOfficial";
  }
  if (trusted) {
    return "extensions.serverTrusted";
  }
  return "extensions.serverUnverified";
}

export function Badge(
  { icon, color, size = 26 }: { icon?: string; color?: string; size?: number },
) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lumen-sm font-semibold text-white"
      style={{
        background: color ?? "#7c8cff",
        width: size,
        height: size,
        fontSize: size * 0.42,
      }}
    >
      {(icon ?? "?").slice(0, 2)}
    </span>
  );
}

/** What the server's security scan said about the recommended version, as a small shield. */
export function SecurityMark({ security }: { security: NonNullable<ExtensionSummary["security"]>; }) {
  const t = useT();
  const count = (security.counts?.critical ?? 0) + (security.counts?.high ?? 0) + (security.counts?.medium ?? 0);
  if (security.verdict === "clean") {
    return <span title={t("security.badge.clean")}><ShieldCheck size={12} className="shrink-0 text-good" /></span>;
  }
  return <span title={t("security.badge.warn", { count })}><ShieldAlert size={12} className="shrink-0 text-warn" /></span>;
}

/** What the extension brings, as a list. */
export function useProvidesText() {
  const t = useT();
  return useCallback((provides: Record<string, number> | undefined) => {
    if (!provides) {
      return "";
    }
    return Object.entries(provides)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => t(`extensions.provides.${key}`, { count }))
      .filter((part) => !part.startsWith("extensions.provides."))
      .join(" · ");
  }, [t]);
}
