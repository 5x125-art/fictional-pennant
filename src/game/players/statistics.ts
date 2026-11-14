function count(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError("成績は0以上の整数で指定してください。");
}
export function battingAverage(hits: number, atBats: number): string {
  count(hits);
  count(atBats);
  if (hits > atBats) throw new RangeError("安打数が打数を超えています。");
  return atBats === 0 ? "—" : (hits / atBats).toFixed(3).replace(/^0/, "");
}
export function earnedRunAverage(earnedRuns: number, outs: number): string {
  count(earnedRuns);
  count(outs);
  return outs === 0 ? "—" : ((earnedRuns * 27) / outs).toFixed(2);
}
/** 小数ではなく、ピリオド以降は端数アウト（1＝1/3回、2＝2/3回）。 */
export function inningsPitched(outs: number): string {
  count(outs);
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}
export function relativeSeason(season: number): string {
  if (!Number.isSafeInteger(season))
    throw new RangeError("シーズン番号が不正です。");
  return season < 0 ? `${-season}シーズン前` : `相対シーズン ${season}`;
}
