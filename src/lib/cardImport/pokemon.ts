import type { ParsedCardLine, ResolvedCardImage } from './types'
import { sanitizeFileName, sleep } from './types'

type PokemonCard = {
  id?: string
  name?: string
  number?: string
  set?: { id?: string; name?: string }
  images?: { large?: string; small?: string }
}

type PokemonResponse = {
  data?: PokemonCard[]
}

export async function resolvePokemonCards(
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
      const card = await fetchPokemonCard(line.name, line.setHint)
      if (!card) {
        failures.push({ name: line.name, reason: 'Not found on Pokémon TCG API' })
      } else {
        const imageUrl = card.images?.large || card.images?.small
        if (!imageUrl) {
          failures.push({ name: line.name, reason: 'No image on Pokémon TCG API' })
        } else {
          const name = card.name || line.name
          const id = card.id || ''
          foundByName.set(line.name.toLowerCase(), {
            name,
            fileName: `${sanitizeFileName(name)}${id ? `-${id}` : ''}.png`,
            imageUrl,
            quantity: 1,
            source: 'pokemon',
            detail: card.set?.name
              ? `${card.set.name}${card.number ? ` #${card.number}` : ''}`
              : id || undefined,
          })
        }
      }
    } catch (err) {
      failures.push({
        name: line.name,
        reason: err instanceof Error ? err.message : 'Pokémon TCG API error',
      })
    }

    onProgress?.(i + 1, entries.length, line.name)
    if (i < entries.length - 1) await sleep(150)
  }

  const expanded: ResolvedCardImage[] = []
  for (const line of lines) {
    const hit = foundByName.get(line.name.toLowerCase())
    if (!hit) continue
    expanded.push({ ...hit, quantity: line.quantity })
  }

  return { resolved: expanded, failures }
}

async function fetchPokemonCard(name: string, setHint?: string): Promise<PokemonCard | null> {
  // Exact-ish name match; optional set id filter
  const parts = [`name:"${name.replace(/"/g, '')}"`]
  if (setHint) parts.push(`set.id:${setHint}`)
  const q = parts.join(' ')
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=5&orderBy=-set.releaseDate`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Pokémon TCG API HTTP ${res.status}`)
  const json = (await res.json()) as PokemonResponse
  const data = json.data || []
  if (data.length === 0) {
    // Fallback: looser name search
    const loose = await fetch(
      `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:${name}`)}&pageSize=5&orderBy=-set.releaseDate`,
    )
    if (!loose.ok) return null
    const looseJson = (await loose.json()) as PokemonResponse
    const looseData = looseJson.data || []
    if (looseData.length === 0) return null
    return (
      looseData.find((c) => (c.name || '').toLowerCase() === name.toLowerCase()) || looseData[0]
    )
  }
  return data.find((c) => (c.name || '').toLowerCase() === name.toLowerCase()) || data[0]
}
