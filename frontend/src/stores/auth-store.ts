import { create } from "zustand";
import api from "@/lib/api";

interface AuthState {
  isAuthenticated: boolean;
  hydrated: boolean;
  login: () => void;
  logout: () => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  hydrated: false,
  login: () => {
    // Clear judge tokens to avoid role conflicts
    localStorage.removeItem("judge_token");
    localStorage.removeItem("judge_event_id");
    localStorage.removeItem("judge_id");
    // Mark as authenticated (actual tokens are in httpOnly cookies)
    localStorage.setItem("is_authenticated", "true");
    localStorage.removeItem("user_email");
    set({ isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem("is_authenticated");
    localStorage.removeItem("user_email");
    // Clear judge tokens too
    localStorage.removeItem("judge_token");
    localStorage.removeItem("judge_event_id");
    localStorage.removeItem("judge_id");
    set({ isAuthenticated: false });
  },
  hydrate: async () => {
    if (localStorage.getItem("is_authenticated") !== "true") {
      set({ isAuthenticated: false, hydrated: true });
      return;
    }
    try {
      await api.get("/api/auth/session");
      set({ isAuthenticated: true, hydrated: true });
    } catch {
      localStorage.removeItem("is_authenticated");
      set({ isAuthenticated: false, hydrated: true });
    }
  },
}));
