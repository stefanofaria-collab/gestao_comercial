"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { clearStoredSession, getDefaultPath, getStoredSession, isAllowedPath } from "@/lib/auth-storage";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const session = useMemo(() => getStoredSession(), [pathname]);

  useEffect(() => {
    if (pathname === "/login") {
      if (session?.user?.role) {
        router.replace(getDefaultPath(session.user.role));
      } else {
        setReady(true);
      }
      return;
    }

    if (!session?.token || !session?.user?.role) {
      clearStoredSession();
      router.replace("/login");
      return;
    }

    if (!isAllowedPath(session.user.role, pathname)) {
      router.replace(getDefaultPath(session.user.role));
      return;
    }

    const disallowed = session.user.role === "analista"
      ? ["/faturamento", "/churn", "/ativos-atrasados", "/indicadores", "/atendimentos", "/pagamentos", "/upgrade-downgrade"]
      : [];

    window.setTimeout(() => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
      links.forEach((link) => {
        const href = link.getAttribute("href") || "";
        const wrapper = link.closest("li, a, div");
        if (!wrapper) return;
        if (disallowed.includes(href)) {
          (wrapper as HTMLElement).style.display = "none";
        }
        if (href === "/configuracoes") {
          (wrapper as HTMLElement).style.display = "";
        }
      });
    }, 300);

    setReady(true);
  }, [pathname, router, session]);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Carregando...</div>;
  }

  return <>{children}</>;
}
