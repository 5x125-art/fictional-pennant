import { teams } from "../../data/teams";
import { SeededRandom } from "../random/seededRandom";
import { generationConfig as config, namePools } from "./generationConfig";
import { fielderHistory, pitcherHistory } from "./history";
import {
  fieldPositions,
  type BattingAbilities,
  type FieldPosition,
  type Fielder,
  type InitialPlayerWorld,
  type Pitcher,
  type PitcherRole,
  type PitchingAbilities,
  type Player,
  type PlayerDevelopment,
  type Registration,
} from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
function commonPlayer(
  rng: SeededRandom,
  seed: number,
  serial: number,
  teamId: string,
  registration: Registration,
  isForeign: boolean,
) {
  const age = rng.between(
    isForeign ? config.age.foreign : config.age[registration],
  );
  const backgrounds = config.careerBackgrounds.filter(
    (background) => config.entryAges[background] <= age,
  );
  const background = isForeign ? ("foreign" as const) : rng.pick(backgrounds);
  const entryAge = config.entryAges[background];
  const batsDraw = rng.next();
  return {
    id: `player-${seed.toString(16).padStart(8, "0")}-${serial.toString().padStart(4, "0")}`,
    name: isForeign
      ? `${rng.pick(namePools.foreignGiven)}・${rng.pick(namePools.foreignFamily)}`
      : `${rng.pick(namePools.family)} ${rng.pick(namePools.given)}`,
    age,
    teamId,
    registration,
    isForeign,
    throws:
      rng.next() < config.leftThrowProbability
        ? ("L" as const)
        : ("R" as const),
    bats:
      batsDraw < config.battingProbabilities.switch
        ? ("S" as const)
        : batsDraw <
            config.battingProbabilities.switch +
              config.battingProbabilities.left
          ? ("L" as const)
          : ("R" as const),
    contract: {
      years: 1,
      annualSalaryManYen: config.salary[
        registration === "senior" ? "seniorBase" : "development"
      ] as number,
    },
    fitness: rng.int(...config.fitness),
    condition: rng.pick(config.conditions),
    career: {
      background,
      entryAge,
      completedProSeasons: age - entryAge,
      completedJapanSeasons: age - entryAge,
    },
  };
}
function ability(
  rng: SeededRandom,
  registration: Registration,
  age: number,
  bias: number,
): number {
  const rules = config.ability;
  return clamp(
    rng.int(...rules.base) +
      rng.int(-rules.variation, rules.variation) +
      bias -
      (registration === "development" ? rules.developmentPenalty : 0) -
      (age < rules.youthAge ? rules.youthPenalty : 0),
    rules.min,
    rules.max,
  );
}
function cap(
  rng: SeededRandom,
  current: number,
  max: number,
  range: readonly [number, number],
): number {
  return Math.min(max, current + rng.between(range));
}
function battingCaps(
  rng: SeededRandom,
  abilities: BattingAbilities,
  age: number,
): BattingAbilities {
  const range =
    age < config.ability.youthAge
      ? config.capHeadroom.young
      : config.capHeadroom.mature;
  const scoreCap = (current: number) =>
    cap(rng, current, config.ability.max, range);
  return {
    contactVsRight: scoreCap(abilities.contactVsRight),
    contactVsLeft: scoreCap(abilities.contactVsLeft),
    power: scoreCap(abilities.power),
    trajectory: cap(
      rng,
      abilities.trajectory,
      config.trajectory[1],
      config.capHeadroom.trajectory,
    ),
    speed: scoreCap(abilities.speed),
    stealing: scoreCap(abilities.stealing),
    catching: scoreCap(abilities.catching),
    throwing: scoreCap(abilities.throwing),
    arm: scoreCap(abilities.arm),
  };
}
function pitchingCaps(
  rng: SeededRandom,
  abilities: PitchingAbilities,
  age: number,
): PitchingAbilities {
  const range =
    age < config.ability.youthAge
      ? config.capHeadroom.young
      : config.capHeadroom.mature;
  const scoreCap = (current: number) =>
    cap(rng, current, config.ability.max, range);
  return {
    velocityKmh: cap(
      rng,
      abilities.velocityKmh,
      config.velocityKmh.max,
      config.capHeadroom.velocity,
    ),
    control: scoreCap(abilities.control),
    stamina: scoreCap(abilities.stamina),
    starterSuitability: scoreCap(abilities.starterSuitability),
    reliefSuitability: scoreCap(abilities.reliefSuitability),
    pitches: abilities.pitches.map((pitch) => ({
      type: pitch.type,
      power: scoreCap(pitch.power),
      control: scoreCap(pitch.control),
      movement: cap(
        rng,
        pitch.movement,
        config.pitchMovement[1],
        config.capHeadroom.movement,
      ),
    })),
  };
}
function generateFielder(
  base: ReturnType<typeof commonPlayer>,
  position: FieldPosition,
  bias: number,
  rng: SeededRandom,
): Fielder {
  // 左投げの捕手・二遊間・三塁手を初期生成しない。
  const throws = ["C", "2B", "3B", "SS"].includes(position) ? "R" : base.throws;
  const score = () => ability(rng, base.registration, base.age, bias);
  const abilities: BattingAbilities = {
    contactVsRight: score(),
    contactVsLeft: score(),
    power: score(),
    trajectory: rng.int(...config.trajectory),
    speed: Math.max(
      config.ability.min,
      score() -
        (base.age >= config.ability.veteranAge
          ? config.ability.veteranSpeedPenalty
          : 0),
    ),
    stealing: score(),
    catching: score(),
    throwing: score(),
    arm: score(),
  };
  const positionAptitudes = Object.fromEntries(
    fieldPositions.map((position) => [position, 0]),
  ) as Record<FieldPosition, number>;
  positionAptitudes[position] = rng.int(...config.primaryAptitude);
  for (const secondary of config.relatedPositions[position]) {
    if (throws === "L" && ["C", "2B", "3B", "SS"].includes(secondary)) continue;
    if (rng.next() < config.secondaryProbability)
      positionAptitudes[secondary] = rng.int(...config.secondaryAptitude);
  }
  const history = fielderHistory(base, rng);
  const last = history.at(-1)?.firstTeam;
  const salary =
    base.registration === "development"
      ? config.salary.development
      : config.salary.seniorBase +
        base.career.completedProSeasons * config.salary.perProSeason +
        (last?.hits ?? 0) * config.salary.perHit +
        (last?.homeRuns ?? 0) * config.salary.perHomeRun;
  return {
    ...base,
    throws,
    kind: "fielder",
    primaryPosition: position,
    abilities,
    positionAptitudes,
    history,
    contract: { years: 1, annualSalaryManYen: salary },
  };
}
function generatePitcher(
  base: ReturnType<typeof commonPlayer>,
  role: PitcherRole,
  bias: number,
  rng: SeededRandom,
): Pitcher {
  const score = () => ability(rng, base.registration, base.age, bias);
  const velocity = config.velocityKmh;
  const count = rng.int(...config.initialPitchCount);
  // 初期生成時だけ3〜5球種。モデルは可変配列で将来の習得数に固定上限を課さない。
  const remaining = config.pitchTypes.filter((type) => type !== "fastball");
  const types = [
    "fastball" as const,
    ...Array.from(
      { length: count - 1 },
      () => remaining.splice(rng.int(0, remaining.length - 1), 1)[0],
    ),
  ];
  const abilities: PitchingAbilities = {
    velocityKmh: clamp(
      rng.int(...velocity.base) +
        rng.int(-velocity.variation, velocity.variation) +
        bias -
        (base.registration === "development" ? velocity.developmentPenalty : 0),
      velocity.min,
      velocity.max,
    ),
    control: score(),
    stamina: Math.min(
      config.ability.max,
      score() +
        (role === "starter" ? config.roleSuitability.starterStaminaBonus : 0),
    ),
    starterSuitability: rng.between(
      role === "starter"
        ? config.roleSuitability.preferred
        : config.roleSuitability.other,
    ),
    reliefSuitability: rng.between(
      role === "starter"
        ? config.roleSuitability.other
        : config.roleSuitability.preferred,
    ),
    pitches: types.map((type) => ({
      type,
      power: score(),
      control: score(),
      movement:
        type === "fastball"
          ? config.pitchMovement[0]
          : rng.int(...config.pitchMovement),
    })),
  };
  const history = pitcherHistory(base, role, rng);
  const last = history.at(-1)?.firstTeam;
  const salary =
    base.registration === "development"
      ? config.salary.development
      : config.salary.seniorBase +
        base.career.completedProSeasons * config.salary.perProSeason +
        (last?.outs ?? 0) * config.salary.perPitchingOut +
        (last?.strikeouts ?? 0) * config.salary.perStrikeout;
  return {
    ...base,
    kind: "pitcher",
    primaryPosition: "P",
    role,
    abilities,
    history,
    contract: { years: 1, annualSalaryManYen: salary },
  };
}

/** UI・IndexedDBに依存しない純粋な全12球団生成。2Bではこの結果を保持してから球団を選ぶ。 */
export function generateInitialPlayerWorld(seed: number): InitialPlayerWorld {
  const rng = new SeededRandom(seed);
  const players: Player[] = [];
  const developmentByPlayerId: Record<string, PlayerDevelopment> = {};
  let serial = 0;
  for (const team of teams) {
    const bias = config.teamBias[team.id as keyof typeof config.teamBias];
    if (!bias) throw new Error(`球団の生成設定がありません: ${team.id}`);
    for (const registration of ["senior", "development"] as const) {
      const positions = config.fielderPositions[registration];
      const roles = config.pitcherRoles[registration];
      if (positions.length + roles.length > config.rosterLimits[registration])
        throw new RangeError("初期人数が登録上限を超えています。");
      positions.forEach((position, index) => {
        const isForeign =
          registration === "senior" &&
          (config.foreignSlots.fielder as readonly number[]).includes(index);
        const base = commonPlayer(
          rng,
          seed,
          ++serial,
          team.id,
          registration,
          isForeign,
        );
        const player = generateFielder(base, position, bias.batting, rng);
        players.push(player);
        developmentByPlayerId[player.id] = {
          kind: "fielder",
          growthType: rng.pick(config.growthTypes),
          abilityCaps: battingCaps(rng, player.abilities, player.age),
        };
      });
      roles.forEach((role, index) => {
        const isForeign =
          registration === "senior" &&
          (config.foreignSlots.pitcher as readonly number[]).includes(index);
        const base = commonPlayer(
          rng,
          seed,
          ++serial,
          team.id,
          registration,
          isForeign,
        );
        const player = generatePitcher(base, role, bias.pitching, rng);
        players.push(player);
        developmentByPlayerId[player.id] = {
          kind: "pitcher",
          growthType: rng.pick(config.growthTypes),
          abilityCaps: pitchingCaps(rng, player.abilities, player.age),
        };
      });
    }
  }
  return {
    generationVersion: 1,
    phase: "awaitingClubSelection",
    seed,
    randomState: rng.getState(),
    players,
    developmentByPlayerId,
  };
}
