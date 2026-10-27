import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'

const editor = useEditorSetupWithClear('/?test&no-chrome&no-rulers')

// Figma 126 strokes inside or outside a path as a centred stroke twice as wide, clipped.
test('a vector drawn from its path strokes on the side its alignment takes', async () => {
  await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('Missing editor')
    const corner = { x: 0, y: 0 }
    const side = 80
    const network = {
      vertices: [
        { x: 0, y: 0 },
        { x: side, y: 0 },
        { x: side, y: side },
        { x: 0, y: side }
      ],
      segments: [0, 1, 2, 3].map((start) => ({
        start,
        end: (start + 1) % 4,
        tangentStart: corner,
        tangentEnd: corner
      })),
      regions: [{ windingRule: 'NONZERO' as const, loops: [[0, 1, 2, 3]] }]
    }
    for (const [index, align] of (['CENTER', 'INSIDE', 'OUTSIDE'] as const).entries()) {
      store.graph.createNode('VECTOR', store.state.currentPageId, {
        name: align,
        x: 60 + index * 160,
        y: 60,
        width: side,
        height: side,
        vectorNetwork: structuredClone(network),
        fills: [
          {
            type: 'SOLID',
            color: { r: 0.86, g: 0.91, b: 0.98, a: 1 },
            opacity: 1,
            visible: true
          }
        ],
        strokes: [
          {
            type: 'SOLID',
            color: { r: 0.1, g: 0.1, b: 0.2, a: 1 },
            weight: 12,
            opacity: 0.6,
            visible: true,
            align,
            cap: 'NONE',
            join: 'MITER',
            dashPattern: []
          }
        ]
      })
    }
    store.requestRender()
  })
  await editor.page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
  expect(await editor.canvas.screenshotCanvasRegion()).toMatchSnapshot('vector-stroke-align.png')
})
