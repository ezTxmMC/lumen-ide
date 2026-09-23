/**
 * Tests the menu bar's model (`src/components/shell/menubar/model.ts`):
 * commands turned into rows, separators, keyboard movement over rows.
 */

import { keybindings } from '@/core/keybindings'
import { nextSelectable, resolveRows, type CommandIndex, type Row } from '@/components/shell/menubar/model'
import type { Command } from '@/core/types'

let failures = 0
let passed = 0

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++
    console.log(`✓ ${name}`)
    return
  }
  failures++
  console.log(`✗ ${name}`, detail ?? '')
}

const ran: string[] = []
const command = (id: string, when?: () => boolean): Command => ({ id, title: `Title ${id}`, run: () => { ran.push(id) }, when })
const commands: CommandIndex = new Map([
  ['a', command('a')],
  ['b', command('b', () => false)],
  ['c', command('c')],
].map(([id, cmd]) => [id as string, cmd as Command]))

keybindings.configure('lumen', { a: ['Ctrl+Shift+Q'] })

/* Commands become rows */
{
  const rows = resolveRows([{ command: 'a' }, { command: 'b', label: 'Bee' }, { command: 'missing' }], commands)
  check('A missing command leaves no row', rows.length === 2, rows)
  const [a, b] = rows
  check('The title comes from the command', a.kind === 'action' && a.label === 'Title a')
  check('A label overrides the title', b.kind === 'action' && b.label === 'Bee')
  check('A false `when` greys the row out', b.kind === 'action' && b.disabled === true && a.kind === 'action' && !a.disabled)
  check('The shortcut shows as a hint', a.kind === 'action' && Boolean(a.hint?.includes('Q')), a)
  const withFallback = resolveRows([{ command: 'c', keys: 'Ctrl+X' }], commands)[0]
  check('A command without a binding shows the fallback keys', withFallback.kind === 'action' && Boolean(withFallback.hint?.includes('X')), withFallback)
  if (a.kind === 'action') a.run()
  check('Running a row runs the command', ran.includes('a'))
}

/* Separators */
{
  const rows = resolveRows(['sep', { command: 'a' }, 'sep', 'sep', { command: 'missing' }, 'sep', { command: 'c' }, 'sep'], commands)
  check('Separators collapse and never lead or trail', rows.map((row) => row.kind).join(',') === 'action,sep,action', rows)
  const empty = resolveRows(['sep', { command: 'missing' }, 'sep'], commands)
  check('A group of missing commands leaves nothing', empty.length === 0, empty)
}

/* Submenus resolve lazily */
{
  let built = 0
  const rows = resolveRows([{ label: 'More', submenu: () => { built++; return [{ command: 'c' }] } }], commands)
  check('A submenu is built only when opened', built === 0 && rows[0].kind === 'submenu')
  const inner = rows[0].kind === 'submenu' ? rows[0].rows() : []
  check('… and resolves its entries then', built === 1 && inner.length === 1)
}

/* Keyboard movement */
{
  const rows: Row[] = [
    { kind: 'action', label: 'one', run: () => {} },
    { kind: 'sep' },
    { kind: 'action', label: 'off', run: () => {}, disabled: true },
    { kind: 'action', label: 'three', run: () => {} },
  ]
  check('Down from nothing lands on the first row', nextSelectable(rows, -1, 1) === 0)
  check('Down skips separators and disabled rows', nextSelectable(rows, 0, 1) === 3)
  check('Down wraps around', nextSelectable(rows, 3, 1) === 0)
  check('Up from nothing lands on the last row', nextSelectable(rows, rows.length, -1) === 3)
  check('Up skips back over the disabled row', nextSelectable(rows, 3, -1) === 0)
  check('No selectable row gives -1', nextSelectable([{ kind: 'sep' }], -1, 1) === -1)
}

console.log(`\n${passed} passed, ${failures} failed`)
if (failures) process.exit(1)
console.log('✓ Menu bar in order')
