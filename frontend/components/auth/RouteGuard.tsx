"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthRequestError, meRequest } from "@/lib/auth-api";
import { clearStoredSession, getDefaultPath, getStoredSession, isAllowedPath, saveStoredSession } from "@/lib/auth-storage";
import type { AuthUser } from "@/types/auth";

// A validacao remota da sessao nao precisa ser repetida em toda troca de pagina.
// O cache e apenas de memoria, expira rapidamente e nunca sobrevive ao reload.
const SESSION_CACHE_MS = 2 * 60 * 1000;
let verifiedSession: { token: string; user: AuthUser; checkedAt: number } | null = null;

function updateNavigationAccess(role: string, pages: string[] | undefined) {
  window.setTimeout(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'));
    links.forEach((link) => {
      const href = link.getAttribute("href") || "";
      link.style.display = isAllowedPath(role, href, pages) ? "" : "none";
    });
  }, 100);
}

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setConnectionError(null);
    const stored = getStoredSession();

    if (pathname === "/login") {
      if (stored?.user?.role) {
        router.replace(getDefaultPath(stored.user.role, stored.user.pages));
      } else {
        setReady(true);
      }
      return () => { active = false; };
    }

    if (!stored?.token || !stored?.user?.role) {
      verifiedSession = null;
      setReady(false);
      clearStoredSession();
      router.replace("/login");
      return () => { active = false; };
    }

    const cached = verifiedSession;
    if (
      cached &&
      cached.token === stored.token &&
      Date.now() - cached.checkedAt < SESSION_CACHE_MS
    ) {
      if (!isAllowedPath(cached.user.role, pathname, cached.user.pages)) {
        setReady(false);
        router.replace(getDefaultPath(cached.user.role, cached.user.pages));
      } else {
        // Trocar entre paginas autorizadas deixa de aguardar uma nova consulta SQL.
        setReady(true);
        updateNavigationAccess(cached.user.role, cached.user.pages);
      }
      return () => { active = false; };
    }

    setReady(false);
    void meRequest(stored.token)
      .then((freshUser) => {
        if (!active) return;
        verifiedSession = { token: stored.token, user: freshUser, checkedAt: Date.now() };
        saveStoredSession({ token: stored.token, user: freshUser });

        if (!isAllowedPath(freshUser.role, pathname, freshUser.pages)) {
          router.replace(getDefaultPath(freshUser.role, freshUser.pages));
          return;
        }

        setReady(true);
        updateNavigationAccess(freshUser.role, freshUser.pages);
      })
      .catch((error: unknown) => {
        if (!active) return;

        // Somente credenciais rejeitadas invalidam a sessao. Uma falha temporaria
        // de internet ou do Supabase nao deve desconectar o usuario.
        if (error instanceof AuthRequestError && (error.status === 401 || error.status === 403)) {
          verifiedSession = null;
          clearStoredSession();
          router.replace("/login");
          return;
        }

        setConnectionError(
          "Não foi possível validar a sessão agora. Verifique sua conexão e tente novamente.",
        );
      });

    return () => { active = false; };
  }, [pathname, router, retryKey]);

  if (!ready) {
    if (connectionError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
          <div role="alert" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-lg font-bold text-slate-900">Conexão temporariamente indisponível</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">{connectionError}</p>
            <button
              type="button"
              onClick={() => { setConnectionError(null); setRetryKey((value) => value + 1); }}
              className="mt-5 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    return (
      <div role="status" className="flex min-h-screen items-center justify-center text-slate-500">
        Validando sua sessão...
      </div>
    );
  }

  return <>{children}</>;
}
