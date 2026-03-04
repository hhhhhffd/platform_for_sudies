import { create } from "zustand";

interface Criterion {
  id: string;
  name: string;
  max_score: number;
}

interface Team {
  id: string;
  name: string;
  description: string | null;
}

interface JudgeState {
  eventId: string | null;
  judgeId: string | null;
  teams: Team[];
  criteria: Criterion[];
  currentIndex: number;
  scores: Record<string, number>; // criterionId -> value
  notes: string;
  isOnline: boolean;
  setEvent: (eventId: string, judgeId: string, teams: Team[], criteria: Criterion[]) => void;
  setCurrentIndex: (i: number) => void;
  setScore: (criterionId: string, value: number) => void;
  setNotes: (notes: string) => void;
  resetScores: () => void;
  loadScores: (scores: Record<string, number>, notes: string) => void;
  setOnline: (online: boolean) => void;
}

export const useJudgeStore = create<JudgeState>((set) => ({
  eventId: null,
  judgeId: null,
  teams: [],
  criteria: [],
  currentIndex: 0,
  scores: {},
  notes: "",
  isOnline: true,
  setEvent: (eventId, judgeId, teams, criteria) =>
    set({ eventId, judgeId, teams, criteria, currentIndex: 0, scores: {}, notes: "" }),
  setCurrentIndex: (i) => set({ currentIndex: i }),
  setScore: (criterionId, value) =>
    set((state) => ({ scores: { ...state.scores, [criterionId]: value } })),
  setNotes: (notes) => set({ notes }),
  resetScores: () => set({ scores: {}, notes: "" }),
  loadScores: (scores, notes) => set({ scores, notes }),
  setOnline: (online) => set({ isOnline: online }),
}));
