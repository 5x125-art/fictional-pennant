import { abilityRank } from "../../game/players/rank";
export function AbilityValue({ value }: { value: number }) {
  const rank = abilityRank(value);
  return (
    <span className="ability-value">
      <strong>{value}</strong>
      <span
        className="ability-rank"
        data-rank={rank}
        aria-label={`${rank}ランク`}
      >
        {rank}
      </span>
    </span>
  );
}
