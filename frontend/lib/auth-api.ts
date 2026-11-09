import type { AuthUser, ManagedUser, PageOption, UserRole } from "@/types/auth";

// No site publicado, a API usa as rotas /api do mesmo dominio.
// Nao tente localhost:8000 no navegador de usuarios da Vercel.
function apiCandidates(): string[] {
  const configured = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return [window.location.origin];
    }

    const candidates = [
      configured,
      `${window.location.protocol}//${hostname}:8000`,
      "http://127.0.0.1:8000",
      "http://localhost:8000",
    ];
    return Array.from(new Set(candidates.filter(Boolean)));
  }

  return [configured || "http://127.0.0.1:8000"];
}

export class AuthRequestError extends Error {
  constructor(message: string, public readonly status: number | null = null) {
    super(message);
    this.name = "AuthRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const candidates = apiCandidates();
  let lastNetworkError: unknown = null;

  for (const base of candidates) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new AuthRequestError(
          typeof payload?.detail === "string" ? payload.detail : "Não foi possível concluir a ação.",
          response.status,
        );
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof AuthRequestError) throw error;
      lastNetworkError = error;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  console.error("Falha de rede ao conectar ao backend do ClickDados", lastNetworkError);
  throw new AuthRequestError(
    "Não foi possível validar sua conexão com o ClickDados. Tente novamente.",
    null,
  );
}

export type LoginResponse =
  | { status: "authenticated"; token: string; user: AuthUser }
  | { status: "first_access_required"; user: AuthUser; message: string };

export function loginRequest(email: string, password: string) {
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function firstAccessRequest(email: string, password: string) {
  return request<{ status: "authenticated"; token: string; user: AuthUser }>("/api/auth/first-access", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function sendCodeRequest(name: string, email: string) {
  return request<{ message: string }>("/api/auth/send-code", {
    method: "POST",
    body: JSON.stringify({ name, email }),
  });
}

export function verifyCodeRequest(name: string, email: string, code: string) {
  return request<{ message: string; created: boolean }>("/api/auth/verify-code", {
    method: "POST",
    body: JSON.stringify({ name, email, code }),
  });
}

export function meRequest(token: string) {
  return request<AuthUser>("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updateSettingsRequest(token: string, currentPassword: string, newEmail?: string, newPassword?: string) {
  return request<{ message: string; token: string; user: AuthUser }>("/api/auth/settings", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ current_password: currentPassword, new_email: newEmail || null, new_password: newPassword || null }),
  });
}

export function listUsersRequest(token: string) {
  return request<{ pages: PageOption[]; users: ManagedUser[] }>("/api/auth/users", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createUserRequest(
  token: string,
  payload: { name: string; email: string; role: UserRole; pages: string[] },
) {
  return request<{ message: string; user: ManagedUser }>("/api/auth/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function updateUserAccessRequest(
  token: string,
  email: string,
  payload: { role: UserRole; pages: string[] },
) {
  return request<{ message: string; user: ManagedUser }>(`/api/auth/users/${encodeURIComponent(email)}/access`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function updateManagedUserRequest(
  token: string,
  email: string,
  payload: { name: string; email: string; role: UserRole; pages: string[] },
) {
  return request<{ message: string; user: ManagedUser }>(`/api/auth/users/${encodeURIComponent(email)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function resetManagedUserPasswordRequest(token: string, email: string) {
  return request<{ message: string; temporary_password: string; user: ManagedUser }>(
    `/api/auth/users/${encodeURIComponent(email)}/reset-password`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export function deleteManagedUserRequest(token: string, email: string) {
  return request<{ message: string }>(`/api/auth/users/${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
