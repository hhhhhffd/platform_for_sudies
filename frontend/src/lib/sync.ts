import api from "./api";
import { getUnsyncedScores, markSynced } from "./offline-db";

type SyncResult = { synced: number; pending: number };
let inFlight: Promise<SyncResult> | null = null;

export function syncOfflineScores(): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = performSync().finally(() => { inFlight = null; });
  }
  return inFlight;
}

async function performSync(): Promise<SyncResult> {
  const judgeId = localStorage.getItem("judge_id");
  if (!judgeId) return { synced: 0, pending: 0 };
  const unsynced = await getUnsyncedScores(judgeId);
  if (unsynced.length === 0) return { synced: 0, pending: 0 };

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
      await markSynced(scores);
      totalSynced += scores.length;
    } catch {
      // Keep these entries pending for the next sync attempt.
    }
  }

  return { synced: totalSynced, pending: (await getUnsyncedScores(judgeId)).length };
}
