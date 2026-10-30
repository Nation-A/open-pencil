import { fromUint8Array } from 'js-base64'
import type { jsPDF } from 'jspdf'

import { parseFontStyle } from '@open-pencil/scene-graph'
import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

import { textNeedsFallbackScript } from '#core/text/coverage'
import type { FontFallbackScript } from '#core/text/fallbacks'
import { isVariableFont } from '#core/text/font/variation'
import { fontManager } from '#core/text/fonts'
import { fontGlyphCoverageSync } from '#core/text/opentype'
import { collectGraphFontRequirements } from '#core/text/requirements'

export interface ExportFontFace {
  family: string
  style: string
  weight: number
  italic: boolean
  data: ArrayBuffer
}

/** Only document faces are included; unrelated installed fonts never leave the editor. */
export function collectExportFonts(graph: SceneGraph, nodeIds: string[]): ExportFontFace[] {
  const keys = new Map(
    fontManager
      .collectFontKeys(graph, nodeIds)
      .map(([family, style]) => [`${family}\0${style}`, [family, style] as const])
  )
  for (const node of collectGraphFontRequirements(graph, nodeIds).nodes) {
    for (const family of nodeFallbackFamilies(node))
      keys.set(`${family}\0Regular`, [family, 'Regular'])
  }
  return [...keys.values()].map(([family, style]) => {
    const data = fontManager.loadedData(family, style)
    if (!data) throw new Error(`Font is not ready for export: ${family} (${style})`)
    return { family, style, data, ...parseFontStyle(style) }
  })
}

function nodeFallbackFamilies(node: SceneNode): string[] {
  const candidates = new Set<string>()
  const cjkScripts: FontFallbackScript[] = ['cjk-jp', 'cjk-kr', 'cjk-tc', 'cjk-sc']
  if (cjkScripts.some((script) => textNeedsFallbackScript(node, script))) {
    for (const family of fontManager.getCJKFallbackFamilies()) candidates.add(family)
  }
  if (textNeedsFallbackScript(node, 'arabic')) {
    for (const family of fontManager.getArabicFallbackFamilies()) candidates.add(family)
  }
  return [...candidates].filter((family) =>
    Array.from(node.text).some((char) => fontGlyphCoverageSync(family, 'Regular', char) === 'has')
  )
}

export function exportFontFamily(node: SceneNode, primary = node.fontFamily): string {
  const fallback = nodeFallbackFamilies(node)
  return fallback.length ? [primary, ...fallback].map(cssString).join(', ') : primary
}

function cssString(value: string): string {
  const escaped = Array.from(value)
    .map((character) => {
      const code = character.codePointAt(0) ?? 0
      return character === '"' || character === '\\' || code < 32 || code === 127
        ? `\\${code.toString(16)} `
        : character
    })
    .join('')
  return `"${escaped}"`
}

export function embeddedFontCSS(faces: ExportFontFace[]): string {
  return faces
    .map((face) => {
      if (face.data.byteLength < 4) throw new Error('Invalid font data for SVG export')
      const signature = new DataView(face.data).getUint32(0)
      const formats: Partial<Record<number, [string, string]>> = {
        0x00010000: ['truetype', 'ttf'],
        0x4f54544f: ['opentype', 'otf'],
        0x774f4646: ['woff', 'woff'],
        0x774f4632: ['woff2', 'woff2']
      }
      const formatInfo = formats[signature]
      if (!formatInfo) throw new Error(`Unsupported SVG font format: ${face.family}`)
      const [format, mime] = formatInfo
      return `@font-face{font-family:${cssString(face.family)};font-style:${face.italic ? 'italic' : 'normal'};font-weight:${face.weight};src:url("data:font/${mime};base64,${fromUint8Array(new Uint8Array(face.data))}") format("${format}")}`
    })
    .join('\n')
}

/** jsPDF embeds static TrueType outlines. Never silently replace an unsupported face. */
export function registerPDFFonts(doc: jsPDF, faces: ExportFontFace[]): void {
  const initialFont = doc.getFont()
  for (const [index, face] of faces.entries()) {
    if (
      face.data.byteLength < 12 ||
      new DataView(face.data).getUint32(0) !== 0x00010000 ||
      isVariableFont(face.data)
    ) {
      throw new Error(`PDF export requires a static TrueType font: ${face.family} (${face.style})`)
    }
    const filename = `open-pencil-font-${index}.ttf`
    doc.addFileToVFS(filename, fromUint8Array(new Uint8Array(face.data)))
    doc.addFont(filename, face.family, face.italic ? 'italic' : 'normal', face.weight, 'Identity-H')
    let style = `${face.weight}${face.italic ? 'italic' : 'normal'}`
    if (face.weight === 400) style = face.italic ? 'italic' : 'normal'
    else if (face.weight === 700 && !face.italic) style = 'bold'
    doc.setFont(face.family, style)
    const font = doc.getFont()
    if (font.fontName !== face.family || !font.metadata || !('Unicode' in font.metadata)) {
      throw new Error(`PDF font embedding failed: ${face.family} (${face.style})`)
    }
  }
  doc.setFont(initialFont.fontName, initialFont.fontStyle)
}
