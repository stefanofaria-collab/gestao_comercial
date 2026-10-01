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

function isFallbackValue(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const info = (value as { _cache_info?: { fallback?: boolean } })._cache_info;
  return Boolean(info?.fallback);
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
      if (parsed?.date === today && !isFallbackValue(parsed.value)) {
        // Responde imediatamente com o que a tela já carregou hoje e atualiza
        // silenciosamente para a próxima visita. Snapshots temporários de um
        // período anterior nunca são fixados como o cache definitivo do dia.
        void loader()
          .then((fresh) => {
            try {
              if (!isFallbackValue(fresh)) {
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
    if (!isFallbackValue(fresh)) {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ date: today, value: fresh }));
    }
  } catch {
    // Sem impacto funcional.
  }
  return fresh;
}
