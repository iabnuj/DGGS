import type { GridCellRecord } from "@dggs/grid-ingest"
import {
  MODEL_HIST_V1,
  embedFromClass,
  embedHistRgba,
  embedTextPrototype,
  labelFromSource,
  parseEmbedding,
  searchTopK,
  semanticSourceName,
  stringifyEmbedding,
  type SemanticHit,
  type VectorRecord,
} from "@dggs/grid-semantic"
import { getWarehouse, syncLayersFromWarehouse } from "@/data/warehouseBoot"
import { getDesktopApi } from "@/ipcWarehouse"
import { useAppStore } from "@/state/store"

async function decodeChipToRgba(dataUrl: string): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0)
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
        resolve(new Uint8Array(data.buffer.slice(0)))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

/** Build semantic records from an existing warehouse source (规则识别 + 向量). */
export async function buildSemanticFromSource(originSource: string): Promise<number> {
  const wh = getWarehouse()
  const rows = (await wh.list({ source: originSource })) as GridCellRecord[]
  if (rows.length === 0) return 0

  const cls = labelFromSource(originSource)
  const semSource = semanticSourceName(originSource)
  const api = getDesktopApi()
  const out: GridCellRecord[] = []

  for (const r of rows) {
    let vector = embedFromClass(cls)
    const chipUri =
      r.fragment?.kind === "raster" ? r.fragment.chipUri : undefined
    if (chipUri && api?.readChipDataUrl) {
      try {
        const url = await api.readChipDataUrl(chipUri)
        const rgba = await decodeChipToRgba(url)
        if (rgba) {
          vector = embedHistRgba(rgba, cls)
        }
      } catch {
        /* keep class embedding */
      }
    }

    out.push({
      gridId: r.gridId,
      level: r.level,
      time: r.time,
      source: semSource,
      featureId: r.featureId ?? cls,
      label: r.label ?? cls,
      attrs: {
        ...r.attrs,
        class: cls,
        score: 1,
        embedding: stringifyEmbedding(vector),
        model: MODEL_HIST_V1,
        origin_source: originSource,
      },
      ref: r.ref ?? {
        objectId: r.featureId ?? r.gridId,
        kind: "other",
        uri: `semantic://${originSource}`,
      },
      fragment: r.fragment,
    })
  }

  await wh.put(out)
  await syncLayersFromWarehouse()
  return out.length
}

export async function loadSemanticCorpus(
  sourceFilter?: string
): Promise<VectorRecord[]> {
  const wh = getWarehouse()
  const rows = (await wh.list(
    sourceFilter ? { source: sourceFilter } : undefined
  )) as GridCellRecord[]
  const corpus: VectorRecord[] = []
  for (const r of rows) {
    if (!r.source.startsWith("semantic:")) continue
    const v = parseEmbedding(r.attrs.embedding)
    if (!v) continue
    corpus.push({
      gridId: r.gridId,
      vector: v,
      className: String(r.attrs.class ?? ""),
      source: r.source,
    })
  }
  return corpus
}

export async function searchSemanticText(
  text: string,
  k = 40
): Promise<SemanticHit[]> {
  const corpus = await loadSemanticCorpus()
  if (corpus.length === 0) return []
  return searchTopK(embedTextPrototype(text), corpus, k, 0.2)
}

export async function searchSemanticByGridId(
  gridId: string,
  k = 40
): Promise<SemanticHit[]> {
  const corpus = await loadSemanticCorpus()
  const seed = corpus.find((c) => c.gridId === gridId)
  if (!seed) return []
  return searchTopK(seed.vector, corpus, k, 0.05).filter((h) => h.gridId !== gridId)
}

export function paintSemanticHits(hits: SemanticHit[], label: string) {
  const codes = hits.map((h) => h.gridId)
  useAppStore.getState().setAnalysisResults([
    ...useAppStore.getState().analysisResults.filter((r) => r.label !== label),
    {
      label,
      codes,
      color: "#a78bfa",
    },
  ])
  return codes
}