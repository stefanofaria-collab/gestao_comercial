const PREFIX = "gestao-comercial-browser-cache";

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type StoredValue<T> = {
  date: string;
  value: T;
};

function isTemporaryValue(value: unknown, today: string) {
  if (!value || typeof value !== "object") return false;
  const info = (value as {
    _cache_info?: {
      fallback?: boolean;
      refreshing?: boolean;
      source_date?: string | null;
    };
  })._cache_info;

  if (!info) return false;
  if (info.fallback || info.refreshing) return true;
  if (info.source_date && info.source_date !== today) return true;
  return false;
}

export async function browserDailyCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (typeof window === "undefined") {
    return loader();
  }

  const storageKey = `${PREFIX}:${key}`;
  const today = todayKey();

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredValue<T>;
      if (parsed?.date === today && !isTemporaryValue(parsed.value, today)) {
        // Responde imediatamente com o que a tela já carregou hoje e atualiza
        // silenciosamente para a próxima visita. Snapshots temporários de um
        // período anterior nunca são fixados como o cache definitivo do dia.
        void loader()
          .then((fresh) => {
            try {
              if (!isTemporaryValue(fresh, today)) {
                window.sessionStorage.setItem(storageKey, JSON.stringify({ date: today, value: fresh }));
              }
            } catch {
              // Cache do navegador é apenas uma otimização.
            }
          })
          .catch(() => undefined);
        return parsed.value;
      }
    }
  } catch {
    // Segue normalmente sem cache do navegador.
  }

  const fresh = await loader();
  try {
    if (!isTemporaryValue(fresh, today)) {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ date: today, value: fresh }));
    }
  } catch {
    // Sem impacto funcional.
  }
  return fresh;
}
