import { beforeAll, expect, test } from 'bun:test'

import { expectDefined } from '#core-tests/helpers/assert'

import { SceneGraph, type Stroke, type VectorNetwork } from '@open-pencil/scene-graph'

import { SkiaRenderer } from '#core/canvas/renderer'
import { getCanvasKit } from '#core/canvaskit'
import { renderNodesToImage } from '#core/io/formats/raster/render'

let ck: Awaited<ReturnType<typeof getCanvasKit>>

beforeAll(async () => {
  ck = await getCanvasKit()
})

const SIDE = 40
const corner = { x: 0, y: 0 }
const SQUARE: VectorNetwork = {
  vertices: [
    { x: 0, y: 0 },
    { x: SIDE, y: 0 },
    { x: SIDE, y: SIDE },
    { x: 0, y: SIDE }
  ],
  segments: [0, 1, 2, 3].map((start) => ({
    start,
    end: (start + 1) % 4,
    tangentStart: corner,
    tangentEnd: corner
  })),
  regions: [{ windingRule: 'NONZERO', loops: [[0, 1, 2, 3]] }]
}

/** The square's first three sides, open, with no region to fill. */
const OPEN: VectorNetwork = {
  vertices: SQUARE.vertices,
  segments: SQUARE.segments.slice(0, 3),
  regions: []
}

/** Whether the shape's 8 px stroke inks the row through its middle `x` px from its left edge. */
function inks(align: Stroke['align'], network = SQUARE): (x: number) => boolean {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const vector = graph.createNode('VECTOR', page.id, {
    width: SIDE,
    height: SIDE,
    vectorNetwork: network,
    fills: [],
    strokes: [
      {
        type: 'SOLID',
        color: { r: 0, g: 0, b: 0, a: 1 },
        weight: 8,
        opacity: 1,
        visible: true,
        align,
        cap: 'NONE',
        join: 'MITER',
        dashPattern: []
      }
    ]
  })
  const surface = expectDefined(ck.MakeSurface(1, 1), 'surface')
  const renderer = new SkiaRenderer(ck, surface)
  try {
    const png = expectDefined(
      renderNodesToImage(ck, renderer, graph, page.id, [vector.id], { scale: 1, format: 'PNG' }),
      'png'
    )
    const image = expectDefined(ck.MakeImageFromEncoded(png), 'image')
    const pixels = expectDefined(
      image.readPixels(0, 0, {
        alphaType: ck.AlphaType.Unpremul,
        colorType: ck.ColorType.RGBA_8888,
        colorSpace: ck.ColorSpace.SRGB,
        width: image.width(),
        height: image.height()
      }),
      'pixels'
    )
    // The export starts where the stroke's ink can reach, outside the square's left edge.
    const left = (image.width() - SIDE) / 2
    const row = Math.floor(image.height() / 2)
    const width = image.width()
    image.delete()
    return (x) => pixels[(row * width + Math.floor(left + x)) * 4 + 3] > 128
  } finally {
    surface.delete()
  }
}

// Figma 126 strokes inside or outside a path as a centred stroke twice as wide, clipped.
test('a vector stroked from its path keeps the stroke on the side its alignment takes', () => {
  const center = inks('CENTER')
  expect([center(-6), center(2), center(6)]).toEqual([false, true, false])
  const inside = inks('INSIDE')
  expect([inside(2), inside(6), inside(10)]).toEqual([true, true, false])
  const outside = inks('OUTSIDE')
  expect([outside(-6), outside(2), outside(6)]).toEqual([true, false, false])
})

// An open path encloses nothing to take a side of, so its stroke stays centred at its weight.
test('an open vector path strokes centred whatever its alignment', () => {
  for (const align of ['INSIDE', 'OUTSIDE'] as const) {
    const open = inks(align, OPEN)
    expect([open(34), open(38), open(42), open(46)]).toEqual([false, true, true, false])
  }
})
