/**
 * A side dock — left or right of the editor. It shows one view at a time,
 * chosen in its navigation strip, with the view's title and toolbar on top.
 */

import { useState } from 'react'
import { Ellipsis, X } from 'lucide-react'
import { useStore } from '@/state/store'
import { isViewPopped } from '@/state/popout'
import { useT } from '@/i18n'
import { ContextMenu, menuBelow, type MenuItem } from '../ui/ContextMenu'
import { Button } from '../ui'
import { useDock } from './useDock'
import { PopOutButton, ResizeHandle, viewMenu } from './parts'
import { ViewBody } from './ViewBody'

export function SideDock({ side }: { side: 'left' | 'right' }) {
  const t = useT()
  const { active, open, size } = useDock(side)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  // The toolbar goes with the view into its window; the dock keeps only the way back.
  const popped = useStore((s) => Boolean(active && isViewPopped(s.popouts, active.id)))

  if (!open || !active) return null

  const border = side === 'left' ? 'border-r' : 'border-l'
  const animation = side === 'left' ? 'lm-anim-right' : 'lm-anim-fade'
  const source = active.source?.()

  return (
    <aside data-dock={side} className={`${animation} flex shrink-0 ${border} border-edge bg-surface`} style={{ width: size }}>
      {side === 'right' && <ResizeHandle dock="right" edge="left" />}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center gap-1 pr-1 pl-3" title={source}>
          <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">
            {active.title()}
          </span>
          {!popped && active.toolbar?.()}
          <PopOutButton view={active} />
          <span onClick={(e) => setMenu({ ...menuBelow(e.currentTarget), items: viewMenu(active, side) })}>
            <Button size="sm" title={t('shell.layout.more')}>
              <Ellipsis size={13} />
            </Button>
          </span>
          <Button size="sm" title={t('shell.layout.closeDock')} onClick={() => useStore.getState().toggleDock(side, false)}>
            <X size={13} />
          </Button>
        </div>
        <div key={active.id} className="lm-anim-fade min-h-0 flex-1">
          <ViewBody view={active} />
        </div>
      </div>
      {side === 'left' && <ResizeHandle dock="left" edge="right" />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </aside>
  )
}
