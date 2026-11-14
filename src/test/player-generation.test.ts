import assert from "node:assert/strict";
import { describe, expect, it, vi } from "vitest";
import { teams } from "../data/teams";
import { SeededRandom } from "../game/random/seededRandom";
import { generateInitialPlayerWorld } from "../game/players/generate";
import { generationConfig as config } from "../game/players/generationConfig";
import { abilityRank } from "../game/players/rank";
import {
  fieldPositions,
  type BattingStats,
  type PitchingStats,
  type Player,
} from "../game/players/types";

function integerIn(value: number, min: number, max: number) {
  assert(
    Number.isInteger(value) && value >= min && value <= max,
    `範囲外の整数: ${value} (${min}〜${max})`,
  );
}
function battingConsistency(stats: BattingStats) {
  for (const value of Object.values(stats)) integerIn(value, 0, 1000);
  assert.equal(
    stats.atBats +
      stats.walks +
      stats.hitByPitches +
      stats.sacrificeBunts +
      stats.sacrificeFlies,
    stats.plateAppearances,
  );
  assert(stats.hits <= stats.atBats);
  assert(stats.doubles + stats.triples + stats.homeRuns <= stats.hits);
  assert(stats.strikeouts + stats.hits <= stats.atBats);
  assert(stats.runs >= stats.homeRuns);
  assert(stats.runsBattedIn >= stats.homeRuns);
  if (stats.games === 0)
    assert(Object.values(stats).every((value) => value === 0));
}
function pitchingConsistency(stats: PitchingStats) {
  for (const value of Object.values(stats)) integerIn(value, 0, 1000);
  assert(stats.starts <= stats.games);
  assert(stats.wins + stats.losses + stats.saves + stats.holds <= stats.games);
  assert(stats.saves + stats.holds <= stats.games - stats.starts);
  assert(stats.homeRunsAllowed <= stats.hitsAllowed);
  assert(stats.earnedRuns <= stats.runsAllowed);
  assert(stats.homeRunsAllowed <= stats.runsAllowed);
  assert(stats.strikeouts <= stats.outs);
  if (stats.games === 0)
    assert(Object.values(stats).every((value) => value === 0));
}
const world = generateInitialPlayerWorld(20261114);

describe("シード付き乱数", () => {
  it("既知の系列と一致し、状態のJSON保存・復元で続きを再現する", () => {
    const rng = new SeededRandom(1);
    expect(rng.next()).toBe(0.6270739405881613);
    rng.next();
    const restored = new SeededRandom(
      JSON.parse(JSON.stringify(rng.getState())),
    );
    expect(Array.from({ length: 50 }, () => restored.next())).toEqual(
      Array.from({ length: 50 }, () => rng.next()),
    );
  });
  it("境界シードと整数範囲を扱い、不正入力を拒否する", () => {
    for (const seed of [0, 0xffffffff]) {
      const rng = new SeededRandom(seed);
      for (let i = 0; i < 100; i++) {
        const value = rng.next();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
        integerIn(rng.int(-2, 2), -2, 2);
      }
      expect(rng.int(3, 3)).toBe(3);
    }
    for (const seed of [-1, 0x100000000, 1.5, NaN, Infinity])
      expect(() => new SeededRandom(seed)).toThrow(RangeError);
    const rng = new SeededRandom(0);
    expect(() => rng.int(2, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});

describe("共通能力ランク（暫定境界）", () => {
  it.each([
    [0, "G"],
    [29, "G"],
    [30, "F"],
    [39, "F"],
    [40, "E"],
    [49, "E"],
    [50, "D"],
    [59, "D"],
    [60, "C"],
    [69, "C"],
    [70, "B"],
    [79, "B"],
    [80, "A"],
    [89, "A"],
    [90, "S"],
    [100, "S"],
  ] as const)("%i → %s", (value, rank) =>
    expect(abilityRank(value)).toBe(rank),
  );
  it.each([-1, 101, NaN, Infinity, 50.5])("不正能力 %s を拒否する", (value) =>
    expect(() => abilityRank(value)).toThrow(RangeError),
  );
});

describe("12球団の架空選手生成", () => {
  it.each([0, 20261114, 0xffffffff])(
    "シード %i: 球団別人数・ID・守備の構成を満たす",
    (seed) => {
      const generated =
        seed === world.seed ? world : generateInitialPlayerWorld(seed);
      expect(generated.players).toHaveLength(912);
      expect(new Set(generated.players.map((player) => player.id)).size).toBe(
        912,
      );
      expect(Object.keys(generated.developmentByPlayerId).sort()).toEqual(
        generated.players.map((player) => player.id).sort(),
      );
      expect(generated.phase).toBe("awaitingClubSelection");
      expect(generated).not.toHaveProperty("managedTeamId");
      for (const team of teams) {
        const roster = generated.players.filter(
          (player) => player.teamId === team.id,
        );
        expect(roster).toHaveLength(76);
        expect(
          roster.filter((player) => player.registration === "senior"),
        ).toHaveLength(68);
        expect(
          roster.filter((player) => player.registration === "development"),
        ).toHaveLength(8);
        expect(
          roster.filter((player) => player.registration === "senior").length,
        ).toBeLessThanOrEqual(70);
        expect(
          roster.filter((player) => player.registration === "development")
            .length,
        ).toBeLessThanOrEqual(10);
        expect(
          roster.filter((player) => player.kind === "pitcher"),
        ).toHaveLength(38);
        expect(
          roster.filter((player) => player.kind === "fielder"),
        ).toHaveLength(38);
        for (const position of fieldPositions)
          expect(
            roster.filter((player) => player.primaryPosition === position)
              .length,
          ).toBeGreaterThanOrEqual(4);
        expect(roster.filter((player) => player.isForeign)).toHaveLength(4);
        for (const player of roster) {
          if (player.kind === "fielder") {
            expect(
              player.positionAptitudes[player.primaryPosition],
            ).toBeGreaterThanOrEqual(60);
            expect(Object.keys(player.positionAptitudes).sort()).toEqual(
              [...fieldPositions].sort(),
            );
            for (const value of Object.values(player.positionAptitudes))
              integerIn(value, 0, 100);
            if (player.throws === "L")
              for (const position of ["C", "2B", "3B", "SS"] as const)
                expect(player.positionAptitudes[position]).toBe(0);
            expect(player).not.toHaveProperty("role");
          } else {
            expect(player.primaryPosition).toBe("P");
            expect(player).not.toHaveProperty("positionAptitudes");
          }
        }
      }
    },
  );
  it("同一シードは時刻や外部乱数に依存せず完全一致し、異なるシードでは選手内容も変わる", () => {
    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("外部乱数禁止");
    });
    try {
      expect(generateInitialPlayerWorld(world.seed)).toEqual(world);
      const other = generateInitialPlayerWorld(world.seed + 1);
      expect(other.players.map(({ id, ...rest }) => rest)).not.toEqual(
        world.players.map(({ id, ...rest }) => rest),
      );
      expect(JSON.parse(JSON.stringify(world))).toEqual(world);
      expect(new SeededRandom(world.randomState).next()).toBe(
        new SeededRandom(
          generateInitialPlayerWorld(world.seed).randomState,
        ).next(),
      );
    } finally {
      spy.mockRestore();
    }
  });
  it("個別能力・単位・球種・非公開成長上限の範囲と独立性を満たす", () => {
    for (const player of world.players) {
      const hidden = world.developmentByPlayerId[player.id];
      expect(hidden.kind).toBe(player.kind);
      expect(["early", "standard", "late"]).toContain(hidden.growthType);
      expect(player).not.toHaveProperty("growthType");
      expect(player).not.toHaveProperty("abilityCaps");
      expect(hidden).not.toHaveProperty("positionAptitudes");
      expect(hidden.abilityCaps).not.toBe(player.abilities);
      if (player.kind === "fielder" && hidden.kind === "fielder") {
        for (const [key, current] of Object.entries(player.abilities)) {
          const max = key === "trajectory" ? 4 : 100;
          integerIn(current, key === "trajectory" ? 1 : 0, max);
          integerIn(
            hidden.abilityCaps[key as keyof typeof player.abilities],
            current,
            max,
          );
        }
      } else if (player.kind === "pitcher" && hidden.kind === "pitcher") {
        const { pitches, ...abilities } = player.abilities;
        for (const [key, current] of Object.entries(abilities)) {
          const max = key === "velocityKmh" ? 165 : 100;
          integerIn(current, key === "velocityKmh" ? 125 : 0, max);
          integerIn(
            hidden.abilityCaps[key as keyof typeof abilities],
            current,
            max,
          );
        }
        integerIn(pitches.length, 3, 5);
        expect(new Set(pitches.map((pitch) => pitch.type)).size).toBe(
          pitches.length,
        );
        expect(pitches.some((pitch) => pitch.type === "fastball")).toBe(true);
        expect(hidden.abilityCaps.pitches).not.toBe(pitches);
        pitches.forEach((pitch, index) => {
          const cap = hidden.abilityCaps.pitches[index];
          expect(config.pitchTypes).toContain(pitch.type);
          expect(cap.type).toBe(pitch.type);
          for (const key of ["power", "control", "movement"] as const) {
            const max = key === "movement" ? 7 : 100;
            integerIn(pitch[key], 0, max);
            integerIn(cap[key], pitch[key], max);
          }
        });
      } else throw new Error("公開情報と非公開情報の種別が不一致");
    }
  });
  it("年齢・入団経歴・プロ在籍年数・単年契約・架空年度成績が整合する", () => {
    for (const player of world.players) {
      integerIn(player.age, 18, 40);
      if (player.registration === "development")
        expect(player.age).toBeLessThanOrEqual(25);
      expect(player.contract.years).toBe(1);
      integerIn(player.contract.annualSalaryManYen, 1, 100000);
      integerIn(player.fitness, 0, 100);
      expect(config.conditions).toContain(player.condition);
      expect(["R", "L"]).toContain(player.throws);
      expect(["R", "L", "S"]).toContain(player.bats);
      expect(player.career.entryAge).toBe(
        config.entryAges[player.career.background],
      );
      expect(player.career.entryAge + player.career.completedProSeasons).toBe(
        player.age,
      );
      expect(player.career.completedJapanSeasons).toBeLessThanOrEqual(
        player.career.completedProSeasons,
      );
      expect(player.isForeign).toBe(player.career.background === "foreign");
      expect(player.history).toHaveLength(player.career.completedProSeasons);
      for (const [index, record] of player.history.entries()) {
        expect(record.season).toBe(index - player.career.completedProSeasons);
        expect(record.age).toBe(player.career.entryAge + index);
        expect(record.age).toBeLessThan(player.age);
        expect(record.teamId).toBe(player.teamId);
        integerIn(record.firstTeam.games, 0, 143);
        integerIn(record.farmTeam.games, 0, 110);
        expect(
          record.firstTeam.games + record.farmTeam.games,
        ).toBeLessThanOrEqual(143);
        if (record.registration === "development")
          expect(
            Object.values(record.firstTeam).every((value) => value === 0),
          ).toBe(true);
      }
      // unionを絞り込み、履歴の種類を混在させない。
      if (player.kind === "fielder")
        for (const record of player.history) {
          battingConsistency(record.firstTeam);
          battingConsistency(record.farmTeam);
        }
      else
        for (const record of player.history) {
          pitchingConsistency(record.firstTeam);
          pitchingConsistency(record.farmTeam);
        }
    }
  });
  it("新入団の経歴は空で、名前・年齢・投打・成長型にバリエーションがある", () => {
    const rookies = world.players.filter(
      (player) => player.career.completedProSeasons === 0,
    );
    expect(rookies.length).toBeGreaterThan(0);
    for (const player of rookies) expect(player.history).toEqual([]);
    expect(
      new Set(world.players.map((player) => player.name)).size,
    ).toBeGreaterThan(300);
    expect(
      new Set(world.players.map((player) => player.age)).size,
    ).toBeGreaterThan(15);
    expect(new Set(world.players.map((player) => player.bats))).toEqual(
      new Set(["R", "L", "S"]),
    );
    expect(
      new Set(
        Object.values(world.developmentByPlayerId).map(
          (hidden) => hidden.growthType,
        ),
      ).size,
    ).toBe(3);
  });
  it("乱数差を取り除いても球団の打撃・投手補正が個別能力へ反映される", () => {
    const spy = vi.spyOn(SeededRandom.prototype, "next").mockReturnValue(0.5);
    try {
      const generated = generateInitialPlayerWorld(9);
      const batter = (teamId: string) =>
        generated.players.find(
          (player): player is Extract<Player, { kind: "fielder" }> =>
            player.teamId === teamId && player.kind === "fielder",
        )!;
      const pitcher = (teamId: string) =>
        generated.players.find(
          (player): player is Extract<Player, { kind: "pitcher" }> =>
            player.teamId === teamId && player.kind === "pitcher",
        )!;
      expect(
        batter("yokohama").abilities.contactVsRight -
          batter("shizuoka").abilities.contactVsRight,
      ).toBe(7);
      expect(
        pitcher("tokyo").abilities.control -
          pitcher("matsuyama").abilities.control,
      ).toBe(6);
    } finally {
      spy.mockRestore();
    }
  });
  it("球団ごとの個別能力分布に適度な差があり、生成結果に総合能力を保持しない", () => {
    // テストの集計のみ。選手データに合算能力・球団総合値は追加しない。
    const means = teams.map((team) => {
      const roster = world.players.filter(
        (player) => player.teamId === team.id,
      );
      const batters = roster.filter(
        (player): player is Extract<Player, { kind: "fielder" }> =>
          player.kind === "fielder",
      );
      const pitchers = roster.filter(
        (player): player is Extract<Player, { kind: "pitcher" }> =>
          player.kind === "pitcher",
      );
      return {
        contact:
          batters.reduce(
            (sum, player) => sum + player.abilities.contactVsRight,
            0,
          ) / batters.length,
        control:
          pitchers.reduce((sum, player) => sum + player.abilities.control, 0) /
          pitchers.length,
      };
    });
    for (const key of ["contact", "control"] as const) {
      const difference =
        Math.max(...means.map((mean) => mean[key])) -
        Math.min(...means.map((mean) => mean[key]));
      expect(difference).toBeGreaterThan(2);
      expect(difference).toBeLessThan(20);
    }
    function inspect(value: unknown) {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        assert(
          !/ovr|overall|special|catcherLead|portrait|faceImage|positionCaps/i.test(
            key,
          ),
          `禁止フィールド: ${key}`,
        );
        inspect(child);
      }
    }
    inspect(world);
  });
});
