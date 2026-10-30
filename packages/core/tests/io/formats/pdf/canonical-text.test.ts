import { describe, expect, spyOn, test } from 'bun:test'

import { corePackagePath } from '#core-tests/helpers/paths'
import { jsPDF } from 'jspdf'

import { SceneGraph } from '@open-pencil/scene-graph'

import { registerPDFFonts } from '#core/io/font-embedding'
import {
  assertCanonicalClusterStyles,
  withCanonicalPDFText
} from '#core/io/formats/pdf/canonical-text'

async function document() {
  const doc = new jsPDF({ compress: false })
  registerPDFFonts(doc, [
    {
      family: 'Noto Sans CJK KR',
      style: 'Regular',
      weight: 400,
      italic: false,
      data: await Bun.file(corePackagePath('assets/NotoSansCJKkr-Regular.ttf')).arrayBuffer()
    }
  ])
  doc.setFont('Noto Sans CJK KR', 'normal')
  return doc
}

describe('canonical PDF clusters', () => {
  test('displays canonical glyphs at original coordinates and preserves exact ActualText', async () => {
    const doc = await document()
    const capture = spyOn(doc, 'text')
    const raw = '한 e\u0301'
    try {
      await withCanonicalPDFText(doc, async () => {
        doc.text(raw, 22, 33, { angle: 10 })
      })
      expect(capture.mock.calls[0].slice(0, 3)).toEqual(['한 é', 22, 33])
      expect(capture.mock.calls[0][3]).toMatchObject({ angle: 10 })
      const output = doc.output()
      expect(output.startsWith('%PDF-1.7')).toBe(true)
      expect(output.includes('/ActualText <FEFF1112116111ab002000650301>')).toBe(true)
      expect(output.includes('EMC')).toBe(true)
    } finally {
      capture.mockRestore()
    }
  })

  test('does not normalize across operations, arrays or directional shaping', async () => {
    const doc = await document()
    const capture = spyOn(doc, 'text')
    const lines = ['e\u0301', '한']
    try {
      await withCanonicalPDFText(doc, async () => {
        doc.text('e', 10, 10)
        doc.text('\u0301', 20, 10)
        doc.text(lines, 10, 30)
        doc.text('ا\u0654', 10, 50)
      })
      expect(capture.mock.calls.map((call) => call[0])).toEqual(['e', '\u0301', lines, 'ا\u0654'])
      expect(doc.output().includes('/ActualText')).toBe(false)
    } finally {
      capture.mockRestore()
    }
  })

  test('requires whole canonical clusters within one style', () => {
    const graph = new SceneGraph(),
      page = graph.getPages()[0]
    const node = graph.createNode('TEXT', page.id, {
      text: 'A한B',
      styleRuns: [{ start: 2, length: 1, style: { fontWeight: 700 } }]
    })
    expect(() => assertCanonicalClusterStyles(graph, [node.id])).toThrow('single text style')
    graph.updateNode(node.id, { styleRuns: [{ start: 1, length: 3, style: { fontWeight: 700 } }] })
    expect(() => assertCanonicalClusterStyles(graph, [node.id])).not.toThrow()
    expect(node.text).toBe('A한B')
  })

  test('restores normal text behavior after a conversion exception', async () => {
    const doc = await document()
    const error: unknown = await withCanonicalPDFText(doc, async () => {
      throw new Error('synthetic')
    }).then(
      () => null,
      (failure: unknown) => failure
    )
    expect(error instanceof Error && error.message === 'synthetic').toBe(true)
    doc.text('한', 10, 10)
    expect(doc.output().includes('/ActualText')).toBe(false)
  })

  test('rejects a canonical glyph when no embedded Unicode face can display it', async () => {
    const doc = new jsPDF()
    const error: unknown = await withCanonicalPDFText(doc, async () => {
      doc.text('한', 10, 10)
    }).then(
      () => null,
      (failure: unknown) => failure
    )
    expect(error instanceof Error && error.message.includes('embedded Unicode font')).toBe(true)
  })
})
