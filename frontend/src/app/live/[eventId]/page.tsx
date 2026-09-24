"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";

/** Show integer if whole number, otherwise 1 decimal */
function fmt(n: number) {
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}

interface TeamResult {
  team_id: string;
  team_name: string;
  total_score: number;
  breakdown: { criterion: string; score: number; judges_count: number }[];
}

interface Criterion {
  id: string;
  name: string;
  max_score: number;
}

interface JudgeEntry {
  judge_id: string;
  judge_name: string | null;
  scores: Record<string, number>;
  total: number;
  notes: string | null;
}

interface TeamDetail {
  team_id: string;
  team_name: string;
  team_description: string | null;
  judges: JudgeEntry[];
}

interface DetailData {
  criteria: Criterion[];
  teams: TeamDetail[];
}

export default function LivePage() {
  const { eventId } = useParams();
  const [eventName, setEventName] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState<string | null>(null);
  const [results, setResults] = useState<TeamResult[]>([]);
  const [eventStatus, setEventStatus] = useState("draft");
  const [loadError, setLoadError] = useState("");
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);

  // Team detail modal
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");

  const ws = useRef<WebSocket | null>(null);

  const loadResults = useCallback(async () => {
    try {
      const res = await api.get(`/api/events/${eventId}/results`);
      setEventName(res.data.event.name);
      setEventDate(res.data.event.start_date);
      setEventStatus(res.data.event.status);
      setResults(res.data.results.map((r: any) => ({
        ...r,
        total_score: Number(r.total_score),
        breakdown: r.breakdown.map((b: any) => ({ ...b, score: Number(b.score) })),
      })));
      setBgUrl(res.data.background_url || null);
      setLoadError("");
    } catch {
      setLoadError("Не удалось загрузить результаты");
    }
  }, [eventId]);

  useEffect(() => { void loadResults(); }, [loadResults]);

  useEffect(() => {
    if (connected) return;
    const interval = setInterval(() => { void loadResults(); }, 10000);
    return () => clearInterval(interval);
  }, [connected, loadResults]);

  // WebSocket with reconnect
  useEffect(() => {
    let cancelled = false;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let backoff = 1000;

    function connect() {
      if (cancelled) return;
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
      const socket = new WebSocket(`${wsUrl}/ws/events/${eventId}/live`);
      ws.current = socket;
      socket.onopen = () => { setConnected(true); backoff = 1000; };
      socket.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          reconnectTimeout = setTimeout(() => connect(), backoff);
          backoff = Math.min(backoff * 2, 15000);
        }
      };
      socket.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "update" && data.results) {
            if (data.status) setEventStatus(data.status);
            setResults((prev) => data.results.map((r: any) => {
              const existing = prev.find((p) => p.team_id === r.team_id);
              return {
                ...r,
                total_score: Number(r.total_score),
                breakdown: r.breakdown
                  ? r.breakdown.map((b: any) => ({ ...b, score: Number(b.score) }))
                  : existing?.breakdown ?? [],
              };
            }));
            setLastUpdate(new Date());
            // Detail cache is invalidated on modal close, not here,
            // so an open modal keeps its data during live updates
          }
        } catch {
          socket.close();
        }
      };
    }
    connect();
    return () => { cancelled = true; clearTimeout(reconnectTimeout); ws.current?.close(); };
  }, [eventId]);

  // Load detail data (once) when first team is clicked
  const loadDetail = useCallback(async () => {
    if (detail) return;
    setLoadingDetail(true);
    setDetailError("");
    try {
      const res = await api.get(`/api/events/${eventId}/results/detail`);
      const d: DetailData = {
        criteria: res.data.criteria.map((c: any) => ({ ...c, max_score: Number(c.max_score) })),
        teams: res.data.teams.map((t: any) => ({
          ...t,
          judges: t.judges.map((j: any) => ({
            ...j,
            total: Number(j.total),
            scores: Object.fromEntries(Object.entries(j.scores).map(([k, v]) => [k, Number(v)])),
          })),
        })),
      };
      setDetail(d);
    } catch {
      setDetailError("Не удалось загрузить подробные результаты");
    } finally {
      setLoadingDetail(false);
    }
  }, [eventId, detail]);

  const openTeam = (teamId: string) => {
    if (eventStatus !== "completed") return;
    setSelectedTeamId(teamId);
    loadDetail();
  };

  const closeModal = () => {
    setSelectedTeamId(null);
    setDetail(null); // invalidate so next open fetches fresh data
    setDetailError("");
  };

  const selectedTeamResult = results.find((r) => r.team_id === selectedTeamId);
  const selectedTeamDetail = detail?.teams.find((t) => t.team_id === selectedTeamId);

  return (
    <div
      className="min-h-screen bg-[#080c14] text-white"
      style={bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" } : {}}
    >
      {bgUrl && <div className="fixed inset-0 bg-black/35 pointer-events-none" />}
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <header className="px-6 pt-10 pb-6 text-center max-w-3xl mx-auto">
          <div className="flex justify-center items-center gap-2 mb-5">
            {connected ? (
              <span className="flex items-center gap-2 text-red-400 text-xs font-bold tracking-widest uppercase">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
                LIVE
              </span>
            ) : (
              <span className="text-white/60 text-xs font-bold tracking-widest uppercase">Связь восстанавливается · проверка каждые 10 с</span>
            )}
            {lastUpdate && (
              <span className="text-white/60 text-xs">· {lastUpdate.toLocaleTimeString("ru")}</span>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">{eventName || "Загрузка..."}</h1>
          {eventDate && (
            <p className="text-white/70 text-sm">
              {new Date(eventDate).toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}
          {eventStatus === "active" && <p className="text-amber-300 text-sm mt-3">Предварительные результаты</p>}
          {eventStatus === "completed" && <p className="text-green-300 text-sm mt-3">Итоговые результаты</p>}
        </header>

        <main className="max-w-2xl mx-auto px-4 pb-12 space-y-2">
          {loadError && <p role="alert" className="text-center text-red-300 py-4">{loadError}</p>}
          {results.length === 0 ? (
            <div className="text-center py-20 text-white/60">
              <p className="text-5xl mb-4">⏳</p>
              <p className="text-lg">{eventStatus === "draft" ? "Оценивание ещё не началось" : "Оценки пока не выставлены"}</p>
            </div>
          ) : (
            results.map((team, i) => {
              const medal = eventStatus === "completed" ? (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null) : null;
              const barWidth = results[0].total_score > 0 ? (team.total_score / results[0].total_score) * 100 : 0;
              const barColor = i === 0
                ? "linear-gradient(to right, #f59e0b, #fbbf24)"
                : i === 1
                ? "linear-gradient(to right, #94a3b8, #e2e8f0)"
                : i === 2
                ? "linear-gradient(to right, #b45309, #d97706)"
                : "linear-gradient(to right, #6366f1, #8b5cf6)";
              const cardAccent = i === 0
                ? "border-l-[3px] border-l-yellow-400 bg-yellow-400/[0.05]"
                : i === 1
                ? "border-l-[3px] border-l-slate-400 bg-white/[0.03]"
                : i === 2
                ? "border-l-[3px] border-l-amber-600 bg-amber-700/[0.05]"
                : "border-l-[3px] border-l-transparent";
              return (
                <button
                  key={team.team_id}
                  disabled={eventStatus !== "completed"}
                  className={`w-full text-left rounded-xl p-4 border border-white/[0.08] transition-all duration-300 ${eventStatus === "completed" ? "hover:bg-white/[0.06] hover:border-white/20 hover:scale-[1.005] active:scale-100" : "cursor-default"} ${cardAccent}`}
                  onClick={() => openTeam(team.team_id)}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 shrink-0 text-center">
                      {medal ? (
                        <span className="text-2xl">{medal}</span>
                      ) : (
                        <span className="text-white/60 font-bold text-lg">{i + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-2 gap-2">
                        <span className="font-semibold text-white text-base sm:text-lg truncate">{team.team_name}</span>
                        <span className={`text-xl sm:text-2xl font-bold shrink-0 tabular-nums ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-500" : "text-white/80"}`}>
                          {fmt(team.total_score)}
                        </span>
                      </div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{ width: `${barWidth}%`, background: barColor }}
                        />
                      </div>
                      {team.breakdown.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">
                          {team.breakdown.map((b, j) => (
                            <span key={j} className="text-xs text-white/65">
                              {b.criterion}: <span className="text-white/85">{fmt(b.score)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </main>
      </div>

      {/* Team detail modal */}
      {selectedTeamId && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ background: "rgba(0,0,0,0.8)" }}
        >
          <div className="bg-[#0f1420] border border-white/[0.12] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.08] shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedTeamResult?.team_name}</h2>
                <p className="text-sm text-white/65">
                  Итого: <span className="text-yellow-400 font-bold text-base">{selectedTeamResult ? fmt(selectedTeamResult.total_score) : ""}</span>
                </p>
              </div>
              <button
                onClick={() => closeModal()}
                className="text-white/30 hover:text-white/80 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
              >✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              {loadingDetail && (
                <p className="text-white/60 text-center py-10">Загрузка...</p>
              )}
              {detailError && <p role="alert" className="text-red-300 text-center py-8">{detailError}</p>}
              {!loadingDetail && selectedTeamDetail && (
                <>
                  {selectedTeamDetail.team_description && (
                    <p className="text-white/70 text-sm italic mb-4">{selectedTeamDetail.team_description}</p>
                  )}
                  {selectedTeamDetail.judges.map((judge, ji) => {
                    const hasScored = judge.total > 0;
                    return (
                      <div key={judge.judge_id} className={`rounded-xl p-4 space-y-3 ${hasScored ? "bg-white/[0.05] border border-white/[0.08]" : "bg-white/[0.02] border border-white/[0.04]"}`}>
                        <div className="flex justify-between items-center">
                          <span className={`font-semibold ${hasScored ? "text-white/90" : "text-white/55"}`}>
                            {judge.judge_name || `Судья ${ji + 1}`}
                          </span>
                          {hasScored
                            ? <span className="text-yellow-400 font-bold">{fmt(judge.total)}</span>
                            : <span className="text-xs text-white/50 italic">не оценил</span>
                          }
                        </div>
                        {hasScored && (
                          <div className="space-y-2">
                            {detail!.criteria.map((c) => {
                              const val = judge.scores[c.id] ?? 0;
                              const pct = c.max_score > 0 ? (val / c.max_score) * 100 : 0;
                              return (
                                <div key={c.id}>
                                  <div className="flex justify-between text-sm text-white/70 mb-1">
                                    <span>{c.name}</span>
                                    <span className="text-white/85 font-medium">{val} / {c.max_score}</span>
                                  </div>
                                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {judge.notes && (
                          <div className="bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-white/70 italic">
                            📝 {judge.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
              {!loadingDetail && !selectedTeamDetail && detail && (
                <p className="text-white/60 text-center py-8">Оценок пока нет</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
