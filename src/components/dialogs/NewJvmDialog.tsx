/**
 * “New Java/Kotlin class” and “New package”, as in IntelliJ: `a.b.Name`
 * creates the package folders and the file; the type is chosen from a list.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useT } from '@/i18n'
import { useStore } from '@/state/store'
import { closeNewJvm, useNewJvm, type NewJvmRequest } from '@/lib/new-jvm-class'
import {
  JAVA_KINDS, JAVA_RETENTIONS, JAVA_TARGETS, KOTLIN_KINDS, KOTLIN_RETENTIONS, KOTLIN_TARGETS,
  javaSource, joinPackage, kotlinSource, locateSource, parseJvmName, validateJvmName,
  type JavaKind, type JvmLanguage, type KotlinKind,
} from '@/core/jvm-class'
import { Button, Select } from '../ui'
import { LAYER } from '../ui/layers'

export function NewJvmDialog() {
  const request = useNewJvm((s) => s.request)
  if (!request) return null
  return <Dialog request={request} />
}

function Dialog({ request }: { request: NewJvmRequest }) {
  const t = useT()
  const languages = useStore((s) => s.project?.languages ?? [])
  const notify = useStore((s) => s.notify)
  const openFile = useStore((s) => s.openFile)
  const location = useMemo(() => locateSource(request.dir), [request.dir])

  const available = (['java', 'kotlin'] as JvmLanguage[]).filter((id) => languages.includes(id))
  const initial: JvmLanguage = location.language ?? available[0] ?? 'java'
  const [language, setLanguage] = useState<JvmLanguage>(initial)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<string>('class')
  const [targets, setTargets] = useState<string[]>([])
  const [retention, setRetention] = useState('RUNTIME')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { input.current?.focus() }, [])

  const isClass = request.mode === 'class'
  const kinds: string[] = language === 'java' ? JAVA_KINDS : KOTLIN_KINDS
  const targetList = language === 'java' ? JAVA_TARGETS : KOTLIN_TARGETS
  const retentionList = language === 'java' ? JAVA_RETENTIONS : KOTLIN_RETENTIONS

  const switchLanguage = (next: JvmLanguage) => {
    setLanguage(next)
    setKind('class')
    setTargets([])
    setRetention('RUNTIME')
  }

  const problem = name.trim() ? validateJvmName(name, request.mode) : null
  const parsed = name.trim() && !problem ? parseJvmName(name, request.mode) : null
  const packageName = parsed ? joinPackage(location.packageName, parsed.packageParts) : location.packageName
  const extension = language === 'java' ? '.java' : '.kt'
  const relative = parsed
    ? [...packageName.split('.').filter(Boolean).slice(location.packageName.split('.').filter(Boolean).length), ...(isClass ? [`${parsed.className}${extension}`] : [])].join('/')
    : ''

  const create = async () => {
    if (!parsed || busy) return
    setBusy(true)
    const folder = `${location.root}/${packageName.split('.').filter(Boolean).join('/')}`.replace(/\/$/, '')
    try {
      if (!isClass) {
        await window.lumen.fs.create(folder, true)
        notify(t('explorer.jvmPackageCreated', { name: packageName }), 'success')
        closeNewJvm()
        return
      }
      const file = `${folder}/${parsed.className}${extension}`
      if (await window.lumen.fs.exists(file)) {
        notify(t('explorer.jvmExists', { name: `${parsed.className}${extension}` }), 'warning')
        return
      }
      const annotation = { targets, retention }
      const text = language === 'java'
        ? javaSource(packageName, parsed.className, kind as JavaKind, annotation)
        : kotlinSource(packageName, parsed.className, kind as KotlinKind, annotation)
      await window.lumen.fs.create(file, false)
      await window.lumen.fs.writeFile(file, text)
      closeNewJvm()
      await openFile(file).catch(() => {})
    } catch (err) {
      notify((err as Error).message.replace(/^Error: /, ''), 'error')
    } finally {
      setBusy(false)
    }
  }

  const toggleTarget = (target: string) =>
    setTargets((current) => (current.includes(target) ? current.filter((entry) => entry !== target) : [...current, target]))

  return createPortal(
    <div
      className={`lm-anim-fade fixed inset-0 ${LAYER.dialog} flex items-start justify-center bg-black/40 p-6 pt-[10vh]`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) closeNewJvm() }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          closeNewJvm()
          return
        }
        if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
          event.preventDefault()
          void create()
        }
      }}
    >
      <div role="dialog" aria-modal="true" className="lm-glass lm-shadow lm-anim-pop max-h-[80vh] w-[min(520px,94vw)] overflow-y-auto rounded-lumen-lg border border-edge">
        <div className="flex items-start gap-2 border-b border-edge px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-fg">{t(isClass ? 'explorer.jvmNewClass' : 'explorer.jvmNewPackage')}</div>
            <div className="truncate font-mono text-[10.5px] text-subtle" title={request.dir}>
              {location.packageName || request.dir}
            </div>
          </div>
          <button onClick={closeNewJvm} aria-label={t('common.cancel')} className="lm-transition rounded-lumen-sm p-1 text-subtle hover:bg-hover hover:text-fg">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div>
            <input
              ref={input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              spellCheck={false}
              placeholder={t(isClass ? 'explorer.jvmClassPlaceholder' : 'explorer.jvmPackagePlaceholder')}
              className="lm-transition w-full rounded-lumen-sm border border-edge bg-transparent px-2.5 py-1.5 font-mono text-[12.5px] text-fg outline-none focus:border-accent"
            />
            <p className={`mt-1 min-h-4 text-[11px] ${problem ? 'text-bad' : 'text-subtle'}`}>
              {problem ? t(`explorer.jvmError.${problem}`) : (relative && t('explorer.jvmWillCreate', { path: relative }))}
            </p>
          </div>

          {isClass && available.length > 1 && (
            <Select label={t('explorer.jvmLanguage')} value={language} options={available.map((id) => ({ value: id, label: id === 'java' ? 'Java' : 'Kotlin' }))} onChange={switchLanguage} />
          )}

          {isClass && (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{t('explorer.jvmType')}</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {kinds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setKind(id)}
                    className={`lm-transition rounded-lumen-sm border px-2 py-1.5 text-left text-[12px] ${kind === id ? 'border-accent bg-hover text-fg' : 'border-edge text-muted hover:bg-hover'}`}
                  >
                    {t(`explorer.jvmKind.${language}.${id}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isClass && kind === 'annotation' && (
            <div className="space-y-2">
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{t('explorer.jvmTargets')}</div>
                <div className="flex flex-wrap gap-1">
                  {targetList.map((target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => toggleTarget(target)}
                      className={`lm-transition rounded-full border px-2 py-0.5 font-mono text-[10.5px] ${targets.includes(target) ? 'border-accent bg-hover text-fg' : 'border-edge text-muted hover:bg-hover'}`}
                    >
                      {target}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-subtle">{t('explorer.jvmTargetsHint')}</p>
              </div>
              <Select label={t('explorer.jvmRetention')} value={retention} options={retentionList.map((id) => ({ value: id, label: id }))} onChange={setRetention} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-edge px-4 py-2.5">
          <Button size="sm" variant="outline" onClick={closeNewJvm}>{t('common.cancel')}</Button>
          <Button size="sm" variant="solid" disabled={!parsed || busy} onClick={() => void create()}>{t('explorer.jvmCreate')}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
