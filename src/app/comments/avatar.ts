/**
 * workos: a host's avatar URL as the editor shows it. Only images are loaded: web addresses, blob URLs and
 * image data URLs; anything else (a script URL, a relative path from a confused host) shows initials instead.
 */
export function safeAvatarSource(source: string | null | undefined): string | undefined {
  if (!source) return undefined
  return /^(https?:\/\/|blob:|data:image\/)/iu.test(source.trim()) ? source.trim() : undefined
}
