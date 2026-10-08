// 1284 -> "1.3K", 12900 -> "12.9K"
export function compactNumber(n: number): string {
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
