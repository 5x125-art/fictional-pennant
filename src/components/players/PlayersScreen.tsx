import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { readPublicRoster, type PublicRoster } from "../../storage/playerViews";
import { storageErrorMessage } from "../../game/saveErrors";
import {
  defaultPlayerQuery,
  searchPlayers,
  type PlayerQuery,
} from "../../game/players/search";
import { PlayerDetail } from "./PlayerDetail";
import { PlayerCard } from "./PlayerCard";
import {
  PlayerSearchControls,
  describePlayerQuery,
  searchScopeLabel,
} from "./PlayerSearchControls";
const PAGE_SIZE = 80;
export function PlayersScreen({
  saveId,
  onHome,
}: {
  saveId: string | null;
  onHome: () => void;
}) {
  const [roster, setRoster] = useState<PublicRoster | null>(null);
  const [query, setQuery] = useState<PlayerQuery>(defaultPlayerQuery(""));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const restore = useRef<{ y: number; id: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRoster(null);
    setError("");
    setSelectedId(null);
    setVisibleCount(PAGE_SIZE);
    setExpanded(false);
    restore.current = null;
    if (saveId)
      readPublicRoster(saveId)
        .then((result) => {
          if (!cancelled) {
            setQuery(defaultPlayerQuery(result.managedTeamId));
            setRoster(result);
          }
        })
        .catch((error) => {
          if (!cancelled) setError(storageErrorMessage(error));
        });
    return () => {
      cancelled = true;
    };
  }, [saveId, retry]);
  const result = useMemo(
    () =>
      roster
        ? searchPlayers(roster.players, query, roster.managedTeamId)
        : { players: [], error: null },
    [roster, query],
  );
  useLayoutEffect(() => {
    if (selectedId === null && roster && restore.current) {
      const previous = restore.current;
      restore.current = null;
      window.scrollTo(0, previous.y);
      document
        .getElementById(`player-row-${previous.id}`)
        ?.focus({ preventScroll: true });
    }
  }, [selectedId, roster]);
  if (!saveId)
    return (
      <section className="player-screen empty-players">
        <h2>選手一覧</h2>
        <p>セーブを読み込むと、保存済みの選手を確認できます。</p>
        <button onClick={onHome}>ホームでセーブを選ぶ</button>
      </section>
    );
  if (error)
    return (
      <section className="player-screen">
        <p role="alert">選手を読み込めませんでした。{error}</p>
        <button onClick={() => setRetry((value) => value + 1)}>
          再読み込み
        </button>
        <button onClick={onHome}>ホームへ戻る</button>
      </section>
    );
  if (!roster)
    return (
      <section className="player-screen">
        <p role="status" aria-label="選手データ">
          保存済みの選手を読み込み中…
        </p>
      </section>
    );
  if (selectedId !== null)
    return (
      <div className="player-screen">
        <PlayerDetail
          key={selectedId}
          player={roster.players.find((player) => player.id === selectedId)}
          onBack={() => setSelectedId(null)}
        />
      </div>
    );
  const players = result.players;
  const visible = players.slice(0, visibleCount);
  const changeQuery = (next: PlayerQuery) => {
    setQuery(next);
    setVisibleCount(PAGE_SIZE);
    restore.current = null;
  };
  const renderCards = (rows: typeof visible) => (
    <ul className="player-list">
      {rows.map((player) => (
        <PlayerCard
          key={player.id}
          player={player}
          query={query}
          onOpen={() => {
            restore.current = { y: window.scrollY, id: player.id };
            setSelectedId(player.id);
            window.scrollTo(0, 0);
          }}
        />
      ))}
    </ul>
  );
  const kinds =
    query.direction === "asc"
      ? (["pitcher", "fielder"] as const)
      : (["fielder", "pitcher"] as const);
  return (
    <section className="player-screen" aria-label="選手一覧">
      <div className="roster-heading">
        <div>
          <span className="eyebrow">PLAYER ROSTER</span>
          <h2>{searchScopeLabel(query, roster.managedTeamId)}</h2>
          <p>
            {players.length}人 / 支配下{" "}
            {
              players.filter((player) => player.registration === "senior")
                .length
            }
            人 / 育成{" "}
            {
              players.filter((player) => player.registration === "development")
                .length
            }
            人
          </p>
        </div>
        <span className="roster-own-label">
          {query.scope === "own" ||
          (query.scope === "team" && query.teamId === roster.managedTeamId)
            ? "自球団"
            : query.scope === "team"
              ? "他球団"
              : "横断検索"}
        </span>
      </div>
      <p className="roster-registration-count">
        自球団の1軍登録：
        {
          roster.players.filter(
            (p) => p.teamId === roster.managedTeamId && p.squad === "first",
          ).length
        }
        人 / 上限31人
      </p>
      <PlayerSearchControls
        query={query}
        onChange={changeQuery}
        managedTeamId={roster.managedTeamId}
        expanded={expanded}
        onExpandedChange={setExpanded}
      />
      <p className="query-summary">
        {describePlayerQuery(query, roster.managedTeamId)}
      </p>
      <p
        className="search-result-count"
        role="status"
        aria-label="検索結果件数"
      >
        {result.error
          ? "検索条件を確認してください"
          : `検索結果 ${players.length}人 / 表示 ${visible.length}人`}
      </p>
      {result.error && (
        <p className="search-range-error" role="alert">
          {result.error}
        </p>
      )}
      {!result.error && !players.length && (
        <p className="search-empty">条件に一致する選手はいません</p>
      )}
      {!result.error &&
        players.length > 0 &&
        (query.sort === "kind" ? (
          kinds.map((kind) => {
            const rows = visible.filter((player) => player.kind === kind);
            const count = players.filter(
              (player) => player.kind === kind,
            ).length;
            if (!count) return null;
            return (
              <section
                className="roster-group"
                key={kind}
                aria-label={kind === "pitcher" ? "投手一覧" : "野手一覧"}
              >
                <h3>
                  {kind === "pitcher" ? "投手" : "野手"}
                  <span>
                    {count}人 / 表示 {rows.length}人
                  </span>
                </h3>
                {renderCards(rows)}
                {!rows.length && (
                  <p className="empty">「さらに表示」で確認できます。</p>
                )}
              </section>
            );
          })
        ) : (
          <section className="roster-group" aria-label="並べ替えた検索結果">
            <h3>
              検索結果<span>{players.length}人</span>
            </h3>
            {renderCards(visible)}
          </section>
        ))}
      {visible.length < players.length && (
        <button
          className="show-more-players"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
        >
          さらに表示（あと{players.length - visible.length}人）
        </button>
      )}
    </section>
  );
}
