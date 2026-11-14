import { describe, expect, it } from "vitest";
import { teams } from "../data/teams";
import { generateInitialPlayerWorld } from "../game/players/generate";
import {
  toPublicPlayer,
  type PublicPlayer,
} from "../game/players/publicPlayer";
import {
  defaultPlayerQuery,
  normalizePlayerName,
  searchableAbilities,
  searchPlayers,
  type PlayerQuery,
} from "../game/players/search";
const players = generateInitialPlayerWorld(2317).players.map(toPublicPlayer);
const own = teams[0].id;
const query = (patch: Partial<PlayerQuery> = {}): PlayerQuery => ({
  ...defaultPlayerQuery(own),
  scope: "all",
  ...patch,
});
const run = (patch: Partial<PlayerQuery> = {}, source = players) =>
  searchPlayers(source, query(patch), own);
const ids = (source: readonly PublicPlayer[]) => source.map((p) => p.id);

describe("公開DTOの選手検索", () => {
  it("自球団・全球団・両リーグ・全個別球団を切り替える", () => {
    expect(run({ scope: "own" }).players).toHaveLength(76);
    expect(run().players).toHaveLength(912);
    for (const scope of ["blue", "red"] as const) {
      const result = run({ scope }).players;
      expect(result).toHaveLength(456);
      expect(
        result.every(
          (p) => teams.find((t) => t.id === p.teamId)?.league === scope,
        ),
      ).toBe(true);
    }
    for (const team of teams)
      expect(
        run({ scope: "team", teamId: team.id }).players.every(
          (p) => p.teamId === team.id,
        ),
      ).toBe(true);
    expect(run({ scope: "team", teamId: "missing" }).error).toBeTruthy();
  });
  it("姓・名の部分一致と全半角・大小・空白・かなを正規化する", () => {
    const domestic = players.find((p) => !p.isForeign)!;
    for (const part of domestic.name.split(/\s/))
      expect(ids(run({ name: part }).players)).toContain(domestic.id);
    expect(normalizePlayerName(" ＪＯＨＮ・ｽﾐｽ ")).toBe(
      normalizePlayerName("john すみす"),
    );
    const fixture = { ...players[0], name: "ジョン・スミス" };
    expect(run({ name: "ｼﾞｮﾝ すみす" }, [fixture]).players).toHaveLength(1);
    expect(run({ name: "存在しない選手名" }).players).toEqual([]);
  });
  it("基本条件をすべてANDで適用する", () => {
    const p = players.find((p) => p.kind === "fielder" && p.isForeign)!;
    const result = run({
      scope: "team",
      teamId: p.teamId,
      kind: p.kind,
      registration: p.registration,
      position: p.primaryPosition,
      ageMin: String(p.age),
      ageMax: String(p.age),
      throws: p.throws,
      bats: p.bats,
      foreign: "foreign",
    }).players;
    const expected = players.filter(
      (x) =>
        x.teamId === p.teamId &&
        x.kind === p.kind &&
        x.registration === p.registration &&
        x.primaryPosition === p.primaryPosition &&
        x.age === p.age &&
        x.throws === p.throws &&
        x.bats === p.bats &&
        x.isForeign,
    );
    expect(ids(result).sort()).toEqual(ids(expected).sort());
    expect(ids(result)).toContain(p.id);
    for (const foreign of ["foreign", "domestic"] as const)
      expect(
        run({ foreign }).players.every(
          (p) => p.isForeign === (foreign === "foreign"),
        ),
      ).toBe(true);
    for (const bats of ["R", "L", "S"] as const)
      expect(run({ bats }).players.every((p) => p.bats === bats)).toBe(true);
  });
  it("年齢の上下限を含み、全角数値・片側指定も扱う", () => {
    expect(
      run({ ageMin: "２０", ageMax: "２５" }).players.every(
        (p) => p.age >= 20 && p.age <= 25,
      ),
    ).toBe(true);
    expect(ids(run({ ageMin: "20", ageMax: "20" }).players).sort()).toEqual(
      ids(players.filter((p) => p.age === 20)).sort(),
    );
    expect(run({ ageMin: "30" }).players.every((p) => p.age >= 30)).toBe(true);
    expect(run({ ageMax: "20" }).players.every((p) => p.age <= 20)).toBe(true);
    expect(run({ ageMin: "0", ageMax: "0" }).players).toHaveLength(0);
  });
  it.each(["-1", "1.5", "Infinity", "NaN", "1e2", "abc", "9007199254740992"])(
    "不正な数値%sをエラーにし、結果を出さない",
    (value) => {
      const result = run({ ageMin: value });
      expect(result.error).toBeTruthy();
      expect(result.players).toEqual([]);
    },
  );
  it("逆転範囲・0〜100超過・非公開能力キーを拒否する", () => {
    for (const patch of [
      { ageMin: "30", ageMax: "20" },
      { ability: "fielder.power", abilityMax: "101" },
      { ability: "pitcher.control", abilityMin: "60", abilityMax: "59" },
      { ability: "growthType" },
      { sort: "abilityCaps" },
    ] as Partial<PlayerQuery>[])
      expect(run(patch).error).toBeTruthy();
  });
  it.each(searchableAbilities.map((a) => [a.id, a] as const))(
    "%s の数値を直接使い、種別と両境界を守る",
    (_id, a) => {
      const sample = players.find((p) => p.kind === a.kind)!;
      const value = a.value(sample)!;
      const result = run({
        ability: a.id,
        abilityMin: String(value),
        abilityMax: String(value),
      });
      expect(result.error).toBeNull();
      expect(ids(result.players).sort()).toEqual(
        ids(players.filter((p) => a.value(p) === value)).sort(),
      );
      expect(ids(result.players)).toContain(sample.id);
      expect(
        run({
          ability: a.id,
          kind: a.kind === "fielder" ? "pitcher" : "fielder",
        }).players,
      ).toEqual([]);
      for (const direction of ["asc", "desc"] as const) {
        const ordered = run({ sort: a.id, direction }).players;
        expect(ordered).toHaveLength(456);
        for (let i = 1; i < ordered.length; i++) {
          const before = a.value(ordered[i - 1])!,
            after = a.value(ordered[i])!;
          expect(direction === "asc" ? before <= after : before >= after).toBe(
            true,
          );
          if (before === after)
            expect(ordered[i - 1].id < ordered[i].id).toBe(true);
        }
      }
    },
  );
  it("0と100の能力境界、100を超えるkm/h、矛盾した能力種別を扱う", () => {
    const p = players.find((p) => p.kind === "fielder")!;
    if (p.kind !== "fielder") throw Error();
    const fixture = [
      { ...p, id: "zero", abilities: { ...p.abilities, power: 0 } },
      { ...p, id: "hundred", abilities: { ...p.abilities, power: 100 } },
    ];
    expect(
      ids(
        run(
          { ability: "fielder.power", abilityMin: "0", abilityMax: "0" },
          fixture,
        ).players,
      ),
    ).toEqual(["zero"]);
    expect(
      ids(
        run(
          { ability: "fielder.power", abilityMin: "100", abilityMax: "100" },
          fixture,
        ).players,
      ),
    ).toEqual(["hundred"]);
    expect(
      run({
        ability: "pitcher.velocityKmh",
        abilityMin: "140",
        abilityMax: "160",
      }).players.every(
        (p) =>
          p.kind === "pitcher" &&
          p.abilities.velocityKmh >= 140 &&
          p.abilities.velocityKmh <= 160,
      ),
    ).toBe(true);
    expect(
      run({ ability: "pitcher.control", sort: "fielder.power" }).players,
    ).toHaveLength(0);
  });
  it.each(["age", "salary", "name"] as const)(
    "%sの昇降順と同値時ID順を維持する",
    (sort) => {
      const sample = players[0];
      const fixture = [
        {
          ...sample,
          id: "z",
          name: "い",
          age: 30,
          contract: { ...sample.contract, annualSalaryManYen: 300 },
        },
        {
          ...sample,
          id: "b",
          name: "あ",
          age: 20,
          contract: { ...sample.contract, annualSalaryManYen: 200 },
        },
        {
          ...sample,
          id: "a",
          name: "あ",
          age: 20,
          contract: { ...sample.contract, annualSalaryManYen: 200 },
        },
      ];
      expect(ids(run({ sort, direction: "asc" }, fixture).players)).toEqual([
        "a",
        "b",
        "z",
      ]);
      expect(ids(run({ sort, direction: "desc" }, fixture).players)).toEqual([
        "z",
        "a",
        "b",
      ]);
    },
  );
  it("元DTO・配列を変更せず、非公開情報への検索経路を持たない", () => {
    const snapshot = JSON.stringify(players);
    Object.freeze(players);
    for (const a of searchableAbilities)
      run({ ability: a.id, sort: a.id, direction: "desc" });
    expect(JSON.stringify(players)).toBe(snapshot);
    expect(JSON.stringify(run().players)).not.toMatch(
      /developmentByPlayerId|growthType|abilityCaps|OVR/,
    );
    expect(searchableAbilities).toHaveLength(21);
  });
});
