import { SeededRandom } from "../random/seededRandom";
import { generationConfig, namePools } from "./generationConfig";

interface NamePools {
  readonly family: readonly string[];
  readonly given: readonly string[];
  readonly foreignFamily: readonly string[];
  readonly foreignGiven: readonly string[];
}
function shuffled<T>(values: readonly T[], rng: SeededRandom): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = rng.int(0, index);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/** 姓を一巡ずつ使い、姓ごとの名は重複なしで消費する。再抽選ループは不要。 */
class NameDeck {
  private families: string[] = [];
  private cursor = 0;
  private readonly givenByFamily: Map<string, string[]>;

  constructor(
    family: readonly string[],
    given: readonly string[],
    private readonly separator: string,
    private readonly familyFirst: boolean,
    private readonly rng: SeededRandom,
  ) {
    for (const pool of [family, given]) {
      if (
        !pool.length ||
        new Set(pool).size !== pool.length ||
        pool.some((name) => !name.trim() || name.includes(separator))
      ) {
        throw new RangeError(
          "名前候補には空文字・区切り文字・重複を含められません。",
        );
      }
    }
    this.givenByFamily = new Map(
      family.map((name) => [name, shuffled(given, rng)]),
    );
  }

  next(): string {
    if (this.cursor === this.families.length) {
      this.families = shuffled([...this.givenByFamily.keys()], this.rng);
      this.cursor = 0;
    }
    if (!this.families.length)
      throw new RangeError("重複しない名前候補を使い切りました。");
    const family = this.families[this.cursor++];
    const givenNames = this.givenByFamily.get(family)!;
    const given = givenNames.pop()!;
    if (!givenNames.length) this.givenByFamily.delete(family);
    return this.familyFirst
      ? `${family}${this.separator}${given}`
      : `${given}${this.separator}${family}`;
  }
}

/** 世界ごとに作成する。名前抽選は能力・契約・経歴用の乱数系列から独立。 */
export function createPlayerNameGenerator(
  seed: number,
  pools: NamePools = namePools,
) {
  // 不正シードをビット演算で有効値へ丸めない。
  new SeededRandom(seed);
  const rng = new SeededRandom((seed ^ generationConfig.nameSeedSalt) >>> 0);
  const domestic = new NameDeck(pools.family, pools.given, " ", true, rng);
  const foreign = new NameDeck(
    pools.foreignFamily,
    pools.foreignGiven,
    "・",
    false,
    rng,
  );
  return {
    next: (isForeign: boolean): string =>
      (isForeign ? foreign : domestic).next(),
  };
}
