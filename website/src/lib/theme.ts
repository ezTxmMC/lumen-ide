/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from 'react';

const KEY = 'lumen-site-theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function isDark() {
  const choice = document.documentElement.getAttribute('data-theme');
  if (choice === 'dark') {
    return true;
  }
  if (choice === 'light') {
    return false;
  }
  return media().matches;
}

/** The page theme: the system's until the visitor picks one, which is remembered. */
export function useSiteTheme() {
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    const query = media();
    const sync = () => setDark(isDark());
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const toggle = useCallback(() => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private window — the choice lasts until the page closes.
    }
    setDark(next === 'dark');
  }, []);

  return { dark, toggle };
}
