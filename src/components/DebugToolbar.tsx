import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDownToDot, ArrowUpFromDot, GripVertical, Pause, Play, RedoDot, RotateCcw, Square,
} from 'lucide-react'
import { useStore } from '@/state/store'
import { useT } from '@/i18n'
import { debug } from '@/core/debug/manager'
import { formatBindingsFor } from '@/core/keybindings'
import { useDebugVersion } from './debug/shared'

const POSITION_KEY = 'lumen.debug.toolbar'

interface Position {
  /** Centre relative to the window width (0 – 1). */
  x: number
  y: number
}

function loadPosition(): Position {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null') as Position | null
    if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed
  } catch {
    // The default position.
  }
  return { x: 0.5, y: 46 }
}

function ToolButton({ title, command, onClick, disabled, children, tone = 'text-muted hover:text-fg' }: {
  title: string
  command: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  tone?: string
}) {
  const keys = formatBindingsFor(command)
  const label = keys ? `${title} (${keys})` : title
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`lm-transition flex size-7 items-center justify-center rounded-lumen-sm hover:bg-hover disabled:pointer-events-none disabled:opacity-35 ${tone}`}
    >
      {children}
    </button>
  )
}

/** A floating control bar during a debug session — top centre, draggable. */
export function DebugToolbar() {
  const t = useT()
  const active = useStore((s) => s.debugActive)
  useDebugVersion()
  const [position, setPosition] = useState<Position>(loadPosition)
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(position))
    } catch {
      // The position then only lasts until a restart.
    }
  }, [position])

  if (!active) return null

  const stopped = debug.isStopped

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault()
    const rect = bar.current?.getBoundingClientRect()
    if (!rect) return
    const offsetX = event.clientX - (rect.left + rect.width / 2)
    const offsetY = event.clientY - rect.top
    const move = (e: PointerEvent) => {
      const half = rect.width / 2
      const centerX = Math.min(Math.max(e.clientX - offsetX, half + 4), window.innerWidth - half - 4)
      const top = Math.min(Math.max(e.clientY - offsetY, 4), window.innerHeight - rect.height - 4)
      setPosition({ x: centerX / window.innerWidth, y: top })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label={t('debug.toolbar.label')}
      className="lm-glass lm-shadow lm-anim-pop fixed z-40 flex items-center gap-0.5 rounded-lumen border border-edge p-0.5"
      // `translate` rather than `transform`, so the fade-in does not override the centring.
      style={{ left: `${position.x * 100}%`, top: position.y, translate: '-50% 0' }}
    >
      <div
        onPointerDown={startDrag}
        className="flex h-7 w-4 cursor-grab items-center justify-center text-subtle active:cursor-grabbing"
        title={t('debug.toolbar.move')}
      >
        <GripVertical size={12} />
      </div>
      {stopped && (
        <ToolButton title={t('debug.cmd.continue')} command="debug.continue" onClick={() => void debug.continue()} tone="text-ok hover:text-ok">
          <Play size={14} />
        </ToolButton>
      )}
      {!stopped && (
        <ToolButton title={t('debug.cmd.pause')} command="debug.pause" onClick={() => void debug.pause()} tone="text-warn hover:text-warn">
          <Pause size={14} />
        </ToolButton>
      )}
      <ToolButton title={t('debug.cmd.stepOver')} command="debug.stepOver" onClick={() => void debug.step('next')} disabled={!stopped}>
        <RedoDot size={14} />
      </ToolButton>
      <ToolButton title={t('debug.cmd.stepInto')} command="debug.stepInto" onClick={() => void debug.step('stepIn')} disabled={!stopped}>
        <ArrowDownToDot size={14} />
      </ToolButton>
      <ToolButton title={t('debug.cmd.stepOut')} command="debug.stepOut" onClick={() => void debug.step('stepOut')} disabled={!stopped}>
        <ArrowUpFromDot size={14} />
      </ToolButton>
      <div className="mx-0.5 h-4 w-px bg-edge" />
      <ToolButton title={t('debug.cmd.restart')} command="debug.restart" onClick={() => void debug.restart()} tone="text-accent hover:text-accent">
        <RotateCcw size={14} />
      </ToolButton>
      <ToolButton title={t('debug.cmd.stop')} command="debug.stop" onClick={() => void debug.stopAll()} tone="text-bad hover:text-bad">
        <Square size={13} />
      </ToolButton>
    </div>
  )
}
