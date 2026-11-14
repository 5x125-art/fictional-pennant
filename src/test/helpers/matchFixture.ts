import type { Player } from "../../game/players/types";
import type { RosterState } from "../../game/roster/types";
import { teams } from "../../data/teams";
import { generateInitialPlayerWorld } from "../../game/players/generate";
import { fieldPositions } from "../../game/players/types";
import { createInitialRosters, isFirstTeam } from "../../game/roster/roster";
import type {
  MatchInput,
  MatchTeamInput,
  PlateAppearanceOutcome,
} from "../../game/match/types";
/** テスト専用。明示したC→1B→2B→3B→SS→LF→CF→RF→DHの順で固定する。
 * 能力比較やAI選択は行わず、製品コードからは利用しない。 */
export const matchFixtureWorld = generateInitialPlayerWorld(786421);
export const matchFixtureRoster = createInitialRosters(
  matchFixtureWorld.players,
);
export function fixtureTeam(
  teamId: string,
  players: readonly Player[] = matchFixtureWorld.players,
  roster: RosterState = matchFixtureRoster,
): MatchTeamInput {
  const available = players.filter(
    (p) => p.teamId === teamId && isFirstTeam(roster, teamId, p.id),
  );
  const entries = fieldPositions.map((position) => ({
    position,
    playerId: available.find(
      (p) => p.kind === "fielder" && p.primaryPosition === position,
    )!.id,
  }));
  const dh = available.find(
    (p) => p.kind === "fielder" && !entries.some((e) => e.playerId === p.id),
  )!;
  const pitcher = available.find(
    (p) => p.kind === "pitcher" && p.role === "starter",
  )!;
  const battingOrder = [
    ...entries,
    { position: "DH" as const, playerId: dh.id },
  ];
  return {
    teamId,
    battingOrder,
    startingPitcherId: pitcher.id,
    availablePlayerIds: [...battingOrder.map((e) => e.playerId), pitcher.id],
  };
}
export function matchFixture(
  seed = 3741,
  away = teams[0].id,
  home = teams[1].id,
): MatchInput {
  return {
    seed,
    away: fixtureTeam(away),
    home: fixtureTeam(home),
    players: matchFixtureWorld.players,
    roster: matchFixtureRoster,
  };
}
export function fixedHalves(
  scripts: Record<string, readonly PlateAppearanceOutcome[]>,
) {
  const indices = new Map<string, number>();
  return (context: {
    before: { inning: number; half: string };
  }): PlateAppearanceOutcome => {
    const key = `${context.before.inning}-${context.before.half}`,
      index = indices.get(key) ?? 0;
    indices.set(key, index + 1);
    return scripts[key]?.[index] ?? "groundOut";
  };
}
