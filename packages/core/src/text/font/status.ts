import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

import { DEFAULT_FONT_FAMILY } from '#core/constants'
import { styleForCharacter } from '#core/text/coverage'
import type { FontLoadedSource, FontUnavailableReason } from '#core/text/font/sources'
import { fontManager, type FontManager } from '#core/text/fonts'
import { fontGlyphCoverageSync } from '#core/text/opentype'
import { collectNodeFontFaces } from '#core/text/requirements'

export type FontFaceStatus = 'available' | 'substituted' | 'unresolved'

export interface DocumentFontFaceStatus {
  family: string
  style: string
  status: FontFaceStatus
  source: FontLoadedSource | null
  substituteFamily: string | null
  /** Why the requested face could not be loaded, when the host reported a reason. */
  reason: FontUnavailableReason | null
  nodeIds: string[]
  nodeNames: string[]
}

export interface DocumentFontStatus {
  faithful: boolean
  faces: DocumentFontFaceStatus[]
  issues: DocumentFontFaceStatus[]
}

interface MutableFontFaceUse {
  family: string
  style: string
  nodeIds: Set<string>
  nodeNames: Set<string>
  characters: Set<string>
}

function faceKey(family: string, style: string): string {
  return `${family}\0${style}`
}

function rootTextNodes(graph: SceneGraph, rootIds: readonly string[]): SceneNode[] {
  return rootIds.flatMap((rootId) =>
    graph.flattenTree(rootId).flatMap(({ node }) => (node.type === 'TEXT' ? [node] : []))
  )
}

function collectFaceUses(graph: SceneGraph, rootIds: readonly string[]): MutableFontFaceUse[] {
  const uses = new Map<string, MutableFontFaceUse>()
  for (const node of rootTextNodes(graph, rootIds)) {
    for (const { family, style } of collectNodeFontFaces(node)) {
      const key = faceKey(family, style)
      const use = uses.get(key) ?? {
        family,
        style,
        nodeIds: new Set<string>(),
        nodeNames: new Set<string>(),
        characters: new Set<string>()
      }
      use.nodeIds.add(node.id)
      use.nodeNames.add(node.name)
      uses.set(key, use)
    }
    let offset = 0
    for (const character of node.text) {
      const face = styleForCharacter(node, offset)
      uses.get(faceKey(face.family, face.style))?.characters.add(character)
      offset += character.length
    }
  }
  return [...uses.values()]
}

function faceStatus(use: MutableFontFaceUse, manager: FontManager): DocumentFontFaceStatus {
  const exactSource = manager.loadedFontSource(use.family, use.style)
  if (exactSource) {
    let substituteFamily: string | null = null
    let uncovered = false
    for (const character of use.characters) {
      if (
        /\s/u.test(character) ||
        fontGlyphCoverageSync(use.family, use.style, character, manager) !== 'missing'
      )
        continue
      const fallback = [
        ...manager.getCJKFallbackFamilies(),
        ...manager.getArabicFallbackFamilies(),
        DEFAULT_FONT_FAMILY
      ].find((family) => fontGlyphCoverageSync(family, 'Regular', character, manager) === 'has')
      if (!fallback) uncovered = true
      else substituteFamily ??= fallback
    }
    let status: FontFaceStatus = 'available'
    if (uncovered) status = 'unresolved'
    else if (substituteFamily) status = 'substituted'
    return {
      family: use.family,
      style: use.style,
      status,
      source: exactSource,
      substituteFamily: uncovered ? null : substituteFamily,
      reason: null,
      nodeIds: [...use.nodeIds],
      nodeNames: [...use.nodeNames]
    }
  }

  if (manager.isLoaded(use.family)) {
    return {
      family: use.family,
      style: use.style,
      status: 'substituted',
      source: null,
      substituteFamily: use.family,
      reason: manager.unavailableReason(use.family, use.style),
      nodeIds: [...use.nodeIds],
      nodeNames: [...use.nodeNames]
    }
  }

  const defaultSource = manager.loadedFontSource(DEFAULT_FONT_FAMILY, 'Regular')
  return {
    family: use.family,
    style: use.style,
    status: defaultSource ? 'substituted' : 'unresolved',
    source: null,
    substituteFamily: defaultSource ? DEFAULT_FONT_FAMILY : null,
    reason: manager.unavailableReason(use.family, use.style),
    nodeIds: [...use.nodeIds],
    nodeNames: [...use.nodeNames]
  }
}

export function documentFontStatus(
  graph: SceneGraph,
  rootIds: string | readonly string[],
  manager: FontManager = fontManager
): DocumentFontStatus {
  const roots = typeof rootIds === 'string' ? [rootIds] : rootIds
  const faces = collectFaceUses(graph, roots)
    .map((use) => faceStatus(use, manager))
    .sort((a, b) => a.family.localeCompare(b.family) || a.style.localeCompare(b.style))
  const issues = faces.filter((face) => face.status !== 'available')
  return { faithful: issues.length === 0, faces, issues }
}
