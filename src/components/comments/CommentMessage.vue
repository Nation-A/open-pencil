<script setup lang="ts">
import type { CommentReaction } from '@open-pencil/scene-graph'
import type { Color } from '@open-pencil/scene-graph/primitives'

import { mentionsToMarkdown } from '@/app/comments/mentions'
import MarkdownContent from '@/components/markdown/MarkdownContent.vue'
import PersonAvatar from '@/components/presence/PersonAvatar.vue'
import { comments } from '@/theme/comments'

import { useCommentAuthor } from './author'
import CommentReactions from './CommentReactions.vue'
import CommentTime from './CommentTime.vue'

/** One message of a thread: who wrote it, when, and what. */
const {
  author,
  color,
  at,
  text,
  reactions = undefined,
  meId = null,
  canReact = true
} = defineProps<{
  author: string
  color?: Color
  at: string
  text: string
  /** workos: set (even empty) when a host stores the comment, which shows the reaction row. */
  reactions?: readonly CommentReaction[]
  meId?: string | null
  canReact?: boolean
}>()

const emit = defineEmits<{ react: [emoji: string] }>()

defineSlots<{ actions?(): unknown }>()

const who = useCommentAuthor()
const ui = comments()
</script>

<template>
  <article data-slot="comment-message" :class="ui.message()">
    <PersonAvatar :name="who.name(author)" :color="who.color(color)" />
    <div :class="ui.messageMeta()">
      <span :class="ui.messageAuthor()">{{ who.name(author) }}</span>
      <CommentTime :at="at" :class="ui.messageTime()" />
      <span v-if="$slots.actions" :class="ui.messageActions()"><slot name="actions" /></span>
    </div>
    <MarkdownContent :content="mentionsToMarkdown(text)" :class="ui.messageText()" />
    <CommentReactions
      v-if="reactions !== undefined"
      :reactions="reactions"
      :me-id="meId"
      :can-react="canReact"
      @toggle="emit('react', $event)"
    />
  </article>
</template>
