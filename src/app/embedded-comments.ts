import { watch, watchEffect, type Ref } from 'vue'

import type { Tool } from '@open-pencil/core/editor'
import {
  readComments,
  writeComments,
  type SceneGraph,
  type CommentThread
} from '@open-pencil/scene-graph'

import { commentsHost, type CommentsHost } from '@/app/comments/host-provider'
import type { EditorStore } from '@/app/editor/active-store'

/**
 * workos: the editor-side rules of a host-owned comment store: which tools a commenter keeps, and the
 * one-time move of a document's old plugin-data comments to the host.
 */

const COMMENTER_TOOLS: ReadonlySet<Tool> = new Set<Tool>(['COMMENT', 'HAND'])
const VIEWER_TOOLS: ReadonlySet<Tool> = new Set<Tool>(['HAND'])

/**
 * The tools a host's person may use, or null for all of them. A read-only document keeps Comment and Hand
 * for someone who may comment (a commenter), and Hand alone for someone who may not.
 */
export function allowedTools(host: CommentsHost | null): ReadonlySet<Tool> | null {
  if (!host?.readOnly) return null
  return host.capabilities.comment ? COMMENTER_TOOLS : VIEWER_TOOLS
}

/** The tool to fall back to when the active one is not allowed. */
export function fallbackTool(allowed: ReadonlySet<Tool>): Tool {
  return allowed.has('COMMENT') ? 'COMMENT' : 'HAND'
}

const importing = new WeakSet<SceneGraph>()
const imported = new WeakSet<SceneGraph>()

/** A document's comments that are still live, without tombstones. */
function liveLegacy(graph: SceneGraph): CommentThread[] {
  return readComments(graph)
    .filter((thread) => !thread.deleted)
    .map((thread) => ({ ...thread, replies: thread.replies.filter((entry) => !entry.deleted) }))
}

/**
 * Hands the document's plugin-data comments to the host once, then removes them from the document so
 * the host's copy is the only one. Nothing is removed when the host cannot import or the import fails.
 * Returns true when comments were moved.
 */
export async function importLegacyComments(
  host: CommentsHost,
  graph: SceneGraph
): Promise<boolean> {
  if (imported.has(graph) || importing.has(graph)) return false
  const legacy = liveLegacy(graph)
  if (legacy.length === 0 && readComments(graph).length === 0) {
    imported.add(graph)
    return false
  }
  if (!host.importLegacy) return false
  importing.add(graph)
  try {
    if (legacy.length > 0) await host.importLegacy(legacy)
    writeComments(graph, [])
    imported.add(graph)
    return legacy.length > 0
  } catch {
    return false
  } finally {
    importing.delete(graph)
  }
}

/** A commenter keeps the Comment tool only, and the document's old comments move to the host once. */
export function bindHostRules(storeRef: Ref<EditorStore | undefined>): void {
  watchEffect(() => {
    const store = storeRef.value
    const allowed = allowedTools(commentsHost.value)
    if (store && allowed && !allowed.has(store.state.activeTool)) {
      store.setTool(fallbackTool(allowed))
    }
  })
  watch(
    [storeRef, commentsHost],
    ([store, current]) => {
      if (store && current) void importLegacyComments(current, store.graph)
    },
    { immediate: true }
  )
}
