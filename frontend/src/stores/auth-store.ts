import { create } from "zustand";

interface AuthState {
  isAuthenticated: boolean;
  userEmail: string | null;
  hydrated: boolean;
  login: (accessToken: string, refreshToken: string, email?: string) => void;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  userEmail: null,
  hydrated: false,
  login: (accessToken, refreshToken, email) => {
    // Clear judge tokens to avoid role conflicts
    localStorage.removeItem("judge_token");
    localStorage.removeItem("judge_event_id");
    localStorage.removeItem("judge_id");
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    if (email) localStorage.setItem("user_email", email);
    set({ isAuthenticated: true, userEmail: email || null });
  },
  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_email");
    // Clear judge tokens too
    localStorage.removeItem("judge_token");
    localStorage.removeItem("judge_event_id");
    localStorage.removeItem("judge_id");
    set({ isAuthenticated: false, userEmail: null });
  },
  hydrate: () => {
    const token = localStorage.getItem("access_token");
    const email = localStorage.getItem("user_email");
    set({ isAuthenticated: !!token, userEmail: email, hydrated: true });
  },
}));
