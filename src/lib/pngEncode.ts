/** Encode RGBA → PNG with optional pHYs DPI metadata (no dependencies). */

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

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const len = u32(data.length)
  const body = new Uint8Array(4 + data.length)
  body.set(typeBytes, 0)
  body.set(data, 4)
  const crc = u32(crc32(body))
  const out = new Uint8Array(4 + body.length + 4)
  out.set(len, 0)
  out.set(body, 4)
  out.set(crc, 4 + body.length)
  return out
}

/** DEFLATE store blocks (no compression) — fine for card-sized images. */
function deflateStore(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = []
  let offset = 0
  while (offset < data.length) {
    const size = Math.min(65535, data.length - offset)
    const isLast = offset + size >= data.length
    const block = new Uint8Array(5 + size)
    block[0] = isLast ? 1 : 0
    block[1] = size & 255
    block[2] = (size >>> 8) & 255
    block[3] = ~size & 255
    block[4] = (~size >>> 8) & 255
    block.set(data.subarray(offset, offset + size), 5)
    blocks.push(block)
    offset += size
  }

  // zlib wrapper: CMF/FLG + deflate + adler32
  const deflatedLen = blocks.reduce((n, b) => n + b.length, 0)
  const out = new Uint8Array(2 + deflatedLen + 4)
  out[0] = 0x78
  out[1] = 0x01
  let pos = 2
  for (const b of blocks) {
    out.set(b, pos)
    pos += b.length
  }
  const adler = adler32(data)
  out.set(u32(adler), pos)
  return out
}

function adler32(data: Uint8Array): number {
  let a = 1
  let b = 0
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function filterNone(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const rowSize = width * 4
  const out = new Uint8Array(height * (1 + rowSize))
  for (let y = 0; y < height; y++) {
    const dest = y * (1 + rowSize)
    out[dest] = 0
    out.set(rgba.subarray(y * rowSize, y * rowSize + rowSize), dest + 1)
  }
  return out
}

export function encodePngRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  dpi = 300,
): Blob {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = new Uint8Array(13)
  ihdr.set(u32(width), 0)
  ihdr.set(u32(height), 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const ppm = Math.round(dpi * (10000 / 254))
  const phys = new Uint8Array(9)
  phys.set(u32(ppm), 0)
  phys.set(u32(ppm), 4)
  phys[8] = 1 // meters

  const filtered = filterNone(rgba, width, height)
  const compressed = deflateStore(filtered)

  const parts = [
    signature,
    chunk('IHDR', ihdr),
    chunk('pHYs', phys),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array(0)),
  ]

  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return new Blob([out], { type: 'image/png' })
}
