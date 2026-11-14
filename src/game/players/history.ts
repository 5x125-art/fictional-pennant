import { SeededRandom } from "../random/seededRandom";
import { generationConfig as config } from "./generationConfig";
import type {
  BattingStats,
  PitcherRole,
  PitchingStats,
  Player,
  Registration,
  SeasonRecord,
} from "./types";

const rules = config.history;
function rate(rng: SeededRandom, range: readonly [number, number]): number {
  return range[0] + rng.next() * (range[1] - range[0]);
}
function battingStats(rng: SeededRandom, games: number): BattingStats {
  const plateAppearances = games * rng.int(...rules.plateAppearancesPerGame);
  const walks = Math.floor(plateAppearances * rate(rng, rules.walkRate));
  const hitByPitches = Math.floor(
    plateAppearances * rate(rng, rules.hitByPitchRate),
  );
  const sacrificeBunts = Math.floor(
    plateAppearances * rate(rng, rules.sacrificeRate),
  );
  const sacrificeFlies = Math.floor(
    plateAppearances * rate(rng, rules.sacrificeRate),
  );
  const atBats =
    plateAppearances - walks - hitByPitches - sacrificeBunts - sacrificeFlies;
  const hits = Math.floor(atBats * rate(rng, rules.battingAverage));
  const doubles = Math.floor(hits * rate(rng, rules.doublesPerHit));
  const triples = Math.floor(hits * rate(rng, rules.triplesPerHit));
  const homeRuns = Math.floor(hits * rate(rng, rules.homeRunsPerHit));
  const reaches = hits + walks + hitByPitches;
  const stolenBases = Math.min(
    reaches - homeRuns,
    Math.floor(games * rate(rng, rules.stolenBasesPerGame)),
  );
  return {
    games,
    plateAppearances,
    atBats,
    hits,
    doubles,
    triples,
    homeRuns,
    walks,
    hitByPitches,
    sacrificeBunts,
    sacrificeFlies,
    strikeouts: Math.min(
      atBats - hits,
      Math.floor(atBats * rate(rng, rules.strikeoutRate)),
    ),
    runs: Math.max(
      homeRuns,
      Math.floor(reaches * rate(rng, rules.runsPerReach)),
    ),
    runsBattedIn: Math.max(
      homeRuns,
      Math.floor(hits * rate(rng, rules.rbiPerHit)),
    ),
    stolenBases,
    caughtStealing: Math.min(
      reaches - homeRuns - stolenBases,
      Math.floor(stolenBases * rate(rng, rules.caughtStealingRate)),
    ),
  };
}
function pitchingStats(
  rng: SeededRandom,
  games: number,
  role: PitcherRole,
): PitchingStats {
  const starts = role === "starter" ? games : 0;
  const outs =
    games *
    rng.between(
      role === "starter" ? rules.starterOutsPerGame : rules.relieverOutsPerGame,
    );
  const hitsAllowed = Math.floor(outs * rate(rng, rules.hitsPerOut));
  const homeRunsAllowed = Math.floor(
    hitsAllowed * rate(rng, rules.homeRunsPerHitAllowed),
  );
  const runsAllowed = Math.max(
    homeRunsAllowed,
    Math.floor(outs * rate(rng, rules.runsPerOut)),
  );
  const decisions = Math.floor(games * rate(rng, rules.decisionsPerGame));
  const wins = rng.int(0, decisions);
  const losses = decisions - wins;
  const available = games - decisions;
  return {
    games,
    starts,
    outs,
    hitsAllowed,
    homeRunsAllowed,
    runsAllowed,
    wins,
    losses,
    earnedRuns: Math.floor(runsAllowed * rate(rng, rules.earnedRunFraction)),
    walks: Math.floor(outs * rate(rng, rules.walksPerOut)),
    strikeouts: Math.min(
      outs,
      Math.floor(outs * rate(rng, rules.strikeoutsPerOut)),
    ),
    saves:
      role === "closer"
        ? Math.floor(available * rate(rng, rules.savesPerRelief))
        : 0,
    holds:
      role === "setup" || role === "middle"
        ? Math.floor(available * rate(rng, rules.holdsPerRelief))
        : 0,
  };
}
export interface HistoryInput {
  readonly age: number;
  readonly teamId: string;
  readonly registration: Registration;
  readonly isForeign: boolean;
  readonly career: Player["career"];
}
function seasonHeaders(input: HistoryInput, rng: SeededRandom) {
  const completed = input.career.completedProSeasons;
  const developmentSeasons =
    input.registration === "development"
      ? completed
      : input.isForeign
        ? 0
        : rng.int(
            rules.developmentSeasons[0],
            Math.min(completed, rules.developmentSeasons[1]),
          );
  return Array.from({ length: completed }, (_, index) => ({
    season: index - completed,
    age: input.career.entryAge + index,
    teamId: input.teamId,
    registration: (index < developmentSeasons
      ? "development"
      : "senior") as Registration,
  }));
}
export function fielderHistory(
  input: HistoryInput,
  rng: SeededRandom,
): SeasonRecord<BattingStats>[] {
  return seasonHeaders(input, rng).map((header) => {
    const firstGames =
      header.registration === "development"
        ? 0
        : rng.int(0, rules.firstTeamGames);
    const farmGames = rng.int(
      0,
      Math.min(rules.farmGames, rules.firstTeamGames - firstGames),
    );
    return {
      ...header,
      firstTeam: battingStats(rng, firstGames),
      farmTeam: battingStats(rng, farmGames),
    };
  });
}
export function pitcherHistory(
  input: HistoryInput,
  role: PitcherRole,
  rng: SeededRandom,
): SeasonRecord<PitchingStats>[] {
  return seasonHeaders(input, rng).map((header) => {
    const range =
      role === "starter"
        ? rules.pitcherGames.starter
        : rules.pitcherGames.reliever;
    const firstGames =
      header.registration === "development" ? 0 : rng.between(range);
    const farmGames = rng.int(
      0,
      Math.min(range[1] - firstGames, rules.farmGames),
    );
    return {
      ...header,
      firstTeam: pitchingStats(rng, firstGames, role),
      farmTeam: pitchingStats(rng, farmGames, role),
    };
  });
}
