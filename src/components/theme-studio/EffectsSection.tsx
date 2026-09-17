import { useState } from 'react'
import { Feather, Play, RotateCcw, Sparkles, Wind } from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import type { Effects } from '@/core/theme'
import { Button, Section, Slider, Toggle } from '../ui'
import './studio.css'

type Level = Effects['animationLevel']

const LEVELS: { id: Level; icon: typeof Wind }[] = [
  { id: 'reduced', icon: Feather },
  { id: 'normal', icon: Wind },
  { id: 'rich', icon: Sparkles },
]

/** A small stage demonstrating what an animation level looks like. */
function MotionDemo({ level, enabled }: { level: Level; enabled: boolean }) {
  const t = useT()
  const [run, setRun] = useState(0)
  return (
    <div className="rounded-lumen border border-edge bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11.5px] font-medium text-fg">{t('themeStudio.effects.demoTitle')}</span>
        <span className="rounded-full bg-active px-2 py-0.5 text-[10.5px] text-muted">
          {enabled ? t(`themeStudio.effects.level.${level}`) : t('common.off')}
        </span>
        <span className="flex-1" />
        <Button size="sm" onClick={() => setRun((n) => n + 1)}>
          <Play size={11} /> {t('themeStudio.effects.replay')}
        </Button>
      </div>
      <div key={`${level}-${run}-${enabled}`} className="lm-ts-demo grid grid-cols-3 gap-2" data-level={enabled ? level : 'off'}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="lm-ts-demo-item lm-transition flex flex-col gap-1.5 rounded-lumen-sm border border-edge bg-overlay p-2"
            style={{ ['--i' as string]: i }}
          >
            <span className="h-2 w-2/3 rounded-full bg-active" />
            <span className="lm-ts-demo-bar h-1.5 rounded-full bg-accent" style={{ width: `${45 + i * 20}%` }} />
            <span className="h-1.5 w-1/2 rounded-full bg-hover" />
          </div>
        ))}
        <div className="lm-ts-demo-item col-span-3 flex items-center gap-2 rounded-lumen-sm border border-edge bg-overlay px-2 py-1.5" style={{ ['--i' as string]: 3 }}>
          <span className="size-2 rounded-full bg-ok" />
          <span className="text-[11px] text-muted">{t('themeStudio.effects.demoToast')}</span>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-subtle">{t('themeStudio.effects.demoHint')}</p>
    </div>
  )
}

function speedLabel(t: (key: string) => string, v: number): string {
  if (v < 0.9) return t('themeStudio.effects.fast')
  if (v > 1.4) return t('themeStudio.effects.calm')
  return t('themeStudio.effects.normalSpeed')
}

/** The “Effects” section of the themes dialog. */
export function EffectsSection({ query }: { query: string }) {
  const t = useT()
  const effects = useStore((s) => s.effects)
  const setEffects = useStore((s) => s.setEffects)
  const resetEffects = useStore((s) => s.resetEffects)
  const [hoverLevel, setHoverLevel] = useState<Level | null>(null)
  const needle = query.trim().toLowerCase()
  const show = (...labels: string[]) => !needle || labels.some((l) => l.toLowerCase().includes(needle))

  const motionVisible = show(t('themeStudio.effects.animations'), t('themeStudio.effects.levelTitle'), t('themeStudio.effects.speed'))
  const looksVisible = show(t('themeStudio.effects.glass'), t('themeStudio.effects.glow'), t('themeStudio.effects.shadows'), t('themeStudio.effects.radius'), t('themeStudio.effects.transparency'))

  return (
    <div className="mx-auto max-w-[760px] px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] text-subtle">{t('themeStudio.effects.intro')}</p>
        <Button size="sm" onClick={resetEffects} title={t('themeStudio.effects.resetTitle')}>
          <RotateCcw size={11} /> {t('common.reset')}
        </Button>
      </div>

      {motionVisible && (
        <Section title={t('themeStudio.effects.motion')}>
          <Toggle
            label={t('themeStudio.effects.animations')}
            hint={t('themeStudio.effects.animationsHint')}
            checked={effects.animations}
            onChange={(v) => setEffects({ animations: v })}
          />

          <div className={`py-2 ${effects.animations ? '' : 'pointer-events-none opacity-45'}`}>
            <div className="mb-1 text-[13px] text-fg">{t('themeStudio.effects.levelTitle')}</div>
            <div className="mb-2 text-[11.5px] text-subtle">{t('themeStudio.effects.levelHint')}</div>
            <div className="grid grid-cols-3 gap-2 max-[640px]:grid-cols-1" role="radiogroup" aria-label={t('themeStudio.effects.levelTitle')}>
              {LEVELS.map(({ id, icon: Icon }) => {
                const active = effects.animationLevel === id
                return (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setEffects({ animationLevel: id })}
                    onMouseEnter={() => setHoverLevel(id)}
                    onMouseLeave={() => setHoverLevel(null)}
                    className={[
                      'lm-transition flex flex-col items-start gap-1 rounded-lumen border p-2.5 text-left',
                      active ? 'border-accent bg-active' : 'border-edge hover:border-edge-strong hover:bg-hover',
                    ].join(' ')}
                  >
                    <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
                      <Icon size={13} className={active ? 'text-accent' : 'text-subtle'} />
                      {t(`themeStudio.effects.level.${id}`)}
                    </span>
                    <span className="text-[11px] leading-snug text-subtle">{t(`themeStudio.effects.level.${id}Hint`)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <MotionDemo level={hoverLevel ?? effects.animationLevel} enabled={effects.animations} />

          {effects.animations && (
            <Slider
              label={t('themeStudio.effects.speed')}
              min={0.4}
              max={2}
              step={0.1}
              value={effects.animationSpeed}
              format={(v) => `${v.toFixed(1)}× · ${speedLabel(t, v)}`}
              onChange={(v) => setEffects({ animationSpeed: v })}
            />
          )}
        </Section>
      )}

      {looksVisible && (
        <Section title={t('themeStudio.effects.looks')}>
          {show(t('themeStudio.effects.glass')) && (
            <Toggle label={t('themeStudio.effects.glass')} hint={t('themeStudio.effects.glassHint')} checked={effects.glass} onChange={(v) => setEffects({ glass: v })} />
          )}
          {show(t('themeStudio.effects.glow')) && (
            <Toggle label={t('themeStudio.effects.glow')} hint={t('themeStudio.effects.glowHint')} checked={effects.glow} onChange={(v) => setEffects({ glow: v })} />
          )}
          {show(t('themeStudio.effects.shadows')) && (
            <Toggle label={t('themeStudio.effects.shadows')} hint={t('themeStudio.effects.shadowsHint')} checked={effects.shadows} onChange={(v) => setEffects({ shadows: v })} />
          )}
          {show(t('themeStudio.effects.radius')) && (
            <Slider label={t('themeStudio.effects.radius')} min={0} max={20} value={effects.radius} format={(v) => `${v} px`} onChange={(v) => setEffects({ radius: v })} />
          )}
          {show(t('themeStudio.effects.transparency')) && (
            <Slider
              label={t('themeStudio.effects.transparency')}
              min={0}
              max={0.5}
              step={0.05}
              value={effects.transparency}
              format={(v) => `${Math.round(v * 100)} %`}
              onChange={(v) => setEffects({ transparency: v })}
            />
          )}

          {/* Live-Muster für Glas, Schein, Schatten und Ecken */}
          <div className="relative mt-2 h-[92px] overflow-hidden rounded-lumen border border-edge bg-[linear-gradient(135deg,var(--c-accent),var(--c-success)_45%,var(--c-warning))]">
            <div className="lm-glass lm-shadow absolute top-4 left-4 flex h-[60px] w-[180px] items-center gap-2 rounded-lumen border border-edge px-3">
              <span className="lm-glow flex size-7 items-center justify-center rounded-lumen-sm bg-accent text-accent-fg"><Sparkles size={13} /></span>
              <span className="text-[11.5px] text-fg">{t('themeStudio.effects.sample')}</span>
            </div>
          </div>
        </Section>
      )}

      {!motionVisible && !looksVisible && <p className="py-8 text-center text-[12px] text-subtle">{t('common.nothingFound')}</p>}
    </div>
  )
}
