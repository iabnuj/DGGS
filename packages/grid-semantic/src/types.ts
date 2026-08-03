/** Default lightweight model id (RGB histogram + class one-hot). */
export const MODEL_HIST_V1 = "hist-v1"

export const SEMANTIC_CLASSES = [
  "road",
  "building",
  "airport",
  "target",
  "water",
  "other",
] as const

export type SemanticClass = (typeof SEMANTIC_CLASSES)[number]

export type SemanticHit = {
  gridId: string
  score: number
  className?: SemanticClass | string
  source?: string
}

export type VectorRecord = {
  gridId: string
  vector: number[]
  className?: string
  source?: string
}
