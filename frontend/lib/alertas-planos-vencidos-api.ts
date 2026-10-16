export type AlertaPlanoVencido = {
  id: string;
  email: string;
  dias: number;
  ativo: boolean;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
};

export type AlertasRegras = {
  dominios_permitidos: string[];
  dias_min: number;
  dias_max: number;
  max_emails?: number;
  emails_cadastrados?: number;
  horario: string;
  origem: string;
  descricao: string;
};

export type AlertasResponse = {
  alertas: AlertaPlanoVencido[];
  regras: AlertasRegras;
};

function apiCandidates(): string[] {
  const values: string[] = [];
  const configured = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");

  if (configured) values.push(configured);

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const hostname = window.location.hostname || "127.0.0.1";
    values.push(`${protocol}//${hostname}:8000`);
  }

  values.push("http://127.0.0.1:8000", "http://localhost:8000");
  return Array.from(new Set(values.filter(Boolean)));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const candidates = apiCandidates();
  let lastNetworkError: unknown = null;

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = payload?.detail;
        throw new Error(typeof detail === "string" ? detail : "Não foi possível concluir a ação.");
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof Error && error.message !== "Failed to fetch" && !/fetch/i.test(error.message)) {
        throw error;
      }
      lastNetworkError = error;
    }
  }

  console.error("Falha ao conectar ao backend do ClickDados", lastNetworkError);
  throw new Error("Não foi possível conectar ao servidor do ClickDados. Verifique se o backend está aberto e tente novamente.");
}

export function listAlertasPlanosVencidosRequest(token: string) {
  return request<AlertasResponse>("/api/alertas-planos-vencidos", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createAlertaPlanoVencidoRequest(token: string, email: string, dias: number) {
  return request<{ message: string; alerta: AlertaPlanoVencido }>("/api/alertas-planos-vencidos", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, dias }),
  });
}

export function deleteAlertaPlanoVencidoRequest(token: string, alertId: string) {
  return request<{ message: string }>(`/api/alertas-planos-vencidos/${encodeURIComponent(alertId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type AlertaEnvioResultado = {
  dias: number;
  status: string;
  destinatarios?: number;
  clientes?: number;
  valor_total?: number;
  erros?: string[];
  detail?: string;
};

export function sendAlertasPlanosVencidosNowRequest(token: string) {
  return request<{
    referencia: string;
    assinaturas: number;
    periodos: number;
    resultados: AlertaEnvioResultado[];
  }>("/api/alertas-planos-vencidos/enviar-agora", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}
