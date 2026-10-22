import type { ParsedCardLine, ResolvedCardImage } from './types'
import { failureLabel, lineKey, sanitizeFileName, sleep } from './types'

type YgoCardSet = {
  set_name?: string
  set_code?: string
  set_rarity?: string
}

type YgoCard = {
  name?: string
  id?: number
  card_images?: Array<{
    id?: number
    image_url?: string
    image_url_small?: string
  }>
  card_sets?: YgoCardSet[]
}

type YgoResponse = {
  data?: YgoCard[]
  error?: string
}

/**
 * Yu-Gi-Oh art is usually shared across sets; we still honour set codes when present
 * for matching / labeling, and fall back to the default (first) artwork.
 */
export async function resolveYugiohCards(
  lines: ParsedCardLine[],
  onProgress?: (current: number, total: number, label: string) => void,
): Promise<{ resolved: ResolvedCardImage[]; failures: { name: string; reason: string }[] }> {
  const unique = new Map<string, ParsedCardLine>()
  for (const line of lines) {
    const key = lineKey(line)
    if (!unique.has(key)) unique.set(key, line)
  }

  const entries = [...unique.values()]
  const foundByKey = new Map<string, ResolvedCardImage>()
  const failures: { name: string; reason: string }[] = []

  for (let i = 0; i < entries.length; i++) {
    const line = entries[i]
    onProgress?.(i, entries.length, line.name)

    try {
      let card = await fetchYgoExact(line.name)
      if (!card) card = await fetchYgoFuzzy(line.name)
      if (!card) {
        failures.push({ name: failureLabel(line), reason: 'Not found on YGOPRODeck' })
      } else if (line.setHint && !setMatches(card, line.setHint, line.collectorNumber)) {
        // Name found but requested set not present on this card entry
        failures.push({
          name: failureLabel(line),
          reason: `Set ${line.setHint} not found for this card`,
        })
      } else {
        const imageUrl = card.card_images?.[0]?.image_url
        if (!imageUrl) {
          failures.push({ name: failureLabel(line), reason: 'No image on YGOPRODeck' })
        } else {
          const name = card.name || line.name
          const id = card.card_images?.[0]?.id || card.id
          const setDetail = pickSetDetail(card, line.setHint, line.collectorNumber)
          foundByKey.set(lineKey(line), {
            name,
            fileName: `${sanitizeFileName(name)}${id ? `-${id}` : ''}.jpg`,
            imageUrl,
            quantity: 1,
            source: 'yugioh',
            detail: setDetail || (id ? `ID ${id}` : undefined),
          })
        }
      }
    } catch (err) {
      failures.push({
        name: failureLabel(line),
        reason: err instanceof Error ? err.message : 'YGOPRODeck error',
      })
    }

    onProgress?.(i + 1, entries.length, line.name)
    if (i < entries.length - 1) await sleep(120)
  }

  const expanded: ResolvedCardImage[] = []
  for (const line of lines) {
    const hit = foundByKey.get(lineKey(line))
    if (!hit) continue
    expanded.push({ ...hit, quantity: line.quantity })
  }

  return { resolved: expanded, failures }
}

function setMatches(card: YgoCard, setHint: string, collector?: string): boolean {
  const sets = card.card_sets || []
  if (sets.length === 0) return !collector // no set data — accept name-only image
  const hint = setHint.toLowerCase()
  const num = collector?.toLowerCase()
  return sets.some((s) => {
    const code = (s.set_code || '').toLowerCase()
    if (num) return code === num || code.endsWith(`-${num}`) || code.includes(hint)
    return code === hint || code.startsWith(`${hint}-`) || code.includes(hint)
  })
}

function pickSetDetail(card: YgoCard, setHint?: string, collector?: string): string | undefined {
  const sets = card.card_sets || []
  if (setHint) {
    const hint = setHint.toLowerCase()
    const num = collector?.toLowerCase()
    const hit = sets.find((s) => {
      const code = (s.set_code || '').toLowerCase()
      if (num) return code === num || code.endsWith(`-${num}`)
      return code === hint || code.startsWith(`${hint}-`)
    })
    if (hit?.set_code) return hit.set_code
  }
  // “Most recent” approximation: last entry in the API list often includes newer reprints
  const last = sets[sets.length - 1]
  return last?.set_code
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
  const exact = data.find((c) => (c.name || '').toLowerCase() === name.toLowerCase())
  return exact || data[0]
}
