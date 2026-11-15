import { describe, expect, it } from "vitest";
import {
  outcomeProbabilities,
  drawPlateAppearance,
} from "../game/match/probability";
import { SeededRandom } from "../game/random/seededRandom";
import { estimatedPitchRanges, probabilityConfig } from "../game/match/config";
import {
  outcomes,
  playOutcomes,
  type MatchBatter,
  type MatchPitcher,
} from "../game/match/types";
import type { PitchAbilities } from "../game/players/types";
const batter: MatchBatter = {
  id: "b",
  teamId: "sapporo",
  bats: "R",
  abilities: {
    contactVsRight: 50,
    contactVsLeft: 50,
    power: 50,
    trajectory: 2,
    speed: 50,
    stealing: 50,
    catching: 50,
    throwing: 50,
    arm: 50,
  },
};
const pitch: PitchAbilities = {
  type: "slider",
  power: 50,
  control: 50,
  movement: 3,
};
const pitcher: MatchPitcher = {
  id: "p",
  teamId: "niigata",
  throws: "R",
  abilities: {
    velocityKmh: 145,
    control: 50,
    stamina: 50,
    starterSuitability: 50,
    reliefSuitability: 50,
    pitches: [pitch],
  },
};
const probabilities = (b = batter, p = pitcher, s = pitch) =>
  outcomeProbabilities(b, p, s);
const hits = (p: ReturnType<typeof probabilities>) =>
  p.single + p.double + p.triple + p.homeRun;
describe("暫定確率モデル", () => {
  it("能力の極端値でも有限・非負で合計1、打率が暴走しない", () => {
    for (const contact of [0, 100])
      for (const power of [0, 100])
        for (const trajectory of [1, 4])
          for (const velocityKmh of [1, 300])
            for (const control of [0, 100])
              for (const movement of [0, 7])
                for (const ballPower of [0, 100]) {
                  const b = {
                    ...batter,
                    abilities: {
                      ...batter.abilities,
                      contactVsRight: contact,
                      power,
                      trajectory,
                      speed: power,
                    },
                  };
                  const p = {
                    ...pitcher,
                    abilities: { ...pitcher.abilities, velocityKmh, control },
                  };
                  const result = probabilities(b, p, {
                    ...pitch,
                    power: ballPower,
                    control,
                    movement,
                  });
                  expect(
                    Object.values(result).every(
                      (v) => Number.isFinite(v) && v >= 0 && v <= 1,
                    ),
                  ).toBe(true);
                  expect(
                    Object.values(result).reduce((a, b) => a + b, 0),
                  ).toBeCloseTo(1, 12);
                  const average =
                    hits(result) / (1 - result.walk - result.hitByPitch);
                  expect(average).toBeGreaterThan(0.16);
                  expect(average).toBeLessThan(0.37);
                }
  });
  it("右投手には対右、左投手には対左ミートを使う", () => {
    const highR = {
      ...batter,
      abilities: { ...batter.abilities, contactVsRight: 90, contactVsLeft: 10 },
    };
    const lowR = {
      ...batter,
      abilities: { ...batter.abilities, contactVsRight: 10, contactVsLeft: 90 },
    };
    expect(hits(probabilities(highR))).toBeGreaterThan(
      hits(probabilities(lowR)),
    );
    const left = { ...pitcher, throws: "L" as const };
    expect(hits(probabilities(highR, left))).toBeLessThan(
      hits(probabilities(lowR, left)),
    );
  });
  it("左右の組合せと両打ちの逆打席を反映する", () => {
    const switchB = { ...batter, bats: "S" as const },
      leftB = { ...batter, bats: "L" as const };
    expect(probabilities(switchB)).toEqual(probabilities(leftB));
    expect(hits(probabilities(leftB))).toBeGreaterThan(hits(probabilities()));
    const leftP = { ...pitcher, throws: "L" as const };
    expect(probabilities(switchB, leftP)).toEqual(probabilities(batter, leftP));
  });
  it("パワー・弾道・制球・球速を個別に反映する", () => {
    expect(
      probabilities({
        ...batter,
        abilities: { ...batter.abilities, power: 90 },
      }).homeRun,
    ).toBeGreaterThan(probabilities().homeRun);
    expect(
      probabilities({
        ...batter,
        abilities: { ...batter.abilities, trajectory: 4 },
      }).homeRun,
    ).toBeGreaterThan(probabilities().homeRun);
    const precise = {
      ...pitcher,
      abilities: { ...pitcher.abilities, control: 90 },
    };
    expect(probabilities(batter, precise).walk).toBeLessThan(
      probabilities().walk,
    );
    const fast = {
      ...pitcher,
      abilities: { ...pitcher.abilities, velocityKmh: 160 },
    };
    expect(probabilities(batter, fast).strikeout).toBeGreaterThan(
      probabilities().strikeout,
    );
  });
  it("球種ごとの球威・制球・変化量と球種差を反映する", () => {
    expect(
      hits(probabilities(batter, pitcher, { ...pitch, power: 90 })),
    ).toBeLessThan(hits(probabilities()));
    expect(
      probabilities(batter, pitcher, { ...pitch, control: 90 }).walk,
    ).toBeLessThan(probabilities().walk);
    expect(
      probabilities(batter, pitcher, { ...pitch, movement: 7 }).strikeout,
    ).toBeGreaterThan(probabilities().strikeout);
    expect(
      probabilities(batter, pitcher, { ...pitch, movement: 7, type: "fork" }),
    ).not.toEqual(
      probabilities(batter, pitcher, {
        ...pitch,
        movement: 7,
        type: "fastball",
      }),
    );
  });
  it("推定球数は各打席結果に応じた暫定範囲で、四球4球・三振3球以上", () => {
    for (const outcome of outcomes) {
      const [min, max] = estimatedPitchRanges[outcome];
      expect(Number.isInteger(min) && min >= 1 && max >= min).toBe(true);
    }
    expect(estimatedPitchRanges.walk[0]).toBe(4);
    expect(estimatedPitchRanges.strikeout[0]).toBe(3);
  });
  it("同じPRNG状態で抽選を再現し、終了状態からも続行できる", () => {
    const a = new SeededRandom(284),
      b = new SeededRandom(284);
    const draw = (rng: SeededRandom) =>
      Array.from({ length: 100 }, () =>
        drawPlateAppearance(batter, pitcher, rng),
      );
    expect(draw(a)).toEqual(draw(b));
    expect(a.getState()).toBe(b.getState());
    expect(draw(new SeededRandom(a.getState()))).toEqual(draw(a));
  });
  it("多数の独立試行が設定した確率に近づく", () => {
    const random = new SeededRandom(78421),
      counts = Object.fromEntries(playOutcomes.map((o) => [o, 0])) as Record<
        (typeof playOutcomes)[number],
        number
      >;
    const n = 50_000;
    for (let i = 0; i < n; i++)
      counts[drawPlateAppearance(batter, pitcher, random)]++;
    const expected = probabilities();
    for (const outcome of outcomes)
      expect(Math.abs(counts[outcome] / n - expected[outcome])).toBeLessThan(
        0.008,
      );
    expect(probabilityConfig.hit.base).toBeGreaterThan(0);
  });
});

it("併殺・犠飛は対象塁と0〜1アウトだけで確率を移し、犠打を自動抽選しない", () => {
  for (let mask = 0; mask < 8; mask++) for (let outs = 0; outs < 3; outs++) {
    const bases = [mask & 1 ? "a" : null, mask & 2 ? "b" : null, mask & 4 ? "c" : null] as const;
    const p = outcomeProbabilities(batter, pitcher, pitch, {outs, bases});
    expect(p.groundDoublePlay > 0).toBe(outs < 2 && !!bases[0]);
    expect(p.sacrificeFly > 0).toBe(outs < 2 && !!bases[2]);
    expect(p.sacrificeBunt).toBe(0);
    expect(Object.values(p).reduce((a,b) => a+b,0)).toBeCloseTo(1, 12);
    expect(p.groundOut + p.groundDoublePlay).toBeCloseTo(probabilities().groundOut, 12);
    expect(p.flyOut + p.sacrificeFly).toBeCloseTo(probabilities().flyOut, 12);
  }
});
