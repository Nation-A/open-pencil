<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

import { useCommentMessages, useCommonMessages } from '@open-pencil/vue'

import AppButton from '@/components/ui/button/AppButton.vue'
import { comments } from '@/theme/comments'

import CommentComposer from './CommentComposer.vue'

/**
 * workos: a comment or reply being edited in place, as in Figma: its text in the composer (with @mention
 * completion), Enter or Save keeps the change, Escape or Cancel drops it.
 */
const { initial, label = '' } = defineProps<{ initial: string; label?: string }>()

const emit = defineEmits<{ save: [text: string]; cancel: [] }>()

const messages = useCommentMessages()
const common = useCommonMessages()
const ui = comments()
const text = ref(initial)
const composer = useTemplateRef<{ focus: () => void }>('composer')

function save(value: string) {
  if (value.trim() === '') return
  emit('save', value.trim())
}

defineExpose({ focus: () => composer.value?.focus() })
</script>

<template>
  <div data-slot="comment-editor" :class="ui.editor()">
    <CommentComposer
      ref="composer"
      v-model="text"
      hide-send
      :label="label || messages.editComment"
      @submit="save"
      @cancel="emit('cancel')"
    />
    <div :class="ui.editorActions()">
      <AppButton
        size="xs"
        variant="ghost"
        data-command="comment-edit-cancel"
        @click="emit('cancel')"
      >
        {{ common.cancel }}
      </AppButton>
      <AppButton
        size="xs"
        color="primary"
        variant="solid"
        data-command="comment-edit-save"
        :disabled="text.trim() === ''"
        @click="save(text)"
      >
        {{ common.save }}
      </AppButton>
    </div>
  </div>
</template>
