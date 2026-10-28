import { describe, expect, test } from 'bun:test'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import { SceneGraph } from '@open-pencil/scene-graph'

import { updateNode } from '#core/tools/modify/update'

describe('update_node', () => {
  test('does not report a size it could not set on a layer inside an instance', async () => {
    const figma = new FigmaAPI(new SceneGraph())
    const component = figma.createComponent()
    const rect = figma.createRectangle()
    rect.resize(30, 30)
    component.appendChild(rect)
    const layer = component.createInstance().children[0]

    const result = await updateNode.execute(figma, { id: layer.id, width: 60, name: 'Badge' })

    expect(result).toEqual({ id: layer.id, updated: ['name'] })
    expect(layer.width).toBe(30)
  })

  test('reports an auto layout frame that stops hugging at the size it had', async () => {
    const figma = new FigmaAPI(new SceneGraph())
    const stack = figma.createFrame()
    stack.layoutMode = 'VERTICAL'
    stack.primaryAxisSizingMode = 'AUTO'
    stack.counterAxisSizingMode = 'AUTO'
    const item = figma.createRectangle()
    item.resize(40, 20)
    stack.appendChild(item)

    const result = await updateNode.execute(figma, { id: stack.id, width: stack.width })

    expect(result).toEqual({
      id: stack.id,
      updated: ['layoutSizingHorizontal', 'layoutSizingVertical']
    })
    expect([stack.layoutSizingHorizontal, stack.layoutSizingVertical]).toEqual(['FIXED', 'FIXED'])
  })

  test('reports a text that stops sizing itself at the size it had', async () => {
    const figma = new FigmaAPI(new SceneGraph())
    const text = figma.createText()
    text.characters = 'Label'

    const result = await updateNode.execute(figma, { id: text.id, width: text.width })

    expect(result).toEqual({ id: text.id, updated: ['textAutoResize'] })
    expect(text.textAutoResize).toBe('NONE')
  })
})
