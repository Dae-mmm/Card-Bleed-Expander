import type { ParsedCardLine, ResolvedCardImage } from './types'
import { sleep } from './types'

type ScryfallCard = {
  name?: string
  set?: string
  collector_number?: string
  image_uris?: { large?: string; normal?: string; png?: string }
  card_faces?: Array<{
    name?: string
    image_uris?: { large?: string; normal?: string; png?: string }
  }>
}

type ScryfallCollectionResponse = {
  data?: ScryfallCard[]
  not_found?: Array<{ name?: string }>
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

/** Resolve unique names via Scryfall /cards/collection (chunks of 75). */
export async function resolveMtgCards(
  lines: ParsedCardLine[],
  onProgress?: (current: number, total: number, label: string) => void,
): Promise<{ resolved: ResolvedCardImage[]; failures: { name: string; reason: string }[] }> {
  const unique = new Map<string, ParsedCardLine>()
  for (const line of lines) {
    const key = line.name.toLowerCase()
    if (!unique.has(key)) unique.set(key, line)
  }

  const entries = [...unique.values()]
  const failures: { name: string; reason: string }[] = []
  const foundByName = new Map<string, ResolvedCardImage>()

  const chunkSize = 75
  let done = 0

  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize)
    onProgress?.(done, entries.length, chunk[0]?.name || 'Scryfall')

    const identifiers = chunk.map((line) =>
      line.setHint
        ? { name: line.name, set: line.setHint.toLowerCase() }
        : { name: line.name },
    )

    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers }),
    })

    if (!res.ok) {
      for (const line of chunk) {
        failures.push({ name: line.name, reason: `Scryfall HTTP ${res.status}` })
      }
    } else {
      const json = (await res.json()) as ScryfallCollectionResponse
      for (const card of json.data || []) {
        const item = toResolved(card, card.name || '?')
        if (!item) {
          failures.push({ name: card.name || '?', reason: 'No image on Scryfall' })
          continue
        }
        foundByName.set(item.name.toLowerCase(), item)
        // Map front-face name for DFCs too
        const face = card.card_faces?.[0]?.name
        if (face) foundByName.set(face.toLowerCase(), item)
      }
      for (const miss of json.not_found || []) {
        if (miss.name) failures.push({ name: miss.name, reason: 'Not found on Scryfall' })
      }
    }

    done = Math.min(entries.length, i + chunkSize)
    onProgress?.(done, entries.length, 'Scryfall')
    if (i + chunkSize < entries.length) await sleep(100)
  }

  const expanded: ResolvedCardImage[] = []
  const failedKeys = new Set(failures.map((f) => f.name.toLowerCase()))

  for (const line of lines) {
    const hit = foundByName.get(line.name.toLowerCase())
    if (!hit) {
      if (!failedKeys.has(line.name.toLowerCase())) {
        failures.push({ name: line.name, reason: 'Not found on Scryfall' })
        failedKeys.add(line.name.toLowerCase())
      }
      continue
    }
    expanded.push({ ...hit, quantity: line.quantity })
  }

  return { resolved: expanded, failures }
}
