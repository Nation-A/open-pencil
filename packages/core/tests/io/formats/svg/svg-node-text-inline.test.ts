import { describe, expect, test } from 'bun:test'

import { renderSVGNode, svg } from '#core/io/formats/svg/node'

describe('renderSVGNode text inlining', () => {
  test('adjacent tspans in a text node get no whitespace between them', () => {
    const node = svg(
      'text',
      { x: 0, y: 12 },
      svg('tspan', { 'font-family': 'Inter' }, 'PDF'),
      svg('tspan', { 'font-family': 'Noto Sans KR' }, '로')
    )
    const out = renderSVGNode(node, 2)
    expect(out).not.toMatch(/>\s+</)
    expect(out).not.toContain('\n')
    expect(out).toContain('>PDF</tspan><tspan')
    expect(out).toContain('>로</tspan></text>')
  })

  test('non-text containers keep pretty-printing', () => {
    const out = renderSVGNode(svg('g', {}, svg('rect', { width: 1 })))
    expect(out).toContain('\n')
  })
})
