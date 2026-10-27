import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'

const editor = useEditorSetupWithClear('/?test&no-chrome&no-rulers')

// Figma 126 never clips a text layer to its box: a fixed-size box grown past by its text draws
// the rest below it, and only a frame that clips its content cuts the text off.
test('draws a fixed-size text past its box, and a clipping frame still cuts it', async () => {
  const heights = await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('Missing editor')
    const page = store.state.currentPageId
    const boxFill = [
      {
        type: 'SOLID' as const,
        color: { r: 0.86, g: 0.91, b: 0.98, a: 1 },
        opacity: 1,
        visible: true
      }
    ]
    const frame = store.graph.createNode('FRAME', page, {
      name: 'Clips its content',
      x: 300,
      y: 40,
      width: 160,
      height: 120,
      clipsContent: true,
      fills: boxFill
    })
    const texts = [
      { parent: page, x: 40, y: 40 },
      { parent: frame.id, x: 20, y: 20 }
    ].map(({ parent, x, y }) => {
      if (parent === page)
        store.graph.createNode('RECTANGLE', page, {
          name: 'Box',
          x,
          y,
          width: 110,
          height: 40,
          fills: boxFill
        })
      const text = store.graph.createNode('TEXT', parent, {
        x,
        y,
        width: 110,
        height: 40,
        text: 'dssdds grows',
        fontSize: 14,
        textAutoResize: 'NONE'
      })
      // The panel's font size goes through the editor, which measures the lines.
      store.updateNode(text.id, { fontSize: 48 })
      return text.id
    })
    store.requestRender()
    return texts.map((id) => {
      const node = store.graph.getNode(id)
      return [node?.height, node?.derivedTextHeight]
    })
  })
  for (const [height, linesHeight] of heights) {
    expect(height).toBe(40)
    expect(linesHeight).toBeGreaterThan(100)
  }
  await editor.page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
  expect(await editor.canvas.screenshotCanvasRegion()).toMatchSnapshot('text-overflow.png')
})
