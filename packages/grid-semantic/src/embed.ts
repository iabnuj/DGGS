import { SEMANTIC_CLASSES, type SemanticClass } from "./types"
import { l2Normalize } from "./vector"

const HIST_BINS = 8
/** hist(R)+hist(G)+hist(B) + one-hot class = 24 + 6 */
export const EMBED_DIM = HIST_BINS * 3 + SEMANTIC_CLASSES.length

function classIndex(c: SemanticClass | string | undefined): number {
  if (!c) return SEMANTIC_CLASSES.indexOf("other")
  const i = (SEMANTIC_CLASSES as readonly string[]).indexOf(c)
  return i >= 0 ? i : SEMANTIC_CLASSES.indexOf("other")
}

/**
 * RGB histogram embedding (optional class one-hot).
 * `rgba` is tightly packed RGBA bytes (ignored alpha).
 */
export function embedHistRgba(
  rgba: Uint8Array | number[],
  className?: SemanticClass | string
): number[] {
  const hist = new Array(HIST_BINS * 3).fill(0) as number[]
  const nPix = Math.floor(rgba.length / 4)
  if (nPix > 0) {
    for (let i = 0; i < nPix; i++) {
      const o = i * 4
      for (let c = 0; c < 3; c++) {
        const v = rgba[o + c]!
        const bin = Math.min(HIST_BINS - 1, (v * HIST_BINS) >> 8)
        hist[c * HIST_BINS + bin]! += 1
      }
    }
    for (let i = 0; i < hist.length; i++) hist[i]! /= nPix
  }
  const oneHot = new Array(SEMANTIC_CLASSES.length).fill(0) as number[]
  oneHot[classIndex(className)] = 1
  return l2Normalize([...hist, ...oneHot])
}

/** Text / label → prototype vector in the same space (class one-hot + weak color prior). */
export function embedTextPrototype(text: string): number[] {
  const t = text.trim().toLowerCase()
  let cls: SemanticClass = "other"
  if (/road|道路|公路|路网/.test(t)) cls = "road"
  else if (/build|建筑|房屋|居民/.test(t)) cls = "building"
  else if (/airport|机场|跑道/.test(t)) cls = "airport"
  else if (/target|靶|目标|设施/.test(t)) cls = "target"
  else if (/water|水|河|湖|海/.test(t)) cls = "water"

  // Synthetic mid-gray hist + class one-hot (no image).
  const hist = new Array(HIST_BINS * 3).fill(0) as number[]
  const mid = (HIST_BINS / 2) | 0
  hist[mid] = hist[HIST_BINS + mid] = hist[2 * HIST_BINS + mid] = 1 / 3
  const oneHot = new Array(SEMANTIC_CLASSES.length).fill(0) as number[]
  oneHot[classIndex(cls)] = 1
  return l2Normalize([...hist, ...oneHot])
}

/** Attribute-only embedding when no chip is available. */
export function embedFromClass(className: SemanticClass | string): number[] {
  return embedHistRgba(new Uint8Array(0), className)
}
