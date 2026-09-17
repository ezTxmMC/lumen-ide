/** The debugger's commands, for the palette and the shortcuts. */

import { useStore } from '@/state/store'
import { editorBridge } from '@/lib/editor-bridge'
import { t } from '@/i18n'
import type { Command } from '@/core/types'
import { breakpoints } from './breakpoints'
import { debug } from './manager'
import { openLaunchConfigFile } from './config'
import { cursorLine } from './editor'
import { editBreakpoint } from './actions'

export function debugCommands(): Command[] {
  const category = t('debug.category')
  const hasEditor = () => Boolean(editorBridge.view && cursorLine())
  const active = () => debug.hasSessions
  const stopped = () => debug.hasSessions && debug.isStopped
  const withLine = (fn: (path: string, line: number) => unknown) => () => {
    const target = cursorLine()
    if (target) void fn(target.path, target.line)
  }

  return [
    {
      id: 'debug.toggleBreakpoint', title: t('debug.cmd.toggleBreakpoint'), category,
      run: withLine((path, line) => breakpoints.toggle(path, line)),
      when: hasEditor,
    },
    {
      id: 'debug.conditionalBreakpoint', title: t('debug.cmd.conditionalBreakpoint'), category,
      run: withLine((path, line) => editBreakpoint(path, line, 'condition')),
      when: hasEditor,
    },
    {
      id: 'debug.logpoint', title: t('debug.cmd.logpoint'), category,
      run: withLine((path, line) => editBreakpoint(path, line, 'logMessage')),
      when: hasEditor,
    },
    {
      id: 'debug.start', title: t('debug.cmd.start'), category,
      run: () => debug.start(),
      when: () => !debug.hasSessions && !debug.starting,
    },
    {
      id: 'debug.selectAndStart', title: t('debug.cmd.selectAndStart'), category,
      run: () => debug.start({ pick: true }),
      when: () => !debug.starting,
    },
    // These share keys with run (F5) and editor commands — they only apply during a session.
    { id: 'debug.continue', title: t('debug.cmd.continue'), category, run: () => debug.continue(), when: stopped },
    { id: 'debug.pause', title: t('debug.cmd.pause'), category, run: () => debug.pause(), when: () => active() && !debug.isStopped },
    { id: 'debug.stepOver', title: t('debug.cmd.stepOver'), category, run: () => debug.step('next'), when: stopped },
    { id: 'debug.stepInto', title: t('debug.cmd.stepInto'), category, run: () => debug.step('stepIn'), when: stopped },
    { id: 'debug.stepOut', title: t('debug.cmd.stepOut'), category, run: () => debug.step('stepOut'), when: stopped },
    { id: 'debug.stop', title: t('debug.cmd.stop'), category, run: () => debug.stopAll(), when: active },
    { id: 'debug.restart', title: t('debug.cmd.restart'), category, run: () => debug.restart(), when: active },
    {
      id: 'debug.runToCursor', title: t('debug.cmd.runToCursor'), category,
      run: withLine((path, line) => debug.runToCursor(path, line)),
      when: hasEditor,
    },
    { id: 'debug.openConfig', title: t('debug.cmd.openConfig'), category, run: () => openLaunchConfigFile(), when: () => Boolean(useStore.getState().workspace) },
    {
      id: 'debug.removeAllBreakpoints', title: t('debug.cmd.removeAllBreakpoints'), category,
      run: () => breakpoints.removeAll(),
      when: () => breakpoints.all().length > 0,
    },
    {
      id: 'debug.enableAllBreakpoints', title: t('debug.cmd.enableAllBreakpoints'), category,
      run: () => breakpoints.setAllEnabled(true),
      when: () => breakpoints.all().some((bp) => !bp.enabled),
    },
    {
      id: 'debug.disableAllBreakpoints', title: t('debug.cmd.disableAllBreakpoints'), category,
      run: () => breakpoints.setAllEnabled(false),
      when: () => breakpoints.all().some((bp) => bp.enabled),
    },
    {
      id: 'debug.toggleInlineValues',
      title: debug.showInline ? t('debug.cmd.hideInlineValues') : t('debug.cmd.showInlineValues'),
      category,
      run: () => debug.setShowInline(!debug.showInline),
    },
    {
      id: 'debug.showConsole', title: t('debug.cmd.showConsole'), category,
      run: () => useStore.getState().showPanel('debug'),
    },
  ]
}
