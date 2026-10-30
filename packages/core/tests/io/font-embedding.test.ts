import { afterAll, afterEach, describe, expect, spyOn, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { corePackagePath } from '#core-tests/helpers/paths'
import { toUint8Array } from 'js-base64'
import { jsPDF } from 'jspdf'

import { SceneGraph } from '@open-pencil/scene-graph'

import { collectExportFonts, embeddedFontCSS, registerPDFFonts } from '#core/io/font-embedding'
import { renderNodesToSVG } from '#core/io/formats/svg/export'
import { fontManager } from '#core/text/fonts'

const bytes = readFileSync(corePackagePath('assets/Inter-Regular.ttf'))
const regular = Uint8Array.from(bytes).buffer
const bold = Uint8Array.from(readFileSync(corePackagePath('assets/Inter-Bold.ttf'))).buffer
const loaded = spyOn(fontManager, 'loadedData')
afterEach(() => loaded.mockReset())
afterAll(() => loaded.mockRestore())

function scene() {
  const graph = new SceneGraph()
  const page = graph.createNode('CANVAS', graph.rootId, { name: 'Synthetic' })
  const text = graph.createNode('TEXT', page.id, {
    text: 'Résumé QA Ω 1030',
    fontFamily: 'Inter',
    fontSize: 24,
    width: 400,
    height: 40,
    styleRuns: [{ start: 7, length: 2, style: { fontWeight: 700 } }]
  })
  return { graph, page, text }
}

describe('portable export fonts', () => {
  test('SVG carries exact source face bytes, styles and searchable Unicode text', () => {
    loaded.mockImplementation((_family, style) => (style === 'Bold' ? bold : regular))
    const { graph, page, text } = scene()
    const result = renderNodesToSVG(graph, page.id, [text.id]) ?? ''
    expect(result).toContain('@font-face')
    expect(result).toContain('font-weight:700')
    expect(result.includes('Résumé ')).toBe(true)
    expect(result.includes('Ω 1030')).toBe(true)
    const encoded = [...result.matchAll(/data:font\/ttf;base64,([^"\s]+)/gu)]
    expect(encoded).toHaveLength(2)
    expect(toUint8Array(encoded[0][1])).toEqual(new Uint8Array(regular))
    expect(toUint8Array(encoded[1][1])).toEqual(new Uint8Array(bold))
    expect(result).not.toMatch(/https?:\/\/[^w]/u)
  })

  test('PDF embeds TrueType with Unicode cmap instead of standard fallback', () => {
    loaded.mockImplementation((_family, style) => (style === 'Bold' ? bold : regular))
    const { graph, text } = scene()
    const doc = new jsPDF({ compress: false })
    registerPDFFonts(doc, collectExportFonts(graph, [text.id]))
    expect(doc.getFont().fontStyle).toBe('normal')
    doc.setFont('Inter', 'normal')
    doc.text('Résumé QA Ω 1030', 20, 20)
    const result = doc.output()
    expect(result).toContain('/FontFile2')
    expect(result).toContain('/ToUnicode')
    expect(doc.getFont().fontName).toBe('Inter')
    expect(doc.getFontList().Inter).toContain('bold')
  })

  test('unloaded and unsupported PDF faces fail explicitly', () => {
    const { graph, text } = scene()
    loaded.mockReturnValue(null)
    expect(() => collectExportFonts(graph, [text.id])).toThrow('not ready')
    const face = {
      family: 'Synthetic OTF',
      style: 'Regular',
      weight: 400,
      italic: false,
      data: new Uint8Array([79, 84, 84, 79, 0, 0, 0, 0, 0, 0, 0, 0]).buffer
    }
    expect(() => registerPDFFonts(new jsPDF(), [face])).toThrow('static TrueType')
    expect(embeddedFontCSS([face])).toContain('data:font/otf;')
  })

  test('mixed Korean gets explicit glyph fallback runs for PDF and SVG', async () => {
    const korean = await Bun.file(corePackagePath('assets/NotoSansCJKkr-Regular.ttf')).arrayBuffer()
    loaded.mockImplementation((family) => (family === 'Noto Sans CJK KR' ? korean : regular))
    const fallback = spyOn(fontManager, 'getCJKFallbackFamilies').mockReturnValue([
      'Noto Sans CJK KR'
    ])
    try {
      const { graph, page, text } = scene()
      graph.updateNode(text.id, { text: 'Synthetic 한글 123', styleRuns: [] })
      const result = renderNodesToSVG(graph, page.id, [text.id]) ?? ''
      expect(result.includes('font-family="Noto Sans CJK KR"')).toBe(true)
      expect(result.includes('>한글</tspan>')).toBe(true)
      expect(collectExportFonts(graph, [text.id]).map((face) => face.family)).toEqual([
        'Inter',
        'Noto Sans CJK KR'
      ])
    } finally {
      fallback.mockRestore()
    }
  })

  test('family names cannot escape embedded CSS strings', () => {
    const css = embeddedFontCSS([
      {
        family: 'A";src:url(https://invalid)',
        style: 'Regular',
        weight: 400,
        italic: false,
        data: regular
      }
    ])
    expect(css).toContain('A\\22 ;src:')
  })
})
