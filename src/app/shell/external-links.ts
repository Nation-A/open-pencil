import { useEventListener } from '@vueuse/core'

import { isTauri } from '@/app/tauri/env'

import { openExternalLink } from './ui'

const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * Opens every link meant for a new tab, `<a target="_blank">`, in the system browser on the
 * desktop. A WebView cannot open one itself, and the shell plugin's own handler for such links
 * needs `shell:allow-open`, which the app does not grant: it opens pages through its
 * `open_external_url` command instead. Listening while the click is captured runs before the
 * plugin's handler on `<body>`, which then never sees the click.
 */
export function useExternalLinks() {
  if (!isTauri()) return
  useEventListener(
    document,
    'click',
    (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target !== '_blank') return
      if (!EXTERNAL_SCHEMES.has(new URL(anchor.href).protocol)) return
      event.preventDefault()
      event.stopPropagation()
      void openExternalLink(anchor.href)
    },
    { capture: true }
  )
}
