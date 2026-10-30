<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from 'reka-ui'
import { computed, ref, useTemplateRef } from 'vue'

import { liveReplies, type CommentThread } from '@open-pencil/scene-graph'
import { useCommentMessages, useCommonMessages } from '@open-pencil/vue'

import { useComments } from '@/app/comments/use'
import IconButton from '@/components/ui/button/IconButton.vue'
import { useMenuUI } from '@/components/ui/menu/menu'
import MenuScrollArea from '@/components/ui/menu/MenuScrollArea.vue'
import PanelHeader from '@/components/ui/panel/PanelHeader.vue'
import { comments } from '@/theme/comments'

import CommentComposer from './CommentComposer.vue'
import CommentEditor from './CommentEditor.vue'
import CommentMessage from './CommentMessage.vue'

/** An open thread: the comment, its replies, and a reply box, as in Figma's comment card. */
const { thread } = defineProps<{ thread: CommentThread }>()

const emit = defineEmits<{
  close: []
  resolve: [threadId: string, resolved: boolean]
  reply: [threadId: string, text: string]
  deleteReply: [threadId: string, replyId: string]
}>()

defineSlots<{ menu?(): unknown }>()

const messages = useCommentMessages()
const common = useCommonMessages()
const menuCls = useMenuUI({ content: 'min-w-40', item: 'justify-start gap-2' })
const ui = comments()
const state = useComments()
// workos: host-stored comments carry reactions (possibly none); the stock ones do not.
const reactionsOf = (reactions: CommentThread['reactions']) =>
  state.hosted.value ? (reactions ?? []) : undefined
const replyText = ref('')
const composer = useTemplateRef<{ focus: () => void }>('composer')
const replies = computed(() => liveReplies(thread))
const editingRoot = computed(
  () => state.editing.value?.threadId === thread.id && state.editing.value.replyId === null
)
const editingReply = (replyId: string) =>
  state.editing.value?.threadId === thread.id && state.editing.value.replyId === replyId

function sendReply(text: string) {
  emit('reply', thread.id, text)
  replyText.value = ''
}

defineExpose({ focus: () => composer.value?.focus() })
</script>

<template>
  <section
    data-slot="comment-thread"
    :data-resolved="thread.resolved || undefined"
    :aria-label="messages.comment"
    :class="ui.threadCard()"
  >
    <PanelHeader>
      <template #icon><icon-lucide-message-circle class="size-3.5" /></template>
      {{ messages.comment }}
      <template #actions>
        <DropdownMenuRoot v-if="$slots.menu" :modal="false">
          <DropdownMenuTrigger as-child>
            <IconButton :label="messages.moreActions">
              <icon-lucide-ellipsis class="size-3.5" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent :class="menuCls.content" align="end" :side-offset="4">
              <MenuScrollArea>
                <slot name="menu" />
              </MenuScrollArea>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <IconButton
          :label="thread.resolved ? messages.reopen : messages.resolve"
          :active="thread.resolved"
          :disabled="!state.can.value.resolve"
          data-command="comment-resolve"
          @click="emit('resolve', thread.id, !thread.resolved)"
        >
          <icon-lucide-circle-check-big v-if="thread.resolved" class="size-3.5" />
          <icon-lucide-circle-check v-else class="size-3.5" />
        </IconButton>
        <IconButton :label="common.close" @click="emit('close')">
          <icon-lucide-x class="size-3.5" />
        </IconButton>
      </template>
    </PanelHeader>

    <div :class="ui.thread()">
      <CommentEditor
        v-if="editingRoot"
        :initial="thread.text"
        @save="state.saveEdit"
        @cancel="state.cancelEdit"
      />
      <CommentMessage
        v-else
        :author="thread.author"
        :color="thread.authorColor"
        :picture="thread.authorAvatarUrl"
        :at="thread.createdAt"
        :text="thread.text"
        :reactions="reactionsOf(thread.reactions)"
        :me-id="state.meId.value"
        :can-react="state.can.value.react"
        @react="state.react(thread.id, null, $event)"
      />
      <template v-for="entry in replies" :key="entry.id">
        <CommentEditor
          v-if="editingReply(entry.id)"
          :initial="entry.text"
          :label="messages.editReply"
          @save="state.saveEdit"
          @cancel="state.cancelEdit"
        />
        <CommentMessage
          v-else
          :author="entry.author"
          :color="entry.authorColor"
          :picture="entry.authorAvatarUrl"
          :at="entry.createdAt"
          :text="entry.text"
          :reactions="reactionsOf(entry.reactions)"
          :me-id="state.meId.value"
          :can-react="state.can.value.react"
          @react="state.react(thread.id, entry.id, $event)"
        >
          <template v-if="state.canEdit(thread, entry.id)" #actions>
            <!-- A reply's own menu, shown on hover as in Figma: edit and delete, for the author only. -->
            <DropdownMenuRoot :modal="false">
              <DropdownMenuTrigger as-child>
                <IconButton :label="messages.moreActions" data-command="comment-reply-menu">
                  <icon-lucide-ellipsis class="size-3" />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent :class="menuCls.content" align="end" :side-offset="4">
                  <DropdownMenuItem
                    :class="menuCls.item"
                    data-command="comment-edit-reply"
                    @select="state.startEdit(thread.id, entry.id)"
                  >
                    <icon-lucide-pencil :class="menuCls.icon" />
                    <span>{{ messages.edit }}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    :class="menuCls.item"
                    data-command="comment-delete-reply"
                    @select="emit('deleteReply', thread.id, entry.id)"
                  >
                    <icon-lucide-trash-2 :class="menuCls.icon" />
                    <span>{{ messages.deleteReply }}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenuRoot>
          </template>
        </CommentMessage>
      </template>
    </div>

    <div v-if="state.can.value.comment" :class="ui.composerSlot()">
      <CommentComposer
        ref="composer"
        v-model="replyText"
        :label="messages.reply"
        @submit="sendReply"
        @cancel="emit('close')"
      />
    </div>
  </section>
</template>
