/** L2-normalize in place copy. */
export function l2Normalize(v: number[]): number[] {
  let s = 0
  for (const x of v) s += x * x
  const n = Math.sqrt(s)
  if (!(n > 0)) return v.map(() => 0)
  return v.map((x) => x / n)
}

/** Cosine similarity; assumes non-empty same-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    dot += x * y
    na += x * x
    nb += y * y
  }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  if (!(d > 0)) return 0
  return dot / d
}

export function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw) && raw.every((x) => typeof x === "number")) {
    return raw as number[]
  }
  if (typeof raw === "string" && raw.startsWith("[")) {
    try {
      const v = JSON.parse(raw) as unknown
      if (Array.isArray(v) && v.every((x) => typeof x === "number")) return v
    } catch {
      return null
    }
  }
  return null
}

export function stringifyEmbedding(v: number[]): string {
  return JSON.stringify(v)
}
