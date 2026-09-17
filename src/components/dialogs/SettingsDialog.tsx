import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  AppWindow, Blocks, Code2, Coffee, Download, Info, Keyboard, Palette, RefreshCw, Settings, SlidersHorizontal, TerminalSquare, Type, Zap,
} from 'lucide-react'
import { useStore } from '@/state/store'
import { useDialogVisible } from '@/hooks/usePresence'
import { registry } from '@/core/registry'
import { lsp } from '@/core/lsp/manager'
import { statusDot } from '@/lib/status'
import { terminals } from '@/lib/terminals'
import { LANGUAGES, systemLanguage, useT } from '@/i18n'
import { checkForUpdates, downloadUpdate, installUpdate, useUpdater } from '@/features/updater'
import { extensions as installedExtensions } from '@/core/extensions/manager'
import type { ExtensionSetting } from '@/core/extensions/types'
import { Button, Empty, Select, Slider, Toggle } from '../ui'
import { DialogShell, type DialogSection } from './DialogShell'

const FONT_STACKS = [
  { value: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace", label: 'JetBrains Mono' },
  { value: "'Fira Code', ui-monospace, monospace", label: 'Fira Code' },
  { value: "'Cascadia Code', ui-monospace, monospace", label: 'Cascadia Code' },
  { value: "'Iosevka', ui-monospace, monospace", label: 'Iosevka' },
  { value: "'Source Code Pro', ui-monospace, monospace", label: 'Source Code Pro' },
  { value: "'SF Mono', ui-monospace, monospace", label: 'SF Mono' },
  { value: 'ui-monospace, monospace', label: 'settings.font.systemMono' },
]

type SectionId = 'general' | 'editor' | 'font' | 'lsp' | 'terminal' | 'sdks' | 'extensions' | 'window' | 'updates' | 'about'

const SECTIONS: { id: SectionId; icon: typeof Settings }[] = [
  { id: 'general', icon: SlidersHorizontal },
  { id: 'editor', icon: Code2 },
  { id: 'font', icon: Type },
  { id: 'lsp', icon: Zap },
  { id: 'terminal', icon: TerminalSquare },
  { id: 'sdks', icon: Coffee },
  { id: 'extensions', icon: Blocks },
  { id: 'window', icon: AppWindow },
  { id: 'updates', icon: RefreshCw },
  { id: 'about', icon: Info },
]

interface Row {
  section: SectionId
  /** Search text: the label and the hint. */
  text: string
  node: ReactNode
}

interface AppInfo {
  version: string
  platform: string
  windowSystem: 'wayland' | 'x11' | 'other'
  waylandSession: boolean
  electron: string
  chrome: string
}

export function SettingsDialog() {
  const t = useT()
  const open = useDialogVisible('settings')
  const requested = useStore((s) => s.dialogSection)
  const effects = useStore((s) => s.effects)
  const setEffects = useStore((s) => s.setEffects)
  const language = useStore((s) => s.language)
  const setLanguage = useStore((s) => s.setLanguage)
  const openDialog = useStore((s) => s.openDialog)
  const showPanel = useStore((s) => s.showPanel)
  const workspace = useStore((s) => s.workspace)
  const registryVersion = useStore((s) => s.registryVersion)
  const lspVersion = useStore((s) => s.lspVersion)
  useSyncExternalStore(terminals.subscribe.bind(terminals), terminals.getVersion)
  useSyncExternalStore(installedExtensions.subscribe, installedExtensions.getVersion)

  const [section, setSection] = useState<SectionId>('general')
  const [query, setQuery] = useState('')
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [initialWindowSystem, setInitialWindowSystem] = useState(effects.windowSystem)

  useEffect(() => {
    if (!open) return
    setQuery('')
    if (requested && SECTIONS.some((s) => s.id === requested)) setSection(requested as SectionId)
    void window.lumen.app.info().then((value) => setInfo(value as AppInfo)).catch(() => {})
    setInitialWindowSystem(useStore.getState().effects.windowSystem)
  }, [open, requested])

  const servers = useMemo(() => lsp.list(), [lspVersion])
  const stats = useMemo(() => ({
    addons: registry.all().length,
    active: registry.activeIds().length,
    languages: registry.languages().length,
    lspLanguages: registry.languages().filter((l) => l.lsp?.length).length,
    themes: registry.themes().length,
    kinds: registry.projectKinds().length,
    templates: registry.projectTemplates().length,
  }), [registryVersion])

  if (!open) return null

  const system = LANGUAGES.find((l) => l.id === systemLanguage())?.name ?? 'English'
  const shells = terminals.shells
  const externals = terminals.externals

  const toggle = (sectionId: SectionId, key: keyof typeof effects, label: string, hint?: string, disabled?: boolean): Row => ({
    section: sectionId,
    text: `${label} ${hint ?? ''}`,
    node: (
      <Toggle
        label={label}
        hint={hint}
        checked={Boolean(effects[key])}
        disabled={disabled}
        onChange={(v) => setEffects({ [key]: v } as Partial<typeof effects>)}
      />
    ),
  })

  const rows: Row[] = [
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
    toggle('general', 'restoreOpenFiles', t('settings.general.restoreOpenFiles'), t('settings.general.restoreOpenFilesHint')),
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

    toggle('editor', 'showLineNumbers', t('settings.editor.lineNumbers')),
    toggle('editor', 'showIndentGuides', t('settings.editor.indentGuides')),
    toggle('editor', 'highlightActiveLine', t('settings.editor.activeLine')),
    toggle('editor', 'wordWrap', t('settings.editor.wordWrap')),
    toggle('editor', 'smoothCaret', t('settings.editor.smoothCaret'), t('settings.editor.smoothCaretHint')),
    toggle('editor', 'cursorBlink', t('settings.editor.cursorBlink')),
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
    toggle('editor', 'minimap', t('settings.editor.minimap'), t('settings.editor.minimapHint')),
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
    toggle('editor', 'minimapRenderCharacters', t('settings.editor.minimapCharacters'), undefined, !effects.minimap),
    toggle('editor', 'foldingOnHover', t('settings.editor.foldingOnHover'), t('settings.editor.foldingOnHoverHint')),
    toggle('editor', 'compactPackages', t('settings.editor.compactPackages'), t('settings.editor.compactPackagesHint')),
    {
      section: 'editor',
      text: t('settings.editor.folding'),
      node: <p className="py-2 text-[11.5px] leading-relaxed text-subtle">{t('settings.editor.folding')}</p>,
    },

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
    toggle('font', 'ligatures', t('settings.font.ligatures'), t('settings.font.ligaturesHint')),
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

    toggle('lsp', 'lsp', t('settings.lsp.enabled'), t('settings.lsp.enabledHint', { count: stats.lspLanguages })),
    toggle('lsp', 'inlayHints', t('settings.lsp.inlayHints'), t('settings.lsp.inlayHintsHint'), !effects.lsp),
    toggle('lsp', 'signatureHelp', t('settings.lsp.signatureHelp'), t('settings.lsp.signatureHelpHint'), !effects.lsp),
    toggle('lsp', 'documentHighlight', t('settings.lsp.documentHighlight'), t('settings.lsp.documentHighlightHint'), !effects.lsp),
    toggle('lsp', 'formatOnSave', t('settings.lsp.formatOnSave'), undefined, !effects.lsp),
    toggle('lsp', 'organizeImportsOnSave', t('settings.lsp.organizeImportsOnSave'), t('settings.lsp.organizeImportsHint'), !effects.lsp),
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
              <Button variant="outline" size="sm" className="w-full" onClick={() => { useStore.getState().closeDialog(); showPanel('lsp') }}>
                {t('settings.lsp.openPanel')}
              </Button>
            </div>
          )
          : <Empty title={t('settings.lsp.noServer')} hint={t('settings.lsp.noServerHint')} />
      ),
    },

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
    toggle('terminal', 'terminalCopyOnSelect', t('settings.terminal.copyOnSelect'), t('settings.terminal.copyOnSelectHint')),
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
                    <Button size="sm" variant="solid" onClick={() => { useStore.getState().persist(); window.setTimeout(() => void window.lumen.app.relaunch(), 250) }}>
                      {t('settings.window.restart')}
                    </Button>
                  </div>
                )}
              </>
            )}
        </div>
      ),
    },

    {
      section: 'updates',
      text: `${t('updater.title')} update version`,
      node: <UpdateStatus />,
    },
    toggle('updates', 'autoUpdate', t('updater.auto'), t('updater.autoHint')),

    ...installedExtensions.list().flatMap(({ manifest }) =>
      (manifest.settings ?? []).map((setting): Row => ({
        section: 'extensions',
        // The extension's name belongs in the search text: typing “Go” should
        // find its settings, not merely match a label.
        text: `${manifest.name} ${setting.label} ${setting.hint ?? ''} ${setting.key}`,
        node: (
          <ExtensionSettingRow
            extensionId={manifest.id}
            extensionName={manifest.name}
            setting={setting}
          />
        ),
      })),
    ),
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
  ]

  const needle = query.trim().toLowerCase()
  const visible = needle
    ? rows.filter((row) => row.text.toLowerCase().includes(needle))
    : rows.filter((row) => row.section === section)

  const sections: DialogSection[] = SECTIONS.map(({ id, icon }) => ({
    id,
    icon,
    label: t(`settings.sections.${id}`),
    badge: needle ? String(rows.filter((row) => row.section === id && row.text.toLowerCase().includes(needle)).length || '') : undefined,
  }))

  return (
    <DialogShell
      id="settings"
      title={t('shell.dialog.settings')}
      icon={Settings}
      sections={sections}
      section={needle ? undefined : section}
      onSection={(id) => { setQuery(''); setSection(id as SectionId) }}
      search={query}
      onSearch={setQuery}
      searchPlaceholder={t('settings.searchPlaceholder')}
    >
      <div className="mx-auto max-w-[680px] px-6 py-4">
        {!needle && (
          <h3 className="mb-2 text-[16px] font-medium text-fg">{t(`settings.sections.${section}`)}</h3>
        )}
        {needle && visible.length === 0 && <Empty title={t('settings.noResults', { query })} />}
        <div className="divide-y divide-edge/60">
          {visible.map((row, index) => (
            row.node ? <div key={`${row.section}-${index}`}>{row.node}</div> : null
          ))}
        </div>
      </div>
    </DialogShell>
  )
}

/** State of the updater, with whatever action comes next. */
function UpdateStatus() {
  const t = useT()
  const update = useUpdater()
  const [checking, setChecking] = useState(false)
  const version = update.version ?? update.current
  const percent = update.total ? Math.round(((update.received ?? 0) / update.total) * 100) : 0

  const check = () => {
    setChecking(true)
    void checkForUpdates().finally(() => setChecking(false))
  }

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
  )
}

function updateStatusText(t: ReturnType<typeof useT>, status: string, installable: boolean, params: { version: string; percent: number; error: string }) {
  if (status === 'available' && !installable) return t('updater.status.availableManual', params)
  return t(`updater.status.${status}`, params)
}

function UpdateAction({ status, installable, busy, onCheck }: {
  status: string
  installable: boolean
  busy: boolean
  onCheck: () => void
}) {
  const t = useT()
  if (status === 'ready') {
    return <Button variant="solid" size="sm" onClick={() => void installUpdate()}>{t('updater.action.install')}</Button>
  }
  if (status === 'available' && installable) {
    return <Button variant="solid" size="sm" onClick={() => void downloadUpdate()}><Download size={12} /> {t('updater.action.download')}</Button>
  }
  if (status === 'available') {
    return <Button variant="outline" size="sm" onClick={() => void window.lumen.updater.openDownload()}>{t('updater.action.openDownload')}</Button>
  }
  return (
    <Button variant="outline" size="sm" disabled={busy || status === 'checking' || status === 'downloading'} onClick={onCheck}>
      {t('updater.action.check')}
    </Button>
  )
}

function LinkRow({ icon: Icon, label, hint, action, onClick }: {
  icon: typeof Settings
  label: string
  hint?: string
  action: string
  onClick: () => void
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
  )
}

/**
 * One setting of an installed extension.
 *
 * The values live in the application settings rather than in the manifest, so
 * updating the extension never overwrites what someone typed. The label names
 * the extension too, because under “Extensions” the settings of several sit
 * side by side.
 */
function ExtensionSettingRow({ extensionId, extensionName, setting }: {
  extensionId: string
  extensionName: string
  setting: ExtensionSetting
}) {
  const value = useStore((s) => s.extensionSettings[extensionId]?.[setting.key])
  const setSetting = useStore((s) => s.setExtensionSetting)
  const current = value ?? setting.default ?? (setting.type === 'toggle' ? 'false' : '')
  const label = `${extensionName} · ${setting.label}`
  const write = (next: string) => setSetting(extensionId, setting.key, next)

  if (setting.type === 'toggle') {
    return <Toggle label={label} hint={setting.hint} checked={current === 'true'} onChange={(v) => write(String(v))} />
  }

  if (setting.type === 'select') {
    return (
      <div className="py-2">
        <Select
          label={label}
          value={current}
          options={(setting.choices ?? []).map((choice) => ({ value: choice.value, label: choice.label }))}
          onChange={write}
        />
        {setting.hint && <p className="text-[11.5px] leading-snug text-subtle">{setting.hint}</p>}
      </div>
    )
  }

  return (
    <div className="py-2">
      <label className="mb-1 block text-[11.5px] text-muted">{label}</label>
      <input
        type={setting.type === 'number' ? 'number' : 'text'}
        value={current}
        spellCheck={false}
        placeholder={setting.placeholder}
        onChange={(e) => write(e.target.value)}
        className="lm-transition w-full rounded-lumen-sm border border-edge bg-input px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent"
      />
      {setting.hint && <p className="mt-1 text-[11.5px] leading-snug text-subtle">{setting.hint}</p>}
    </div>
  )
}
