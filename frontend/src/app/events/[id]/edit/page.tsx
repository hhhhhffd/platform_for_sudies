"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { extractErrorMessage, toDatetimeLocal } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface TeamItem { id: string; name: string; description: string | null }
interface CriterionItem { id: string; name: string; max_score: number }
interface JudgeItem { id: string; token: string; link: string; name: string | null }

const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
  <label className="flex items-center gap-3 cursor-pointer select-none">
    <div onClick={() => onChange(!value)} className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${value ? "bg-blue-500" : "bg-muted"}`}>
      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? "translate-x-4" : "translate-x-0"}`} />
    </div>
    <span className="text-sm font-medium">{label}</span>
  </label>
);

export default function EditEventPage() {
  const { id } = useParams();
  const router = useRouter();
  const { isAuthenticated, hydrated } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [eventStatus, setEventStatus] = useState("draft");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Basic info
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [location, setLocation] = useState("");

  // Judge settings
  const [scoringMode, setScoringMode] = useState<"team" | "criterion">("team");
  const [notesEnabled, setNotesEnabled] = useState(true);

  // Teams
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamDesc, setEditTeamDesc] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [addingTeam, setAddingTeam] = useState(false);

  // Criteria
  const [criteria, setCriteria] = useState<CriterionItem[]>([]);
  const [editCritId, setEditCritId] = useState<string | null>(null);
  const [editCritName, setEditCritName] = useState("");
  const [editCritMax, setEditCritMax] = useState("");
  const [newCritName, setNewCritName] = useState("");
  const [newCritMax, setNewCritMax] = useState("10");
  const [addingCrit, setAddingCrit] = useState(false);

  // Judges
  const [judges, setJudges] = useState<JudgeItem[]>([]);
  const [editJudgeId, setEditJudgeId] = useState<string | null>(null);
  const [editJudgeName, setEditJudgeName] = useState("");
  const [newJudgeName, setNewJudgeName] = useState("");
  const [addingJudge, setAddingJudge] = useState(false);

  // Alert settings
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertText, setAlertText] = useState("");
  const [alertAlign, setAlertAlign] = useState<"left" | "center" | "right">("left");
  const [alertButtonText, setAlertButtonText] = useState("");

  // Overlay settings
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [overlayColor, setOverlayColor] = useState("#000000");
  const [overlayOpacity, setOverlayOpacity] = useState(0.35);

  // Label/prefix settings
  const [criteriaLabel, setCriteriaLabel] = useState("");
  const [criteriaLabelEnabled, setCriteriaLabelEnabled] = useState(true);
  const [teamsLabel, setTeamsLabel] = useState("");
  const [teamsLabelEnabled, setTeamsLabelEnabled] = useState(true);

  const loadEvent = useCallback(async () => {
    try {
      const res = await api.get(`/api/events/${id}`);
      const e = res.data;
      setName(e.name);
      setDescription(e.description || "");
      setStartDate(e.start_date ? toDatetimeLocal(e.start_date) : "");
      setEventStatus(e.status);
      setLocation(e.location || "");
      setScoringMode(e.scoring_mode || "team");
      setNotesEnabled(e.notes_enabled ?? true);
      setTeams(e.teams || []);
      setCriteria((e.criteria || []).map((c: CriterionItem) => ({ ...c, max_score: Number(c.max_score) })));
      setJudges(e.judge_tokens || []);
      setAlertEnabled(e.alert_enabled ?? false);
      setAlertTitle(e.alert_title || "");
      setAlertText(e.alert_text || "");
      setAlertAlign(e.alert_align || "left");
      setAlertButtonText(e.alert_button_text || "");
      setOverlayEnabled(e.overlay_enabled ?? true);
      setOverlayColor(e.overlay_color || "#000000");
      setOverlayOpacity(Number(e.overlay_opacity ?? 0.35));
      setCriteriaLabel(e.criteria_label || "");
      setCriteriaLabelEnabled(e.criteria_label_enabled ?? true);
      setTeamsLabel(e.teams_label || "");
      setTeamsLabelEnabled(e.teams_label_enabled ?? true);
    } catch {
      toast({ title: "Ошибка загрузки", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) { router.replace("/login"); return; }
    loadEvent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, isAuthenticated]);

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: "Введите название", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await api.patch(`/api/events/${id}`, {
        name: name.trim(),
        description: description || null,
        start_date: startDate ? new Date(startDate).toISOString() : undefined,
        location: location || null,
        ...(eventStatus === "draft" ? { scoring_mode: scoringMode, notes_enabled: notesEnabled } : {}),
        alert_enabled: alertEnabled,
        alert_title: alertTitle || null,
        alert_text: alertText || null,
        alert_align: alertAlign,
        alert_button_text: alertButtonText || null,
        overlay_enabled: overlayEnabled,
        overlay_color: overlayColor,
        overlay_opacity: overlayOpacity,
        criteria_label: criteriaLabel || null,
        criteria_label_enabled: criteriaLabelEnabled,
        teams_label: teamsLabel || null,
        teams_label_enabled: teamsLabelEnabled,
      });
      toast({ title: "✅ Сохранено" });
      router.push(`/events/${id}`);
    } catch (e: any) {
      toast({ title: "Ошибка", description: extractErrorMessage(e, "Не удалось сохранить"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleResetAlerts = async () => {
    if (!confirm("Сбросить алерты? Все судьи увидят алерт заново.")) return;
    setResetting(true);
    try {
      await api.post(`/api/events/${id}/reset-alerts`);
      toast({ title: "🔔 Алерты сброшены" });
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  // ── Team handlers ──
  const startEditTeam = (t: TeamItem) => { setEditTeamId(t.id); setEditTeamName(t.name); setEditTeamDesc(t.description || ""); };
  const saveTeam = async (teamId: string) => {
    if (!editTeamName.trim()) return;
    try {
      await api.patch(`/api/events/${id}/teams/${teamId}`, { name: editTeamName.trim(), description: editTeamDesc || null });
      setTeams((prev) => prev.map((t) => t.id === teamId ? { ...t, name: editTeamName.trim(), description: editTeamDesc || null } : t));
      setEditTeamId(null);
    } catch { toast({ title: "Ошибка", variant: "destructive" }); }
  };
  const deleteTeam = async (teamId: string) => {
    if (!confirm("Удалить команду? Все оценки этой команды также будут удалены.")) return;
    try {
      await api.delete(`/api/events/${id}/teams/${teamId}`);
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
    } catch { toast({ title: "Ошибка", variant: "destructive" }); }
  };
  const addTeam = async () => {
    if (!newTeamName.trim()) return;
    setAddingTeam(true);
    try {
      const res = await api.post(`/api/events/${id}/teams`, { name: newTeamName.trim(), description: null });
      setTeams((prev) => [...prev, res.data]);
      setNewTeamName("");
    } catch { toast({ title: "Ошибка", variant: "destructive" }); }
    setAddingTeam(false);
  };

  // ── Criterion handlers ──
  const startEditCrit = (c: CriterionItem) => { setEditCritId(c.id); setEditCritName(c.name); setEditCritMax(String(c.max_score)); };
  const saveCrit = async (critId: string) => {
    if (!editCritName.trim() || !editCritMax) return;
    try {
      await api.patch(`/api/events/${id}/criteria/${critId}`, { name: editCritName.trim(), max_score: Number(editCritMax) });
      setCriteria((prev) => prev.map((c) => c.id === critId ? { ...c, name: editCritName.trim(), max_score: Number(editCritMax) } : c));
      setEditCritId(null);
    } catch { toast({ title: "Ошибка", variant: "destructive" }); }
  };
  const deleteCrit = async (critId: string) => {
    if (!confirm("Удалить критерий? Все оценки по этому критерию также будут удалены.")) return;
    try {
      await api.delete(`/api/events/${id}/criteria/${critId}`);
      setCriteria((prev) => prev.filter((c) => c.id !== critId));
    } catch { toast({ title: "Ошибка", variant: "destructive" }); }
  };
  const addCrit = async () => {
    if (!newCritName.trim() || !newCritMax) return;
    setAddingCrit(true);
    try {
      const res = await api.post(`/api/events/${id}/criteria`, { name: newCritName.trim(), max_score: Number(newCritMax) });
      setCriteria((prev) => [...prev, { ...res.data, max_score: Number(res.data.max_score) }]);
      setNewCritName("");
      setNewCritMax("10");
    } catch { toast({ title: "Ошибка", variant: "destructive" }); }
    setAddingCrit(false);
  };

  // ── Judge handlers ──
  const startEditJudge = (j: JudgeItem) => { setEditJudgeId(j.id); setEditJudgeName(j.name || ""); };
  const saveJudge = async (judgeId: string) => {
    try {
      await api.patch(`/api/events/${id}/judges/${judgeId}`, { name: editJudgeName || null });
      setJudges((prev) => prev.map((j) => j.id === judgeId ? { ...j, name: editJudgeName || null } : j));
      setEditJudgeId(null);
    } catch { toast({ title: "Ошибка", variant: "destructive" }); }
  };
  const addJudge = async () => {
    setAddingJudge(true);
    try {
      const res = await api.post(`/api/events/${id}/judges`, { name: newJudgeName || null });
      setJudges((prev) => [...prev, res.data]);
      setNewJudgeName("");
    } catch { toast({ title: "Ошибка", variant: "destructive" }); }
    setAddingJudge(false);
  };

  if (!hydrated || loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Загрузка...</p></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">←</button>
        <h1 className="text-xl font-bold">✏️ Редактирование мероприятия</h1>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-4">
        {eventStatus !== "draft" && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">После начала оценивания состав, критерии и режим оценки заблокированы. Остальные настройки можно обновить.</p>}

        {/* Basic info */}
        <Card>
          <CardHeader><CardTitle>Основная информация</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Название *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Описание</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
            <div className="space-y-2"><Label>Дата и время</Label><Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Место</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Judge settings */}
        {eventStatus === "draft" && (
        <Card>
          <CardHeader><CardTitle>Настройки оценивания</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Режим оценивания</Label>
              <div className="grid grid-cols-2 gap-3">
                {(["team", "criterion"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setScoringMode(m)}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${scoringMode === m ? "border-indigo-500 bg-indigo-950/60" : "border-border"}`}>
                    <div className="font-medium text-sm">{m === "team" ? "👤 По команде" : "📋 По критерию"}</div>
                  </button>
                ))}
              </div>
            </div>
            <Toggle value={notesEnabled} onChange={setNotesEnabled} label="Заметки судей" />
          </CardContent>
        </Card>
        )}

        {/* Judges */}
        <Card>
          <CardHeader><CardTitle>Судьи ({judges.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {judges.map((j) => (
              <div key={j.id} className="flex items-center gap-2 border rounded-lg p-2">
                {editJudgeId === j.id ? (
                  <>
                    <Input className="flex-1 h-8" value={editJudgeName} onChange={(e) => setEditJudgeName(e.target.value)} placeholder="Имя судьи" />
                    <Button size="sm" onClick={() => saveJudge(j.id)}>✓</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditJudgeId(null)}>✕</Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{j.name || <span className="text-muted-foreground italic">Судья</span>}</p>
                      <p className="text-xs text-muted-foreground truncate">{j.link}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => startEditJudge(j)}>✏️</Button>
                  </>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Input className="flex-1 h-8" placeholder="Имя нового судьи (необяз.)" value={newJudgeName} onChange={(e) => setNewJudgeName(e.target.value)} />
              <Button size="sm" onClick={addJudge} disabled={addingJudge}>{addingJudge ? "..." : "+ Добавить"}</Button>
            </div>
          </CardContent>
        </Card>

        {/* Teams */}
        {eventStatus === "draft" && (
        <Card>
          <CardHeader><CardTitle>Команды ({teams.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {teams.map((t) => (
              <div key={t.id} className="flex items-center gap-2 border rounded-lg p-2">
                {editTeamId === t.id ? (
                  <>
                    <div className="flex-1 space-y-1">
                      <Input className="h-8" value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} placeholder="Название команды" />
                      <Input className="h-7 text-xs" value={editTeamDesc} onChange={(e) => setEditTeamDesc(e.target.value)} placeholder="Описание (необяз.)" />
                    </div>
                    <Button size="sm" onClick={() => saveTeam(t.id)}>✓</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditTeamId(null)}>✕</Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => startEditTeam(t)}>✏️</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteTeam(t.id)}>🗑️</Button>
                  </>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Input className="flex-1 h-8" placeholder="Название новой команды" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTeam()} />
              <Button size="sm" onClick={addTeam} disabled={addingTeam || !newTeamName.trim()}>{addingTeam ? "..." : "+ Добавить"}</Button>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Criteria */}
        {eventStatus === "draft" && (
        <Card>
          <CardHeader><CardTitle>Критерии ({criteria.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {criteria.map((c) => (
              <div key={c.id} className="flex items-center gap-2 border rounded-lg p-2">
                {editCritId === c.id ? (
                  <>
                    <Input className="flex-1 h-8" value={editCritName} onChange={(e) => setEditCritName(e.target.value)} placeholder="Название" />
                    <Input className="w-20 h-8 text-sm" type="number" value={editCritMax} onChange={(e) => setEditCritMax(e.target.value)} placeholder="Макс." />
                    <Button size="sm" onClick={() => saveCrit(c.id)}>✓</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditCritId(null)}>✕</Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">Макс: {c.max_score}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => startEditCrit(c)}>✏️</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteCrit(c.id)}>🗑️</Button>
                  </>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Input className="flex-1 h-8" placeholder="Название критерия" value={newCritName} onChange={(e) => setNewCritName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCrit()} />
              <Input className="w-20 h-8 text-sm" type="number" placeholder="Макс." value={newCritMax} onChange={(e) => setNewCritMax(e.target.value)} />
              <Button size="sm" onClick={addCrit} disabled={addingCrit || !newCritName.trim()}>{addingCrit ? "..." : "+ Добавить"}</Button>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Labels */}
        <Card>
          <CardHeader><CardTitle>🏷️ Метки (префиксы)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Показываются в интерфейсе судьи перед названием. Например: «Этап» вместо «Критерий».</p>
            <div className="space-y-3">
              <Toggle value={criteriaLabelEnabled} onChange={setCriteriaLabelEnabled} label="Метка для критериев" />
              {criteriaLabelEnabled && (
                <Input placeholder='Например: "Этап", "Задание", "Номинация"' value={criteriaLabel} onChange={(e) => setCriteriaLabel(e.target.value)} />
              )}
            </div>
            <div className="space-y-3">
              <Toggle value={teamsLabelEnabled} onChange={setTeamsLabelEnabled} label="Метка для команд" />
              {teamsLabelEnabled && (
                <Input placeholder='Например: "Проект", "Участник", "Группа"' value={teamsLabel} onChange={(e) => setTeamsLabel(e.target.value)} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Alert settings */}
        <Card>
          <CardHeader><CardTitle>🔔 Алерт при открытии ссылки</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Toggle value={alertEnabled} onChange={setAlertEnabled} label="Показывать алерт" />
            {alertEnabled && (
              <>
                <div className="space-y-2"><Label>Заголовок</Label><Input placeholder='По умолч. "👋 Добро пожаловать!"' value={alertTitle} onChange={(e) => setAlertTitle(e.target.value)} /></div>
                <div className="space-y-2"><Label>Текст</Label><Textarea placeholder="Инструкции для судей..." rows={3} value={alertText} onChange={(e) => setAlertText(e.target.value)} /></div>
                <div className="space-y-2">
                  <Label>Выравнивание текста</Label>
                  <div className="flex gap-2">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button key={a} type="button" onClick={() => setAlertAlign(a)}
                        className={`flex-1 py-1.5 text-xs rounded border-2 transition-colors ${alertAlign === a ? "border-indigo-500 bg-indigo-950/60" : "border-border"}`}>
                        {a === "left" ? "← Слева" : a === "center" ? "⬛ Центр" : "→ Справа"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2"><Label>Текст кнопки</Label><Input placeholder='По умолч. "Приступить к оцениванию →"' value={alertButtonText} onChange={(e) => setAlertButtonText(e.target.value)} /></div>
                <div className="flex items-center gap-3 pt-2 border-t">
                  <p className="flex-1 text-sm text-muted-foreground">Судьи уже видели алерт? Сбросьте — они увидят снова.</p>
                  <Button variant="outline" size="sm" onClick={handleResetAlerts} disabled={resetting}>{resetting ? "..." : "🔄 Сбросить алерты"}</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Overlay settings */}
        <Card>
          <CardHeader><CardTitle>🎨 Затемняющий слой</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Toggle value={overlayEnabled} onChange={setOverlayEnabled} label="Показывать слой поверх фона" />
            {overlayEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Цвет</Label>
                  <input type="color" value={overlayColor} onChange={(e) => setOverlayColor(e.target.value)}
                    className="h-9 w-full rounded border cursor-pointer bg-transparent" />
                </div>
                <div className="space-y-2">
                  <Label>Прозрачность: {Math.round(overlayOpacity * 100)}%</Label>
                  <Slider min={0} max={100} step={5} value={[Math.round(overlayOpacity * 100)]} onValueChange={([v]) => setOverlayOpacity(v / 100)} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end pb-8">
          <Button variant="outline" onClick={() => router.back()}>Отмена</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Сохранение..." : "💾 Сохранить"}</Button>
        </div>
      </main>
    </div>
  );
}
