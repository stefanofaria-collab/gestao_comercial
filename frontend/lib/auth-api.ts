import type { AuthSession, AuthUser } from "@/types/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || "Não foi possível concluir a ação.");
  }

  return response.json() as Promise<T>;
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
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function updateSettingsRequest(token: string, currentPassword: string, newEmail?: string, newPassword?: string) {
  return request<{ message: string; token: string; user: AuthUser }>("/api/auth/settings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ current_password: currentPassword, new_email: newEmail || null, new_password: newPassword || null }),
  });
}
