export type CardGame = 'mtg' | 'pokemon' | 'yugioh'

export interface ParsedCardLine {
  quantity: number
  name: string
  /** Optional set code from the list line, e.g. MH3 / swsh8 / LOB */
  setHint?: string
  /** Optional collector / card number within the set */
  collectorNumber?: string
  raw: string
}

export interface ResolvedCardImage {
  name: string
  fileName: string
  imageUrl: string
  quantity: number
  source: CardGame
  detail?: string
}

export interface ImportProgress {
  phase: 'resolve' | 'download'
  current: number
  total: number
  label: string
}

export interface ImportResult {
  cards: import('../localFiles').LocalCard[]
  failures: { name: string; reason: string }[]
}

const SKIP_PREFIXES = [
  /^sideboard\b/i,
  /^sideboard:/i,
  /^deck\b/i,
  /^mainboard\b/i,
  /^maybeboard\b/i,
  /^commander\b/i,
  /^companion\b/i,
  /^extra\b/i,
  /^#/,
  /^\/\//,
]

/** Stable key so the same name with different printings stays distinct. */
export function lineKey(line: ParsedCardLine): string {
  return [
    line.name.toLowerCase(),
    (line.setHint || '').toLowerCase(),
    (line.collectorNumber || '').toLowerCase(),
  ].join('|')
}

/**
 * Parse a plain deck/list.
 * Supported shapes:
 * - `4 Lightning Bolt`
 * - `1x Sol Ring (C21)`
 * - `1 Sol Ring (C21) 10`  (Arena / set + collector number)
 * - `3 Dark Magician (LOB)`
 */
export function parseCardList(text: string): ParsedCardLine[] {
  const lines = text.split(/\r?\n/)
  const out: ParsedCardLine[] = []

  for (const rawLine of lines) {
    const raw = rawLine.trim()
    if (!raw) continue
    if (SKIP_PREFIXES.some((re) => re.test(raw))) continue

    let rest = raw
    let quantity = 1
    const qtyMatch = rest.match(/^(\d+)\s*[x×]?\s+(.*)$/i)
    if (qtyMatch) {
      quantity = Math.max(1, Math.min(99, Number(qtyMatch[1])))
      rest = qtyMatch[2].trim()
    }

    // Name (SET) collectorNumber
    let match = rest.match(/^(.*?)\s+[\(\[]([A-Za-z0-9_-]+)[\)\]]\s+(\S+)\s*$/)
    if (match) {
      const name = match[1].trim()
      if (!name) continue
      out.push({
        quantity,
        name,
        setHint: match[2].trim(),
        collectorNumber: match[3].trim(),
        raw,
      })
      continue
    }

    // Name (SET)
    match = rest.match(/^(.*?)\s+[\(\[]([A-Za-z0-9_-]+)[\)\]]\s*$/)
    if (match) {
      const name = match[1].trim()
      if (!name) continue
      out.push({
        quantity,
        name,
        setHint: match[2].trim(),
        raw,
      })
      continue
    }

    if (!rest) continue
    out.push({ quantity, name: rest, raw })
  }

  return out
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function downloadAsFile(
  url: string,
  fileName: string,
): Promise<File> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const type = blob.type || guessMime(fileName)
  return new File([blob], fileName, { type })
}

function guessMime(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  return 'image/jpeg'
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export function failureLabel(line: ParsedCardLine): string {
  const set = line.setHint ? ` (${line.setHint}` + (line.collectorNumber ? ` ${line.collectorNumber}` : '') + ')' : ''
  return `${line.name}${set}`
}
