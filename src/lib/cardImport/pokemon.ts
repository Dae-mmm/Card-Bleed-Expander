import type { ParsedCardLine, ResolvedCardImage } from './types'
import { failureLabel, lineKey, sanitizeFileName, sleep } from './types'

type PokemonCard = {
  id?: string
  name?: string
  number?: string
  set?: { id?: string; name?: string; releaseDate?: string }
  images?: { large?: string; small?: string }
}

type PokemonResponse = {
  data?: PokemonCard[]
}

/**
 * Resolve printings:
 * - set + number → that exact card
 * - set only → that set, prefer exact name
 * - name only → most recent set release
 */
export async function resolvePokemonCards(
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
      const card = await fetchPokemonCard(line)
      if (!card) {
        failures.push({ name: failureLabel(line), reason: 'Not found on Pokémon TCG API' })
      } else {
        const imageUrl = card.images?.large || card.images?.small
        if (!imageUrl) {
          failures.push({ name: failureLabel(line), reason: 'No image on Pokémon TCG API' })
        } else {
          const name = card.name || line.name
          const id = card.id || ''
          foundByKey.set(lineKey(line), {
            name,
            fileName: `${sanitizeFileName(name)}${id ? `-${id}` : ''}.png`,
            imageUrl,
            quantity: 1,
            source: 'pokemon',
            detail: card.set?.id
              ? `${card.set.id.toUpperCase()}${card.number ? ` #${card.number}` : ''}`
              : id || undefined,
          })
        }
      }
    } catch (err) {
      failures.push({
        name: failureLabel(line),
        reason: err instanceof Error ? err.message : 'Pokémon TCG API error',
      })
    }

    onProgress?.(i + 1, entries.length, line.name)
    if (i < entries.length - 1) await sleep(150)
  }

  const expanded: ResolvedCardImage[] = []
  for (const line of lines) {
    const hit = foundByKey.get(lineKey(line))
    if (!hit) continue
    expanded.push({ ...hit, quantity: line.quantity })
  }

  return { resolved: expanded, failures }
}

async function fetchPokemonCard(line: ParsedCardLine): Promise<PokemonCard | null> {
  const safeName = line.name.replace(/"/g, '')
  const parts = [`name:"${safeName}"`]
  if (line.setHint) parts.push(`set.id:${line.setHint.toLowerCase()}`)
  if (line.collectorNumber) parts.push(`number:"${line.collectorNumber}"`)

  const data = await searchPokemon(parts.join(' '))
  if (data.length > 0) {
    return pickBest(data, line)
  }

  // Fallback: looser name (+ optional set)
  const looseParts = [`name:${safeName}`]
  if (line.setHint) looseParts.push(`set.id:${line.setHint.toLowerCase()}`)
  const loose = await searchPokemon(looseParts.join(' '))
  if (loose.length === 0) return null
  return pickBest(loose, line)
}

async function searchPokemon(q: string): Promise<PokemonCard[]> {
  const url =
    `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}` +
    `&pageSize=20&orderBy=-set.releaseDate`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Pokémon TCG API HTTP ${res.status}`)
  const json = (await res.json()) as PokemonResponse
  return json.data || []
}

function pickBest(data: PokemonCard[], line: ParsedCardLine): PokemonCard {
  const exactName = data.filter((c) => (c.name || '').toLowerCase() === line.name.toLowerCase())
  const pool = exactName.length > 0 ? exactName : data

  if (line.collectorNumber) {
    const byNum = pool.find(
      (c) => (c.number || '').toLowerCase() === line.collectorNumber!.toLowerCase(),
    )
    if (byNum) return byNum
  }

  if (line.setHint) {
    const bySet = pool.find(
      (c) => (c.set?.id || '').toLowerCase() === line.setHint!.toLowerCase(),
    )
    if (bySet) return bySet
  }

  // Already ordered by -set.releaseDate → most recent first
  return pool[0]
}
