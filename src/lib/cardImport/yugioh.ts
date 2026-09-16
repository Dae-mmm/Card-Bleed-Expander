import type { ParsedCardLine, ResolvedCardImage } from './types'
import { sanitizeFileName, sleep } from './types'

type YgoCard = {
  name?: string
  id?: number
  card_images?: Array<{
    id?: number
    image_url?: string
    image_url_small?: string
  }>
}

type YgoResponse = {
  data?: YgoCard[]
  error?: string
}

export async function resolveYugiohCards(
  lines: ParsedCardLine[],
  onProgress?: (current: number, total: number, label: string) => void,
): Promise<{ resolved: ResolvedCardImage[]; failures: { name: string; reason: string }[] }> {
  const unique = new Map<string, ParsedCardLine>()
  for (const line of lines) {
    const key = line.name.toLowerCase()
    if (!unique.has(key)) unique.set(key, line)
  }

  const entries = [...unique.values()]
  const foundByName = new Map<string, ResolvedCardImage>()
  const failures: { name: string; reason: string }[] = []

  for (let i = 0; i < entries.length; i++) {
    const line = entries[i]
    onProgress?.(i, entries.length, line.name)

    try {
      // Prefer exact name, then fuzzy fname
      let card = await fetchYgoExact(line.name)
      if (!card) card = await fetchYgoFuzzy(line.name)
      if (!card) {
        failures.push({ name: line.name, reason: 'Not found on YGOPRODeck' })
      } else {
        const imageUrl = card.card_images?.[0]?.image_url
        if (!imageUrl) {
          failures.push({ name: line.name, reason: 'No image on YGOPRODeck' })
        } else {
          const name = card.name || line.name
          const id = card.card_images?.[0]?.id || card.id
          foundByName.set(line.name.toLowerCase(), {
            name,
            fileName: `${sanitizeFileName(name)}${id ? `-${id}` : ''}.jpg`,
            imageUrl,
            quantity: 1,
            source: 'yugioh',
            detail: id ? `ID ${id}` : undefined,
          })
        }
      }
    } catch (err) {
      failures.push({
        name: line.name,
        reason: err instanceof Error ? err.message : 'YGOPRODeck error',
      })
    }

    onProgress?.(i + 1, entries.length, line.name)
    if (i < entries.length - 1) await sleep(120)
  }

  const expanded: ResolvedCardImage[] = []
  for (const line of lines) {
    const hit = foundByName.get(line.name.toLowerCase())
    if (!hit) continue
    expanded.push({ ...hit, quantity: line.quantity })
  }

  return { resolved: expanded, failures }
}

async function fetchYgoExact(name: string): Promise<YgoCard | null> {
  const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(name)}`
  const res = await fetch(url)
  if (res.status === 400) return null
  if (!res.ok) throw new Error(`YGOPRODeck HTTP ${res.status}`)
  const json = (await res.json()) as YgoResponse
  return json.data?.[0] || null
}

async function fetchYgoFuzzy(name: string): Promise<YgoCard | null> {
  const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(name)}`
  const res = await fetch(url)
  if (res.status === 400) return null
  if (!res.ok) throw new Error(`YGOPRODeck HTTP ${res.status}`)
  const json = (await res.json()) as YgoResponse
  const data = json.data || []
  if (data.length === 0) return null
  // Prefer exact case-insensitive match among fuzzy hits
  const exact = data.find((c) => (c.name || '').toLowerCase() === name.toLowerCase())
  return exact || data[0]
}
