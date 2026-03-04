"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { useJudgeStore } from "@/stores/judge-store";
import { saveScoreLocally, getScoresForEvent } from "@/lib/offline-db";
import { syncOfflineScores } from "@/lib/sync";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type ScoringMode = "team" | "criterion";
type SyncStatus = "saved" | "saving" | "pending";

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(v)));
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function ScoringPage() {
  const { eventId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const eid = eventId as string;

  const teams = useJudgeStore((s) => s.teams);
  const criteria = useJudgeStore((s) => s.criteria);
  const isOnline = useJudgeStore((s) => s.isOnline);
  const setEvent = useJudgeStore((s) => s.setEvent);
  const setOnline = useJudgeStore((s) => s.setOnline);

  const [loading, setLoading] = useState(true);
  const [judgeId, setJudgeId] = useState("");
  const [mode, setMode] = useState<ScoringMode>("team");
  const [notesEnabled, setNotesEnabled] = useState(true);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [judgeName, setJudgeName] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("saved");

  // Alert state
  const [showAlert, setShowAlert] = useState(false);
  const [alertTitle, setAlertTitle] = useState<string | null>(null);
  const [alertText, setAlertText] = useState<string | null>(null);
  const [alertAlign, setAlertAlign] = useState<"left" | "center" | "right">("left");
  const [alertButtonText, setAlertButtonText] = useState<string | null>(null);
  const [alertVersion, setAlertVersion] = useState(0);

  // Overlay state
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [overlayColor, setOverlayColor] = useState("#000000");
  const [overlayOpacity, setOverlayOpacity] = useState(0.35);

  // Label/prefix state
  const [criteriaLabel, setCriteriaLabel] = useState<string | null>(null);
  const [criteriaLabelEnabled, setCriteriaLabelEnabled] = useState(true);
  const [teamsLabel, setTeamsLabel] = useState<string | null>(null);
  const [teamsLabelEnabled, setTeamsLabelEnabled] = useState(true);

  // Navigation state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [criterionIndex, setCriterionIndex] = useState(0);

  // ALL scores pre-loaded from IDB → instant navigation
  const [allTeamScores, setAllTeamScores] = useState<Record<string, Record<string, number>>>({});
  const [allCritScores, setAllCritScores] = useState<Record<string, Record<string, number>>>({});
  const [allTeamNotes, setAllTeamNotes] = useState<Record<string, string>>({});
  const [allCritNotes, setAllCritNotes] = useState<Record<string, string>>({});

  const syncTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Auth guard
  useEffect(() => {
    if (!localStorage.getItem("judge_token")) window.location.href = "/";
  }, []);

  const [sessionExpired, setSessionExpired] = useState(false);

  // Online status
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [setOnline]);

  // Periodic background sync
  useEffect(() => {
    const interval = setInterval(async () => {
      if (navigator.onLine) {
        await syncOfflineScores();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load event + ALL scores on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(`/api/judge/events/${eid}`);
        const jid = localStorage.getItem("judge_id") || "";
        const parsedCriteria = res.data.criteria.map((c: any) => ({ ...c, max_score: Number(c.max_score) }));
        setEvent(eid, jid, res.data.teams, parsedCriteria);
        setJudgeId(jid);
        setMode((res.data.scoring_mode as ScoringMode) || "team");
        setNotesEnabled(res.data.notes_enabled ?? true);
        setBgUrl(res.data.background_url || null);
        setJudgeName(res.data.judge_name || null);

        // Alert: show on first open only
        // Alert: show on first open per version
        const alertVersion = res.data.alert_version ?? 0;
        setAlertVersion(alertVersion);
        if (res.data.alert_enabled && !localStorage.getItem(`judge_alerted_${jid}_v${alertVersion}`)) {
          setAlertTitle(res.data.alert_title || null);
          setAlertText(res.data.alert_text || null);
          setAlertAlign(res.data.alert_align || "left");
          setAlertButtonText(res.data.alert_button_text || null);
          setShowAlert(true);
        }

        // Overlay settings
        setOverlayEnabled(res.data.overlay_enabled ?? true);
        setOverlayColor(res.data.overlay_color || "#000000");
        setOverlayOpacity(Number(res.data.overlay_opacity ?? 0.35));

        // Prefix labels
        setCriteriaLabel(res.data.criteria_label || null);
        setCriteriaLabelEnabled(res.data.criteria_label_enabled ?? true);
        setTeamsLabel(res.data.teams_label || null);
        setTeamsLabelEnabled(res.data.teams_label_enabled ?? true);

        // Pre-load ALL scores from IDB for instant navigation (filtered by this judge)
        const saved = await getScoresForEvent(eid, jid);
        const ts: Record<string, Record<string, number>> = {};
        const tn: Record<string, string> = {};
        const cs: Record<string, Record<string, number>> = {};
        const cn: Record<string, string> = {};
        for (const s of saved) {
          if (!ts[s.teamId]) ts[s.teamId] = {};
          ts[s.teamId][s.criterionId] = s.value;
          if (s.notes) tn[s.teamId] = s.notes;
          if (!cs[s.criterionId]) cs[s.criterionId] = {};
          cs[s.criterionId][s.teamId] = s.value;
        }
        setAllTeamScores(ts);
        setAllTeamNotes(tn);
        setAllCritScores(cs);
        setAllCritNotes(cn);
      } catch (err: any) {
        if (err?.response?.status === 401) {
          setSessionExpired(true);
        } else {
          toast({ title: "Ошибка загрузки", variant: "destructive" });
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eid]);

  // Debounced server sync
  const scheduleServerSync = useCallback(() => {
    setSyncStatus("pending");
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      if (!navigator.onLine) return;
      setSyncStatus("saving");
      try {
        await syncOfflineScores();
        setSyncStatus("saved");
      } catch {
        setSyncStatus("pending");
      }
    }, 1500);
  }, []);

  const saveScore = useCallback(async (teamId: string, criterionId: string, value: number, notes: string) => {
    await saveScoreLocally({
      judgeId,
      eventId: eid,
      teamId,
      criterionId,
      value,
      notes: notes || null,
      synced: false,
      updatedAt: Date.now(),
    });
    scheduleServerSync();
  }, [judgeId, eid, scheduleServerSync]);

  // Team mode: score one criterion for current team
  const handleTeamScore = useCallback((criterionId: string, value: number) => {
    const team = teams[currentIndex];
    if (!team) return;

    setAllTeamScores((prev) => ({
      ...prev,
      [team.id]: { ...(prev[team.id] || {}), [criterionId]: value },
    }));
    setAllCritScores((prev) => ({
      ...prev,
      [criterionId]: { ...(prev[criterionId] || {}), [team.id]: value },
    }));

    saveScore(team.id, criterionId, value, allTeamNotes[team.id] || "");
  }, [teams, currentIndex, allTeamNotes, saveScore]);

  // Criterion mode: score current criterion for one team
  const handleCritScore = useCallback((teamId: string, value: number) => {
    const criterion = criteria[criterionIndex];
    if (!criterion) return;

    setAllCritScores((prev) => ({
      ...prev,
      [criterion.id]: { ...(prev[criterion.id] || {}), [teamId]: value },
    }));
    setAllTeamScores((prev) => ({
      ...prev,
      [teamId]: { ...(prev[teamId] || {}), [criterion.id]: value },
    }));

    saveScore(teamId, criterion.id, value, allCritNotes[criterion.id] || "");
  }, [criteria, criterionIndex, allCritNotes, saveScore]);

  const handleTeamNotes = useCallback(async (val: string) => {
    const team = teams[currentIndex];
    if (!team) return;
    setAllTeamNotes((prev) => ({ ...prev, [team.id]: val }));
    for (const c of criteria) {
      const v = allTeamScores[team.id]?.[c.id];
      if (v !== undefined) {
        await saveScoreLocally({ judgeId, eventId: eid, teamId: team.id, criterionId: c.id, value: v, notes: val || null, synced: false, updatedAt: Date.now() });
      }
    }
    scheduleServerSync();
  }, [judgeId, teams, currentIndex, criteria, allTeamScores, eid, scheduleServerSync]);

  const handleCritNotes = useCallback(async (val: string) => {
    const criterion = criteria[criterionIndex];
    if (!criterion) return;
    setAllCritNotes((prev) => ({ ...prev, [criterion.id]: val }));
    for (const [teamId, v] of Object.entries(allCritScores[criterion.id] || {})) {
      await saveScoreLocally({ judgeId, eventId: eid, teamId, criterionId: criterion.id, value: v, notes: val || null, synced: false, updatedAt: Date.now() });
    }
    scheduleServerSync();
  }, [judgeId, criteria, criterionIndex, allCritScores, eid, scheduleServerSync]);

  // ── Instant navigation (synchronous — all data already loaded) ──
  const navigate = (dir: number) => {
    const idx = currentIndex + dir;
    if (idx >= 0 && idx < teams.length) setCurrentIndex(idx);
  };
  const navigateCrit = (dir: number) => {
    const idx = criterionIndex + dir;
    if (idx >= 0 && idx < criteria.length) setCriterionIndex(idx);
  };

  // ── Render helpers ──
  const currentTeam = teams[currentIndex];
  const currentCriterion = criteria[criterionIndex];
  const syncIcon = syncStatus === "saved" ? "✅" : syncStatus === "saving" ? "⏳" : "💾";

  const dark = !!bgUrl;
  const cardCls = dark ? "bg-black/75 border-white/20 shadow-lg" : "";
  const titleCls = dark ? "text-white" : "";
  const subTextCls = dark ? "text-white/60" : "text-gray-500";
  const headerCls = dark ? "bg-black/80 backdrop-blur-md border-b border-white/10" : "bg-card border-b border-border shadow-sm";
  const numInputCls = dark
    ? "w-16 text-center text-lg font-bold border-2 border-indigo-400/60 rounded-lg py-1 focus:border-indigo-400 focus:outline-none bg-white/10 text-white"
    : "w-16 text-center text-lg font-bold border-2 border-indigo-500/50 rounded-lg py-1 focus:border-indigo-400 focus:outline-none bg-transparent text-foreground";

  const activeTeamLabel = teamsLabelEnabled && teamsLabel ? teamsLabel : null;
  const activeCritLabel = criteriaLabelEnabled && criteriaLabel ? criteriaLabel : null;

  const NavRow = ({
    onPrev, onNext, onFinish, current, total, disablePrev, disableNext, label,
  }: { onPrev: () => void; onNext: () => void; onFinish?: () => void; current: number; total: number; disablePrev: boolean; disableNext: boolean; label?: string | null }) => {
    const isLast = current === total;
    return (
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={disablePrev}
          className={cn("shrink-0", dark && "border-white/30 text-white hover:bg-white/10 hover:text-white disabled:opacity-40")}>←</Button>
        <span className={cn("text-sm font-semibold tabular-nums select-none", dark ? "text-white/80" : "text-muted-foreground")}>
          {label ? `${label} ` : ""}{current} / {total}
        </span>
        {isLast && onFinish ? (
          <Button size="sm" onClick={onFinish}
            className="shrink-0 bg-green-600 hover:bg-green-500 text-white border-0">
            Готово ✓
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onNext} disabled={disableNext}
            className={cn("shrink-0", dark && "border-white/30 text-white hover:bg-white/10 hover:text-white disabled:opacity-40")}>→</Button>
        )}
      </div>
    );
  };

  const bgStyle = bgUrl
    ? { backgroundImage: `url(${bgUrl})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }
    : {};

  const dismissAlert = () => {
    const jid = localStorage.getItem("judge_id") || "";
    localStorage.setItem(`judge_alerted_${jid}_v${alertVersion}`, "1");
    setShowAlert(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Загрузка...</p>
    </div>
  );

  if (sessionExpired) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3 px-6">
        <p className="text-4xl">⏱️</p>
        <p className="text-lg font-semibold">Сессия судьи истекла</p>
        <p className="text-muted-foreground text-sm">Перейдите по своей ссылке ещё раз, чтобы войти заново.</p>
      </div>
    </div>
  );

  return (
    <div className={cn("min-h-screen", !bgUrl && "bg-background")} style={bgUrl ? bgStyle : {}}>
      {bgUrl && overlayEnabled && (
        <div className="fixed inset-0 pointer-events-none z-0" style={{ background: hexToRgba(overlayColor, overlayOpacity) }} />
      )}

      {/* Welcome alert — shown only on first open */}
      {showAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className={`text-lg font-bold text-${alertAlign}`}>{alertTitle || "👋 Добро пожаловать!"}</h2>
            {alertText && <p className={`text-sm text-muted-foreground whitespace-pre-wrap text-${alertAlign}`}>{alertText}</p>}
            <Button onClick={dismissAlert} className="w-full">{alertButtonText || "Приступить к оцениванию →"}</Button>
          </div>
        </div>
      )}
      <header className={`${headerCls} px-4 py-3 flex justify-between items-center sticky top-0 z-10`}>
        <div>
          <h1 className="text-lg font-bold">⚖️ Оценивание</h1>
          {judgeName && <p className={`text-xs ${subTextCls}`}>{judgeName}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm" title="Статус сохранения">{syncIcon}</span>
          <Badge variant={isOnline ? "default" : "destructive"} className="text-xs">
            {isOnline ? "🟢" : "🔴"}
          </Badge>
        </div>
      </header>

      <main className="relative z-1 max-w-lg mx-auto p-4 space-y-4">
        {mode === "team" ? (
          <>
            <NavRow
              onPrev={() => navigate(-1)} onNext={() => navigate(1)}
              current={currentIndex + 1} total={teams.length}
              disablePrev={currentIndex === 0} disableNext={currentIndex === teams.length - 1}
              label={activeTeamLabel}
              onFinish={() => router.push(`/live/${eid}`)}
            />

            <Card className={cardCls}>
              <CardHeader className="pb-2">
                {activeTeamLabel && <p className={`text-xs text-center mb-1 ${subTextCls}`}>{activeTeamLabel}</p>}
                <CardTitle className={`text-xl text-center ${titleCls}`}>{currentTeam?.name}</CardTitle>
                {currentTeam?.description && <p className={`text-sm text-center ${subTextCls}`}>{currentTeam.description}</p>}
              </CardHeader>
            </Card>

            {criteria.map((criterion) => {
              const val = allTeamScores[currentTeam?.id]?.[criterion.id] ?? 0;
              return (
                <Card key={criterion.id} className={cardCls}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className={`font-medium ${titleCls}`}>{criterion.name}</span>
                      <span className={`text-sm ${subTextCls}`}>макс. {criterion.max_score}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Slider
                          min={0} max={criterion.max_score} step={1}
                          value={[val]}
                          onValueChange={([v]) => handleTeamScore(criterion.id, v)}
                          className="[&_[role=slider]]:bg-indigo-500 [&_[role=slider]]:border-indigo-600 [&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&_[role=slider]]:shadow-md"
                        />
                      </div>
                      <input
                        type="number" inputMode="numeric" pattern="[0-9]*"
                        min={0} max={criterion.max_score}
                        value={val}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          handleTeamScore(criterion.id, isNaN(v) ? 0 : clamp(v, 0, criterion.max_score));
                        }}
                        className={numInputCls}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {notesEnabled && (
              <Card className={cardCls}>
                <CardContent className="pt-4">
                  <label className={`text-sm font-medium mb-2 block ${titleCls}`}>📝 Заметка</label>
                  <Textarea
                    placeholder="Комментарии к команде..."
                    rows={3}
                    value={allTeamNotes[currentTeam?.id] || ""}
                    onChange={(e) => handleTeamNotes(e.target.value)}
                    className={dark ? "bg-white/10 text-white border-white/20 placeholder:text-white/40 focus:border-white/40" : ""}
                  />
                </CardContent>
              </Card>
            )}

            <NavRow
              onPrev={() => navigate(-1)} onNext={() => navigate(1)}
              current={currentIndex + 1} total={teams.length}
              disablePrev={currentIndex === 0} disableNext={currentIndex === teams.length - 1}
              label={activeTeamLabel}
              onFinish={() => router.push(`/live/${eid}`)}
            />
          </>
        ) : (
          <>
            <NavRow
              onPrev={() => navigateCrit(-1)} onNext={() => navigateCrit(1)}
              current={criterionIndex + 1} total={criteria.length}
              disablePrev={criterionIndex === 0} disableNext={criterionIndex === criteria.length - 1}
              label={activeCritLabel}
              onFinish={() => router.push(`/live/${eid}`)}
            />

            <Card className={cardCls}>
              <CardHeader className="pb-2">
                {activeCritLabel && <p className={`text-xs text-center mb-1 ${subTextCls}`}>{activeCritLabel}</p>}
                <CardTitle className={`text-xl text-center ${titleCls}`}>{currentCriterion?.name}</CardTitle>
                <p className={`text-sm text-center ${subTextCls}`}>Максимум: {currentCriterion?.max_score} баллов</p>
              </CardHeader>
            </Card>

            {teams.map((team) => {
              const val = allCritScores[currentCriterion?.id]?.[team.id] ?? 0;
              return (
                <Card key={team.id} className={cardCls}>
                  <CardContent className="pt-4 space-y-3">
                    <span className={`font-medium ${titleCls}`}>{team.name}</span>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Slider
                          min={0} max={currentCriterion?.max_score ?? 10} step={1}
                          value={[val]}
                          onValueChange={([v]) => handleCritScore(team.id, v)}
                          className="[&_[role=slider]]:bg-indigo-500 [&_[role=slider]]:border-indigo-600 [&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&_[role=slider]]:shadow-md"
                        />
                      </div>
                      <input
                        type="number" inputMode="numeric" pattern="[0-9]*"
                        min={0} max={currentCriterion?.max_score ?? 10}
                        value={val}
                        onChange={(e) => {
                          const max = currentCriterion?.max_score ?? 10;
                          const v = parseInt(e.target.value, 10);
                          handleCritScore(team.id, isNaN(v) ? 0 : clamp(v, 0, max));
                        }}
                        className={numInputCls}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {notesEnabled && (
              <Card className={cardCls}>
                <CardContent className="pt-4">
                  <label className={`text-sm font-medium mb-2 block ${titleCls}`}>📝 Заметка по критерию</label>
                  <Textarea
                    placeholder="Комментарии по критерию..."
                    rows={3}
                    value={allCritNotes[currentCriterion?.id] || ""}
                    onChange={(e) => handleCritNotes(e.target.value)}
                    className={dark ? "bg-white/10 text-white border-white/20 placeholder:text-white/40 focus:border-white/40" : ""}
                  />
                </CardContent>
              </Card>
            )}

            <NavRow
              onPrev={() => navigateCrit(-1)} onNext={() => navigateCrit(1)}
              current={criterionIndex + 1} total={criteria.length}
              disablePrev={criterionIndex === 0} disableNext={criterionIndex === criteria.length - 1}
              label={activeCritLabel}
              onFinish={() => router.push(`/live/${eid}`)}
            />
          </>
        )}
      </main>
    </div>
  );
}
