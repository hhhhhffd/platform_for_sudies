"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import api from "@/lib/api";
import { extractErrorMessage } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Введите шесть цифр из приложения-аутентификатора");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/auth/login", { code });
      login();
      router.replace("/dashboard");
    } catch (error) {
      setError(extractErrorMessage(error, "Не удалось войти"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-5">
      <Card className="w-full max-w-md shadow-none">
        <CardHeader className="space-y-4 pb-5">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary"><Trophy className="size-6" aria-hidden="true" /></span>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Панель организатора</p>
            <CardTitle className="text-3xl">Войти в JudgeFlow</CardTitle>
            <CardDescription className="mt-2 leading-6">Введите код из приложения-аутентификатора.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form method="post" onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="code">Шестизначный код</Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-2xl tracking-[0.35em] font-mono"
                autoFocus
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
              {submitting ? "Проверяем код..." : "Войти"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
