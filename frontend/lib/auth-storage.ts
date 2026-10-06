import type { AuthSession, UserRole } from "@/types/auth";

const STORAGE_KEY = "clickdados.auth";

export const ANALYST_ALLOWED_PATHS = [
  "/churn-score",
  "/intranet-2-0",
  "/perfil",
  "/vencimentos-futuros",
  "/configuracoes",
];

export function getDefaultPath(role?: UserRole | string | null): string {
  return role === "analista" ? "/churn-score" : "/indicadores";
}

export function isAllowedPath(role: UserRole | string | null | undefined, pathname: string): boolean {
  if (!role) return false;
  if (pathname === "/login") return true;
  if (pathname === "/configuracoes") return true;
  if (role === "gerencial") return true;
  return ANALYST_ALLOWED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.token || !parsed?.user?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: AuthSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
