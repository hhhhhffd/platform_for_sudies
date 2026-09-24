"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { extractErrorMessage } from "@/lib/utils";
import { syncOfflineScores } from "@/lib/sync";

export default function JudgeAuthPage() {
  const { token } = useParams();
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    async function auth() {
      try {
        // Flush any pending offline scores for the previous judge before switching credentials
        if (localStorage.getItem("judge_token")) {
          const { pending } = await syncOfflineScores();
          if (pending > 0) {
            setError("Сначала отправьте сохранённые оценки предыдущего судьи. Проверьте соединение и обновите страницу.");
            return;
          }
        }
        const res = await api.post("/api/judge/auth", { token });
        localStorage.setItem("judge_token", res.data.access_token);
        localStorage.setItem("judge_event_id", res.data.event_id);
        localStorage.setItem("judge_id", res.data.judge_id);
        router.replace(`/scoring/${res.data.event_id}`);
      } catch (e: any) {
        setError(extractErrorMessage(e, "Невалидный токен"));
      }
    }
    if (token) auth();
  }, [token, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-lg text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-4xl mb-4 animate-pulse">⚖️</p>
        <p className="text-gray-500">Авторизация судьи...</p>
      </div>
    </div>
  );
}
