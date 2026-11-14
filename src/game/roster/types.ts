/** 世界開始からの通算相対日。暦年・シーズン境界でもリセットしない。 */
export type GameDay = number;
export type Squad = "first" | "farm";
export interface TeamRoster {
  readonly firstTeamIds: readonly string[];
}
export interface RosterState {
  readonly currentDay: GameDay;
  readonly byTeam: Readonly<Record<string, TeamRoster>>;
  readonly deregisteredOnByPlayerId: Readonly<Record<string, GameDay>>;
}
export type RosterCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly string[] };
export type RosterChange =
  | { readonly ok: true; readonly state: RosterState }
  | { readonly ok: false; readonly reasons: readonly string[] };
