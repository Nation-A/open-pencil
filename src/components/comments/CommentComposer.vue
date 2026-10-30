<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core'
import { computed, nextTick, ref, useTemplateRef } from 'vue'

import { shortcutPlatform, useCommentMessages } from '@open-pencil/vue'

import {
  commentFormatForKey,
  continueList,
  formatComment,
  type CommentEdit
} from '@/app/comments/format'
import {
  activeMentionQuery,
  applyMention,
  filterMembers,
  type MentionMember
} from '@/app/comments/mentions'
import { useComments } from '@/app/comments/use'
import AppButton from '@/components/ui/button/AppButton.vue'
import { comments } from '@/theme/comments'

/**
 * Where a comment or reply is written. Enter sends and Shift+Enter starts a new line or list
 * item; Figma's shortcuts format the selection as Markdown (`format.ts`).
 */
const { label, bare = false } = defineProps<{
  label: string
  /** The composer is its card's whole content, as a new comment's is. */
  bare?: boolean
}>()

const emit = defineEmits<{ submit: [text: string]; cancel: [] }>()

const text = defineModel<string>({ default: '' })
const input = useTemplateRef<HTMLTextAreaElement>('input')
useTextareaAutosize({ element: input, input: text })

const messages = useCommentMessages()
const ui = computed(() => comments({ bare }))
const empty = computed(() => text.value.trim() === '')
const mac = shortcutPlatform() === 'mac'

// workos: typing `@` offers the people the host says have access.
const members = useComments().members
const caret = ref(0)
const dismissedAt = ref<number | null>(null)
const highlighted = ref(0)
const openMention = computed(() => {
  const open = members.value.length > 0 ? activeMentionQuery(text.value, caret.value) : null
  return open && open.start !== dismissedAt.value ? open : null
})
const options = computed(() =>
  openMention.value ? filterMembers(members.value, openMention.value.query, 5) : []
)

function syncCaret() {
  caret.value = input.value?.selectionStart ?? text.value.length
}

function onInput() {
  syncCaret()
  highlighted.value = 0
}

function pickMention(member: MentionMember) {
  const element = input.value
  const open = openMention.value
  if (!element || !open) return
  const next = applyMention(text.value, element.selectionStart, open, member)
  text.value = next.value
  caret.value = next.caret
  void nextTick(() => {
    element.focus()
    element.setSelectionRange(next.caret, next.caret)
  })
}

/** Keys that move through or confirm the mention list; true when one was used. */
function onMentionKey(event: KeyboardEvent): boolean {
  if (options.value.length === 0) return false
  const last = options.value.length - 1
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const step = event.key === 'ArrowDown' ? 1 : -1
    highlighted.value = Math.min(last, Math.max(0, highlighted.value + step))
  } else if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
    const member = options.value[highlighted.value]
    if (!member) return false
    pickMention(member)
  } else {
    return false
  }
  event.preventDefault()
  return true
}

function onEscape() {
  if (openMention.value) dismissedAt.value = openMention.value.start
  else emit('cancel')
}

function submit() {
  if (empty.value) return
  emit('submit', text.value.trim())
}

function apply(next: CommentEdit) {
  text.value = next.value
  void nextTick(() => input.value?.setSelectionRange(next.start, next.end))
}

function onKeydown(event: KeyboardEvent) {
  const element = input.value
  // Enter also confirms a word in an input method; that is not sending.
  if (!element || event.isComposing) return
  if (onMentionKey(event)) return
  const current = {
    value: text.value,
    start: element.selectionStart,
    end: element.selectionEnd
  }
  if (event.code === 'Enter' || event.code === 'NumpadEnter') {
    if (event.altKey || event.metaKey || event.ctrlKey) return
    if (!event.shiftKey) {
      event.preventDefault()
      submit()
      return
    }
    const next = continueList(current)
    if (!next) return
    event.preventDefault()
    apply(next)
    return
  }
  const format = commentFormatForKey({
    code: event.code,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    mod: mac ? event.metaKey : event.ctrlKey
  })
  if (!format) return
  // The editor binds some of these keys too, such as Cmd+K for the command palette.
  event.preventDefault()
  event.stopPropagation()
  apply(formatComment(current, format))
}

function focus() {
  input.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <form data-slot="comment-composer" :class="[ui.composer(), 'relative']" @submit.prevent="submit">
    <ul
      v-if="options.length"
      role="listbox"
      data-slot="mention-list"
      class="absolute bottom-full left-0 z-20 mb-1 flex w-full flex-col overflow-hidden rounded-lg border border-border bg-panel py-1 text-xs shadow-md"
    >
      <li
        v-for="(member, index) in options"
        :key="member.id"
        role="option"
        :aria-selected="index === highlighted"
        :data-mention-id="member.id"
        class="cursor-pointer truncate px-3 py-1 text-surface hover:bg-hover aria-selected:bg-hover"
        @pointerdown.prevent="pickMention(member)"
      >
        {{ member.name }}
      </li>
    </ul>
    <textarea
      ref="input"
      v-model="text"
      rows="1"
      :aria-label="label"
      :placeholder="label"
      :class="ui.composerInput()"
      @keydown="onKeydown"
      @keyup="syncCaret"
      @click="syncCaret"
      @input="onInput"
      @keydown.escape.stop.prevent="onEscape"
    />
    <AppButton
      type="submit"
      color="primary"
      variant="solid"
      shape="pill"
      size="xs"
      :disabled="empty"
      :aria-label="messages.send"
      :ui="{ base: 'size-6 shrink-0 px-0' }"
    >
      <icon-lucide-arrow-up class="size-3.5" />
    </AppButton>
  </form>
</template>
