/** Inject a pHYs (DPI) chunk into an existing PNG, or encode RGBA via canvas. */

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function u32be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
}

function readU32be(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0
  )
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const body = new Uint8Array(4 + data.length)
  body.set(typeBytes, 0)
  body.set(data, 4)
  const out = new Uint8Array(4 + body.length + 4)
  out.set(u32be(data.length), 0)
  out.set(body, 4)
  out.set(u32be(crc32(body)), 4 + body.length)
  return out
}

/** Insert/replace pHYs after IHDR so print tools see the intended DPI. */
export function injectPngDpi(png: ArrayBuffer | Uint8Array, dpi: number): Uint8Array {
  const src = png instanceof Uint8Array ? png : new Uint8Array(png)
  if (src.length < 8 || src[0] !== 0x89) return src

  const ppm = Math.round(dpi * (10000 / 254))
  const physData = new Uint8Array(9)
  physData.set(u32be(ppm), 0)
  physData.set(u32be(ppm), 4)
  physData[8] = 1
  const physChunk = makeChunk('pHYs', physData)

  // Find end of IHDR (always first chunk after signature)
  let offset = 8
  const len = readU32be(src, offset)
  const ihdrEnd = offset + 12 + len // len + type + data + crc

  // Skip/drop any existing pHYs while copying the rest
  const parts: Uint8Array[] = [src.subarray(0, ihdrEnd), physChunk]
  offset = ihdrEnd
  while (offset + 12 <= src.length) {
    const chunkLen = readU32be(src, offset)
    const type = String.fromCharCode(src[offset + 4], src[offset + 5], src[offset + 6], src[offset + 7])
    const chunkEnd = offset + 12 + chunkLen
    if (type !== 'pHYs') {
      parts.push(src.subarray(offset, chunkEnd))
    }
    offset = chunkEnd
    if (type === 'IEND') break
  }

  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

function canvas2d(width: number, height: number): {
  canvas: OffscreenCanvas | HTMLCanvasElement
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
} {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas unavailable')
    return { canvas, ctx }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return { canvas, ctx }
}

export async function encodePngRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  dpi = 300,
): Promise<Blob> {
  const { canvas, ctx } = canvas2d(width, height)
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height)
  ctx.putImageData(imageData, 0, 0)

  let raw: ArrayBuffer
  if ('convertToBlob' in canvas) {
    const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' })
    raw = await blob.arrayBuffer()
  } else {
    const dataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png')
    const bin = atob(dataUrl.split(',')[1] ?? '')
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    raw = bytes.buffer
  }

  const withDpi = injectPngDpi(raw, dpi)
  const copy = new Uint8Array(withDpi.byteLength)
  copy.set(withDpi)
  return new Blob([copy], { type: 'image/png' })
}
