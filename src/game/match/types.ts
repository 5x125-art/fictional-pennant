import type {
  BattingStats,
  Fielder,
  FieldPosition,
  Pitcher,
  PitchingStats,
  Player,
} from "../players/types";
import type { RosterState } from "../roster/types";
export const outcomes = [
  "single",
  "double",
  "triple",
  "homeRun",
  "walk",
  "hitByPitch",
  "strikeout",
  "groundOut",
  "flyOut",
] as const;
export type PlateAppearanceOutcome = (typeof outcomes)[number];
export type Side = "away" | "home";
export type Half = "top" | "bottom";
export type Bases = readonly [string | null, string | null, string | null];
export interface LineupEntry {
  readonly playerId: string;
  readonly position: FieldPosition | "DH";
}
export interface MatchTeamInput {
  readonly teamId: string;
  /** 当日利用可能なベンチID。自動選定は行わない。 */
  readonly availablePlayerIds: readonly string[];
  /** 配列順が打順1〜9番。 */
  readonly battingOrder: readonly LineupEntry[];
  readonly startingPitcherId: string;
}
export interface MatchInput {
  readonly away: MatchTeamInput;
  readonly home: MatchTeamInput;
  readonly players: readonly Player[];
  readonly roster: RosterState;
  /** 正式セーブのPRNG状態とは独立した、試合専用uint32シード。 */
  readonly seed: number;
}
export type MatchBatter = Pick<Fielder, "id" | "teamId" | "bats" | "abilities">;
export type MatchPitcher = Pick<
  Pitcher,
  "id" | "teamId" | "throws" | "abilities"
>;
export interface Situation {
  readonly inning: number;
  readonly half: Half;
  readonly outs: number;
  readonly bases: Bases;
  readonly score: Readonly<Record<Side, number>>;
  /** 次に打つ打者の0〜8インデックス。 */
  readonly nextBatterIndex: Readonly<Record<Side, number>>;
}
export interface PlateAppearanceContext {
  readonly eventIndex: number;
  readonly battingOrderSlot: number;
  readonly batter: MatchBatter;
  readonly pitcher: MatchPitcher;
  readonly before: Situation;
}
export interface PlateAppearanceEvent {
  readonly index: number;
  readonly inning: number;
  readonly half: Half;
  readonly battingTeamId: string;
  readonly fieldingTeamId: string;
  readonly battingOrderSlot: number;
  readonly batterId: string;
  readonly pitcherId: string;
  readonly drawnOutcome: PlateAppearanceOutcome;
  /** サヨナラ非HRは勝越点までに到達した安打種別。 */
  readonly outcome: PlateAppearanceOutcome;
  readonly before: Situation;
  readonly after: Situation;
  readonly scoredPlayerIds: readonly string[];
  readonly runsBattedIn: number;
  readonly estimatedPitches: number;
}
export interface HalfInningResult {
  readonly inning: number;
  readonly half: Half;
  readonly runs: number;
  readonly outs: number;
  readonly leftOnBaseIds: readonly string[];
  readonly endedBy: "threeOuts" | "walkOff";
}
export interface InningScore {
  readonly inning: number;
  readonly away: number;
  readonly home: number | null;
}
export interface MatchBattingStats extends BattingStats {
  readonly singles: number;
}
export interface MatchPitchingStats extends PitchingStats {
  readonly hitBatters: number;
  readonly pitches: number;
}
export type EndReason =
  "regulation" | "extraInnings" | "walkOff" | "twelveInningDraw";
export interface MatchResult {
  readonly engineVersion: 1;
  readonly status: "completed";
  readonly awayTeamId: string;
  readonly homeTeamId: string;
  readonly winnerTeamId: string | null;
  readonly endReason: EndReason;
  readonly score: Readonly<Record<Side, number>>;
  /** 未実施の裏はnull。実施した無得点回は0。 */
  readonly innings: readonly InningScore[];
  readonly halfInnings: readonly HalfInningResult[];
  readonly battingByPlayerId: Readonly<Record<string, MatchBattingStats>>;
  readonly pitchingByPlayerId: Readonly<Record<string, MatchPitchingStats>>;
  readonly events: readonly PlateAppearanceEvent[];
  readonly finalState: Situation;
  readonly random: {
    readonly seed: number;
    readonly initialState: number;
    readonly finalState: number;
  };
}
export interface MatchOptions {
  /** 規則の検証用。未指定なら能力・試合専用PRNGで抽選。 */
  readonly resolvePlateAppearance?: (
    context: PlateAppearanceContext,
  ) => PlateAppearanceOutcome;
}
export class MatchInputError extends Error {
  readonly name = "MatchInputError";
}
export class MatchSimulationError extends Error {
  readonly name = "MatchSimulationError";
}
