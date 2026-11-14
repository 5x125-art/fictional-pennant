/** 初期編成の暫定配分。確定した登録上限とは別。能力評価・乱数は使わない。 */
export const initialRosterConfig = {
  pitchers: 15,
  starters: 6,
  fielders: 16,
  catchers: 2,
  perOtherPosition: 2,
} as const;
/** 確定ルール（docs/requirements.md）。初期配分の調整で変更しない。 */
export const rosterRules = {
  senior: 70,
  development: 10,
  firstTeam: 31,
  foreignFirst: 5,
  foreignPitchers: 4,
  foreignFielders: 4,
  foreignExemptionSeasons: 8,
  reentryDays: 10,
  bench: 26,
  foreignBench: 4,
} as const;
