import type { VisualBoundsNode } from '../geometry'

type TextBoundsNode = Pick<
  VisualBoundsNode,
  | 'type'
  | 'height'
  | 'fontSize'
  | 'textDecoration'
  | 'textUnderlineOffset'
  | 'textDecorationThickness'
  | 'derivedTextHeight'
>

/** How far a text node's underline or strikethrough reaches below its box. */
export function textDecorationOverflow(node: TextBoundsNode): number {
  if (node.type !== 'TEXT' || !node.textDecoration || node.textDecoration === 'NONE') return 0
  const fontSize = node.fontSize ?? 14
  const underlineOffset = node.textUnderlineOffset ?? fontSize * 0.18
  const thickness = node.textDecorationThickness ?? Math.max(1, fontSize / 16)
  return underlineOffset + thickness + fontSize * 0.35
}

/**
 * How far a text's lines reach below its box: a fixed-size box does not clip them, as in Figma,
 * and the renderer starts them at its top.
 */
export function textLinesOverflow(node: TextBoundsNode): number {
  if (node.type !== 'TEXT' || !node.derivedTextHeight) return 0
  return Math.max(0, node.derivedTextHeight - node.height)
}
