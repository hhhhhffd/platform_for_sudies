"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, FileUp, ImagePlus, Plus, Trash2, Trophy } from "lucide-react";
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
const steps = ["Основное", "Критерии", "Команды", "Судьи"];

export default function NewEventPage() {
  const router = useRouter();
  const { isAuthenticated, hydrated } = useAuthStore();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  // Step 1
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startDateError, setStartDateError] = useState(false);
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
    if (step === 1) return Boolean(name.trim() && startDate && !startDateError);
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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Ссылка скопирована" });
    } catch {
      toast({ title: "Не удалось скопировать ссылку", variant: "destructive" });
    }
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
      <header className="border-b border-border bg-card/70">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4 sm:px-8">
          <Button asChild variant="ghost" size="icon" aria-label="К мероприятиям">
            <Link href="/dashboard"><ArrowLeft className="size-5" aria-hidden="true" /></Link>
          </Button>
          <Trophy className="size-5 text-primary" aria-hidden="true" />
          <span className="font-semibold">JudgeFlow</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-9 sm:px-8 sm:py-12">
        <div className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Подготовка мероприятия</p>
          <h1 className="text-3xl font-semibold tracking-tight">{step === 5 ? "Мероприятие создано" : "Новое мероприятие"}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{step === 5 ? "Ссылки готовы. Откройте мероприятие, когда будете готовы начать оценивание." : "Добавьте главное сейчас. До начала оценивания всё можно изменить."}</p>
        </div>
        {step <= 4 && (
          <nav aria-label="Шаги создания" className="mb-7">
            <ol className="grid grid-cols-4 gap-2 sm:gap-4">
              {steps.map((title, index) => {
                const number = index + 1;
                return (
                  <li key={title} aria-current={number === step ? "step" : undefined} className="min-w-0">
                    <div className={"mb-2 h-1 rounded-full " + (number <= step ? "bg-primary" : "bg-muted")} />
                    <div className={"flex items-center gap-2 text-xs sm:text-sm " + (number === step ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      <span className={"flex size-6 shrink-0 items-center justify-center rounded-full text-xs " + (number <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{number < step ? <Check className="size-3.5" aria-hidden="true" /> : number}</span>
                      <span className="hidden truncate sm:inline">{title}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-sm text-muted-foreground sm:hidden">Шаг {step} из 4 · {steps[step - 1]}</p>
          </nav>
        )}

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Основная информация</CardTitle>
              <CardDescription>Название и дата будут видны судьям и зрителям.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="event-name">Название <span aria-hidden="true">*</span></Label>
                <Input id="event-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Городской хакатон" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-description">Описание</Label>
                <Textarea id="event-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="О чём мероприятие" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-date">Дата и время <span aria-hidden="true">*</span></Label>
                <Input id="event-date" required type="datetime-local" value={startDate} onChange={(e) => {
                  setStartDate(e.target.value);
                  setStartDateError(Boolean(e.target.value && new Date(e.target.value).getTime() < Date.now() - 60000));
                }} />
                {startDateError && <p role="alert" className="text-sm text-destructive">Укажите дату и время в будущем.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-location">Место</Label>
                <Input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Городской центр проектов" />
              </div>
              <div className="flex items-center justify-between border-t border-border pt-5">
                <Button variant="outline" onClick={() => router.push("/dashboard")}>Отменить</Button>
                <Button onClick={() => setStep(2)} disabled={!canNext()}>К критериям <ArrowRight className="size-4" aria-hidden="true" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Criteria */}
        {step === 2 && (
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Критерии оценки</CardTitle>
              <CardDescription>Для каждого критерия укажите максимальный балл.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {criteria.map((c, i) => (
                <div key={i} className="flex items-end gap-2 rounded-lg border border-border p-3 sm:gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={"criterion-name-" + i}>Критерий {i + 1}</Label>
                    <Input id={"criterion-name-" + i} value={c.name} onChange={(e) => updateCriterion(i, "name", e.target.value)} placeholder="Идея" />
                  </div>
                  <div className="w-20 shrink-0 space-y-1 sm:w-28">
                    <Label htmlFor={"criterion-score-" + i}>Макс. балл</Label>
                    <Input id={"criterion-score-" + i} type="number" min="1" value={c.max_score} onChange={(e) => updateCriterion(i, "max_score", e.target.value)} />
                  </div>
                  {criteria.length > 1 && (
                    <Button variant="ghost" size="icon" aria-label={"Удалить критерий " + (i + 1)} onClick={() => removeCriterion(i)}><Trash2 className="size-4" aria-hidden="true" /></Button>
                  )}
                </div>
              ))}
              <Button variant="outline" onClick={addCriterion}><Plus className="size-4" aria-hidden="true" />Добавить критерий</Button>
              <div className="flex justify-between border-t border-border pt-5">
                <Button variant="outline" onClick={() => setStep(1)}>Назад</Button>
                <Button onClick={() => setStep(3)} disabled={!canNext()}>К командам <ArrowRight className="size-4" aria-hidden="true" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Teams */}
        {step === 3 && (
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Команды</CardTitle>
              <CardDescription>Добавьте команды вручную или загрузите CSV с названием и описанием.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-medium">Импорт из CSV</p>
                <input id="team-csv" type="file" accept=".csv,text/csv" onChange={handleCSV} className="peer sr-only" />
                <label htmlFor="team-csv" className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring"><FileUp className="size-4" aria-hidden="true" />Выбрать CSV-файл</label>
                <p className="text-xs text-muted-foreground">Столбцы: название, описание. Импорт заменит текущий список команд.</p>
              </div>
              <div className="space-y-3 border-t border-border pt-5">
                {teams.map((t, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3 sm:gap-3">
                    <div className="w-full space-y-1 sm:min-w-32 sm:flex-1">
                      <Label htmlFor={"team-name-" + i}>Команда {i + 1}</Label>
                      <Input id={"team-name-" + i} value={t.name} onChange={(e) => updateTeam(i, "name", e.target.value)} placeholder="Название команды" />
                    </div>
                    <div className="w-full space-y-1 sm:min-w-32 sm:flex-1">
                      <Label htmlFor={"team-description-" + i}>Описание</Label>
                      <Input id={"team-description-" + i} value={t.description} onChange={(e) => updateTeam(i, "description", e.target.value)} placeholder="Необязательно" />
                    </div>
                    {teams.length > 1 && (
                      <Button variant="ghost" size="icon" aria-label={"Удалить команду " + (i + 1)} onClick={() => removeTeam(i)}><Trash2 className="size-4" aria-hidden="true" /></Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" onClick={addTeam}><Plus className="size-4" aria-hidden="true" />Добавить команду</Button>
              </div>
              <div className="flex justify-between border-t border-border pt-5">
                <Button variant="outline" onClick={() => setStep(2)}>Назад</Button>
                <Button onClick={() => setStep(4)} disabled={!canNext()}>К судьям <ArrowRight className="size-4" aria-hidden="true" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Judges */}
        {step === 4 && (
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Судьи и порядок оценки</CardTitle>
              <CardDescription>Каждому судье будет создана персональная ссылка.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-medium">Судьи ({judges.length})</p>
                <div className="space-y-2">
                  {judges.map((j, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        aria-label={"Имя судьи " + (i + 1)}
                        placeholder={`Судья ${i + 1} (необязательно)`}
                        value={j.name}
                        onChange={(e) => setJudgeName(i, e.target.value)}
                      />
                      {judges.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" aria-label={"Удалить судью " + (i + 1)} onClick={() => removeJudge(i)} className="shrink-0"><Trash2 className="size-4" aria-hidden="true" /></Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" onClick={addJudge}><Plus className="size-4" aria-hidden="true" />Добавить судью</Button>
              </div>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Порядок оценки</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block cursor-pointer">
                    <input className="peer sr-only" type="radio" name="scoring-mode" checked={scoringMode === "team"} onChange={() => setScoringMode("team")} />
                    <span className="block h-full rounded-lg border-2 border-border p-4 transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      <span className="block text-sm font-semibold">По команде</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">Все критерии одной команды, затем следующая команда.</span>
                    </span>
                  </label>
                  <label className="block cursor-pointer">
                    <input className="peer sr-only" type="radio" name="scoring-mode" checked={scoringMode === "criterion"} onChange={() => setScoringMode("criterion")} />
                    <span className="block h-full rounded-lg border-2 border-border p-4 transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      <span className="block text-sm font-semibold">По критерию</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">Все команды по одному критерию, затем следующий критерий.</span>
                    </span>
                  </label>
                </div>
              </fieldset>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border p-4">
                <span>
                  <span className="block text-sm font-medium">Заметки судей</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Судьи смогут оставить комментарий к оценке.</span>
                </span>
                <input type="checkbox" checked={notesEnabled} onChange={(event) => setNotesEnabled(event.target.checked)} className="size-5 shrink-0 accent-primary" />
              </label>

              <div className="flex justify-between border-t border-border pt-5">
                <Button variant="outline" onClick={() => setStep(3)}>Назад</Button>
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? "Создание..." : "Создать мероприятие"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Result */}
        {step === 5 && result && (
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Check className="size-5 text-emerald-400" aria-hidden="true" />Ссылки готовы</CardTitle>
              <CardDescription>{result.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold">Ссылки для судей</h2>
                <p className="mt-1 text-xs text-muted-foreground">Каждую ссылку передайте только её судье.</p>
                <div className="mt-3 space-y-2">
                  {result.judge_tokens.map((jt: any, i: number) => (
                    <div key={jt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
                      <span className="min-w-0 break-words text-sm font-medium">{jt.name || `Судья ${i + 1}`}</span>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" asChild><Link href={`/judge/${result.id}/${jt.token}`} target="_blank" rel="noopener noreferrer" aria-label={`Открыть ссылку судьи ${jt.name || i + 1}`}><ExternalLink className="size-4" aria-hidden="true" /></Link></Button>
                        <Button size="sm" variant="outline" onClick={() => void copyToClipboard(`${window.location.origin}/judge/${result.id}/${jt.token}`)}><Copy className="size-4" aria-hidden="true" />Копировать</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold">Страница результатов</h2>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
                  <span className="min-w-0 break-all text-xs text-muted-foreground">{`${window.location.origin}/live/${result.id}`}</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" asChild><Link href={`/live/${result.id}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" aria-hidden="true" />Открыть</Link></Button>
                    <Button size="sm" variant="outline" onClick={() => void copyToClipboard(`${window.location.origin}/live/${result.id}`)}><Copy className="size-4" aria-hidden="true" />Копировать</Button>
                  </div>
                </div>
              </div>
              <div className="border-t border-border pt-5">
                <p className="mb-2 text-sm font-semibold">Фоновое изображение <span className="font-normal text-muted-foreground">(необязательно)</span></p>
                <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
                <Button variant="outline" size="sm" onClick={() => bgInputRef.current?.click()} disabled={uploadingBg}>
                  <ImagePlus className="size-4" aria-hidden="true" />{uploadingBg ? "Загрузка..." : bgUploaded ? "Фон загружен · Заменить" : "Загрузить фон"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">Отображается у судей и в live-режиме. Макс 5 МБ.</p>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-5">
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
