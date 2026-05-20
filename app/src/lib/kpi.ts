// Management score (관리지수) tier colors.
//   9-10 → green   |   7-8 → yellow   |   5-6 → red   |   <5 → black
// score is 0..10 (or undefined when no data → gray).

export function kpiDotColor(score: number | undefined): string {
  if (score === undefined) return 'bg-gray-300'
  if (score >= 9) return 'bg-emerald-500'
  if (score >= 7) return 'bg-yellow-400'
  if (score >= 5) return 'bg-red-500'
  return 'bg-black'
}
