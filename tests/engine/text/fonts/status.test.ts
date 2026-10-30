import { describe, expect, test } from 'bun:test'

import { FontManager, SceneGraph, documentFontStatus } from '@open-pencil/core'
import { UnsupportedFontFormatError } from '@open-pencil/core/text'

import { fontGlyphCoverageSync } from '#core/text/opentype'

function pageId(graph: SceneGraph): string {
  return graph.getPages()[0].id
}

describe('documentFontStatus', () => {
  test('loads complete bundled Korean coverage without external font requests', async () => {
    const manager = new FontManager()
    let remoteRequests = 0
    manager.setWebFontFetch(async () => {
      remoteRequests++
      throw new Error('offline')
    })
    const text = 'Synthetic hello 한글 123 한 ㄱㅎ'
    const result = await manager.ensureFallbackPack(['cjk-kr'], text)
    expect(result['cjk-kr']).toContain('Noto Sans CJK KR')
    expect(remoteRequests).toBe(0)
    let coveredSyllables = 0
    for (let code = 0xac00; code <= 0xd7a3; code++) {
      if (
        fontGlyphCoverageSync(
          'Noto Sans CJK KR',
          'Regular',
          String.fromCodePoint(code),
          manager
        ) === 'has'
      )
        coveredSyllables++
    }
    expect(coveredSyllables).toBe(11172)
    for (const character of '한ㄱㅎ')
      expect(fontGlyphCoverageSync('Noto Sans CJK KR', 'Regular', character, manager)).toBe('has')
    manager.markLoaded(
      'Inter',
      'Regular',
      await Bun.file('packages/core/assets/Inter-Regular.ttf').arrayBuffer()
    )
    const graph = new SceneGraph()
    graph.createNode('TEXT', pageId(graph), { text, fontFamily: 'Inter' })
    const status = documentFontStatus(graph, pageId(graph), manager)
    expect(status.faithful).toBe(false)
    expect(status.issues[0].status).toBe('substituted')
    expect(status.issues[0].substituteFamily).toBe('Noto Sans CJK KR')
  })

  test('does not report a loaded Latin face as faithful when mixed Hangul has no fallback', async () => {
    const manager = new FontManager()
    manager.markLoaded(
      'Inter',
      'Regular',
      await Bun.file('packages/core/assets/Inter-Regular.ttf').arrayBuffer()
    )
    const graph = new SceneGraph()
    graph.createNode('TEXT', pageId(graph), {
      text: 'Synthetic hello 한글 123',
      fontFamily: 'Inter'
    })
    const status = documentFontStatus(graph, pageId(graph), manager)
    expect(status.faithful).toBe(false)
    expect(status.issues[0].status).toBe('unresolved')
  })

  test('reports loaded faces and their source without false warnings', () => {
    const graph = new SceneGraph()
    const manager = new FontManager()
    manager.markLoaded('Inter', 'Regular', new ArrayBuffer(8), 'bundled')
    graph.createNode('TEXT', pageId(graph), {
      name: 'Title',
      text: 'Hello',
      fontFamily: 'Inter',
      fontWeight: 400
    })

    expect(documentFontStatus(graph, pageId(graph), manager)).toEqual({
      faithful: true,
      faces: [
        {
          family: 'Inter',
          style: 'Regular',
          status: 'available',
          source: 'bundled',
          substituteFamily: null,
          reason: null,
          nodeIds: [expect.any(String)],
          nodeNames: ['Title']
        }
      ],
      issues: []
    })
  })

  test('reports the active default-family substitution for missing faces', () => {
    const graph = new SceneGraph()
    const manager = new FontManager()
    manager.markLoaded('Inter', 'Regular', new ArrayBuffer(8), 'bundled')
    const node = graph.createNode('TEXT', pageId(graph), {
      name: 'Unavailable label',
      text: 'Hello',
      fontFamily: 'Missing Sans',
      fontWeight: 400
    })

    const status = documentFontStatus(graph, pageId(graph), manager)

    expect(status.faithful).toBe(false)
    expect(status.issues).toEqual([
      {
        family: 'Missing Sans',
        style: 'Regular',
        status: 'substituted',
        source: null,
        substituteFamily: 'Inter',
        reason: null,
        nodeIds: [node.id],
        nodeNames: ['Unavailable label']
      }
    ])
  })

  test('reports synthesized styles and style-run faces separately', () => {
    const graph = new SceneGraph()
    const manager = new FontManager()
    manager.markLoaded('Example Sans', 'Regular', new ArrayBuffer(8), 'local')
    const node = graph.createNode('TEXT', pageId(graph), {
      name: 'Mixed text',
      text: 'Bold and serif',
      fontFamily: 'Example Sans',
      fontWeight: 700,
      styleRuns: [
        {
          start: 9,
          length: 5,
          style: { fontFamily: 'Missing Serif', fontWeight: 400 }
        }
      ]
    })

    const status = documentFontStatus(graph, pageId(graph), manager)

    expect(status.issues).toEqual([
      {
        family: 'Example Sans',
        style: 'Bold',
        status: 'substituted',
        source: null,
        substituteFamily: 'Example Sans',
        reason: null,
        nodeIds: [node.id],
        nodeNames: ['Mixed text']
      },
      {
        family: 'Missing Serif',
        style: 'Regular',
        status: 'unresolved',
        source: null,
        substituteFamily: null,
        reason: null,
        nodeIds: [node.id],
        nodeNames: ['Mixed text']
      }
    ])
  })

  test('reports why the host could not load an installed face until it loads', async () => {
    const graph = new SceneGraph()
    const manager = new FontManager()
    manager.markLoaded('Inter', 'Regular', new ArrayBuffer(8), 'bundled')
    let host: 'unsupported' | 'failed' | 'drawable' = 'unsupported'
    manager.setHostFontLoader(async (family, style) => {
      if (host === 'unsupported') throw new UnsupportedFontFormatError(family, style)
      return host === 'drawable' ? new ArrayBuffer(8) : null
    })
    const node = graph.createNode('TEXT', pageId(graph), {
      name: 'Chinese label',
      text: '按钮',
      fontFamily: 'PingFang SC',
      fontWeight: 400
    })

    expect(await manager.loadLocalFont('PingFang SC', 'Regular')).toBeNull()
    expect(documentFontStatus(graph, pageId(graph), manager).issues).toEqual([
      {
        family: 'PingFang SC',
        style: 'Regular',
        status: 'substituted',
        source: null,
        substituteFamily: 'Inter',
        reason: 'unsupported-format',
        nodeIds: [node.id],
        nodeNames: ['Chinese label']
      }
    ])

    host = 'failed'
    expect(await manager.loadLocalFont('PingFang SC', 'Regular')).toBeNull()
    expect(manager.unavailableReason('PingFang SC', 'Regular')).toBe('unsupported-format')

    host = 'drawable'
    expect(await manager.loadLocalFont('PingFang SC', 'Regular')).not.toBeNull()
    expect(documentFontStatus(graph, pageId(graph), manager).faithful).toBe(true)
  })
})
