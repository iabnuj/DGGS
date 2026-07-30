import type { BBox } from "./types"

function inside(lon: number, lat: number, b: BBox): boolean {
  return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north
}

/** Liang–Barsky clip of one segment to axis-aligned bbox. */
function clipSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  b: BBox
): [number, number, number, number] | null {
  let t0 = 0
  let t1 = 1
  const dx = x1 - x0
  const dy = y1 - y0
  const checks: [number, number][] = [
    [-dx, x0 - b.west],
    [dx, b.east - x0],
    [-dy, y0 - b.south],
    [dy, b.north - y0],
  ]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1) return null
      if (r > t0) t0 = r
    } else {
      if (r < t0) return null
      if (r < t1) t1 = r
    }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy]
}

/**
 * Clip a LineString to a bbox. Returns one or more polylines (disjoint parts).
 */
export function clipLineStringToBBox(
  coords: number[][],
  b: BBox
): number[][][] {
  const parts: number[][][] = []
  let cur: number[][] = []

  const flush = () => {
    if (cur.length >= 2) parts.push(cur)
    cur = []
  }

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!
    const c = coords[i + 1]!
    const clipped = clipSegment(a[0]!, a[1]!, c[0]!, c[1]!, b)
    if (!clipped) {
      flush()
      continue
    }
    const [x0, y0, x1, y1] = clipped
    if (cur.length === 0) {
      cur.push([x0, y0], [x1, y1])
    } else {
      const last = cur[cur.length - 1]!
      if (Math.hypot(last[0]! - x0, last[1]! - y0) > 1e-12) {
        flush()
        cur.push([x0, y0], [x1, y1])
      } else {
        cur.push([x1, y1])
      }
    }
  }
  flush()
  return parts
}

export function pointInBBox(lon: number, lat: number, b: BBox): boolean {
  return inside(lon, lat, b)
}

/** Sutherland–Hodgman clip of a ring against an axis-aligned bbox. */
export function clipRingToBBox(ring: number[][], b: BBox): number[][] {
  if (ring.length < 3) return []
  let output = ring.map((p) => [p[0]!, p[1]!])
  const edges: { inside: (x: number, y: number) => boolean; intersect: (x0: number, y0: number, x1: number, y1: number) => number[] }[] = [
    {
      inside: (x, y) => x >= b.west,
      intersect: (x0, y0, x1, y1) => {
        const t = (b.west - x0) / (x1 - x0 || 1e-15)
        return [b.west, y0 + t * (y1 - y0)]
      },
    },
    {
      inside: (x) => x <= b.east,
      intersect: (x0, y0, x1, y1) => {
        const t = (b.east - x0) / (x1 - x0 || 1e-15)
        return [b.east, y0 + t * (y1 - y0)]
      },
    },
    {
      inside: (_x, y) => y >= b.south,
      intersect: (x0, y0, x1, y1) => {
        const t = (b.south - y0) / (y1 - y0 || 1e-15)
        return [x0 + t * (x1 - x0), b.south]
      },
    },
    {
      inside: (_x, y) => y <= b.north,
      intersect: (x0, y0, x1, y1) => {
        const t = (b.north - y0) / (y1 - y0 || 1e-15)
        return [x0 + t * (x1 - x0), b.north]
      },
    },
  ]

  for (const edge of edges) {
    if (output.length === 0) return []
    const input = output
    output = []
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]!
      const prev = input[(i + input.length - 1) % input.length]!
      const curIn = edge.inside(cur[0]!, cur[1]!)
      const prevIn = edge.inside(prev[0]!, prev[1]!)
      if (curIn) {
        if (!prevIn) output.push(edge.intersect(prev[0]!, prev[1]!, cur[0]!, cur[1]!))
        output.push(cur)
      } else if (prevIn) {
        output.push(edge.intersect(prev[0]!, prev[1]!, cur[0]!, cur[1]!))
      }
    }
  }
  if (output.length && (output[0]![0] !== output[output.length - 1]![0] || output[0]![1] !== output[output.length - 1]![1])) {
    output.push([output[0]![0]!, output[0]![1]!])
  }
  return output.length >= 4 ? output : []
}
