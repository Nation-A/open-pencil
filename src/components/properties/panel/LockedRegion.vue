<script setup lang="ts">
import { computed } from 'vue'

import { useEditorStore } from '@/app/editor/active-store'

/**
 * The part of a panel that edits the document. While the document is read-only the region is inert:
 * nothing in it takes focus or a click, so a viewer can look at the values and not change them.
 */
const store = useEditorStore()
const locked = computed(() => store.state.readOnly === true)
</script>

<template>
  <div class="contents" :inert="locked" :data-locked="locked || undefined">
    <slot />
  </div>
</template>
