import type { jsPDF } from 'jspdf'

import type { SceneGraph } from '@open-pencil/scene-graph'

import { collectGraphFontRequirements } from '#core/text/requirements'

/** A style boundary inside a canonical cluster needs shaped glyph/cluster emission. */
export function assertCanonicalClusterStyles(graph: SceneGraph, nodeIds: string[]): void {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const node of collectGraphFontRequirements(graph, nodeIds).nodes) {
    for (const { segment, index } of segmenter.segment(node.text)) {
      if (segment === segment.normalize('NFC')) continue
      if (
        node.styleRuns.some((run) =>
          [run.start, run.start + run.length].some(
            (boundary) => boundary > index && boundary < index + segment.length
          )
        )
      ) {
        throw new Error('PDF export requires a single text style within a canonical cluster')
      }
    }
  }
}

function utf16Hex(text: string): string {
  let result = 'FEFF'
  for (let index = 0; index < text.length; index++) {
    result += text.charCodeAt(index).toString(16).padStart(4, '0')
  }
  return result
}

/**
 * Display a canonically equivalent glyph while keeping the exact original cluster as ActualText.
 * This is scoped to one PDF text operation; it never changes the scene graph or SVG source.
 * Noncanonical shaping (including bidi/contextual substitutions) stays on the existing path.
 */
export async function withCanonicalPDFText(
  doc: jsPDF,
  render: () => Promise<unknown>
): Promise<void> {
  const internal: unknown = doc.internal
  if (
    !internal ||
    typeof internal !== 'object' ||
    !('write' in internal) ||
    typeof internal.write !== 'function'
  ) {
    throw new Error('PDF marked-content writer is unavailable')
  }
  const write = internal.write.bind(internal)
  const api: unknown = doc
  if (!api || typeof api !== 'object' || !('__private__' in api))
    throw new Error('PDF version API is unavailable')
  const privateAPI: unknown = api.__private__
  if (
    !privateAPI ||
    typeof privateAPI !== 'object' ||
    !('setPdfVersion' in privateAPI) ||
    typeof privateAPI.setPdfVersion !== 'function'
  ) {
    throw new Error('PDF version API is unavailable')
  }
  const setVersion = privateAPI.setPdfVersion.bind(privateAPI)
  const original = doc.text.bind(doc)
  doc.text = (text, x, y, options, transform) => {
    // svg2pdf emits single string operations. Never join lines or reorder directional text.
    if (typeof text !== 'string' || /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(text)) {
      return original(text, x, y, options, transform)
    }
    const normalized = text.normalize('NFC')
    if (normalized === text) return original(text, x, y, options, transform)
    const metadata: unknown = doc.getFont().metadata
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      !('characterToGlyph' in metadata) ||
      typeof metadata.characterToGlyph !== 'function'
    ) {
      throw new Error('PDF canonical cluster needs an embedded Unicode font')
    }
    for (const character of normalized) {
      if (!/\s/u.test(character) && metadata.characterToGlyph(character.codePointAt(0)) === 0) {
        throw new Error('PDF embedded font cannot display the canonical cluster')
      }
    }
    setVersion('1.7')
    write(`/Span << /ActualText <${utf16Hex(text)}> >> BDC`)
    try {
      return original(normalized, x, y, options, transform)
    } finally {
      write('EMC')
    }
  }
  try {
    await render()
  } finally {
    doc.text = original
  }
}
