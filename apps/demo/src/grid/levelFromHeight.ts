/** Map camera height (meters) → GeoSOT level for auto mode. */
export function levelFromHeight(height: number): number {
  if (height > 8_000_000) return 6
  if (height > 3_000_000) return 8
  if (height > 1_200_000) return 10
  if (height > 500_000) return 11
  if (height > 200_000) return 12
  if (height > 80_000) return 13
  if (height > 30_000) return 14
  if (height > 12_000) return 15
  return 16
}
