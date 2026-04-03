export function safeAverage(total: number, count: number) {
  return count > 0 ? total / count : 0;
}

export function percentage(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0;
}
