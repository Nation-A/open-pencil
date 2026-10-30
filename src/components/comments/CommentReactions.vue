<script setup lang="ts">
import { computed, ref } from 'vue'

import type { CommentReaction } from '@open-pencil/scene-graph'

/**
 * workos: the emoji reactions under a comment or reply: one chip per emoji with its count, lit when the
 * signed-in person reacted, and a small palette to add one. Clicking a chip or a palette emoji toggles
 * the person's own reaction; counts come from the host.
 */
const {
  reactions = [],
  meId = null,
  canReact = true
} = defineProps<{
  reactions?: readonly CommentReaction[]
  meId?: string | null
  canReact?: boolean
}>()

const emit = defineEmits<{ toggle: [emoji: string] }>()

/** The palette a person picks from, as Figma's quick reactions. */
const PALETTE = ['👍', '❤️', '😂', '🎉', '👀', '🙏'] as const

const open = ref(false)

const chips = computed(() =>
  reactions
    .filter((entry) => entry.userIds.length > 0)
    .map((entry) => ({
      emoji: entry.emoji,
      count: entry.userIds.length,
      mine: meId !== null && entry.userIds.includes(meId)
    }))
)

function pick(emoji: string) {
  open.value = false
  emit('toggle', emoji)
}
</script>

<template>
  <div
    v-if="chips.length > 0 || canReact"
    data-slot="comment-reactions"
    class="col-start-2 flex flex-wrap items-center gap-1 pt-0.5"
  >
    <button
      v-for="chip in chips"
      :key="chip.emoji"
      type="button"
      :data-reaction="chip.emoji"
      :data-mine="chip.mine || undefined"
      :aria-pressed="chip.mine"
      :disabled="!canReact"
      class="flex h-5 items-center gap-1 rounded-full border border-border px-1.5 text-[11px] text-surface hover:bg-hover disabled:cursor-default data-[mine]:border-accent data-[mine]:bg-accent/10"
      @click="emit('toggle', chip.emoji)"
    >
      <span aria-hidden="true">{{ chip.emoji }}</span>
      <span>{{ chip.count }}</span>
    </button>
    <span v-if="canReact" class="relative">
      <button
        type="button"
        data-slot="comment-react-add"
        aria-label="+"
        :aria-expanded="open"
        class="flex size-5 items-center justify-center rounded-full border border-border text-[11px] text-muted hover:bg-hover"
        @click="open = !open"
      >
        <icon-lucide-smile-plus class="size-3" />
      </button>
      <span
        v-if="open"
        role="menu"
        class="absolute bottom-full left-0 z-20 mb-1 flex gap-0.5 rounded-lg border border-border bg-panel p-1 shadow-md"
      >
        <button
          v-for="emoji in PALETTE"
          :key="emoji"
          type="button"
          role="menuitem"
          :data-pick="emoji"
          class="flex size-6 items-center justify-center rounded text-sm hover:bg-hover"
          @click="pick(emoji)"
        >
          {{ emoji }}
        </button>
      </span>
    </span>
  </div>
</template>
