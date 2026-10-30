import * as OpenTypeSync from 'opentype.js'

export interface OutlineCommand {
  type: string
  x?: number
  y?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}

interface OutlinePath {
  commands: OutlineCommand[]
}

export interface OutlineGlyph {
  path: OutlinePath
  advanceWidth?: number
  getPath(
    x: number,
    y: number,
    fontSize: number,
    options?: { variation?: Record<string, number> },
    font?: OutlineFont
  ): OutlinePath
}

export interface OutlineFont {
  unitsPerEm: number
  ascender: number
  descender: number
  tables: {
    os2?: { sTypoLineGap?: number; yStrikeoutPosition?: number; yStrikeoutSize?: number }
    post?: { underlinePosition?: number; underlineThickness?: number }
    fvar?: unknown
  }
  glyphs: { get(index: number): OutlineGlyph | undefined }
  charToGlyphIndex(char: string): number
  charToGlyph(char: string): OutlineGlyph
  forEachGlyph(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    options: undefined,
    callback: (glyph: OutlineGlyph, x: number) => void
  ): number
}

export interface GlyphOutlineProbe {
  family: string
  style: string
  unitsPerEm: number
  commandCount: number
  firstGlyphCommandSample: OutlineCommand[]
}

interface OpenTypeModule {
  parse(buffer: ArrayBuffer): OutlineFont
}

const parsedFonts = new WeakMap<ArrayBuffer, OutlineFont | null>()

export function parsedFontData(bytes: ArrayBuffer): OutlineFont | null {
  if (parsedFonts.has(bytes)) return parsedFonts.get(bytes) ?? null
  try {
    const font = (OpenTypeSync as OpenTypeModule).parse(bytes.slice(0))
    parsedFonts.set(bytes, font)
    return font
  } catch {
    parsedFonts.set(bytes, null)
    return null
  }
}

export function fontDataHasGlyph(bytes: ArrayBuffer, character: string): boolean {
  const font = parsedFontData(bytes)
  return font !== null && font.charToGlyphIndex(character) !== 0
}
