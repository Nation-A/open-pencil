<script setup lang="ts">
import { computed } from 'vue'

import { useCommonMessages, useCredentialMessages, usePanelMessages } from '@open-pencil/vue/i18n'

import { PHOTO_SERVICES, type PhotoService } from '@/app/editor/photos/search'
import { useMediaSettingsEditor } from '@/app/settings/media/use'
import ProviderSettingsKeyField from '@/components/settings/provider/ProviderSettingsKeyField.vue'
import AppButton from '@/components/ui/button/AppButton.vue'

/** Asks for the chosen photo service's key where the photos are searched, rather than in Settings. */
const { service } = defineProps<{ service: PhotoService }>()
const panels = usePanelMessages()
const credentials = useCredentialMessages()
const common = useCommonMessages()
const editor = useMediaSettingsEditor(service)
const { key, error, busy } = editor
const info = computed(() => PHOTO_SERVICES.find((item) => item.id === service))
const name = computed(() => info.value?.name ?? service)
</script>

<template>
  <form class="flex flex-col gap-3" :aria-busy="busy" @submit.prevent="editor.save()">
    <div class="flex flex-col gap-1">
      <h4 class="text-xs font-semibold text-surface">
        {{ panels.photoKeyHeading({ service: name }) }}
      </h4>
      <p class="text-[11px] leading-relaxed text-muted">
        {{ panels.photoKeyDescription({ service: name }) }}
      </p>
    </div>
    <ProviderSettingsKeyField
      v-model="key"
      :label="service === 'unsplash' ? credentials.accessKey : credentials.apiKey"
      :saved="false"
      :kind="service"
      placeholder=""
      :key-u-r-l="info?.keyURL"
      :key-u-r-l-label="credentials.getAPIKey"
      :error="error"
    />
    <AppButton
      type="submit"
      color="primary"
      variant="solid"
      class="self-end"
      :loading="busy"
      :disabled="!key.trim()"
      >{{ common.save }}</AppButton
    >
  </form>
</template>
