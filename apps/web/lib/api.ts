const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/iam";

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    clinic_id: string | null;
    email: string;
    full_name: string;
    phone: string | null;
    role: string;
  };
};

export type CurrentSession = {
  user_id: string;
  clinic_id: string | null;
  clinic_name: string | null;
  email: string;
  full_name: string;
  role: string;
  mfa_enabled: boolean;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

function saveTokens(data: TokenPair, rememberMe = false) {
  clearTokens();
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem("sahel_access", data.access_token);
  storage.setItem("sahel_refresh", data.refresh_token);
}

function clearTokens() {
  localStorage.removeItem("sahel_access");
  localStorage.removeItem("sahel_refresh");
  sessionStorage.removeItem("sahel_access");
  sessionStorage.removeItem("sahel_refresh");
}

function storedToken(name: "sahel_access" | "sahel_refresh") {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(name) || sessionStorage.getItem(name);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retryWithRefresh = true
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const accessToken = storedToken("sahel_access");
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (
    response.status === 401 &&
    retryWithRefresh &&
    path !== "/auth/refresh" &&
    typeof window !== "undefined"
  ) {
    const refreshToken = storedToken("sahel_refresh");
    if (refreshToken) {
      try {
        await refreshSession();
        return request<T>(path, init, false);
      } catch (error) {
        clearTokens();
        throw error;
      }
    }
  }

  if (!response.ok) {
    const body = await response.json() as { message?: string; error?: string };
    throw new ApiError(body.message || body.error || `HTTP ${response.status}`, response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init);
}

export async function login(
  email: string,
  password: string,
  options: { rememberMe?: boolean; totpCode?: string } = {}
) {
  const data = await request<TokenPair>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      remember_me: options.rememberMe ?? false,
      totp_code: options.totpCode || null,
    })
  }, false);
  saveTokens(data, options.rememberMe ?? false);
  return data;
}

export async function registerClinic(payload: {
  clinic_name: string;
  slug: string;
  email: string;
  password: string;
  full_name: string;
  phone?: string;
}) {
  const data = await request<TokenPair>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  }, false);
  saveTokens(data, true);
  return data;
}

export async function refreshSession() {
  if (typeof window === "undefined") {
    throw new Error("تحديث الجلسة متاح من المتصفح فقط.");
  }
  const refreshToken = storedToken("sahel_refresh");
  if (!refreshToken) throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
  const rememberMe = localStorage.getItem("sahel_refresh") !== null;
  const data = await request<TokenPair>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken })
  }, false);
  saveTokens(data, rememberMe);
  return data;
}

export async function logout() {
  if (typeof window === "undefined") {
    throw new Error("تسجيل الخروج متاح من المتصفح فقط.");
  }
  const refreshToken = storedToken("sahel_refresh");
  if (refreshToken) {
    try {
      await request("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken })
      }, false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) clearTokens();
      throw error;
    }
  }
  clearTokens();
}
