import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateInitialPlayerWorld } from "../game/players/generate";
import { namePools } from "../game/players/generationConfig";
import { createPlayerNameGenerator } from "../game/players/names";
import beforeNameChange from "./fixtures/player-generation-before-names.json";

const seeds = [0, 1, 42, 20261114, 0x12345678, 0xffffffff];

describe("架空選手名の多様性", () => {
  it("全候補に重複がなく、旧候補より十分多い姓名を持つ", () => {
    for (const pool of Object.values(namePools))
      expect(new Set(pool).size).toBe(pool.length);
    expect(namePools.family.length).toBeGreaterThanOrEqual(100);
    expect(namePools.given.length).toBeGreaterThanOrEqual(100);
    expect(namePools.foreignFamily.length).toBeGreaterThanOrEqual(32);
    expect(namePools.foreignGiven.length).toBeGreaterThanOrEqual(32);
  });

  it.each(seeds)(
    "シード %i: 912人の名前が一意で、姓の出現回数が均等",
    (seed) => {
      const world = generateInitialPlayerWorld(seed);
      expect(world.players).toHaveLength(912);
      expect(new Set(world.players.map((player) => player.name)).size).toBe(
        912,
      );
      for (const isForeign of [false, true]) {
        const players = world.players.filter(
          (player) => player.isForeign === isForeign,
        );
        expect(players).toHaveLength(isForeign ? 48 : 864);
        const familyPool = isForeign
          ? namePools.foreignFamily
          : namePools.family;
        const givenPool = isForeign ? namePools.foreignGiven : namePools.given;
        const counts = new Map<string, number>(
          familyPool.map((family) => [family, 0]),
        );
        for (const player of players) {
          const parts = player.name.split(isForeign ? "・" : " ");
          expect(parts).toHaveLength(2);
          const [family, given] = isForeign ? [parts[1], parts[0]] : parts;
          expect(familyPool as readonly string[]).toContain(family);
          expect(givenPool as readonly string[]).toContain(given);
          counts.set(family, counts.get(family)! + 1);
        }
        expect(
          [...counts.values()].every(
            (count) =>
              count === Math.floor(players.length / familyPool.length) ||
              count === Math.ceil(players.length / familyPool.length),
          ),
        ).toBe(true);
      }
      expect(generateInitialPlayerWorld(seed)).toEqual(world);
    },
  );

  it("異なるシードでは名前の並びも変わる", () => {
    const a = createPlayerNameGenerator(1);
    const b = createPlayerNameGenerator(2);
    expect(Array.from({ length: 20 }, () => a.next(false))).not.toEqual(
      Array.from({ length: 20 }, () => b.next(false)),
    );
  });

  it("候補を使い切るまで重複せず、枯渇したら番号や弱い乱数で代用せず停止する", () => {
    const pools = {
      family: ["青柳", "森川"],
      given: ["悠真", "航"],
      foreignFamily: ["リベラ", "ベネット"],
      foreignGiven: ["レオ", "サム"],
    };
    const names = createPlayerNameGenerator(0, pools);
    for (const isForeign of [false, true]) {
      const generated = Array.from({ length: 4 }, () => names.next(isForeign));
      expect(new Set(generated).size).toBe(4);
      expect(() => names.next(isForeign)).toThrow("名前候補を使い切りました");
    }
    expect(pools.family).toEqual(["青柳", "森川"]);
    expect(pools.given).toEqual(["悠真", "航"]);
  });

  it("空・重複・区切り文字を含む候補と不正シードを拒否する", () => {
    expect(() => createPlayerNameGenerator(-1)).toThrow(RangeError);
    for (const family of [[], ["青柳", "青柳"], [""], ["青 柳"]]) {
      expect(() =>
        createPlayerNameGenerator(1, { ...namePools, family }),
      ).toThrow(RangeError);
    }
  });

  // ea45960の生成処理から採取。名前だけを除いた全データ（乱数状態を含む）の比較。
  it.each(beforeNameChange)(
    "シード $seed: 名前以外の能力・契約・経歴等は修正前と完全一致",
    ({ seed, hash }) => {
      const world = generateInitialPlayerWorld(seed);
      const withoutNames = {
        ...world,
        players: world.players.map(({ name, ...rest }) => rest),
      };
      expect(
        createHash("sha256").update(JSON.stringify(withoutNames)).digest("hex"),
      ).toBe(hash);
    },
  );
});
