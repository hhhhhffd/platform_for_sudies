"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, hydrated, userEmail, logout } = useAuthStore();

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace("/login");
  }, [hydrated, isAuthenticated, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get("/api/events").then((r) => r.data),
    enabled: hydrated && isAuthenticated,
  });

  const statusBorderColor: Record<string, string> = {
    draft: "border-l-4 border-l-amber-400",
    active: "border-l-4 border-l-green-500",
    completed: "border-l-4 border-l-gray-400",
  };

  if (!hydrated) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Загрузка...</p></div>;
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">🏆 JudgeFlow</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{userEmail}</span>
          <Button variant="outline" size="sm" onClick={() => { logout(); router.push("/login"); }}>
            Выйти
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Мероприятия</h2>
          <Link href="/events/new">
            <Button>+ Создать мероприятие</Button>
          </Link>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Загрузка...</p>
        ) : isError ? (
          <Card>
            <CardContent className="py-12 text-center text-red-500">
              <p className="text-lg mb-2">⚠️ Не удалось загрузить мероприятия</p>
              <p className="text-sm text-muted-foreground mb-4">Проверьте соединение и попробуйте снова</p>
              <Button variant="outline" onClick={() => window.location.reload()}>Обновить</Button>
            </CardContent>
          </Card>
        ) : !data?.events?.length ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <div className="text-6xl mb-4">📋</div>
              <p className="text-xl font-semibold mb-2 text-foreground">Пока нет мероприятий</p>
              <p className="text-sm">Создайте первое мероприятие, чтобы начать</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.events.map((event: any) => (
              <Link key={event.id} href={`/events/${event.id}`} className="block">
                <Card className={`hover:shadow-lg transition-all duration-200 cursor-pointer ${statusBorderColor[event.status] || ""}`}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{event.name}</CardTitle>
                      <Badge className={
                        event.status === "draft" ? "bg-amber-400/10 text-amber-400 border-amber-400/20" :
                        event.status === "active" ? "bg-green-400/10 text-green-400 border-green-400/20" :
                        "bg-white/10 text-white/50 border-white/10"
                      }>
                        {event.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-4 text-sm text-gray-500">
                      <span>📅 {new Date(event.start_date).toLocaleDateString("ru")}</span>
                      <span>👥 {event.teams_count} команд</span>
                      <span>⚖️ {event.judges_count} судей</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
