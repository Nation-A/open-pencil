import { computed, ref, type WritableComputedRef } from 'vue'

import type { CommentStatus } from '@open-pencil/scene-graph'

import {
  appPreferences,
  updateCommentPreferences,
  type CommentPreferences
} from '@/app/settings/preferences/store'

/** A comment preference the list and menus read and change in place. */
function preference<K extends keyof CommentPreferences>(
  key: K
): WritableComputedRef<CommentPreferences[K]> {
  return computed({
    get: () => appPreferences.value.comments[key],
    set: (value) => updateCommentPreferences({ [key]: value })
  })
}

/** The comments list's search and filters: the saved preferences, and workos' status and mentions filters for the session. */
export function createListState() {
  return {
    listQuery: ref(''),
    listShowResolved: preference('showResolved'),
    listOnlyPage: preference('onlyPage'),
    listOnlyMine: preference('onlyMine'),
    listSort: preference('sort'),
    listStatus: ref<CommentStatus>('all'),
    listOnlyMentions: ref(false)
  }
}
