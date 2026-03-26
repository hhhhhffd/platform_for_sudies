import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "",
  headers: { "Content-Type": "application/json" },
  timeout: 10000, // 10s — prevents hanging on dead tunnel URLs
  withCredentials: true, // send httpOnly cookies automatically
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // Judge tokens are still in localStorage (no cookie for judges — they use token links)
    const judgeToken = localStorage.getItem("judge_token");
    const isJudgePath = config.url?.startsWith("/api/judge") || config.url?.startsWith("/ws/");
    if (isJudgePath && judgeToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${judgeToken}`;
    }
    // Organizer auth is handled via httpOnly cookies (sent automatically)
  }
  return config;
});

// Mutex: ensures only one token refresh request runs at a time.
let refreshPromise: Promise<void> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      // Only refresh for organizer tokens, not judge
      const isJudge = original.url?.startsWith("/api/judge") || original.url?.startsWith("/ws/");
      if (isJudge) {
        return Promise.reject(error);
      }
      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${api.defaults.baseURL}/api/auth/refresh`, {}, { withCredentials: true })
            .then(() => {
              // Cookies are refreshed automatically by the server
            })
            .catch((err) => {
              // Only clear on explicit rejection
              if (err.response?.status === 401 || err.response?.status === 403) {
                window.location.href = "/login";
              }
              throw err;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }
        await refreshPromise;
        // Retry original request — cookies are already refreshed
        return api(original);
      } catch {
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
