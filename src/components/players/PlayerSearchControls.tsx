import { leagues, teams } from "../../data/teams";
import {
  searchableAbilities,
  getSearchAbility,
  defaultPlayerQuery,
  type PlayerQuery,
  type AbilityId,
  type SortKey,
} from "../../game/players/search";
import { fieldPositions } from "../../game/players/types";
import { handLabels, positionLabels } from "./labels";
export function searchScopeLabel(
  query: PlayerQuery,
  managedTeamId: string,
): string {
  return query.scope === "all"
    ? "全球団"
    : query.scope === "blue"
      ? "ブルーリーグ"
      : query.scope === "red"
        ? "レッドリーグ"
        : (teams.find(
            (team) =>
              team.id ===
              (query.scope === "own" ? managedTeamId : query.teamId),
          )?.name ?? "個別球団");
}
function abilityOptions() {
  return (["fielder", "pitcher"] as const).map((kind) => (
    <optgroup
      label={kind === "fielder" ? "野手の能力・守備適性" : "投手の能力"}
      key={kind}
    >
      {searchableAbilities
        .filter((ability) => ability.kind === kind)
        .map((ability) => (
          <option value={ability.id} key={ability.id}>
            {ability.label}
            {ability.unit === "kmh" ? "（km/h）" : ""}
          </option>
        ))}
    </optgroup>
  ));
}
export function describePlayerQuery(
  q: PlayerQuery,
  managedTeamId: string,
): string {
  const filters = [
    `対象：${q.scope === "own" ? "自球団・" : ""}${searchScopeLabel(q, managedTeamId)}`,
  ];
  if (q.name.trim()) filters.push(`名前：${q.name}`);
  if (q.kind !== "all") filters.push(q.kind === "pitcher" ? "投手" : "野手");
  if (q.registration !== "all")
    filters.push(q.registration === "senior" ? "支配下" : "育成");
  if (q.position !== "all")
    filters.push(`主守備：${positionLabels[q.position]}`);
  if (q.ageMin || q.ageMax)
    filters.push(
      `年齢：${q.ageMin || "指定なし"}〜${q.ageMax || "指定なし"}歳`,
    );
  if (q.throws !== "all") filters.push(`${handLabels[q.throws]}投げ`);
  if (q.bats !== "all") filters.push(`${handLabels[q.bats]}打ち`);
  if (q.foreign !== "all")
    filters.push(q.foreign === "foreign" ? "外国人選手" : "外国人以外");
  const ability = getSearchAbility(q.ability),
    sort = getSearchAbility(q.sort);
  if (ability)
    filters.push(
      `${ability.label}：${q.abilityMin || "指定なし"}〜${q.abilityMax || "指定なし"}${ability.unit === "kmh" ? "km/h" : ""}`,
    );
  const sortLabel =
    sort?.label ??
    (
      { kind: "種別", name: "名前", age: "年齢", salary: "年俸" } as Record<
        string,
        string
      >
    )[q.sort];
  filters.push(
    `並べ替え：${sortLabel}・${q.direction === "asc" ? "昇順" : "降順"}`,
  );
  for (const kind of new Set([ability?.kind, sort?.kind])) {
    if (kind)
      filters.push(
        `${kind === "pitcher" ? "投手" : "野手"}専用能力はその種別のみ対象`,
      );
  }
  return filters.join(" / ");
}
export function PlayerSearchControls({
  query: q,
  onChange,
  managedTeamId,
  expanded,
  onExpandedChange,
}: {
  query: PlayerQuery;
  onChange: (query: PlayerQuery) => void;
  managedTeamId: string;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
}) {
  const patch = (value: Partial<PlayerQuery>) => onChange({ ...q, ...value });
  const ability = getSearchAbility(q.ability);
  return (
    <div className="player-search-controls">
      <div className="scope-shortcuts" aria-label="よく使う閲覧対象">
        <button
          aria-pressed={q.scope === "own"}
          onClick={() => patch({ scope: "own" })}
        >
          自球団
        </button>
        <button
          aria-pressed={q.scope === "all"}
          onClick={() => patch({ scope: "all" })}
        >
          全球団
        </button>
        <button onClick={() => onChange(defaultPlayerQuery(managedTeamId))}>
          条件をすべて解除
        </button>
      </div>
      <label className="search-name">
        選手名で検索
        <input
          type="search"
          value={q.name}
          maxLength={100}
          placeholder="姓・名の一部を入力"
          onChange={(event) => patch({ name: event.target.value })}
        />
      </label>
      <label>
        表示する球団
        <select
          value={q.scope === "team" ? q.teamId : q.scope}
          onChange={(event) => {
            const value = event.target.value;
            patch(
              ["own", "all", "blue", "red"].includes(value)
                ? { scope: value as PlayerQuery["scope"] }
                : { scope: "team", teamId: value },
            );
          }}
        >
          <option value="own">自球団</option>
          <option value="all">全球団</option>
          <option value="blue">ブルーリーグ</option>
          <option value="red">レッドリーグ</option>
          {leagues.map((league) => (
            <optgroup key={league.id} label={league.name}>
              {teams
                .filter((team) => team.league === league.id)
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="search-sort-row">
        <label>
          並べ替え
          <select
            value={q.sort}
            onChange={(event) => patch({ sort: event.target.value as SortKey })}
          >
            <option value="kind">種別順（標準）</option>
            <option value="name">名前</option>
            <option value="age">年齢</option>
            <option value="salary">年俸</option>
            {abilityOptions()}
          </select>
        </label>
        <label>
          並び順
          <select
            value={q.direction}
            onChange={(event) =>
              patch({
                direction: event.target.value as PlayerQuery["direction"],
              })
            }
          >
            <option value="asc">昇順</option>
            <option value="desc">降順</option>
          </select>
        </label>
      </div>
      <details
        className="advanced-search"
        open={expanded}
        onToggle={(event) => onExpandedChange(event.currentTarget.open)}
      >
        <summary>詳細な絞り込み条件</summary>
        <div className="search-filter-grid">
          <label>
            投手・野手
            <select
              value={q.kind}
              onChange={(event) =>
                patch({ kind: event.target.value as PlayerQuery["kind"] })
              }
            >
              <option value="all">指定なし</option>
              <option value="pitcher">投手</option>
              <option value="fielder">野手</option>
            </select>
          </label>
          <label>
            登録区分
            <select
              value={q.registration}
              onChange={(event) =>
                patch({
                  registration: event.target
                    .value as PlayerQuery["registration"],
                })
              }
            >
              <option value="all">指定なし</option>
              <option value="senior">支配下</option>
              <option value="development">育成</option>
            </select>
          </label>
          <label>
            主守備位置
            <select
              value={q.position}
              onChange={(event) =>
                patch({
                  position: event.target.value as PlayerQuery["position"],
                })
              }
            >
              <option value="all">指定なし</option>
              <option value="P">投手</option>
              {fieldPositions.map((position) => (
                <option key={position} value={position}>
                  {positionLabels[position]}
                </option>
              ))}
            </select>
          </label>
          <label>
            投げ方
            <select
              value={q.throws}
              onChange={(event) =>
                patch({ throws: event.target.value as PlayerQuery["throws"] })
              }
            >
              <option value="all">指定なし</option>
              <option value="R">右投げ</option>
              <option value="L">左投げ</option>
            </select>
          </label>
          <label>
            打ち方
            <select
              value={q.bats}
              onChange={(event) =>
                patch({ bats: event.target.value as PlayerQuery["bats"] })
              }
            >
              <option value="all">指定なし</option>
              <option value="R">右打ち</option>
              <option value="L">左打ち</option>
              <option value="S">両打ち</option>
            </select>
          </label>
          <label>
            外国人区分
            <select
              value={q.foreign}
              onChange={(event) =>
                patch({ foreign: event.target.value as PlayerQuery["foreign"] })
              }
            >
              <option value="all">指定なし</option>
              <option value="foreign">外国人選手</option>
              <option value="domestic">外国人以外</option>
            </select>
          </label>
          <label>
            年齢の下限
            <input
              inputMode="numeric"
              value={q.ageMin}
              onChange={(event) => patch({ ageMin: event.target.value })}
              placeholder="指定なし"
            />
          </label>
          <label>
            年齢の上限
            <input
              inputMode="numeric"
              value={q.ageMax}
              onChange={(event) => patch({ ageMax: event.target.value })}
              placeholder="指定なし"
            />
          </label>
        </div>
        <label>
          能力条件
          <select
            value={q.ability}
            onChange={(event) =>
              patch({
                ability: event.target.value as AbilityId | "",
                abilityMin: "",
                abilityMax: "",
              })
            }
          >
            <option value="">指定なし</option>
            {abilityOptions()}
          </select>
        </label>
        <p className="search-unit-note">
          {ability
            ? `${ability.kind === "pitcher" ? "投手" : "野手"}専用 / ${ability.unit === "kmh" ? "球速はkm/h" : "0〜100の数値"} / 上下限を含む`
            : "能力を選ぶと下限・上限を指定できます。"}
        </p>
        <div className="search-filter-grid">
          <label>
            能力値の下限
            <input
              inputMode="numeric"
              value={q.abilityMin}
              disabled={!ability}
              onChange={(event) => patch({ abilityMin: event.target.value })}
              placeholder="指定なし"
            />
          </label>
          <label>
            能力値の上限
            <input
              inputMode="numeric"
              value={q.abilityMax}
              disabled={!ability}
              onChange={(event) => patch({ abilityMax: event.target.value })}
              placeholder="指定なし"
            />
          </label>
        </div>
      </details>
    </div>
  );
}
