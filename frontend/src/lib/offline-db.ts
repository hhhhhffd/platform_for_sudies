import { openDB, DBSchema } from "idb";

export interface ScoreEntry {
  id: string; // `${judgeId}-${teamId}-${criterionId}`
  judgeId: string;
  eventId: string;
  teamId: string;
  criterionId: string;
  value: number;
  notes: string | null;
  synced: number; // 0 = unsynced, 1 = synced (IDB can't index booleans)
  updatedAt: number;
}

interface JudgeFlowDB extends DBSchema {
  scores: {
    key: string;
    value: ScoreEntry;
    indexes: {
      "by-event": string;
      "by-synced": number;
    };
  };
}

const DB_NAME = "judgeflow";
const DB_VERSION = 4;

function getDB() {
  return openDB<JudgeFlowDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("scores")) {
        const store = db.createObjectStore("scores", { keyPath: "id" });
        store.createIndex("by-event", "eventId");
        store.createIndex("by-synced", "synced");
      }
    },
  });
}

export async function saveScoreLocally(entry: { judgeId: string; teamId: string; criterionId: string; eventId: string; value: number; notes: string | null; synced: boolean; updatedAt: number }) {
  const db = await getDB();
  const id = `${entry.judgeId}-${entry.teamId}-${entry.criterionId}`;
  await db.put("scores", { ...entry, synced: entry.synced ? 1 : 0, id });
}

export async function getScoresForEvent(eventId: string, judgeId: string) {
  const db = await getDB();
  const all = await db.getAllFromIndex("scores", "by-event", eventId);
  return all.filter((s) => s.judgeId === judgeId);
}

export async function getUnsyncedScores(judgeId?: string) {
  const db = await getDB();
  const all = await db.getAllFromIndex("scores", "by-synced", 0);
  return judgeId ? all.filter((s) => s.judgeId === judgeId) : all;
}

export async function mergeServerScores(eventId: string, judgeId: string, scores: { team_id: string; criterion_id: string; value: number; notes: string | null }[]) {
  const db = await getDB();
  const tx = db.transaction("scores", "readwrite");
  for (const score of scores) {
    const id = `${judgeId}-${score.team_id}-${score.criterion_id}`;
    const local = await tx.store.get(id);
    if (!local || local.synced === 1) {
      await tx.store.put({
        id,
        judgeId,
        eventId,
        teamId: score.team_id,
        criterionId: score.criterion_id,
        value: Number(score.value),
        notes: score.notes,
        synced: 1,
        updatedAt: Date.now(),
      });
    }
  }
  await tx.done;
}

export async function markSynced(scores: ScoreEntry[]) {
  const db = await getDB();
  const tx = db.transaction("scores", "readwrite");
  for (const score of scores) {
    const entry = await tx.store.get(score.id);
    if (entry && entry.synced === 0 && entry.updatedAt === score.updatedAt && entry.value === score.value && entry.notes === score.notes) {
      entry.synced = 1;
      await tx.store.put(entry);
    }
  }
  await tx.done;
}
