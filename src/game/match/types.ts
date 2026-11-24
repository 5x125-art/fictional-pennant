import type {
  BattingStats,
  Fielder,
  FieldPosition,
  Pitcher,
  PitcherRole,
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
export const playOutcomes = [...outcomes, "groundDoublePlay", "sacrificeFly", "sacrificeBunt", "reachedOnError"] as const;
export type PlateAppearanceOutcome = (typeof playOutcomes)[number];
export interface RunnerMovement {
  readonly playerId: string;
  readonly from: 0 | 1 | 2 | 3;
  readonly to: 1 | 2 | 3 | "score" | "out";
  readonly outKind?: "batter" | "force" | "tag";
  readonly extraAdvance?: ExtraAdvanceEvent;
  readonly extraAdvanceTarget?: 3 | "score";
  readonly extraAdvanceAttempted?: boolean;
  readonly advanceBlocked?: "occupied" | "thirdOut" | "walkOff";
}
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
export interface PitcherFatigueLevel {
  readonly pitches: number;
  readonly stamina: number;
  readonly onsetPitches: number;
  readonly fatigue: number;
  readonly stage: number;
}
export interface PitcherFatigueAdjustments {
  /** 基礎能力から差し引く暫定量。下限到達時の実差分は有効能力と基礎能力で照合する。 */
  readonly velocityKmh: number;
  readonly control: number;
  readonly pitchPower: number;
  readonly pitchControl: number;
}
export interface PitcherFatigueState extends PitcherFatigueLevel {
  readonly pitcherId: string;
  readonly effectivePitcher: MatchPitcher;
  readonly adjustments: PitcherFatigueAdjustments;
}
export interface PitcherFatigueLog {
  readonly before: PitcherFatigueState;
  readonly after: PitcherFatigueState;
}
export interface PlateAppearanceContext {
  readonly eventIndex: number;
  readonly battingOrderSlot: number;
  readonly batter: MatchBatter;
  readonly pitcher: MatchPitcher;
  readonly pitcherFatigue: PitcherFatigueState;
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
  readonly scoredRuns: readonly RunnerResponsibility[];
  readonly runsBattedIn: number;
  readonly estimatedPitches: number;
  readonly outsRecorded: number;
  readonly movements: readonly RunnerMovement[];
  readonly defense: DefenseEvent | null;
  readonly playSequence: readonly PlayMoment[];
  readonly pitcherFatigue: PitcherFatigueLog;
  readonly responsibilities: readonly RunnerResponsibility[];
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
  /** 暫定の失策なし再構成値。正式裁定ではない（MatchResult.earnedRunMethod参照）。 */
  readonly earnedRuns: number;
  readonly hitBatters: number;
  readonly pitches: number;
}
export type EndReason =
  "regulation" | "extraInnings" | "walkOff" | "twelveInningDraw";
export interface PitchingDecision {
  readonly status: "adjudicated" | "draw" | "provisional" | "unadjudicated";
  readonly reason: string;
  readonly winPitcherId: string | null;
  readonly lossPitcherId: string | null;
  readonly savePitcherId: string | null;
  readonly holdPitcherIds: readonly string[];
  readonly decisiveRun: {
    readonly eventIndex: number;
    readonly runIndex: number;
    readonly runner: RunnerResponsibility;
    readonly pitcherOfRecordId: string;
  } | null;
  readonly judgment: {
    readonly reason: "shortStarter" | "briefIneffectiveRelief";
    readonly candidates: readonly {
      readonly pitcherId: string;
      readonly outs: number;
      readonly runsAllowed: number;
      readonly earnedRuns: number;
      /** 登板中に相手が挙げた得点。引継ぎ走者も含む。 */
      readonly runsWhilePitching: number;
    }[];
  } | null;
}
export interface MatchResult {
  readonly engineVersion: 9;
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
  readonly pitcherFatigueByPlayerId: Readonly<Record<string, PitcherFatigueState>>;
  /** 完了した打席だけ。従来のindexはこの配列内の番号を維持する。 */
  readonly events: readonly PlateAppearanceEvent[];
  readonly stealingEvents: readonly StealingEvent[];
  readonly timeline: readonly MatchTimelineEntry[];
  readonly pitchingChanges: readonly PitchingChangeEvent[];
  readonly pitcherAppearances: readonly PitcherAppearance[];
  readonly pitchingDecision: PitchingDecision;
  readonly fieldingByPlayerId: Readonly<Record<string, MatchFieldingStats>>;
  readonly earnedRunMethod: "reconstructedInningApproximation";
  readonly finalState: Situation;
  readonly random: {
    readonly seed: number;
    readonly initialState: number;
    readonly finalState: number;
  };
}
export interface DefenseFielder {
  readonly id: string;
  readonly position: FieldPosition;
  readonly catching: number;
  readonly throwing: number;
  readonly aptitude: number;
}
export type DefenseAction = "none" | "hitPrevented" | "catchingError" | "throwingError";
export interface DefenseContext {
  readonly eventIndex: number;
  readonly battedBall: "ground" | "fly";
  readonly drawnOutcome: PlateAppearanceOutcome;
  readonly fielder: DefenseFielder;
}
export interface DefenseEvent extends DefenseContext {
  readonly hitPrevented: boolean;
  readonly error: boolean;
  readonly errorKind: "catching" | "throwing" | null;
  readonly errorPlayerId: string | null;
}
export interface MatchFieldingStats {
  readonly chances: number;
  readonly hitsPrevented: number;
  readonly errors: number;
  readonly catchingErrors: number;
  readonly throwingErrors: number;
}
export type BaserunningAction = "hold" | "safe" | "out";
export interface ThrowingFielder {
  readonly id: string;
  readonly position: "LF" | "CF" | "RF";
  readonly arm: number;
  readonly throwing: number;
  readonly aptitude: number;
}
export interface BaserunningContext {
  readonly eventIndex: number;
  readonly runnerId: string;
  readonly from: 1 | 2;
  readonly target: 3 | "score";
  readonly outcome: "single" | "double";
  readonly outs: number;
  readonly battedBall: "ground" | "fly";
  readonly speed: number;
  readonly fielder: ThrowingFielder;
}
export interface ExtraAdvanceEvent extends BaserunningContext {
  readonly action: BaserunningAction;
  readonly attempted: boolean;
  readonly outPlayerId: string | null;
  readonly probabilities: { readonly attempt: number; readonly out: number };
}
/** 配列順が成立順。フォース／打者走者の一塁到達前の第3アウトは全得点を無効にする。 */
export interface PlayMoment {
  readonly playerId: string;
  readonly type: "score" | "out";
  readonly outKind?: "batter" | "force" | "tag";
}
export interface StealCatcher {
  readonly id: string;
  readonly position: "C";
  readonly arm: number;
  readonly throwing: number;
  readonly aptitude: number;
}
export interface StealRunner {
  readonly id: string;
  readonly speed: number;
  readonly stealing: number;
}
export interface StealCandidate extends StealRunner {
  readonly from: 1 | 2;
  readonly to: 2 | 3;
  readonly probabilities: {readonly attempt: number; readonly success: number};
}
export interface StealingContext {
  /** 次の完了打席番号。盗塁死で交代した場合も増えない。 */
  readonly plateAppearanceIndex: number;
  readonly before: Situation;
  readonly batterId: string;
  readonly pitcherId: string;
  readonly catcher: StealCatcher;
  readonly candidates: readonly StealCandidate[];
}
export type StealingDecision = {readonly action: "hold"} |
  {readonly action: "safe" | "out"; readonly runnerId: string};
export interface StealingEvent extends StealingContext {
  readonly index: number;
  readonly battingTeamId: string;
  readonly fieldingTeamId: string;
  readonly battingOrderSlot: number;
  readonly after: Situation;
  readonly candidate: StealCandidate | null;
  readonly action: "hold" | "safe" | "out";
  readonly reason: "noEligibleRunner" | "hold" | "attempt";
  readonly attempted: boolean;
  readonly outsRecorded: 0 | 1;
  readonly movements: readonly RunnerMovement[];
  /** 完了打席の推定球数と重複しない追加分。第3アウトの盗塁死だけ1球。 */
  readonly estimatedPitches: number;
  readonly pitcherFatigue: PitcherFatigueLog;
  readonly responsibilities: readonly RunnerResponsibility[];
  readonly plateAppearanceCompleted: false;
  readonly endedHalfInning: boolean;
}
export interface RunnerResponsibility {
  readonly token: string;
  readonly playerId: string;
  readonly responsiblePitcherId: string;
}
export interface AvailablePitcher extends MatchPitcher {
  readonly role: PitcherRole;
}
export interface PitchingChangeContext {
  readonly eventIndex: number;
  readonly timelineIndex: number;
  readonly before: Situation;
  readonly battingTeamId: string;
  readonly fieldingTeamId: string;
  readonly batter: MatchBatter;
  readonly currentPitcherId: string;
  readonly currentPitcher: AvailablePitcher;
  readonly currentAppearance: PitcherAppearance;
  readonly currentFatigue: PitcherFatigueState;
  readonly currentStats: MatchPitchingStats;
  readonly availablePitchers: readonly AvailablePitcher[];
  readonly responsibilities: readonly RunnerResponsibility[];
}
export type PitchingChangeDecision = {readonly action: "continue"} |
  {readonly action: "change"; readonly pitcherId: string};
export interface PitchingChangeEvent extends PitchingChangeContext {
  readonly batterId: string;
  readonly index: number;
  readonly plateAppearanceIndex: number;
  readonly after: Situation;
  readonly pitcherId: string;
  readonly outgoingPitcherId: string;
  readonly incomingPitcherId: string;
  readonly incomingFatigue: PitcherFatigueState;
  readonly reason: "explicitInstruction" | AIPitchingChangeReason;
  readonly decisionSource: "explicit" | "ai";
  readonly ai?: AIPitchingAssessment;
  readonly estimatedPitches: 0;
  readonly outsRecorded: 0;
}
export interface PitcherAppearance {
  readonly pitcherId: string;
  readonly teamId: string;
  readonly role: PitcherRole;
  readonly starter: boolean;
  readonly entryTimelineIndex: number | null;
  readonly entry: Situation | null;
  readonly exitTimelineIndex: number | null;
  readonly exit: Situation | null;
}
export type MatchTimelineEntry =
  {readonly type: "plateAppearance"; readonly event: PlateAppearanceEvent} |
  {readonly type: "stealing"; readonly event: StealingEvent} |
  {readonly type: "pitchingChange"; readonly event: PitchingChangeEvent};
export interface AIPitchingStrategy {
  /** 試合計算だけの積極度0〜1。保存型・正式チーム設定には接続しない。 */
  readonly aggression: number;
}
export type AIPitchingChangeReason = "autoFatigue" | "autoWorkload" | "autoEarlyExit" | "autoHighLeverage";
export interface AIPitchingCandidateComparison {
  readonly pitcherId: string;
  readonly role: PitcherRole;
  readonly ability: number;
  readonly roleFit: number;
  readonly staminaFit: number;
  readonly handedness: number;
  readonly total: number;
}
export interface AIPitchingAssessment {
  readonly decision: PitchingChangeDecision;
  readonly reason: AIPitchingChangeReason | "noCandidates" | "lowWorkload" | "reserveBullpen" | "protectShortStint";
  readonly lead: number;
  readonly close: boolean;
  readonly extraInnings: boolean;
  readonly aggression: number;
  readonly pitchBudget: number;
  readonly pressure: number;
  readonly threshold: number;
  readonly candidates: readonly AIPitchingCandidateComparison[];
}
export interface MatchOptions {
  readonly autoPitching?: boolean;
  readonly pitchingStrategy?: AIPitchingStrategy;
  readonly resolvePitchingChange?: (context: PitchingChangeContext) => PitchingChangeDecision;
  /** 各打席開始前に最大1回。候補外走者の指定・不明な結果は拒否する。 */
  readonly resolveStealing?: (context: StealingContext) => StealingDecision;
  /** 対象走者だけに呼ぶ。hold／safe／out以外は明示拒否する。 */
  readonly resolveBaserunning?: (context: BaserunningContext) => BaserunningAction;

  /** 守備対象打球だけで呼ぶ決定的テスト注入。打席注入のみの場合は守備抽選しない。 */
  readonly resolveDefense?: (context: DefenseContext) => DefenseAction;

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
