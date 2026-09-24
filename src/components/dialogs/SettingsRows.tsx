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
 * The rows of the settings dialog, one builder per section. Each returns rows
 * tagged with their section and a search text; the dialog filters them.
 */

import { useState, type ReactNode } from 'react';
import {
  Blocks, Coffee, Download, Keyboard, Palette, RefreshCw, type Settings,
} from 'lucide-react';
import { useStore } from '@/state/store';
import { statusDot } from '@/lib/status';
import { LANGUAGES, getLanguage, useT } from '@/i18n';
import { localizeSetting } from '@/core/extensions/localize';
import { checkForUpdates, downloadUpdate, installUpdate, useUpdater } from '@/features/updater';
import { extensions as installedExtensions } from '@/core/extensions/manager';
import { ExtensionSettingRow, settingVisible } from '../settings/ExtensionSettingRow';
import { Button, Empty, Select, Slider, Toggle } from '../ui';
import type { lsp } from '@/core/lsp/manager';
import type { terminals } from '@/lib/terminals';

export type SectionId = 'general' | 'editor' | 'formatting' | 'font' | 'lsp' | 'terminal' | 'sdks' | 'extensions' | 'window' | 'updates' | 'about';

export interface Row {
  section: SectionId;
  /** Search text: the label and the hint. */
  text: string;
  node: ReactNode;
}

export interface AppInfo {
  version: string;
  platform: string;
  windowSystem: 'wayland' | 'x11' | 'other';
  waylandSession: boolean;
  electron: string;
  chrome: string;
}

type State = ReturnType<typeof useStore.getState>;
type Effects = State['effects'];

/** Everything the row builders read, gathered by the dialog. */
export interface SettingsData {
  t: ReturnType<typeof useT>;
  effects: Effects;
  setEffects: State['setEffects'];
  openDialog: State['openDialog'];
  showPanel: State['showPanel'];
  language: State['language'];
  setLanguage: State['setLanguage'];
  navSide: State['layout']['navSide'];
  extensionSettings: State['extensionSettings'];
  workspace: State['workspace'];
  system: string;
  stats: { addons: number; active: number; languages: number; lspLanguages: number; themes: number; kinds: number; templates: number; };
  servers: ReturnType<typeof lsp.list>;
  shells: typeof terminals.shells;
  externals: typeof terminals.externals;
  info: AppInfo | null;
  initialWindowSystem: Effects['windowSystem'];
}

const FONT_STACKS = [
  { value: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace", label: 'JetBrains Mono' },
  { value: "'Fira Code', ui-monospace, monospace", label: 'Fira Code' },
  { value: "'Cascadia Code', ui-monospace, monospace", label: 'Cascadia Code' },
  { value: "'Iosevka', ui-monospace, monospace", label: 'Iosevka' },
  { value: "'Source Code Pro', ui-monospace, monospace", label: 'Source Code Pro' },
  { value: "'SF Mono', ui-monospace, monospace", label: 'SF Mono' },
  { value: 'ui-monospace, monospace', label: 'settings.font.systemMono' },
];

const toggle = (d: SettingsData, sectionId: SectionId, key: keyof Effects, label: string, hint?: string, disabled?: boolean): Row => ({
  section: sectionId,
  text: `${label} ${hint ?? ''}`,
  node: (
    <Toggle
      label={label}
      hint={hint}
      checked={Boolean(d.effects[key])}
      disabled={disabled}
      onChange={(v) => d.setEffects({ [key]: v } as Partial<Effects>)}
    />
  ),
});

export function generalRows(d: SettingsData): Row[] {
  const { t, effects, setEffects, openDialog, language, setLanguage, system, stats } = d;
  return [
    {
      section: 'general',
      text: `${t('settings.general.language')} ${t('settings.general.languageHint')} language sprache`,
      node: (
        <div className="py-2">
          <Select
            label={t('settings.general.language')}
            value={language}
            options={[
              { value: 'system', label: t('settings.general.system', { language: system }) },
              ...LANGUAGES.map((l) => ({ value: l.id, label: l.id === 'en' ? l.name : `${l.name} · ${l.english}` })),
            ]}
            onChange={(v) => setLanguage(v)}
          />
          <p className="text-[11.5px] leading-snug text-subtle">{t('settings.general.languageHint')}</p>
        </div>
      ),
    },
    toggle(d, 'general', 'reopenLastProject', t('settings.general.reopenLastProject'), t('settings.general.reopenLastProjectHint')),
    {
      section: 'general',
      text: `${t('projectSwitcher.setting.label')} ${t('projectSwitcher.setting.hint')}`,
      node: (
        <div className="py-2">
          <Select
            label={t('projectSwitcher.setting.label')}
            value={effects.openProjectsIn}
            options={[
              { value: 'ask', label: t('projectSwitcher.setting.ask') },
              { value: 'this', label: t('projectSwitcher.setting.this') },
              { value: 'new', label: t('projectSwitcher.setting.new') },
            ]}
            onChange={(v) => setEffects({ openProjectsIn: v })}
          />
          <p className="text-[11.5px] leading-snug text-subtle">{t('projectSwitcher.setting.hint')}</p>
        </div>
      ),
    },
    toggle(d, 'general', 'gradleTasksOnOpen', t('settings.general.gradleTasksOnOpen'), t('settings.general.gradleTasksOnOpenHint')),
    toggle(d, 'general', 'restoreOpenFiles', t('settings.general.restoreOpenFiles'), t('settings.general.restoreOpenFilesHint')),
    {
      section: 'general',
      text: t('settings.general.density'),
      node: (
        <Select
          label={t('settings.general.density')}
          value={effects.density}
          options={[
            { value: 'comfortable', label: t('settings.general.comfortable') },
            { value: 'compact', label: t('settings.general.compact') },
          ]}
          onChange={(v) => setEffects({ density: v })}
        />
      ),
    },
    {
      section: 'general',
      text: `${t('settings.general.keybindings')} ${t('settings.general.keybindingsHint')}`,
      node: (
        <LinkRow
          icon={Keyboard}
          label={t('settings.general.keybindings')}
          hint={t('settings.general.keybindingsHint')}
          action={t('settings.general.openKeybindings')}
          onClick={() => openDialog('keybindings')}
        />
      ),
    },
    {
      section: 'general',
      text: t('settings.general.themes'),
      node: (
        <LinkRow
          icon={Palette}
          label={t('settings.general.themes')}
          action={t('settings.general.openThemes')}
          onClick={() => openDialog('themes')}
        />
      ),
    },
    {
      section: 'general',
      text: t('settings.general.projectStats', { kinds: stats.kinds, templates: stats.templates }),
      node: <p className="py-2 text-[11.5px] leading-relaxed text-subtle">{t('settings.general.projectStats', { kinds: stats.kinds, templates: stats.templates })}</p>,
    },
  ];
}

export function editorRows(d: SettingsData): Row[] {
  const { t, effects, setEffects } = d;
  return [
    toggle(d, 'editor', 'showLineNumbers', t('settings.editor.lineNumbers')),
    toggle(d, 'editor', 'showIndentGuides', t('settings.editor.indentGuides')),
    toggle(d, 'editor', 'highlightActiveLine', t('settings.editor.activeLine')),
    toggle(d, 'editor', 'wordWrap', t('settings.editor.wordWrap')),
    toggle(d, 'editor', 'smoothCaret', t('settings.editor.smoothCaret'), t('settings.editor.smoothCaretHint')),
    toggle(d, 'editor', 'cursorBlink', t('settings.editor.cursorBlink')),
    {
      section: 'editor',
      text: `${t('settings.editor.cursorStyle')} ${t('settings.editor.cursorStyleHint')} cursor caret block`,
      node: (
        <div className="py-2">
          <Select
            label={t('settings.editor.cursorStyle')}
            value={effects.cursorStyle}
            options={[
              { value: 'line', label: t('settings.editor.cursorLine') },
              { value: 'block', label: t('settings.editor.cursorBlock') },
              { value: 'underline', label: t('settings.editor.cursorUnderline') },
            ]}
            onChange={(v) => setEffects({ cursorStyle: v })}
          />
          <p className="text-[11.5px] leading-snug text-subtle">{t('settings.editor.cursorStyleHint')}</p>
          {effects.cursorStyle === 'line' && (
            <Slider label={t('settings.editor.cursorWidth')} min={1} max={4} value={effects.cursorWidth} format={(v) => `${v} px`} onChange={(v) => setEffects({ cursorWidth: v })} />
          )}
        </div>
      ),
    },
    toggle(d, 'editor', 'minimap', t('settings.editor.minimap'), t('settings.editor.minimapHint')),
    {
      section: 'editor',
      text: `${t('settings.editor.minimapWidth')} minimap`,
      node: effects.minimap && (
        <Slider
          label={t('settings.editor.minimapWidth')}
          min={48}
          max={180}
          step={4}
          value={effects.minimapWidth}
          format={(v) => `${v} px`}
          onChange={(v) => setEffects({ minimapWidth: v })}
        />
      ),
    },
    toggle(d, 'editor', 'minimapRenderCharacters', t('settings.editor.minimapCharacters'), undefined, !effects.minimap),
    toggle(d, 'editor', 'foldingOnHover', t('settings.editor.foldingOnHover'), t('settings.editor.foldingOnHoverHint')),
    toggle(d, 'editor', 'compactPackages', t('settings.editor.compactPackages'), t('settings.editor.compactPackagesHint')),
    {
      section: 'editor',
      text: t('settings.editor.folding'),
      node: <p className="py-2 text-[11.5px] leading-relaxed text-subtle">{t('settings.editor.folding')}</p>,
    },
  ];
}

export function fontRows(d: SettingsData): Row[] {
  const { t, effects, setEffects } = d;
  return [
    {
      section: 'font',
      text: t('settings.font.family'),
      node: (
        <Select
          label={t('settings.font.family')}
          value={effects.fontFamily}
          options={FONT_STACKS.map((f) => ({ value: f.value, label: f.label.startsWith('settings.') ? t(f.label) : f.label }))}
          onChange={(v) => setEffects({ fontFamily: v })}
        />
      ),
    },
    {
      section: 'font',
      text: t('settings.font.size'),
      node: (
        <Slider label={t('settings.font.size')} min={9} max={28} value={effects.fontSize} format={(v) => `${v} px`} onChange={(v) => setEffects({ fontSize: v })} />
      ),
    },
    {
      section: 'font',
      text: t('settings.font.lineHeight'),
      node: (
        <Slider label={t('settings.font.lineHeight')} min={1.2} max={2.2} step={0.05} value={effects.lineHeight} format={(v) => v.toFixed(2)} onChange={(v) => setEffects({ lineHeight: v })} />
      ),
    },
    toggle(d, 'font', 'ligatures', t('settings.font.ligatures'), t('settings.font.ligaturesHint')),
    {
      section: 'font',
      text: 'preview',
      node: (
        <pre
          className="mt-2 overflow-x-auto rounded-lumen border border-edge bg-bg px-3 py-2.5 text-fg"
          style={{ fontFamily: effects.fontFamily, fontSize: effects.fontSize, lineHeight: effects.lineHeight, fontVariantLigatures: effects.ligatures ? 'normal' : 'none' }}
        >
          {'const sum = (a, b) => a + b !== 0\nfor (let i = 0; i <= 10; i++) { /* 0O1lI */ }'}
        </pre>
      ),
    },
  ];
}

export function lspRows(d: SettingsData): Row[] {
  const { t, effects, stats, servers, showPanel } = d;
  return [
    toggle(d, 'lsp', 'lsp', t('settings.lsp.enabled'), t('settings.lsp.enabledHint', { count: stats.lspLanguages })),
    toggle(d, 'lsp', 'lspAutoStart', t('settings.lsp.autoStart'), t('settings.lsp.autoStartHint'), !effects.lsp),
    toggle(d, 'lsp', 'javacBackend', t('settings.lsp.javac'), t('settings.lsp.javacHint'), !effects.lsp),
    toggle(d, 'lsp', 'inlayHints', t('settings.lsp.inlayHints'), t('settings.lsp.inlayHintsHint'), !effects.lsp),
    toggle(d, 'lsp', 'signatureHelp', t('settings.lsp.signatureHelp'), t('settings.lsp.signatureHelpHint'), !effects.lsp),
    toggle(d, 'lsp', 'documentHighlight', t('settings.lsp.documentHighlight'), t('settings.lsp.documentHighlightHint'), !effects.lsp),
    toggle(d, 'lsp', 'formatOnSave', t('settings.lsp.formatOnSave'), undefined, !effects.lsp),
    toggle(d, 'lsp', 'organizeImportsOnSave', t('settings.lsp.organizeImportsOnSave'), t('settings.lsp.organizeImportsHint'), !effects.lsp),
    {
      section: 'lsp',
      text: 'server',
      node: effects.lsp && (
        servers.length > 0
          ? (
            <div className="mt-1.5 space-y-1">
              {servers.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center gap-2 rounded-lumen-sm border border-edge px-2 py-1.5"
                  title={`${server.label}\n${server.root}${server.detail ? `\n${server.detail}` : ''}`}
                >
                  <span className={`size-1.5 shrink-0 rounded-full ${statusDot(server.status)}`} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{server.label}</span>
                  <span className="shrink-0 text-[11px] text-subtle">
                    {server.busy ? server.busy.slice(0, 32) : t(`settings.lsp.state.${server.status}`)}
                  </span>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full" onClick={() => { useStore.getState().closeDialog(); showPanel('lsp'); }}>
                {t('settings.lsp.openPanel')}
              </Button>
            </div>
          )
          : <Empty title={t('settings.lsp.noServer')} hint={t('settings.lsp.noServerHint')} />
      ),
    },
  ];
}

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

export function updateRows(d: SettingsData): Row[] {
  const { t } = d;
  return [
    {
      section: 'updates',
      text: `${t('updater.title')} update version`,
      node: <UpdateStatus />,
    },
    toggle(d, 'updates', 'autoUpdate', t('updater.auto'), t('updater.autoHint')),
  ];
}

export function extensionRows(d: SettingsData): Row[] {
  const { t, extensionSettings, openDialog } = d;
  return [
    ...installedExtensions.list().flatMap(({ manifest }) => {
      const settings = (manifest.settings ?? []).map((setting) => localizeSetting(setting, getLanguage()));
      const values = extensionSettings[manifest.id];
      const visible = settings.filter((setting) => settingVisible(setting, settings, values));
      return visible.flatMap((setting, index): Row[] => {
        // The extension's name belongs in the search text: typing “Go” should
        // find its settings, not merely match a label.
        const text = `${manifest.name} ${setting.section ?? ''} ${setting.label} ${setting.hint ?? ''} ${setting.key}`;
        const row: Row = {
          section: 'extensions',
          text,
          node: <ExtensionSettingRow extensionId={manifest.id} extensionName={manifest.name} setting={setting} />,
        };
        const opensGroup = index === 0 || visible[index - 1].section !== setting.section;
        if (!opensGroup) {
          return [row];
        }
        const heading = setting.section ? `${manifest.name} — ${setting.section}` : manifest.name;
        return [{
          section: 'extensions',
          text,
          node: <h4 className="mt-3 border-b border-edge pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">{heading}</h4>,
        }, row];
      });
    }),
    ...(installedExtensions.list().some(({ manifest }) => manifest.settings?.length)
      ? []
      : [{
          section: 'extensions' as SectionId,
          text: 'extensions',
          node: (
            <Empty
              icon={<Blocks size={22} />}
              title={t('extensions.noServers')}
              hint={t('extensions.subtitle')}
              action={(
                <Button size="sm" onClick={() => openDialog('extensions', 'servers')}>
                  {t('extensions.servers')}
                </Button>
              )}
            />
          ),
        }]),
  ];
}

export function aboutRows(d: SettingsData): Row[] {
  const { t, stats, workspace, info } = d;
  return [
    {
      section: 'about',
      text: 'about version',
      node: (
        <div className="py-2">
          <dl className="space-y-1 text-[12px]">
            {[
              [t('settings.about.addons'), t('settings.about.activeOf', { active: stats.active, total: stats.addons })],
              [t('settings.about.languages'), String(stats.languages)],
              [t('settings.about.themes'), String(stats.themes)],
              [t('settings.about.folder'), workspace ?? '—'],
            ].map(([key, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-subtle">{key}</dt>
                <dd className="truncate text-right text-muted" title={value}>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-subtle">{t('settings.about.version', { version: info?.version ?? '' })}</p>
          {info && <p className="text-[11px] text-subtle">{t('settings.about.runtime', { electron: info.electron, chrome: info.chrome })}</p>}
        </div>
      ),
    },
  ];
}

/** State of the updater, with whatever action comes next. */
function UpdateStatus() {
  const t = useT();
  const update = useUpdater();
  const [checking, setChecking] = useState(false);
  const version = update.version ?? update.current;
  const percent = update.total ? Math.round(((update.received ?? 0) / update.total) * 100) : 0;

  const check = () => {
    setChecking(true);
    void checkForUpdates().finally(() => setChecking(false));
  };

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lumen-sm bg-active text-accent">
        <RefreshCw size={15} className={update.status === 'checking' || update.status === 'downloading' ? 'lm-anim-spin' : ''} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-fg">{updateStatusText(t, update.status, update.installable, { version, percent, error: update.error ?? '' })}</div>
        {update.status === 'downloading' && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-active">
            <div className="lm-transition h-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
        )}
        {update.notes && <div className="mt-0.5 text-[11.5px] leading-snug whitespace-pre-line text-subtle">{update.notes}</div>}
      </div>
      <UpdateAction status={update.status} installable={update.installable} busy={checking} onCheck={check} />
    </div>
  );
}

function updateStatusText(t: ReturnType<typeof useT>, status: string, installable: boolean, params: { version: string; percent: number; error: string; }) {
  if (status === 'available' && !installable) {
    return t('updater.status.availableManual', params);
  }
  return t(`updater.status.${status}`, params);
}

function UpdateAction({ status, installable, busy, onCheck }: {
  status: string;
  installable: boolean;
  busy: boolean;
  onCheck: () => void;
}) {
  const t = useT();
  if (status === 'ready') {
    return <Button variant="solid" size="sm" onClick={() => void installUpdate()}>{t('updater.action.install')}</Button>;
  }
  if (status === 'available' && installable) {
    return <Button variant="solid" size="sm" onClick={() => void downloadUpdate()}><Download size={12} /> {t('updater.action.download')}</Button>;
  }
  if (status === 'available') {
    return <Button variant="outline" size="sm" onClick={() => void window.lumen.updater.openDownload()}>{t('updater.action.openDownload')}</Button>;
  }
  return (
    <Button variant="outline" size="sm" disabled={busy || status === 'checking' || status === 'downloading'} onClick={onCheck}>
      {t('updater.action.check')}
    </Button>
  );
}

function LinkRow({ icon: Icon, label, hint, action, onClick }: {
  icon: typeof Settings;
  label: string;
  hint?: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lumen-sm bg-active text-accent">
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-subtle">{hint}</div>}
      </div>
      <Button variant="outline" size="sm" onClick={onClick}>{action}</Button>
    </div>
  );
}
