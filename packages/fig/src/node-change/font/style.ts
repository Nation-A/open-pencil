import type { CharacterStyleOverride, SceneNode } from '@open-pencil/scene-graph'
import { normalizeFontFamily, standardStyleName } from '@open-pencil/scene-graph/font-style'

/** The name a family's font gives its face at a weight and slant. */
export type FaceStyleNamer = (family: string, weight: number, italic: boolean) => string

/** Names a face as Google Fonts does, for a writer that cannot read the fonts. */
export const standardFaceNamer: FaceStyleNamer = (_family, weight, italic) =>
  standardStyleName(weight, italic)

/**
 * Figma's names for faces of a font Figma ships in another version than ours, by family and our
 * name. Figma finds a face by its exact name, and its Inter is Inter 3, which spaces the names
 * our Inter 4 joins (measured 2026-10-28).
 */
const FIGMA_FACE_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Inter: {
    ExtraLight: 'Extra Light',
    'ExtraLight Italic': 'Extra Light Italic',
    SemiBold: 'Semi Bold',
    'SemiBold Italic': 'Semi Bold Italic',
    ExtraBold: 'Extra Bold',
    'ExtraBold Italic': 'Extra Bold Italic'
  }
}

/**
 * The face name characters with `style` over the text are saved under, which Figma finds their
 * font's face by: the name they were given, else the font's own for their weight and slant.
 */
export function figmaStyleName(
  node: SceneNode,
  style: CharacterStyleOverride,
  nameFace: FaceStyleNamer
): string {
  const family = style.fontFamily ?? node.fontFamily
  const own = style.fontStyle !== undefined ? style.fontStyle : node.fontStyle
  const name =
    own ?? nameFace(family, style.fontWeight ?? node.fontWeight, style.italic ?? node.italic)
  return FIGMA_FACE_NAMES[normalizeFontFamily(family)]?.[name] ?? name
}
