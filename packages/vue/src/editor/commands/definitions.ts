import { computed } from 'vue'

import type { EditorCommandMapOptions } from './context'
import { createEditCommands } from './edit'
import { createSelectionCommands } from './selection'
import type { EditorCommand, EditorCommandId } from './types'
import { createViewCommands } from './view'

export function createEditorCommandMap(
  options: EditorCommandMapOptions
): Record<EditorCommandId, EditorCommand> {
  const commands = {
    ...createEditCommands(options),
    ...createSelectionCommands(options),
    ...createViewCommands(options)
  }
  // A read-only document keeps the commands that only move around or select; the rest are disabled.
  for (const id of Object.keys(commands) as EditorCommandId[]) {
    if (READ_ONLY_SAFE.has(id)) continue
    const command = commands[id]
    const enabled = command.enabled
    commands[id] = {
      ...command,
      enabled: computed(() => enabled.value && options.editor.state.readOnly !== true)
    }
  }
  return commands
}

/** Commands that stay available when the document is read-only. */
const READ_ONLY_SAFE: ReadonlySet<EditorCommandId> = new Set<EditorCommandId>([
  'selection.selectAll',
  'selection.selectInverse',
  'selection.selectChildren',
  'selection.selectParent',
  'selection.selectNextSibling',
  'selection.selectPreviousSibling',
  'selection.goToMainComponent',
  'view.zoom100',
  'view.zoomFit',
  'view.zoomSelection',
  'view.zoomNextFrame',
  'view.zoomPreviousFrame',
  'view.nextPage',
  'view.previousPage'
])
