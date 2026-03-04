"use client";

import { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

export default function EventDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { isAuthenticated, hydrated } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [deleting, setDeleting] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [editingJudge, setEditingJudge] = useState<string | null>(null);
  const [judgeNameInput, setJudgeNameInput] = useState("");
  const bgInputRef = useRef<HTMLInputElement>(null);

  const handleDelete = async () => {
    if (!confirm("Удалить мероприятие? Это действие необратимо.")) return;
    setDeleting(true);
    try {
      await api.delete(`/api/events/${id}`);
      toast({ title: "Мероприятие удалено" });
      router.push("/dashboard");
    } catch {
      toast({ title: "Ошибка удаления", variant: "destructive" });
      setDeleting(false);
    }
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBg(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/api/events/${id}/background`, form, { headers: { "Content-Type": "multipart/form-data" } });
      toast({ title: "Фон загружен" });
      qc.invalidateQueries({ queryKey: ["event", id] });
    } catch {
      toast({ title: "Ошибка загрузки фона", variant: "destructive" });
    } finally {
      setUploadingBg(false);
    }
  };

  const handleBgDelete = async () => {
    try {
      await api.delete(`/api/events/${id}/background`);
      toast({ title: "Фон удалён" });
      qc.invalidateQueries({ queryKey: ["event", id] });
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    }
  };

  const startEditJudge = (jt: any) => {
    setEditingJudge(jt.id);
    setJudgeNameInput(jt.name || "");
  };

  const saveJudgeName = async (jtId: string) => {
    try {
      await api.patch(`/api/events/${id}/judges/${jtId}`, { name: judgeNameInput || null });
      toast({ title: "Имя судьи сохранено" });
      qc.invalidateQueries({ queryKey: ["event", id] });
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setEditingJudge(null);
    }
  };

  const { data: event, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api.get(`/api/events/${id}`).then((r) => r.data),
    enabled: hydrated && isAuthenticated,
  });

  const { data: results } = useQuery({
    queryKey: ["results", id],
    queryFn: () => api.get(`/api/events/${id}/results`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: 10000,
  });

  if (!hydrated) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Загрузка...</p></div>;
  }

  if (!isAuthenticated) {
    router.replace("/login");
    return null;
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Скопировано!" });
  };

  const exportCSV = async () => {
    try {
      const res = await api.get(`/api/events/${id}/export.csv`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `results_${id}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Ошибка экспорта", variant: "destructive" });
    }
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Загрузка...</div>;
  if (!event) return <div className="p-6 text-muted-foreground">Мероприятие не найдено</div>;

  const maxTotal = event.criteria.reduce((s: number, c: any) => s + Number(c.max_score), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">←</Link>
          <h1 className="text-xl font-bold">{event.name}</h1>
          <Badge variant="outline">{event.status}</Badge>
        </div>
        <div className="flex gap-2">
          <Link href={`/events/${id}/edit`}>
            <Button variant="outline" size="sm">✏️ Редактировать</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={exportCSV}>📥 CSV</Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
            {deleting ? "..." : "🗑️"}
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Info */}
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">📅 Дата:</span> {new Date(event.start_date).toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              {event.location && <div><span className="text-muted-foreground">📍 Место:</span> {event.location}</div>}
              {event.description && <div className="col-span-2"><span className="text-muted-foreground">📝</span> {event.description}</div>}
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Criteria */}
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-base">Критерии ({event.criteria.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {event.criteria.map((c: any) => (
                  <div key={c.id} className="flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="text-muted-foreground">макс. {c.max_score}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Teams */}
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-base">Команды ({event.teams.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {event.teams.map((t: any, i: number) => (
                  <div key={t.id} className="text-sm">{i + 1}. {t.name}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Judge Tokens */}
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Токены судей ({event.judge_tokens.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {event.judge_tokens.map((jt: any, i: number) => (
              <div key={jt.id} className="bg-muted p-2 rounded text-sm space-y-1">
                <div className="flex items-center gap-2">
                  {editingJudge === jt.id ? (
                    <>
                      <input
                        autoFocus
                        className="border rounded px-2 py-0.5 text-sm flex-1 bg-background border-border"
                        placeholder={`Судья ${i + 1}`}
                        value={judgeNameInput}
                        onChange={(e) => setJudgeNameInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveJudgeName(jt.id); if (e.key === "Escape") setEditingJudge(null); }}
                      />
                      <Button size="sm" variant="default" onClick={() => saveJudgeName(jt.id)}>✓</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingJudge(null)}>✕</Button>
                    </>
                  ) : (
                    <>
                      <span className="font-mono flex-1 text-sm">{jt.name || `Судья ${i + 1}`}: {jt.token}</span>
                      <Button size="sm" variant="ghost" onClick={() => startEditJudge(jt)} title="Переименовать">✏️</Button>
                      <Button size="sm" variant="outline" onClick={() => window.open(`${window.location.origin}/judge/${event.id}/${jt.token}`, "_blank")}>↗</Button>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(`${window.location.origin}/judge/${event.id}/${jt.token}`)}>📋</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            <Separator className="my-3" />
            <div className="flex items-center gap-2 bg-muted/60 border border-border p-2 rounded text-sm">
              <span className="flex-1 truncate text-muted-foreground">🔴 Live: {`${window.location.origin}/live/${event.id}`}</span>
              <Button size="sm" variant="outline" onClick={() => window.open(`${window.location.origin}/live/${event.id}`, "_blank")}>↗ Открыть</Button>
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(`${window.location.origin}/live/${event.id}`)}>📋</Button>
            </div>
          </CardContent>
        </Card>

        {/* Background image */}
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">🖼️ Фоновое изображение</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {event.background_url && (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={event.background_url} alt="Фон" className="w-full h-32 object-cover rounded" />
                <Button size="sm" variant="destructive" className="absolute top-2 right-2" onClick={handleBgDelete}>✕</Button>
              </div>
            )}
            <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
            <Button variant="outline" size="sm" onClick={() => bgInputRef.current?.click()} disabled={uploadingBg}>
              {uploadingBg ? "Загрузка..." : event.background_url ? "Заменить фон" : "Загрузить фон"}
            </Button>
            <p className="text-xs text-muted-foreground">Отображается у судей и в live-режиме. Максимум 5 МБ, форматы: JPG, PNG, WebP, GIF.</p>
          </CardContent>
        </Card>

        {/* Results */}
        {results && results.results.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-base">📊 Результаты</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">#</th>
                      <th className="text-left py-2">Команда</th>
                      {event.criteria.map((c: any) => (
                        <th key={c.id} className="text-right py-2">{c.name}</th>
                      ))}
                      <th className="text-right py-2 font-bold">Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results.map((r: any, i: number) => (
                      <tr key={r.team_id} className="border-b last:border-0 even:bg-muted/50">
                        <td className="py-2">{i + 1}</td>
                        <td className="py-2 font-medium">{r.team_name}</td>
                        {r.breakdown.map((b: any, j: number) => (
                          <td key={j} className="text-right py-2">{Number(b.score).toFixed(1)}</td>
                        ))}
                        <td className="text-right py-2 font-bold">{Number(r.total_score).toFixed(1)} / {maxTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
