import type { SemanticClass } from "./types"
import { cosineSimilarity } from "./vector"
import type { SemanticHit, VectorRecord } from "./types"

export function searchTopK(
  query: number[],
  corpus: VectorRecord[],
  k = 20,
  minScore = 0.15
): SemanticHit[] {
  const scored: SemanticHit[] = []
  for (const row of corpus) {
    const score = cosineSimilarity(query, row.vector)
    if (score < minScore) continue
    scored.push({
      gridId: row.gridId,
      score,
      className: row.className,
      source: row.source,
    })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, Math.max(0, k))
}

/** Map warehouse / file source name → semantic class. */
export function labelFromSource(source: string): SemanticClass {
  const s = source.toLowerCase()
  if (/road|公路|路网|street/.test(s)) return "road"
  if (/build|建筑|house|resident/.test(s)) return "building"
  if (/airport|机场|runway/.test(s)) return "airport"
  if (/target|靶|poi|facility/.test(s)) return "target"
  if (/water|river|lake|hydro|水域/.test(s)) return "water"
  if (/field|temp|wind|radar|标量|dem|elev/.test(s)) return "other"
  return "other"
}

export function semanticSourceName(originSource: string): string {
  if (originSource.startsWith("semantic:")) return originSource
  return `semantic:${originSource}`
}
