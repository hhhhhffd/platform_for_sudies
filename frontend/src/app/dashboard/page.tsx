"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Plus, Scale, Trophy, UsersRound } from "lucide-react";
import api from "@/lib/api";
import { extractErrorMessage } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface EventSummary {
  id: string;
  name: string;
  status: string;
  start_date: string;
  teams_count: number;
  judges_count: number;
}

const eventStates: Record<string, { label: string; action: string; color: string }> = {
  draft: { label: "Подготовка", action: "Продолжить подготовку", color: "text-amber-300 bg-amber-400/10 border-amber-400/20" },
  active: { label: "Идёт оценивание", action: "Следить за оценками", color: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20" },
  completed: { label: "Завершено", action: "Посмотреть результаты", color: "text-slate-300 bg-slate-400/10 border-slate-400/20" },
};

function countLabel(count: number, forms: [string, string, string]) {
  const lastTwo = count % 100;
  const last = count % 10;
  const form = lastTwo >= 11 && lastTwo <= 14 ? forms[2] : last === 1 ? forms[0] : last >= 2 && last <= 4 ? forms[1] : forms[2];
  return count + " " + form;
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, hydrated, logout } = useAuthStore();
  const { toast } = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await api.post("/api/auth/logout");
      logout();
      router.push("/login");
    } catch (error) {
      toast({ title: "Не удалось выйти", description: extractErrorMessage(error, "Проверьте соединение и попробуйте снова"), variant: "destructive" });
      setLoggingOut(false);
    }
  };

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace("/login");
  }, [hydrated, isAuthenticated, router]);

  const { data, isLoading, isError, refetch } = useQuery<{ events: EventSummary[] }>({
    queryKey: ["events"],
    queryFn: () => api.get("/api/events").then((response) => response.data),
    enabled: hydrated && isAuthenticated,
  });

  if (!hydrated) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Загрузка...</div>;
  }
  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary"><Trophy className="size-5" aria-hidden="true" /></span>
            <span>JudgeFlow</span>
          </div>
          <Button variant="ghost" size="sm" disabled={loggingOut} onClick={handleLogout}>
            {loggingOut ? "Выходим..." : "Выйти"}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-9 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Панель организатора</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Мероприятия</h1>
            <p className="mt-2 text-sm text-muted-foreground">Подготовка, оценивание и результаты в одном месте.</p>
          </div>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/events/new"><Plus className="size-4" aria-hidden="true" />Создать мероприятие</Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3" role="status" aria-label="Загрузка мероприятий">
            {[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl border border-border bg-card" />)}
          </div>
        ) : isError ? (
          <Card><CardContent className="px-6 py-10 sm:px-8">
            <h2 className="text-lg font-semibold">Не удалось загрузить мероприятия</h2>
            <p className="mt-2 text-sm text-muted-foreground">Проверьте соединение и повторите попытку.</p>
            <Button variant="outline" className="mt-5" onClick={() => void refetch()}>Повторить</Button>
          </CardContent></Card>
        ) : !data?.events.length ? (
          <Card className="border-dashed"><CardContent className="px-6 py-12 sm:px-8">
            <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Trophy className="size-5" aria-hidden="true" /></span>
            <h2 className="text-xl font-semibold">Первое мероприятие начинается здесь</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Добавьте дату, команды, критерии и судей. Оценивание можно открыть позже.</p>
            <Button asChild className="mt-6"><Link href="/events/new">Создать мероприятие<ArrowRight className="size-4" aria-hidden="true" /></Link></Button>
          </CardContent></Card>
        ) : (
          <section aria-label="Список мероприятий" className="space-y-3">
            {data.events.map((event) => {
              const state = eventStates[event.status];
              return (
                <Link key={event.id} href={"/events/" + event.id} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card className="border-border bg-card/80 transition-colors group-hover:border-primary/60 group-focus-visible:border-primary">
                    <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="min-w-0 break-words text-lg font-semibold leading-snug">{event.name}</h2>
                          <span className={"rounded-full border px-2.5 py-1 text-xs font-medium " + (state?.color ?? "border-border text-muted-foreground")}>{state?.label ?? event.status}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden="true" />{new Date(event.start_date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</span>
                          <span className="inline-flex items-center gap-1.5"><UsersRound className="size-4" aria-hidden="true" />{countLabel(event.teams_count, ["команда", "команды", "команд"])}</span>
                          <span className="inline-flex items-center gap-1.5"><Scale className="size-4" aria-hidden="true" />{countLabel(event.judges_count, ["судья", "судьи", "судей"])}</span>
                        </div>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary">{state?.action ?? "Открыть"}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
