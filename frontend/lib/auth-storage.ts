import type { AuthSession, UserRole } from "@/types/auth";

const STORAGE_KEY = "clickdados.auth";

export const DEFAULT_ANALYST_ALLOWED_PATHS = [
  "/churn-score",
  "/intranet-2",
  "/perfil",
  "/vencimentos-futuros",
];

export function getDefaultPath(role?: UserRole | string | null, pages?: string[] | null): string {
  if (role !== "analista") return "/indicadores";
  const allowed = pages?.length ? pages : DEFAULT_ANALYST_ALLOWED_PATHS;
  return allowed[0] || "/configuracoes";
}

export function isAllowedPath(
  role: UserRole | string | null | undefined,
  pathname: string,
  pages?: string[] | null,
): boolean {
  if (!role) return false;
  if (pathname === "/login") return true;
  if (pathname === "/configuracoes") return true;
  if (role === "gerencial") return true;
  const allowed = pages?.length ? pages : DEFAULT_ANALYST_ALLOWED_PATHS;
  return allowed.some((path) => pathname === path || pathname.startsWith(`${path}/`));
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
