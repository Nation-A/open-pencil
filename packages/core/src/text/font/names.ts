import { parseFontStyle, standardStyleName } from '@open-pencil/scene-graph/font-style'

import type { FamilyFace } from '#core/text/font/faces'
import { fontManager } from '#core/text/fonts'

/** A text's or a character's face: its family, weight, and slant, and the name it was given. */
export interface NamedFaceStyle {
  fontFamily: string
  fontWeight: number
  italic: boolean
  fontStyle: string | null
}

/**
 * The name the family's font gives its face at `weight` and slant, as Figma names a face; the
 * standard name while the family's faces are unknown or it has no such face.
 */
export function faceStyleName(family: string, weight: number, italic: boolean): string {
  const face = fontManager
    .loadedFamilyFaces(family)
    ?.find((candidate) => candidate.weight === weight && candidate.italic === italic)
  return face?.style ?? standardStyleName(weight, italic)
}

/** The name of the face a text draws in: the one it was given, else its font's own. */
export function textStyleName(style: NamedFaceStyle): string {
  return style.fontStyle ?? faceStyleName(style.fontFamily, style.fontWeight, style.italic)
}

/** A name compared without case or spaces, so "Semi Bold" and "SemiBold" name one face. */
function spelled(style: string): string {
  return style.toLowerCase().replace(/\s+/gu, '')
}

/**
 * The face `style` names in the family, by the family's own name for it, where the family names
 * it alike but for case and spaces, as Inter 3's "Semi Bold" names Inter 4's "SemiBold". A name
 * the family's faces do not hold, or while they are unknown, stays as asked, with the weight and
 * slant its words stand for.
 */
export function namedFace(family: string, style: string): FamilyFace {
  const faces = fontManager.loadedFamilyFaces(family) ?? []
  const face =
    faces.find((candidate) => candidate.style === style) ??
    faces.find((candidate) => spelled(candidate.style) === spelled(style))
  return face ?? { ...parseFontStyle(style), style }
}
