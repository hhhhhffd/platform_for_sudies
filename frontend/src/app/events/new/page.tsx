"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import api from "@/lib/api";
import { extractErrorMessage } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Criterion { name: string; max_score: string }
interface Team { name: string; description: string }

export default function NewEventPage() {
  const router = useRouter();
  const { isAuthenticated, hydrated } = useAuthStore();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [location, setLocation] = useState("");

  // Step 2
  const [criteria, setCriteria] = useState<Criterion[]>([{ name: "", max_score: "10" }]);

  // Step 3
  const [teams, setTeams] = useState<Team[]>([{ name: "", description: "" }]);

  // Step 4
  const [judges, setJudges] = useState<{ name: string }[]>([{ name: "" }, { name: "" }, { name: "" }]);
  const [scoringMode, setScoringMode] = useState<"team" | "criterion">("team");
  const [notesEnabled, setNotesEnabled] = useState(true);

  const addJudge = () => setJudges((prev) => [...prev, { name: "" }]);
  const removeJudge = (i: number) => setJudges((prev) => prev.filter((_, idx) => idx !== i));
  const setJudgeName = (i: number, val: string) => setJudges((prev) => prev.map((j, idx) => idx === i ? { ...j, name: val } : j));

  // Result
  const [result, setResult] = useState<any>(null);
  const [uploadingBg, setUploadingBg] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const [bgUploaded, setBgUploaded] = useState(false);

  if (!hydrated) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Загрузка...</p></div>;
  }

  if (!isAuthenticated) {
    router.replace("/login");
    return null;
  }

  const addCriterion = () => setCriteria([...criteria, { name: "", max_score: "10" }]);
  const removeCriterion = (i: number) => setCriteria(criteria.filter((_, idx) => idx !== i));
  const updateCriterion = (i: number, field: keyof Criterion, value: string) => {
    const c = [...criteria];
    c[i] = { ...c[i], [field]: value };
    setCriteria(c);
  };

  const addTeam = () => setTeams([...teams, { name: "", description: "" }]);
  const removeTeam = (i: number) => setTeams(teams.filter((_, idx) => idx !== i));
  const updateTeam = (i: number, field: keyof Team, value: string) => {
    const t = [...teams];
    t[i] = { ...t[i], [field]: value };
    setTeams(t);
  };

  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" });
      if (parsed.errors.length) throw new Error(`Ошибка CSV в строке ${(parsed.errors[0]?.row ?? 0) + 1}`);
      const rows = parsed.data;
      if (rows[0]?.[0]?.replace(/^\uFEFF/, "").trim().toLowerCase() === "name" || rows[0]?.[0]?.trim().toLowerCase() === "название") {
        rows.shift();
      }
      if (!rows.length || rows.some((row) => row.length > 2 || !row[0]?.trim())) {
        throw new Error("CSV должен содержать название и необязательное описание в каждой строке");
      }
      setTeams(rows.map(([name, description]) => ({ name: name.trim(), description: description?.trim() || "" })));
      toast({ title: `Загружено команд: ${rows.length}` });
    } catch (error) {
      toast({ title: "Не удалось импортировать CSV", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
    e.target.value = "";
  };

  const canNext = () => {
    if (step === 1) return name.trim() && startDate;
    if (step === 2) return criteria.every((c) => c.name.trim() && Number(c.max_score) > 0);
    if (step === 3) return teams.every((t) => t.name.trim());
    return true;
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await api.post("/api/events", {
        name,
        description: description || null,
        start_date: new Date(startDate).toISOString(),
        location: location || null,
        criteria: criteria.map((c) => ({ name: c.name, max_score: Number(c.max_score) })),
        teams: teams.map((t) => ({ name: t.name, description: t.description || null })),
        judge_count: judges.length,
        judge_names: judges.map((j) => j.name.trim() || null),
        scoring_mode: scoringMode,
        notes_enabled: notesEnabled,
      });
      setResult(res.data);
      setStep(5);
    } catch (e: any) {
      toast({ title: "Ошибка", description: extractErrorMessage(e, "Не удалось создать"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Скопировано!" });
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !result) return;
    setUploadingBg(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/api/events/${result.id}/background`, form, { headers: { "Content-Type": "multipart/form-data" } });
      setBgUploaded(true);
      toast({ title: "🖼️ Фон загружен" });
    } catch {
      toast({ title: "Ошибка загрузки фона", variant: "destructive" });
    } finally {
      setUploadingBg(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border px-6 py-4">
        <h1 className="text-xl font-bold">🏆 Создание мероприятия</h1>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        {/* Progress */}
        {step <= 4 && (
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${s < step ? "bg-indigo-600 text-white" : s === step ? "bg-indigo-600 text-white ring-4 ring-indigo-200" : "bg-muted text-muted-foreground"}`}>
                  {s < step ? "✓" : s}
                </div>
                {s < 4 && <div className={`h-1 flex-1 rounded ${s < step ? "bg-indigo-600" : "bg-muted"}`} />}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Основная информация</CardTitle>
              <CardDescription>Шаг 1 из 4</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Название *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Хакатон AI 2026" />
              </div>
              <div className="space-y-2">
                <Label>Описание</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание мероприятия" />
              </div>
              <div className="space-y-2">
                <Label>Дата и время *</Label>
                <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Место</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Сколково" />
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => router.push("/dashboard")}>Отменить</Button>
                <Button onClick={() => setStep(2)} disabled={!canNext()}>Далее →</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Criteria */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Критерии оценки</CardTitle>
              <CardDescription>Шаг 2 из 4</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {criteria.map((c, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <Label>Название</Label>
                    <Input value={c.name} onChange={(e) => updateCriterion(i, "name", e.target.value)} placeholder="Идея" />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label>Макс балл</Label>
                    <Input type="number" min="1" value={c.max_score} onChange={(e) => updateCriterion(i, "max_score", e.target.value)} />
                  </div>
                  {criteria.length > 1 && (
                    <Button variant="outline" size="sm" onClick={() => removeCriterion(i)}>✕</Button>
                  )}
                </div>
              ))}
              <Button variant="outline" onClick={addCriterion}>+ Добавить критерий</Button>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>← Назад</Button>
                <Button onClick={() => setStep(3)} disabled={!canNext()}>Далее →</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Teams */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Команды</CardTitle>
              <CardDescription>Шаг 3 из 4. Можно загрузить CSV (name,description)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Импорт из CSV</Label>
                <Input type="file" accept=".csv" onChange={handleCSV} className="mt-1" />
              </div>
              <div className="border-t pt-4 space-y-3">
                {teams.map((t, i) => (
                  <div key={i} className="flex flex-wrap gap-2 items-end">
                    <div className="flex-1 min-w-36 space-y-1">
                      <Label>Название</Label>
                      <Input value={t.name} onChange={(e) => updateTeam(i, "name", e.target.value)} placeholder="Team Alpha" />
                    </div>
                    <div className="flex-1 min-w-36 space-y-1">
                      <Label>Описание</Label>
                      <Input value={t.description} onChange={(e) => updateTeam(i, "description", e.target.value)} placeholder="Необязательно" />
                    </div>
                    {teams.length > 1 && (
                      <Button variant="outline" size="sm" onClick={() => removeTeam(i)}>✕</Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" onClick={addTeam}>+ Добавить команду</Button>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>← Назад</Button>
                <Button onClick={() => setStep(4)} disabled={!canNext()}>Далее →</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Judges */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Судьи и режим оценки</CardTitle>
              <CardDescription>Шаг 4 из 4</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Судьи ({judges.length})</Label>
                <div className="space-y-2">
                  {judges.map((j, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        placeholder={`Судья ${i + 1} (необязательно)`}
                        value={j.name}
                        onChange={(e) => setJudgeName(i, e.target.value)}
                      />
                      {judges.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeJudge(i)} className="shrink-0 text-red-500">✕</Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addJudge}>+ Добавить судью</Button>
              </div>
              <div className="space-y-2">
                <Label>Режим оценивания судьями</Label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => setScoringMode("team")}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${scoringMode === "team" ? "border-indigo-500 bg-indigo-950/60" : "border-border hover:border-border/80"}`}
                  >
                    <div className="font-medium text-sm">👤 По команде</div>
                    <div className="text-xs text-muted-foreground mt-1">Судья оценивает одну команду по всем критериям, затем переходит к следующей</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScoringMode("criterion")}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${scoringMode === "criterion" ? "border-indigo-500 bg-indigo-950/60" : "border-border hover:border-border/80"}`}
                  >
                    <div className="font-medium text-sm">📋 По критерию</div>
                    <div className="text-xs text-muted-foreground mt-1">Судья оценивает все команды по одному критерию, затем переходит к следующему</div>
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setNotesEnabled(!notesEnabled)}
                    className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${notesEnabled ? "bg-blue-500" : "bg-muted"}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${notesEnabled ? "translate-x-4" : "translate-x-0"}`} />
                  </div>
                  <span className="text-sm font-medium">Заметки судей</span>
                  <span className="text-xs text-gray-500">{notesEnabled ? "включены" : "отключены"}</span>
                </label>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(3)}>← Назад</Button>
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? "Создание..." : "🚀 Создать мероприятие"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Result */}
        {step === 5 && result && (
          <Card>
            <CardHeader>
              <CardTitle>✅ Мероприятие создано!</CardTitle>
              <CardDescription>{result.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-base font-semibold">Ссылки для судей:</Label>
                <div className="space-y-2 mt-2">
                  {result.judge_tokens.map((jt: any, i: number) => (
                    <div key={jt.id} className="flex items-center gap-2 bg-muted/60 border border-border p-2 rounded">
                      <span className="text-sm font-mono flex-1 text-muted-foreground">
                        {jt.name || `Судья ${i + 1}`}: {jt.token}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => window.open(`${window.location.origin}/judge/${result.id}/${jt.token}`, "_blank")}>↗</Button>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(`${window.location.origin}/judge/${result.id}/${jt.token}`)}>
                        📋
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-base font-semibold">Публичная ссылка:</Label>
                <div className="flex items-center gap-2 bg-muted/60 border border-border p-2 rounded mt-2">
                  <span className="text-sm font-mono flex-1 text-muted-foreground">{`${window.location.origin}/live/${result.id}`}</span>
                  <Button size="sm" variant="outline" onClick={() => window.open(`${window.location.origin}/live/${result.id}`, "_blank")}>↗ Открыть</Button>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(`${window.location.origin}/live/${result.id}`)}>
                    📋
                  </Button>
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-2">🖼️ Фоновое изображение <span className="font-normal text-gray-500">(необязательно)</span></p>
                <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
                <Button variant="outline" size="sm" onClick={() => bgInputRef.current?.click()} disabled={uploadingBg}>
                  {uploadingBg ? "Загрузка..." : bgUploaded ? "✅ Фон загружен · Заменить" : "Загрузить фон"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">Отображается у судей и в live-режиме. Макс 5 МБ.</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => router.push(`/events/${result.id}`)}>Открыть мероприятие</Button>
                <Button variant="outline" onClick={() => router.push("/dashboard")}>К списку</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
