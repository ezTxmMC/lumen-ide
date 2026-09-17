/** The icon pack gallery in the themes dialog: choose, customise, import, export. */

import { useMemo } from 'react'
import { Check, Copy, Download, Pencil, Plus, Shapes, Trash2, Upload } from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import { registry } from '@/core/registry'
import { iconPackSize, resolveFileIcon, resolveFolderIcon } from '@/core/icon-pack'
import type { IconPack } from '@/core/types'
import { Button, Empty } from '../ui'
import { IconGlyph } from '../icons/FileIcon'

/** Files and folders of the card preview — languages, common files, build tools. */
export const PREVIEW_FILES = [
  'Main.java', 'App.tsx', 'main.ts', 'index.js', 'main.py', 'main.rs', 'main.go', 'main.cpp',
  'package.json', 'pom.xml', 'build.gradle.kts', 'CMakeLists.txt', 'Cargo.toml', 'Dockerfile',
  '.gitignore', 'README.md', 'LICENSE', '.env', 'logo.png', 'config.yaml',
]
export const PREVIEW_FOLDERS = ['src', 'test', 'docs', 'node_modules', '.github', 'build']

function PackPreview({ pack }: { pack: IconPack }) {
  const languages = useMemo(() => registry.languages(), [])
  return (
    <div className="flex flex-col gap-2 rounded-lumen-sm bg-bg/60 px-2.5 py-2.5">
      <div className="flex flex-wrap gap-x-2.5 gap-y-2">
        {PREVIEW_FOLDERS.map((name) => {
          const icon = resolveFolderIcon(pack, name)
          const drawn = icon.shape || icon.path || icon.glyph ? icon : { ...icon, shape: 'folder' }
          return <span key={name} className="flex w-[18px] justify-center" title={`${name}/`}><IconGlyph icon={drawn} size={15} /></span>
        })}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-2">
        {PREVIEW_FILES.map((name) => (
          <span key={name} className="flex w-[18px] justify-center" title={name}>
            <IconGlyph icon={resolveFileIcon(pack, name, languages)} size={15} />
          </span>
        ))}
      </div>
    </div>
  )
}

export function IconPacksSection({ query }: { query: string }) {
  const t = useT()
  const iconPackId = useStore((s) => s.iconPackId)
  const registryVersion = useStore((s) => s.registryVersion)
  const customIconPacks = useStore((s) => s.customIconPacks)
  const setIconPack = useStore((s) => s.setIconPack)
  const openStudio = useStore((s) => s.openIconStudio)
  const duplicate = useStore((s) => s.duplicateIconPack)
  const remove = useStore((s) => s.deleteCustomIconPack)
  const importPack = useStore((s) => s.importIconPack)
  const exportPack = useStore((s) => s.exportIconPack)

  const packs = useMemo(() => registry.iconPacks(), [registryVersion, customIconPacks])
  const customIds = useMemo(() => new Set(customIconPacks.map((pack) => pack.id)), [customIconPacks])
  const needle = query.trim().toLowerCase()
  const visible = packs.filter((pack) => !needle || `${pack.name} ${pack.author ?? ''} ${pack.id}`.toLowerCase().includes(needle))

  return (
    <div className="px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => void importPack()}>
          <Upload size={12} /> {t('common.import')}
        </Button>
        <Button size="sm" variant="solid" onClick={() => openStudio(undefined, true)}>
          <Plus size={12} /> {t('iconPacks.dialog.newPack')}
        </Button>
      </div>

      {visible.length === 0 && needle && <Empty icon={<Shapes size={28} />} title={t('common.nothingFound')} />}

      <div className="lm-stagger grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {visible.map((pack) => {
          const active = pack.id === iconPackId
          const custom = customIds.has(pack.id)
          return (
            <div
              key={pack.id}
              role="button"
              tabIndex={0}
              onClick={() => setIconPack(pack.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') setIconPack(pack.id) }}
              className={[
                'lm-transition lm-lift group flex cursor-pointer flex-col gap-2.5 rounded-lumen border p-3',
                active ? 'border-accent bg-active/60' : 'border-edge hover:border-edge-strong',
              ].join(' ')}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-fg">{pack.name}</span>
                    {active && (
                      <span className="flex items-center gap-0.5 rounded-full bg-accent px-1.5 text-[10px] text-accent-fg">
                        <Check size={9} /> {t('iconPacks.dialog.active')}
                      </span>
                    )}
                    {custom && <span className="rounded-full border border-edge px-1.5 text-[10px] text-subtle">{t('iconPacks.dialog.custom')}</span>}
                  </div>
                  <div className="truncate text-[11px] text-subtle">
                    {[pack.author, t('iconPacks.dialog.entries', { count: iconPackSize(pack) })].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" title={custom ? t('iconPacks.dialog.edit') : t('iconPacks.dialog.customize')} onClick={() => openStudio(pack.id)}>
                    <Pencil size={12} />
                  </Button>
                  <Button size="sm" title={t('iconPacks.dialog.duplicate')} onClick={() => duplicate(pack.id)}>
                    <Copy size={12} />
                  </Button>
                  <Button size="sm" title={t('iconPacks.dialog.export')} onClick={() => void exportPack(pack.id)}>
                    <Download size={12} />
                  </Button>
                  {custom && (
                    <Button size="sm" variant="danger" title={t('iconPacks.dialog.delete')} onClick={() => remove(pack.id)}>
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              </div>
              {pack.description && <p className="line-clamp-2 text-[11.5px] leading-snug text-muted">{pack.description}</p>}
              <PackPreview pack={pack} />
            </div>
          )
        })}

        <button
          onClick={() => openStudio(undefined, true)}
          className="lm-transition flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-lumen border border-dashed border-edge text-[12.5px] text-subtle hover:border-accent hover:text-fg"
        >
          <Plus size={20} />
          {t('iconPacks.dialog.newPack')}
          <span className="px-6 text-center text-[11px] text-subtle">{t('iconPacks.dialog.newPackHint')}</span>
        </button>
      </div>
    </div>
  )
}
