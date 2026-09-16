/** Minimal uncompressed CMYK TIFF writer (print-oriented). */

function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const k = 1 - Math.max(rr, gg, bb)
  if (k >= 1 - 1e-9) return [0, 0, 0, 255]
  const c = (1 - rr - k) / (1 - k)
  const m = (1 - gg - k) / (1 - k)
  const y = (1 - bb - k) / (1 - k)
  return [
    Math.round(Math.min(1, Math.max(0, c)) * 255),
    Math.round(Math.min(1, Math.max(0, m)) * 255),
    Math.round(Math.min(1, Math.max(0, y)) * 255),
    Math.round(Math.min(1, Math.max(0, k)) * 255),
  ]
}

function writeU16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true)
}

function writeU32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true)
}

/**
 * Build a little-endian TIFF with photometric CMYK, LZW-free (uncompressed).
 * Resolution tags use inches so print tools pick up DPI.
 */
export function encodeCmykTiff(
  rgba: Uint8Array,
  width: number,
  height: number,
  dpi = 300,
): Blob {
  const pixelCount = width * height
  const imageBytes = new Uint8Array(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4
    const [c, m, y, k] = rgbToCmyk(rgba[o], rgba[o + 1], rgba[o + 2])
    imageBytes[o] = c
    imageBytes[o + 1] = m
    imageBytes[o + 2] = y
    imageBytes[o + 3] = k
  }

  // IFD entries we need (12 bytes each) + values that don't fit inline
  type Entry = { tag: number; type: number; count: number; value: number | Uint8Array }
  const entries: Entry[] = []

  const bitsPerSample = new Uint8Array([8, 0, 8, 0, 8, 0, 8, 0]) // 4× uint16 LE
  const xRes = new Uint8Array(8) // rational dpi/1
  const yRes = new Uint8Array(8)
  const xView = new DataView(xRes.buffer)
  const yView = new DataView(yRes.buffer)
  xView.setUint32(0, dpi, true)
  xView.setUint32(4, 1, true)
  yView.setUint32(0, dpi, true)
  yView.setUint32(4, 1, true)

  // Header (8) + IFD count (2) + N*12 + next IFD (4) + extra values + image
  // We'll lay out: header | image data | extra | IFD
  const headerSize = 8
  const imageOffset = headerSize
  const imageLength = imageBytes.length
  const extrasOffset = imageOffset + imageLength

  // extras: bitsPerSample (8) + xRes (8) + yRes (8)
  const extras = new Uint8Array(8 + 8 + 8)
  extras.set(bitsPerSample, 0)
  extras.set(xRes, 8)
  extras.set(yRes, 16)
  const bitsOffset = extrasOffset
  const xResOffset = extrasOffset + 8
  const yResOffset = extrasOffset + 16

  const ifdOffset = extrasOffset + extras.length

  entries.push({ tag: 256, type: 3, count: 1, value: width }) // ImageWidth
  entries.push({ tag: 257, type: 3, count: 1, value: height }) // ImageLength
  entries.push({ tag: 258, type: 3, count: 4, value: bitsOffset }) // BitsPerSample
  entries.push({ tag: 259, type: 3, count: 1, value: 1 }) // Compression=none
  entries.push({ tag: 262, type: 3, count: 1, value: 5 }) // Photometric=separated (CMYK)
  entries.push({ tag: 273, type: 4, count: 1, value: imageOffset }) // StripOffsets
  entries.push({ tag: 277, type: 3, count: 1, value: 4 }) // SamplesPerPixel
  entries.push({ tag: 278, type: 4, count: 1, value: height }) // RowsPerStrip
  entries.push({ tag: 279, type: 4, count: 1, value: imageLength }) // StripByteCounts
  entries.push({ tag: 282, type: 5, count: 1, value: xResOffset }) // XResolution
  entries.push({ tag: 283, type: 5, count: 1, value: yResOffset }) // YResolution
  entries.push({ tag: 284, type: 3, count: 1, value: 1 }) // PlanarConfiguration=chunky
  entries.push({ tag: 296, type: 3, count: 1, value: 2 }) // ResolutionUnit=inch

  entries.sort((a, b) => a.tag - b.tag)

  const ifdSize = 2 + entries.length * 12 + 4
  const total = ifdOffset + ifdSize
  const buf = new ArrayBuffer(total)
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)

  // Header
  writeU16(view, 0, 0x4949) // little endian
  writeU16(view, 2, 42)
  writeU32(view, 4, ifdOffset)

  bytes.set(imageBytes, imageOffset)
  bytes.set(extras, extrasOffset)

  writeU16(view, ifdOffset, entries.length)
  let pos = ifdOffset + 2
  for (const e of entries) {
    writeU16(view, pos, e.tag)
    writeU16(view, pos + 2, e.type)
    writeU32(view, pos + 4, e.count)
    if (typeof e.value === 'number') {
      // Inline if fits in 4 bytes
      if (e.type === 3 && e.count === 1) {
        writeU16(view, pos + 8, e.value)
        writeU16(view, pos + 10, 0)
      } else {
        writeU32(view, pos + 8, e.value)
      }
    }
    pos += 12
  }
  writeU32(view, pos, 0) // next IFD

  return new Blob([buf], { type: 'image/tiff' })
}
