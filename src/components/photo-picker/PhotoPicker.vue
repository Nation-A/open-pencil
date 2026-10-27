<script setup lang="ts">
import { computed, watch } from 'vue'

import type { StockPhotoResult } from '@open-pencil/core/tools'
import { useCommonMessages, usePanelMessages } from '@open-pencil/vue/i18n'

import { PHOTO_SERVICES, usePhotoSearch, type PhotoService } from '@/app/editor/photos/search'
import { refreshMediaCredentials } from '@/app/settings/credentials/media'
import SettingsLink from '@/components/settings/layout/SettingsLink.vue'
import AppPicker from '@/components/ui/select/AppPicker.vue'
import type { AppPickerItem } from '@/components/ui/select/AppPicker.vue'
import AppSelect from '@/components/ui/select/AppSelect.vue'

import PhotoKeySetup from './PhotoKeySetup.vue'

/**
 * Searches Unsplash or Pexels and hands back the photo picked, crediting each as the services
 * ask. Without the chosen service's key it asks for one in place of the results.
 */
const {
  heading,
  tooltip,
  side = 'left',
  align = 'start'
} = defineProps<{
  heading: string
  tooltip?: string
  side?: 'left' | 'right' | 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
}>()
const emit = defineEmits<{
  select: [photo: StockPhotoResult, service: PhotoService, serviceName: string]
}>()
const open = defineModel<boolean>('open', { default: false })

const panels = usePanelMessages()
const common = useCommonMessages()
const search = usePhotoSearch()
const { query, service, photos, loading, failed, hasMore, hasKey } = search

// The keys may have changed elsewhere, such as in Settings, since the picker last opened.
watch(open, (isOpen) => {
  if (isOpen) void refreshMediaCredentials()
})

const serviceInfo = computed(() => PHOTO_SERVICES.find((item) => item.id === service.value))
const serviceName = computed(() => serviceInfo.value?.name ?? service.value)
const serviceOptions = PHOTO_SERVICES.map((item) => ({ value: item.id, label: item.name }))

function credit(photo: StockPhotoResult) {
  return panels.value.photoCredit({ photographer: photo.photographer, service: serviceName.value })
}
const items = computed<AppPickerItem[]>(() =>
  photos.value.map((photo) => ({ value: photo.sourceId, label: credit(photo) }))
)

const emptyLabel = computed(() => {
  if (failed.value) return panels.value.photoSearchFailed({ service: serviceName.value })
  if (loading.value) return panels.value.searchingIcons
  return query.value.trim()
    ? panels.value.noPhotosFound
    : panels.value.photoSearchHint({ service: serviceName.value })
})

function pick(id: string) {
  const photo = search.find(id)
  if (photo) emit('select', photo, service.value, serviceName.value)
}
</script>

<template>
  <AppPicker
    v-model:open="open"
    v-model:query="query"
    search="remote"
    layout="gallery"
    :has-more="hasMore"
    :loading="loading"
    :heading="heading"
    :items="items"
    :tooltip="tooltip"
    :side="side"
    :align="align"
    :search-placeholder="panels.searchPhotos"
    :empty-label="emptyLabel"
    :close-label="common.close"
    @select="pick"
    @load-more="search.loadMore"
  >
    <template v-if="$slots.trigger" #trigger>
      <slot name="trigger" />
    </template>
    <template v-else #anchor>
      <slot name="anchor" />
    </template>
    <template #actions>
      <AppSelect
        v-model="service"
        :options="serviceOptions"
        :label="panels.photoService"
        :ui="{
          trigger: 'h-6 w-auto shrink-0 border-0 bg-transparent px-1.5 hover:bg-hover',
          value: 'text-muted'
        }"
      />
    </template>
    <template v-if="!hasKey" #setup>
      <PhotoKeySetup :key="service" :service="service" />
    </template>
    <template #leading="{ item: entry }">
      <img
        :src="search.find(entry.value)?.thumbnailURL"
        alt=""
        loading="lazy"
        draggable="false"
        class="size-full rounded object-cover"
      />
    </template>
    <template v-if="hasKey" #footer="{ highlighted }">
      <p class="flex h-5 items-center gap-1 truncate px-1 text-[11px] text-muted">
        <span v-if="highlighted" class="truncate">{{ highlighted.label }}</span>
        <SettingsLink v-else-if="serviceInfo" :href="serviceInfo.siteURL">{{
          serviceName
        }}</SettingsLink>
      </p>
    </template>
  </AppPicker>
</template>
