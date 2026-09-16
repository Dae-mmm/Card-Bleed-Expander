import type { LocalCard } from '../localFiles'
import { resolveMtgCards } from './scryfall'
import { resolvePokemonCards } from './pokemon'
import { resolveYugiohCards } from './yugioh'
import {
  downloadAsFile,
  parseCardList,
  sanitizeFileName,
  sleep,
  type CardGame,
  type ImportProgress,
  type ImportResult,
  type ResolvedCardImage,
} from './types'

export type { CardGame, ImportProgress, ImportResult }

export async function importCardList(
  text: string,
  game: CardGame,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const parsed = parseCardList(text)
  if (parsed.length === 0) {
    return { cards: [], failures: [{ name: '(list)', reason: 'No card lines found' }] }
  }

  const reportResolve = (current: number, total: number, label: string) => {
    onProgress?.({ phase: 'resolve', current, total, label })
  }

  let resolved: ResolvedCardImage[] = []
  let failures: { name: string; reason: string }[] = []

  if (game === 'mtg') {
    ;({ resolved, failures } = await resolveMtgCards(parsed, reportResolve))
  } else if (game === 'pokemon') {
    ;({ resolved, failures } = await resolvePokemonCards(parsed, reportResolve))
  } else {
    ;({ resolved, failures } = await resolveYugiohCards(parsed, reportResolve))
  }

  const cards: LocalCard[] = []
  const downloadJobs: ResolvedCardImage[] = []

  for (const item of resolved) {
    for (let i = 0; i < item.quantity; i++) {
      downloadJobs.push(item)
    }
  }

  for (let i = 0; i < downloadJobs.length; i++) {
    const item = downloadJobs[i]
    onProgress?.({
      phase: 'download',
      current: i,
      total: downloadJobs.length,
      label: item.name,
    })

    try {
      const copiesBefore = downloadJobs.slice(0, i).filter((c) => c.name === item.name).length
      const suffix = item.quantity > 1 || copiesBefore > 0 ? `-${copiesBefore + 1}` : ''
      const base = sanitizeFileName(item.fileName.replace(/\.[^.]+$/, ''))
      const ext = item.fileName.includes('.') ? item.fileName.slice(item.fileName.lastIndexOf('.')) : '.png'
      const fileName = `${base}${suffix}${ext}`
      const file = await downloadAsFile(item.imageUrl, fileName)
      const id = `import/${game}/${fileName}-${i}`
      cards.push({ id, name: fileName, file })
    } catch (err) {
      failures.push({
        name: item.name,
        reason: err instanceof Error ? err.message : 'Download failed',
      })
    }

    onProgress?.({
      phase: 'download',
      current: i + 1,
      total: downloadJobs.length,
      label: item.name,
    })
    if (i < downloadJobs.length - 1) await sleep(60)
  }

  return { cards, failures }
}
