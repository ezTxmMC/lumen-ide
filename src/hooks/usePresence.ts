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
 * Showing and hiding overlays: after closing, the element stays in the DOM
 * until its exit animation (`--duration-exit`) is through. While that runs
 * `closing` is set — the component then adds `lm-closing`.
 */

import { useEffect, useRef, useState } from 'react';
import { useStore, type DialogId } from '@/state/store';

/** The length of the exit animation in ms as the theme system currently sets it (0 when animations are off). */
export function exitDuration(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--duration-exit').trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (raw.endsWith('ms')) {
    return value;
  }
  return value * 1000;
}

export function usePresence(open: boolean): { visible: boolean; closing: boolean; } {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) {
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), exitDuration());
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  return { visible: open || mounted, closing: !open && mounted };
}

/** Keep the last value set — the content stays put while hiding (a form spec, say). */
export function useLastValue<T>(value: T | null | false | undefined): T | null {
  const last = useRef<T | null>(null);
  if (value) {
    last.current = value;
  }
  return last.current;
}

/** A large dialog: open, or in the middle of hiding. */
export function useDialogVisible(id: DialogId): boolean {
  const open = useStore((s) => s.dialog === id);
  return usePresence(open).visible;
}
