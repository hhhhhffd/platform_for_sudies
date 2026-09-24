"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-3">
          <div className="text-4xl" aria-hidden="true">🏆</div>
          <CardTitle className="text-3xl">JudgeFlow</CardTitle>
          <CardDescription>Панель организатора</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="code">Код доступа</Label>
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
              <p className="text-sm text-muted-foreground">Шестизначный код из приложения-аутентификатора.</p>
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
