import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "",
  headers: { "Content-Type": "application/json" },
  timeout: 10000, // 10s — prevents hanging on dead tunnel URLs
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const judgeToken = localStorage.getItem("judge_token");
    const orgToken = localStorage.getItem("access_token");
    if (!config.headers.Authorization) {
      // Use judge_token only for judge API paths to avoid polluting organizer requests
      const isJudgePath = config.url?.startsWith("/api/judge") || config.url?.startsWith("/ws/");
      const token = (isJudgePath && judgeToken) ? judgeToken : orgToken;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  }
  return config;
});

// Mutex: ensures only one token refresh request runs at a time.
// All concurrent 401s await this same promise instead of firing parallel refreshes.
let refreshPromise: Promise<string> | null = null;

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
      const refresh = typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null;
      if (refresh) {
        try {
          if (!refreshPromise) {
            refreshPromise = axios
              .post(`${api.defaults.baseURL}/api/auth/refresh`, { refresh_token: refresh })
              .then(({ data }) => {
                localStorage.setItem("access_token", data.access_token);
                localStorage.setItem("refresh_token", data.refresh_token);
                return data.access_token as string;
              })
              .catch((err) => {
                // Only clear tokens when server explicitly rejects them (401/403),
                // not on transient network errors
                if (err.response?.status === 401 || err.response?.status === 403) {
                  localStorage.removeItem("access_token");
                  localStorage.removeItem("refresh_token");
                  window.location.href = "/login";
                }
                throw err;
              })
              .finally(() => {
                refreshPromise = null;
              });
          }
          const newToken = await refreshPromise;
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        } catch {
          return Promise.reject(error);
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
