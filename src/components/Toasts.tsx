import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useStore, type Toast } from '@/state/store'
import { exitDuration } from '@/hooks/usePresence'

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const

const COLORS = {
  info: 'text-accent',
  success: 'text-ok',
  warning: 'text-warn',
  error: 'text-bad',
} as const

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  // Removed notices linger briefly and glide out.
  const [leaving, setLeaving] = useState<Toast[]>([])
  const previous = useRef<Toast[]>(toasts)

  useEffect(() => {
    const live = new Set(toasts.map((toast) => toast.id))
    const gone = previous.current.filter((toast) => !live.has(toast.id))
    previous.current = toasts
    if (!gone.length) return
    setLeaving((list) => [...list, ...gone])
    window.setTimeout(() => setLeaving((list) => list.filter((toast) => !gone.includes(toast))), exitDuration())
  }, [toasts])

  const shown = [...toasts, ...leaving].sort((a, b) => a.id - b.id)

  return (
    <div className="pointer-events-none fixed right-4 bottom-9 z-50 flex flex-col items-end gap-2">
      {shown.map((toast) => {
        const Icon = ICONS[toast.kind]
        const closing = leaving.includes(toast)
        return (
          <button
            key={toast.id}
            onClick={() => dismiss(toast.id)}
            className={`lm-glass lm-shadow lm-anim-toast pointer-events-auto ${closing ? 'lm-closing' : ''} flex max-w-[360px] items-center gap-2.5 rounded-lumen border border-edge px-3 py-2 text-left`}
          >
            <Icon size={14} className={`shrink-0 ${COLORS[toast.kind]}`} />
            <span className="text-[12.5px] text-fg">{toast.message}</span>
          </button>
        )
      })}
    </div>
  )
}
