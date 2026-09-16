import type { ParsedCardLine, ResolvedCardImage } from './types'
import { failureLabel, lineKey, sleep } from './types'

type ScryfallCard = {
  name?: string
  set?: string
  collector_number?: string
  released_at?: string
  image_uris?: { large?: string; normal?: string; png?: string }
  card_faces?: Array<{
    name?: string
    image_uris?: { large?: string; normal?: string; png?: string }
  }>
}

type ScryfallListResponse = {
  object?: string
  data?: ScryfallCard[]
  not_found?: Array<{ name?: string; set?: string; collector_number?: string }>
  details?: string
}

function pickImage(card: ScryfallCard): string | null {
  const uris = card.image_uris || card.card_faces?.[0]?.image_uris
  return uris?.png || uris?.large || uris?.normal || null
}

function fileStem(card: ScryfallCard, fallback: string): string {
  const base = card.name || fallback
  const set = card.set ? `-${card.set}` : ''
  const num = card.collector_number ? `-${card.collector_number}` : ''
  return `${base}${set}${num}`
}

function toResolved(card: ScryfallCard, fallbackName: string): ResolvedCardImage | null {
  const imageUrl = pickImage(card)
  if (!imageUrl) return null
  const name = card.name || fallbackName
  return {
    name,
    fileName: `${fileStem(card, name)}.png`,
    imageUrl,
    quantity: 1,
    source: 'mtg',
    detail: card.set ? `${card.set.toUpperCase()} #${card.collector_number}` : undefined,
  }
}

type Identifier =
  | { name: string; set: string; collector_number: string }
  | { name: string; set: string }
  | { set: string; collector_number: string }
  | { name: string }

function identifierFor(line: ParsedCardLine): Identifier {
  const set = line.setHint?.toLowerCase()
  const num = line.collectorNumber
  if (set && num) return { name: line.name, set, collector_number: num }
  if (set) return { name: line.name, set }
  return { name: line.name }
}

/**
 * Resolve printings:
 * - set + collector → that exact printing
 * - set only → that set’s printing of the card
 * - name only → most recent English printing
 */
export async function resolveMtgCards(
  lines: ParsedCardLine[],
  onProgress?: (current: number, total: number, label: string) => void,
): Promise<{ resolved: ResolvedCardImage[]; failures: { name: string; reason: string }[] }> {
  const unique = new Map<string, ParsedCardLine>()
  for (const line of lines) {
    const key = lineKey(line)
    if (!unique.has(key)) unique.set(key, line)
  }

  const entries = [...unique.values()]
  const failures: { name: string; reason: string }[] = []
  const foundByKey = new Map<string, ResolvedCardImage>()

  // 1) Exact / set-scoped via collection API
  const withPrintHint = entries.filter((l) => l.setHint)
  const nameOnly = entries.filter((l) => !l.setHint)

  const chunkSize = 75
  for (let i = 0; i < withPrintHint.length; i += chunkSize) {
    const chunk = withPrintHint.slice(i, i + chunkSize)
    onProgress?.(i, entries.length, chunk[0]?.name || 'Scryfall')

    const identifiers = chunk.map(identifierFor)
    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers }),
    })

    if (!res.ok) {
      for (const line of chunk) {
        failures.push({ name: failureLabel(line), reason: `Scryfall HTTP ${res.status}` })
      }
    } else {
      const json = (await res.json()) as ScryfallListResponse
      // Match returned cards back to requests by set(+number) and name
      const remaining = [...chunk]
      for (const card of json.data || []) {
        const item = toResolved(card, card.name || '?')
        if (!item) {
          failures.push({ name: card.name || '?', reason: 'No image on Scryfall' })
          continue
        }
        const idx = remaining.findIndex((line) => matchesPrinting(line, card))
        if (idx >= 0) {
          const line = remaining[idx]
          foundByKey.set(lineKey(line), item)
          remaining.splice(idx, 1)
        } else {
          // Fallback: map by name+set
          const key = lineKey({
            quantity: 1,
            name: card.name || '',
            setHint: card.set,
            collectorNumber: card.collector_number,
            raw: '',
          })
          foundByKey.set(key, item)
        }
      }
      for (const line of remaining) {
        // Try name+set without collector if collector miss
        if (line.setHint && line.collectorNumber) {
          const fallback = await fetchByNameAndSet(line.name, line.setHint)
          if (fallback) {
            const item = toResolved(fallback, line.name)
            if (item) {
              foundByKey.set(lineKey(line), item)
              continue
            }
          }
        }
        failures.push({ name: failureLabel(line), reason: 'Not found on Scryfall' })
      }
    }

    onProgress?.(Math.min(entries.length, withPrintHint.length), entries.length, 'Scryfall')
    if (i + chunkSize < withPrintHint.length) await sleep(100)
  }

  // 2) Name-only → most recent English printing
  for (let i = 0; i < nameOnly.length; i++) {
    const line = nameOnly[i]
    onProgress?.(withPrintHint.length + i, entries.length, line.name)
    try {
      const card = await fetchNewestByName(line.name)
      if (!card) {
        failures.push({ name: failureLabel(line), reason: 'Not found on Scryfall' })
      } else {
        const item = toResolved(card, line.name)
        if (!item) {
          failures.push({ name: failureLabel(line), reason: 'No image on Scryfall' })
        } else {
          foundByKey.set(lineKey(line), item)
        }
      }
    } catch (err) {
      failures.push({
        name: failureLabel(line),
        reason: err instanceof Error ? err.message : 'Scryfall error',
      })
    }
    onProgress?.(withPrintHint.length + i + 1, entries.length, line.name)
    if (i < nameOnly.length - 1) await sleep(100)
  }

  const expanded: ResolvedCardImage[] = []
  const failedKeys = new Set(failures.map((f) => f.name.toLowerCase()))

  for (const line of lines) {
    const hit = foundByKey.get(lineKey(line))
    if (!hit) {
      const label = failureLabel(line)
      if (!failedKeys.has(label.toLowerCase())) {
        failures.push({ name: label, reason: 'Not found on Scryfall' })
        failedKeys.add(label.toLowerCase())
      }
      continue
    }
    expanded.push({ ...hit, quantity: line.quantity })
  }

  return { resolved: expanded, failures }
}

function matchesPrinting(line: ParsedCardLine, card: ScryfallCard): boolean {
  const setOk = !line.setHint || (card.set || '').toLowerCase() === line.setHint.toLowerCase()
  const numOk =
    !line.collectorNumber ||
    (card.collector_number || '').toLowerCase() === line.collectorNumber.toLowerCase()
  const nameOk =
    (card.name || '').toLowerCase() === line.name.toLowerCase() ||
    (card.card_faces?.[0]?.name || '').toLowerCase() === line.name.toLowerCase()
  return setOk && numOk && nameOk
}

async function fetchNewestByName(name: string): Promise<ScryfallCard | null> {
  const q = `!"${name.replace(/"/g, '')}" lang:en`
  const url =
    `https://api.scryfall.com/cards/search?` +
    `q=${encodeURIComponent(q)}&unique=prints&order=released&dir=desc`
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Scryfall HTTP ${res.status}`)
  const json = (await res.json()) as ScryfallListResponse
  return json.data?.[0] || null
}

async function fetchByNameAndSet(name: string, set: string): Promise<ScryfallCard | null> {
  const q = `!"${name.replace(/"/g, '')}" set:${set.toLowerCase()} lang:en`
  const url =
    `https://api.scryfall.com/cards/search?` +
    `q=${encodeURIComponent(q)}&unique=prints&order=released&dir=desc`
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) return null
  const json = (await res.json()) as ScryfallListResponse
  return json.data?.[0] || null
}
