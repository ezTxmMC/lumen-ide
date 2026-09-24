/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { useThemeHistory } from './history';
import { colorOf, splitKey, type ColorKey } from './keys';
import { PreviewStage } from './preview/PreviewStage';
import {
  ConfirmOverlay, StudioFooter, StudioHeader, StudioSidebar, useStudioShortcuts, type Tab,
} from './StudioParts';
import { resetColors, useColorEdit, useInvertOnSwitch, useStudioSession } from './useStudioSession';
import './studio.css';

export function ThemeStudio() {
  const t = useT();
  const effects = useStore((s) => s.effects);
  const previewTheme = useStore((s) => s.previewTheme);
  const exportTheme = useStore((s) => s.exportTheme);

  const history = useThemeHistory(previewTheme);
  const draft = history.draft;
  const container = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<Tab>('ui');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ColorKey | null>(null);
  const [flash, setFlash] = useState(0);
  const [hovered, setHovered] = useState<ColorKey | null>(null);

  const {
    editingId, original, existed, confirm, setConfirm, dirty, save, saveKeepOpen, discard, requestDiscard, remove,
  } = useStudioSession(history, () => {
    setSelected(null);
    setQuery('');
    requestAnimationFrame(() => container.current?.focus());
  });

  const labelOf = useCallback((key: ColorKey) => {
    const [scope, name] = splitKey(key);
    return t(scope === 'ui' ? `themeStudio.ui.${name}` : `themeStudio.token.${name}`);
  }, [t]);

  /* -------------------------------------------------------------- */

  const { invertOnSwitch, switchType, toggleInvert } = useInvertOnSwitch(history);
  const setColor = useColorEdit(history);

  const resetKeys = (keys: ColorKey[]) => {
    const base = original.current;
    if (!draft || !base) {
      return;
    }
    history.change(resetColors(draft, base, keys), `reset:${keys.join()}`);
  };

  const pickFromPreview = (key: ColorKey) => {
    const [scope] = splitKey(key);
    setTab(scope === 'ui' ? 'ui' : 'syntax');
    setQuery('');
    setSelected(key);
    setFlash((n) => n + 1);
  };

  /* -------------------------------------------------------------- */

  useStudioShortcuts(Boolean(editingId), {
    confirm, history, clearConfirm: () => setConfirm(null), requestDiscard, discard, remove, save, saveKeepOpen,
  });

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (key: ColorKey) => {
      if (!needle || !draft) {
        return true;
      }
      return [key, labelOf(key), colorOf(draft, key)].some((text) => text.toLowerCase().includes(needle));
    };
  }, [query, draft, labelOf]);

  if (!editingId || !draft || !original.current) {
    return null;
  }
  const base = original.current;

  const fieldProps = (key: ColorKey) => ({
    colorKey: key,
    label: labelOf(key),
    value: colorOf(draft, key),
    onChange: (color: string, mark: string) => setColor(key, color, mark),
    selected: selected === key,
    flash: selected === key ? flash : 0,
    onSelect: () => setSelected(key),
    onHover: setHovered,
  });

  return (
    <div className="lm-anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        ref={container}
        tabIndex={-1}
        data-keybinding-recorder
        role="dialog"
        aria-label={t('themeStudio.studio.title')}
        className="lm-glass lm-shadow lm-anim-dialog relative flex h-full max-h-[920px] w-full max-w-[1480px] flex-col overflow-hidden rounded-lumen-lg border border-edge outline-none"
      >
        <StudioHeader
          draft={draft}
          base={base}
          history={history}
          dirty={dirty}
          canDelete={existed.current}
          invertOnSwitch={invertOnSwitch}
          onSwitchType={switchType}
          onToggleInvert={toggleInvert}
          onExport={() => void exportTheme(draft.id)}
          onSaveKeepOpen={saveKeepOpen}
          onDelete={() => setConfirm('delete')}
          onDiscard={requestDiscard}
          onDone={save}
        />

        <div className="flex min-h-0 flex-1">
          <StudioSidebar
            tab={tab}
            onTab={setTab}
            query={query}
            onQuery={setQuery}
            draft={draft}
            base={base}
            history={history}
            matches={matches}
            fieldProps={fieldProps}
            onReset={resetKeys}
            labelOf={labelOf}
            onSelect={pickFromPreview}
          />

          <PreviewStage
            draft={draft}
            original={base}
            effects={effects}
            highlight={hovered}
            onPick={pickFromPreview}
            labelOf={labelOf}
          />
        </div>

        <StudioFooter />

        {confirm && (
          <ConfirmOverlay confirm={confirm} name={draft.name} onCancel={() => setConfirm(null)} onDiscard={discard} onDelete={remove} />
        )}
      </div>
    </div>
  );
}
