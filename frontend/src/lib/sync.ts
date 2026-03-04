import api from "./api";
import { getUnsyncedScores, markSynced } from "./offline-db";

export async function syncOfflineScores() {
  // Only sync the current judge's scores — never send another judge's data
  const judgeId = localStorage.getItem("judge_id") || "";
  const unsynced = await getUnsyncedScores(judgeId);
  if (unsynced.length === 0) return 0;

  // Group by event
  const byEvent = new Map<string, typeof unsynced>();
  for (const s of unsynced) {
    const arr = byEvent.get(s.eventId) || [];
    arr.push(s);
    byEvent.set(s.eventId, arr);
  }

  let totalSynced = 0;

  for (const eventId of Array.from(byEvent.keys())) {
    const scores = byEvent.get(eventId)!;
    try {
      await api.put("/api/judge/scores", {
        scores: scores.map((s) => ({
          team_id: s.teamId,
          criterion_id: s.criterionId,
          value: s.value,
          notes: s.notes,
        })),
      });
      await markSynced(scores.map((s) => s.id));
      totalSynced += scores.length;
    } catch {
      // Will retry next cycle
    }
  }

  return totalSynced;
}
