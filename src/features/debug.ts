/** Starting the “debug” feature: registering the debugger, the editor extension and the commands. */

import { registerEditorExtension } from '@/lib/editor-extensions'
import { registerCommandProvider } from '@/core/commands'
import { debug } from '@/core/debug/manager'
import { debugEditorExtension } from '@/core/debug/editor'
import { debugCommands } from '@/core/debug/commands'

export function init() {
  debug.init()
  registerEditorExtension(debugEditorExtension)
  registerCommandProvider(debugCommands)
}
