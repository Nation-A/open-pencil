<script setup lang="ts">
import IconImagePlus from '~icons/lucide/image-plus'

import type { StockPhotoResult } from '@open-pencil/core/tools'
import { usePanelMessages } from '@open-pencil/vue/i18n'

import { useEditorStore } from '@/app/editor/active-store'
import { insertPhoto } from '@/app/editor/photos/place'
import type { PhotoService } from '@/app/editor/photos/search'
import { toast } from '@/app/shell/ui'
import ToolButton from '@/components/toolbar/ToolButton.vue'
import type { ToolbarUI } from '@/components/toolbar/types'

import PhotoPicker from './PhotoPicker.vue'

/**
 * The toolbar's stock photo picker, also opened by the Insert Photo command. `anchored` mounts it
 * without its button, over the toolbar, while the button is hidden from it.
 */
const {
  ui,
  mobile = false,
  anchored = false
} = defineProps<{ ui?: ToolbarUI; mobile?: boolean; anchored?: boolean }>()
const store = useEditorStore()
const panels = usePanelMessages()

function insert(photo: StockPhotoResult, service: PhotoService, serviceName: string) {
  insertPhoto(
    store,
    service,
    photo,
    panels.value.photoCredit({
      photographer: photo.photographer,
      service: serviceName
    })
  ).catch(() => toast.error(panels.value.insertPhotoFailed))
}
</script>

<template>
  <PhotoPicker
    v-model:open="store.state.photoPickerOpen"
    :heading="panels.insertPhoto"
    :tooltip="panels.insertPhoto"
    side="top"
    align="center"
    @select="insert"
  >
    <template v-if="anchored" #anchor>
      <span aria-hidden="true" class="pointer-events-none absolute inset-x-0 top-0" />
    </template>
    <template v-else #trigger>
      <ToolButton
        :icon="IconImagePlus"
        :label="panels.insertPhoto"
        :active="store.state.photoPickerOpen"
        :mobile="mobile"
        :ui="ui"
      />
    </template>
  </PhotoPicker>
</template>
