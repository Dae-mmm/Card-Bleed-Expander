export type CardGame = 'mtg' | 'pokemon' | 'yugioh'

export interface ParsedCardLine {
  quantity: number
  name: string
  /** Optional set code / collector number hint from the list line */
  setHint?: string
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

/**
 * Parse a plain deck/list: lines like `4 Lightning Bolt`, `1x Sol Ring`,
 * `Lightning Bolt`, or `3 Dark Magician (LOB)`.
 */
export function parseCardList(text: string): ParsedCardLine[] {
  const lines = text.split(/\r?\n/)
  const out: ParsedCardLine[] = []

  for (const rawLine of lines) {
    const raw = rawLine.trim()
    if (!raw) continue
    if (SKIP_PREFIXES.some((re) => re.test(raw))) continue

    // 4 Card Name / 4x Card Name / 4x Card Name (SET) / Card Name
    const match = raw.match(
      /^(?:(\d+)\s*[x×]?\s+)?(.+?)(?:\s+\(([A-Za-z0-9_-]+)\))?\s*$/,
    )
    if (!match) continue

    const quantity = Math.max(1, Math.min(99, Number(match[1] || 1)))
    let name = (match[2] || '').trim()
    const setHint = match[3]?.trim()

    // Strip trailing set codes like "Lightning Bolt SET" only when already captured
    name = name.replace(/\s+$/, '')
    if (!name) continue

    out.push({ quantity, name, setHint, raw })
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
