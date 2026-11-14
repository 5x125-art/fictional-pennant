export const fieldPositions = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
] as const;
export type FieldPosition = (typeof fieldPositions)[number];
export type Throws = "R" | "L";
export type Bats = Throws | "S";
export type Registration = "senior" | "development";
export type GrowthType = "early" | "standard" | "late";
export type Condition = "絶好調" | "好調" | "普通" | "不調" | "絶不調";
export type PitcherRole = "starter" | "closer" | "setup" | "middle" | "long";
export type PitchType =
  "fastball" | "slider" | "curve" | "changeup" | "fork" | "sinker" | "cutter";
export type CareerBackground =
  "highSchool" | "university" | "corporate" | "independent" | "foreign";

export interface BattingAbilities {
  readonly contactVsRight: number;
  readonly contactVsLeft: number;
  readonly power: number;
  /** 弾道は暫定1〜4。0〜100能力とは別単位。 */
  readonly trajectory: number;
  readonly speed: number;
  readonly stealing: number;
  readonly catching: number;
  readonly throwing: number;
  readonly arm: number;
}
export interface PitchAbilities {
  readonly type: PitchType;
  readonly power: number;
  readonly control: number;
  /** 変化量は暫定0〜7。0〜100能力とは別単位。 */
  readonly movement: number;
}
export interface PitchingAbilities {
  readonly velocityKmh: number;
  readonly control: number;
  readonly stamina: number;
  readonly starterSuitability: number;
  readonly reliefSuitability: number;
  readonly pitches: readonly PitchAbilities[];
}
/** 回ではなくアウト数で保存する（例：4アウト＝1回1/3）。 */
export interface PitchingStats {
  readonly games: number;
  readonly starts: number;
  readonly outs: number;
  readonly hitsAllowed: number;
  readonly homeRunsAllowed: number;
  readonly walks: number;
  readonly strikeouts: number;
  readonly runsAllowed: number;
  readonly earnedRuns: number;
  readonly wins: number;
  readonly losses: number;
  readonly saves: number;
  readonly holds: number;
}
export interface BattingStats {
  readonly games: number;
  readonly plateAppearances: number;
  readonly atBats: number;
  readonly hits: number;
  readonly doubles: number;
  readonly triples: number;
  readonly homeRuns: number;
  readonly walks: number;
  readonly hitByPitches: number;
  readonly sacrificeBunts: number;
  readonly sacrificeFlies: number;
  readonly strikeouts: number;
  readonly runs: number;
  readonly runsBattedIn: number;
  readonly stolenBases: number;
  readonly caughtStealing: number;
}
export interface SeasonRecord<T> {
  /** 新規世界の開始シーズンは0。過去は-1、-2…（実暦年は2B以降）。 */
  readonly season: number;
  readonly age: number;
  readonly teamId: string;
  readonly registration: Registration;
  readonly firstTeam: T;
  readonly farmTeam: T;
}
interface PlayerBase {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly throws: Throws;
  readonly bats: Bats;
  readonly teamId: string;
  readonly registration: Registration;
  readonly contract: {
    readonly years: number;
    readonly annualSalaryManYen: number;
  };
  readonly fitness: number;
  readonly condition: Condition;
  readonly isForeign: boolean;
  readonly career: {
    readonly background: CareerBackground;
    readonly entryAge: number;
    /** 開始時点で完了済みのプロ在籍シーズン数。育成期間を含む。 */
    readonly completedProSeasons: number;
    readonly completedJapanSeasons: number;
  };
}
export interface Fielder extends PlayerBase {
  readonly kind: "fielder";
  readonly primaryPosition: FieldPosition;
  readonly abilities: BattingAbilities;
  readonly positionAptitudes: Readonly<Record<FieldPosition, number>>;
  readonly history: readonly SeasonRecord<BattingStats>[];
}
export interface Pitcher extends PlayerBase {
  readonly kind: "pitcher";
  readonly primaryPosition: "P";
  readonly role: PitcherRole;
  readonly abilities: PitchingAbilities;
  readonly history: readonly SeasonRecord<PitchingStats>[];
}
/** 現在能力・経歴など公開可能な選手情報。二刀流は定義しない。 */
export type Player = Fielder | Pitcher;
export interface FielderDevelopment {
  readonly kind: "fielder";
  readonly growthType: GrowthType;
  readonly abilityCaps: Readonly<BattingAbilities>;
}
export interface PitcherDevelopment {
  readonly kind: "pitcher";
  readonly growthType: GrowthType;
  readonly abilityCaps: PitchingAbilities;
}
/** 守備位置習得の個人別上限は持たせない。UIにはこのデータを渡さない。 */
export type PlayerDevelopment = FielderDevelopment | PitcherDevelopment;
export interface InitialPlayerWorld {
  readonly generationVersion: 1;
  readonly phase: "awaitingClubSelection";
  readonly seed: number;
  readonly randomState: number;
  readonly players: readonly Player[];
  readonly developmentByPlayerId: Readonly<Record<string, PlayerDevelopment>>;
}
