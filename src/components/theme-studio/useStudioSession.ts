/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import type { Theme, TokenKind, UIColorKey } from '@/core/types';
import type { ThemeHistory } from './history';
import { invertTheme } from '@/core/theme-colors';
import { readStorage, splitKey, STORAGE, withColor, writeStorage, type ColorKey } from './keys';
import { pushRecentColor } from './recent';
import type { Confirm } from './StudioParts';

const sameTheme = (a: Theme | null, b: Theme | null) => JSON.stringify(a) === JSON.stringify(b);

/** The draft with the given keys put back to the values of `base`. */
export function resetColors(draft: Theme, base: Theme, keys: ColorKey[]): Theme {
  let next = draft;
  for (const key of keys) {
    const [scope, name] = splitKey(key);
    if (scope === 'ui') {
      next = withColor(next, key, base.ui[name as UIColorKey]);
    }
    if (scope === 'syntax') {
      next = { ...next, syntax: { ...next.syntax, [name]: base.syntax[name as TokenKind] } };
    }
  }
  return next;
}

/**
 * The life of one Studio session: the theme as it was when opened, whether it
 * existed before, and the save / discard / delete flows that follow from that.
 * `onOpened` runs whenever a theme is opened for editing.
 */
export function useStudioSession(history: ThemeHistory, onOpened: () => void) {
  const t = useT();
  const editingId = useStore((s) => s.editingThemeId);
  const closeStudio = useStore((s) => s.closeThemeStudio);
  const saveTheme = useStore((s) => s.saveCustomTheme);
  const deleteTheme = useStore((s) => s.deleteCustomTheme);
  const previewTheme = useStore((s) => s.previewTheme);
  const setTheme = useStore((s) => s.setTheme);
  const draft = history.draft;

  const original = useRef<Theme | null>(null);
  /** Was the theme already saved before the Studio opened? Discarding must then not delete it. */
  const existed = useRef(false);
  /** The theme active before opening — restored after discarding a fresh copy. */
  const previousThemeId = useRef<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  // Notes on opening whether the theme was freshly copied.
  useEffect(() => useStore.subscribe((state, prev) => {
    if (!state.editingThemeId || state.editingThemeId === prev.editingThemeId) {
      return;
    }
    existed.current = prev.customThemes.some((theme) => theme.id === state.editingThemeId);
    previousThemeId.current = prev.themeId;
  }), []);

  useEffect(() => {
    if (!editingId) {
      history.reset(null);
      original.current = null;
      return;
    }
    const current = useStore.getState().customThemes.find((theme) => theme.id === editingId) ?? null;
    original.current = current ? structuredClone(current) : null;
    history.reset(current);
    setConfirm(null);
    onOpened();
  }, [editingId]);

  const dirty = Boolean(draft && original.current && !sameTheme(draft, original.current));

  const save = () => closeStudio(false);

  /** Save without closing (Ctrl+S). */
  const saveKeepOpen = () => {
    if (!draft) {
      return;
    }
    saveTheme(draft);
    original.current = structuredClone(draft);
    existed.current = true;
    useStore.getState().notify(t('common.saved', { name: draft.name }), 'success');
  };

  const discard = () => {
    setConfirm(null);
    if (existed.current && original.current) {
      previewTheme(original.current);
      saveTheme(original.current);
      useStore.setState({ editingThemeId: null });
      return;
    }
    const previous = previousThemeId.current;
    closeStudio(true);
    if (previous && previous !== editingId) {
      setTheme(previous);
    }
  };

  const requestDiscard = () => {
    if (dirty) {
      setConfirm('discard');
      return;
    }
    discard();
  };

  const remove = () => {
    setConfirm(null);
    if (!draft) {
      return;
    }
    const id = draft.id;
    useStore.setState({ editingThemeId: null });
    deleteTheme(id);
  };

  return { editingId, original, existed, confirm, setConfirm, dirty, save, saveKeepOpen, discard, requestDiscard, remove };
}

/** Sets one colour; the colour joins the recent ones once the changes settle. */
export function useColorEdit(history: ThemeHistory) {
  const recentTimer = useRef<number>(0);
  return (key: ColorKey, color: string, mark: string) => {
    const draft = history.draft;
    if (!draft) {
      return;
    }
    history.change(withColor(draft, key, color), mark);
    window.clearTimeout(recentTimer.current);
    recentTimer.current = window.setTimeout(() => pushRecentColor(color), 900);
  };
}

/** Switching between dark and light, optionally inverting the colours along with it. */
export function useInvertOnSwitch(history: ThemeHistory) {
  const [invertOnSwitch, setInvertOnSwitch] = useState(() => readStorage(STORAGE.invertOnSwitch, true));

  const switchType = (type: Theme['type']) => {
    const draft = history.draft;
    if (!draft || draft.type === type) {
      return;
    }
    if (invertOnSwitch) {
      history.change({ ...invertTheme(draft), type }, 'invert');
      return;
    }
    history.change({ ...draft, type }, 'type');
  };

  const toggleInvert = () => {
    const next = !invertOnSwitch;
    setInvertOnSwitch(next);
    writeStorage(STORAGE.invertOnSwitch, next);
  };

  return { invertOnSwitch, switchType, toggleInvert };
}
