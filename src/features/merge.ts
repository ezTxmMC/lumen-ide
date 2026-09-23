/** Starting the “merge” feature: conflict blocks in the editor and their commands. */

import { registerEditorExtension } from '@/lib/editor-extensions'
import { registerCommandProvider } from '@/core/commands'
import { mergeEditorExtension } from '@/core/merge/editor'
import { mergeCommands } from '@/core/merge/commands'

export function init() {
  registerEditorExtension(mergeEditorExtension)
  registerCommandProvider(mergeCommands)
}
