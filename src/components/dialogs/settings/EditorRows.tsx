/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useStore } from '@/state/store';
import { statusDot } from '@/lib/status';
import { Button, Empty, Select, Slider } from '../../ui';
import { type Row, type SettingsData, FONT_STACKS, toggle } from './SettingsRows';

export function editorRows(d: SettingsData): Row[] {
  const { t, effects, setEffects } = d;
  return [
    toggle(d, 'editor', 'showLineNumbers', t('settings.editor.lineNumbers')),
    toggle(d, 'editor', 'showIndentGuides', t('settings.editor.indentGuides')),
    toggle(d, 'editor', 'highlightActiveLine', t('settings.editor.activeLine')),
    toggle(d, 'editor', 'wordWrap', t('settings.editor.wordWrap')),
    toggle(d, 'editor', 'autoCloseBrackets', t('settings.editor.autoCloseBrackets'), t('settings.editor.autoCloseBracketsHint')),
    toggle(d, 'editor', 'autoCloseTags', t('settings.editor.autoCloseTags'), t('settings.editor.autoCloseTagsHint')),
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
    toggle(d, 'editor', 'showBuildFolders', t('settings.editor.showBuildFolders'), t('settings.editor.showBuildFoldersHint')),
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
    toggle(d, 'lsp', 'semanticTokens', t('settings.lsp.semanticTokens'), t('settings.lsp.semanticTokensHint'), !effects.lsp),
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
