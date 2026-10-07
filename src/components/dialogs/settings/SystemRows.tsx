/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { Coffee } from 'lucide-react';
import { useStore } from '@/state/store';
import { Button, Select, Slider } from '../../ui';
import { type Row, type SettingsData, toggle } from './SettingsRows';
import { LinkRow } from './SettingsRows';

export function terminalRows(d: SettingsData): Row[] {
  const { t, effects, setEffects, shells, externals } = d;
  return [
    {
      section: 'terminal',
      text: t('settings.terminal.shell'),
      node: (
        <Select
          label={t('settings.terminal.shell')}
          value={effects.terminalShell}
          options={[
            { value: '', label: t('settings.terminal.shellDefault', { shell: shells.find((s) => s.isDefault)?.label ?? 'System' }) },
            ...shells.map((s) => ({ value: s.path, label: s.label })),
          ]}
          onChange={(v) => setEffects({ terminalShell: v })}
        />
      ),
    },
    {
      section: 'terminal',
      text: `${t('settings.terminal.fontSize')} terminal`,
      node: (
        <Slider label={t('settings.terminal.fontSize')} min={9} max={22} value={effects.terminalFontSize} format={(v) => `${v} px`} onChange={(v) => setEffects({ terminalFontSize: v })} />
      ),
    },
    {
      section: 'terminal',
      text: t('settings.terminal.cursor'),
      node: (
        <Select
          label={t('settings.terminal.cursor')}
          value={effects.terminalCursor}
          options={[
            { value: 'bar', label: t('settings.terminal.cursorBar') },
            { value: 'block', label: t('settings.terminal.cursorBlock') },
            { value: 'underline', label: t('settings.terminal.cursorUnderline') },
          ]}
          onChange={(v) => setEffects({ terminalCursor: v })}
        />
      ),
    },
    toggle(d, 'terminal', 'terminalCopyOnSelect', t('settings.terminal.copyOnSelect'), t('settings.terminal.copyOnSelectHint')),
    {
      section: 'terminal',
      text: t('settings.terminal.external'),
      node: (
        <Select
          label={t('settings.terminal.external')}
          value={effects.externalTerminal}
          options={[
            { value: '', label: externals[0] ? t('settings.terminal.externalAuto', { terminal: externals[0].label }) : t('settings.terminal.externalNone') },
            ...externals.map((term) => ({ value: term.id, label: term.label })),
          ]}
          onChange={(v) => setEffects({ externalTerminal: v })}
        />
      ),
    },
  ];
}

export function sdkRows(d: SettingsData): Row[] {
  const { t, openDialog } = d;
  return [
    {
      section: 'sdks',
      text: `${t('settings.sdks.title')} ${t('settings.sdks.hint')} java jdk temurin corretto zulu openjdk`,
      node: (
        <LinkRow
          icon={Coffee}
          label={t('settings.sdks.title')}
          hint={t('settings.sdks.hint')}
          action={t('settings.sdks.open')}
          onClick={() => openDialog('sdks')}
        />
      ),
    },
  ];
}

export function windowRows(d: SettingsData): Row[] {
  const { t, effects, setEffects, navSide, info, initialWindowSystem } = d;
  return [
    {
      section: 'window',
      text: `${t('settings.window.navSide')} ${t('settings.window.navSideHint')} layout panel`,
      node: (
        <div className="py-2">
          <Select
            label={t('settings.window.navSide')}
            value={navSide}
            options={[
              { value: 'left', label: t('shell.layout.navLeft') },
              { value: 'right', label: t('shell.layout.navRight') },
            ]}
            onChange={(side) => useStore.getState().setNavSide(side)}
          />
          <p className="text-[11.5px] leading-snug text-subtle">{t('settings.window.navSideHint')}</p>
        </div>
      ),
    },
    {
      section: 'window',
      text: `${t('settings.window.resetLayout')} ${t('settings.window.resetLayoutHint')} layout`,
      node: (
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="min-w-0">
            <div className="text-[13px] text-fg">{t('settings.window.resetLayout')}</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-subtle">{t('settings.window.resetLayoutHint')}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => useStore.getState().resetLayout()}>{t('shell.layout.reset')}</Button>
        </div>
      ),
    },

    {
      section: 'window',
      text: `${t('settings.window.system')} ${t('settings.window.systemHint')} wayland x11`,
      node: (
        <div className="py-2">
          {info && info.platform !== 'linux'
            ? <p className="text-[12px] text-subtle">{t('settings.window.linuxOnly')}</p>
            : (
              <>
                <Select
                  label={t('settings.window.system')}
                  value={effects.windowSystem}
                  options={[
                    { value: 'auto', label: t('settings.window.auto') },
                    { value: 'wayland', label: t('settings.window.wayland') },
                    { value: 'x11', label: t('settings.window.x11') },
                  ]}
                  onChange={(v) => setEffects({ windowSystem: v })}
                />
                <p className="text-[11.5px] leading-snug text-subtle">{t('settings.window.systemHint')}</p>
                {info && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full border border-edge px-2 py-0.5 text-muted">
                      {t('settings.window.current', { system: info.windowSystem === 'wayland' ? 'Wayland' : 'X11' })}
                    </span>
                    <span className="rounded-full border border-edge px-2 py-0.5 text-muted">
                      {t('settings.window.session', { session: info.waylandSession ? 'Wayland' : 'X11' })}
                    </span>
                  </div>
                )}
                {effects.windowSystem !== initialWindowSystem && (
                  <div className="lm-anim-up mt-2.5 flex items-center gap-2 rounded-lumen-sm border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[12px]">
                    <span className="flex-1 text-fg">{t('settings.window.restartNeeded')}</span>
                    <Button size="sm" variant="solid" onClick={() => { useStore.getState().persist(); window.setTimeout(() => void window.lumen.app.relaunch(), 250); }}>
                      {t('settings.window.restart')}
                    </Button>
                  </div>
                )}
              </>
            )}
        </div>
      ),
    },
  ];
}
