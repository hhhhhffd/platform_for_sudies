import { create } from "zustand";

interface AuthState {
  isAuthenticated: boolean;
  userEmail: string | null;
  hydrated: boolean;
  login: (email?: string) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  userEmail: null,
  hydrated: false,
  login: (email) => {
    // Clear judge tokens to avoid role conflicts
    localStorage.removeItem("judge_token");
    localStorage.removeItem("judge_event_id");
    localStorage.removeItem("judge_id");
    // Mark as authenticated (actual tokens are in httpOnly cookies)
    localStorage.setItem("is_authenticated", "true");
    if (email) localStorage.setItem("user_email", email);
    set({ isAuthenticated: true, userEmail: email || null });
  },
  logout: () => {
    localStorage.removeItem("is_authenticated");
    localStorage.removeItem("user_email");
    // Clear judge tokens too
    localStorage.removeItem("judge_token");
    localStorage.removeItem("judge_event_id");
    localStorage.removeItem("judge_id");
    set({ isAuthenticated: false, userEmail: null });
  },
  hydrate: () => {
    const isAuth = localStorage.getItem("is_authenticated") === "true";
    const email = localStorage.getItem("user_email");
    set({ isAuthenticated: isAuth, userEmail: email, hydrated: true });
  },
}));
