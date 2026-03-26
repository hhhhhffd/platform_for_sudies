"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)" }}>
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className="text-5xl mb-2">🏆</div>
          <CardTitle className="text-3xl">JudgeFlow</CardTitle>
          <CardDescription>Регистрация недоступна</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Регистрация временно недоступна. Обратитесь к администратору для создания аккаунта.
          </p>
          <Button variant="outline" className="w-full" onClick={() => router.push("/login")}>
            Войти
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
