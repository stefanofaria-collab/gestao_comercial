"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { meRequest } from "@/lib/auth-api";
import { clearStoredSession, getDefaultPath, getStoredSession, isAllowedPath, saveStoredSession } from "@/lib/auth-storage";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setReady(false);
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
      clearStoredSession();
      router.replace("/login");
      return () => { active = false; };
    }

    void meRequest(stored.token)
      .then((freshUser) => {
        if (!active) return;
        const freshSession = { token: stored.token, user: freshUser };
        saveStoredSession(freshSession);

        if (!isAllowedPath(freshUser.role, pathname, freshUser.pages)) {
          router.replace(getDefaultPath(freshUser.role, freshUser.pages));
          return;
        }

        window.setTimeout(() => {
          const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'));
          links.forEach((link) => {
            const href = link.getAttribute("href") || "";
            const allowed = isAllowedPath(freshUser.role, href, freshUser.pages);
            link.style.display = allowed ? "" : "none";
          });
        }, 100);

        setReady(true);
      })
      .catch(() => {
        if (!active) return;
        clearStoredSession();
        router.replace("/login");
      });

    return () => { active = false; };
  }, [pathname, router]);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Carregando...</div>;
  }

  return <>{children}</>;
}
