"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Target,
  TrendingUp,
  UsersRound,
  WalletCards,
} from "lucide-react";

import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import {
  fetchChurnScoreDashboard,
  fetchChurnScoreMeta,
  trainChurnScore,
} from "@/lib/churn-score-api";
import type {
  ChurnScoreClient,
  ChurnScoreDashboardResponse,
  ChurnScoreMetricSet,
  ChurnScoreModelMeta,
} from "@/types/churn-score";

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}

function formatMetric(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits).replace(".", ",");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function riskClass(label: string) {
  if (label === "Muito alto") return "bg-red-100 text-red-700 ring-red-200";
  if (label === "Alto") return "bg-orange-100 text-orange-700 ring-orange-200";
  if (label === "Moderado") return "bg-amber-100 text-amber-700 ring-amber-200";
  return "bg-emerald-100 text-emerald-700 ring-emerald-200";
}

function Kpi({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof UsersRound;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <Icon size={18} />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{subtitle}</p>
    </div>
  );
}

function MetricCell({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{help}</p>
    </div>
  );
}

function ModelMetrics({ metrics }: { metrics?: ChurnScoreMetricSet }) {
  if (!metrics) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCell label="ROC-AUC" value={formatMetric(metrics.roc_auc)} help="Capacidade geral de separar churn de renovação." />
      <MetricCell label="PR-AUC" value={formatMetric(metrics.pr_auc)} help="Mais importante quando churn é a classe minoritária." />
      <MetricCell label="Brier" value={formatMetric(metrics.brier)} help="Erro das probabilidades; quanto menor, melhor." />
      <MetricCell label="F1" value={formatMetric(metrics.f1)} help="Equilíbrio entre precisão e recall no corte escolhido." />
      <MetricCell label="Precision" value={formatPercent(metrics.precision)} help="Entre os alertas, quantos realmente churnaram." />
      <MetricCell label="Recall" value={formatPercent(metrics.recall)} help="Entre os churns reais, quantos foram capturados." />
      <MetricCell label="Lift Top 10%" value={`${formatMetric(metrics.lift_10, 2)}x`} help="Concentração de churn no topo do ranking." />
      <MetricCell label="Captura Top 10%" value={formatPercent(metrics.captura_churn_10)} help="Percentual dos churns encontrados nos 10% maiores scores." />
    </div>
  );
}

function ClientRow({ item }: { item: ChurnScoreClient }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black text-slate-950">{item.score}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${riskClass(item.faixa_risco)}`}>
            {item.faixa_risco}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">ML {item.probabilidade_ml.toFixed(1).replace(".", ",")} · acesso {item.ajuste_acesso >= 0 ? "+" : ""}{item.ajuste_acesso.toFixed(1).replace(".", ",")}</p>
      </td>
      <td className="px-4 py-3">
        <a
          href={item.intranet_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
        >
          {item.cliente}
          <ExternalLink size={13} />
        </a>
        <p className="mt-1 text-xs text-slate-500">{item.origem} · {item.pagador}</p>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        <p className="font-semibold">{item.nome_plano} · {item.duracao || "—"}</p>
        <p className="mt-1 text-xs text-slate-500">{formatMoney(item.valor)}</p>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        <p className="font-semibold">{formatDate(item.data_vencimento)}</p>
        <p className="mt-1 text-xs text-slate-500">em {item.dias_ate_vencimento} dias</p>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">
        <p>{formatDateTime(item.ultimo_acesso)}</p>
        <p className="mt-1 text-xs text-slate-500">
          {item.dias_sem_acesso === null ? "sem registro" : `${item.dias_sem_acesso} dias sem acesso`}
        </p>
      </td>
      <td className="px-4 py-3">
        <div className="flex max-w-[360px] flex-wrap gap-1.5">
          {item.sinais.map((signal) => (
            <span key={signal} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {signal}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

export default function ChurnScoreDashboard() {
  const { filters } = useGlobalFilters();
  const [meta, setMeta] = useState<ChurnScoreModelMeta | null>(null);
  const [data, setData] = useState<ChurnScoreDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMeta() {
    const response = await fetchChurnScoreMeta();
    setMeta(response);
    return response;
  }

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchChurnScoreDashboard(filters);
      setData(response);
      setMeta(response.model);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado ao carregar o Churn Score.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchChurnScoreMeta();
        if (!active) return;
        setMeta(response);
        if (response.status === "treinado") {
          const dashboard = await fetchChurnScoreDashboard(filters);
          if (!active) return;
          setData(dashboard);
          setMeta(dashboard.model);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Erro inesperado ao carregar o Churn Score.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // Carregamento inicial; os filtros são tratados no efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (meta?.status !== "treinado") return;
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.empresa, filters.origem, filters.pagador]);

  async function handleTrain() {
    setTraining(true);
    setError(null);
    try {
      const result = await trainChurnScore();
      setMeta(result);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado ao treinar o modelo.");
    } finally {
      setTraining(false);
    }
  }

  const comparison = useMemo(() => Object.entries(meta?.validation_results ?? {}), [meta]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Churn Score</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Score de 1 a 100 para priorizar clientes com maior risco de não renovar. O modelo aprende com ciclos históricos e o score final recebe um ajuste transparente pelo comportamento de acesso atual.
            </p>
          </div>

          <button
            type="button"
            onClick={handleTrain}
            disabled={training}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={17} className={training ? "animate-spin" : ""} />
            {training ? "Treinando..." : meta?.status === "treinado" ? "Treinar novamente" : "Treinar modelo"}
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            Carregando Churn Score...
          </div>
        )}

        {!loading && meta?.status === "nao_treinado" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 text-amber-600" size={20} />
              <div>
                <h2 className="font-bold text-amber-950">Modelo ainda não treinado nesta máquina</h2>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  Clique em <strong>Treinar modelo</strong>. O backend vai buscar o histórico no MySQL, separar treino, validação e teste em ordem temporal, comparar os três algoritmos e salvar o melhor modelo localmente.
                </p>
              </div>
            </div>
          </div>
        )}

        {data && (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Kpi title="Clientes avaliados" value={formatInteger(data.resumo.clientes)} subtitle="Planos atuais com vencimento futuro dentro dos filtros globais." icon={UsersRound} />
              <Kpi title="Score médio" value={data.resumo.score_medio.toFixed(1).replace(".", ",")} subtitle="Média do score final de risco de 1 a 100." icon={Target} />
              <Kpi title="Risco alto ou maior" value={formatInteger(data.resumo.alto_risco)} subtitle="Clientes com score igual ou superior a 60." icon={ShieldAlert} />
              <Kpi title="Risco muito alto" value={formatInteger(data.resumo.muito_alto_risco)} subtitle="Clientes com score igual ou superior a 80." icon={TrendingUp} />
              <Kpi title="Valor ponderado pelo risco" value={formatMoney(data.resumo.valor_ponderado_risco)} subtitle="Valor do plano multiplicado pelo score de cada cliente." icon={WalletCards} />
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
              <strong>Importante:</strong> `dias_vencido` não entra no modelo. O campo de último acesso também não é usado no treino histórico porque hoje só existe o último acesso atual; usá-lo contra vencimentos antigos criaria vazamento de informação. Ele entra separadamente como ajuste comportamental no score final.
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <BrainCircuit size={19} className="text-blue-600" />
                    <h2 className="text-lg font-bold text-slate-950">Validação do modelo</h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Modelo selecionado: <strong className="text-slate-800">{data.model.model_name}</strong> · treinado em {formatDateTime(data.model.trained_at)}.
                  </p>
                </div>
                <p className="text-xs text-slate-400">R² não é usado porque este é um problema de classificação.</p>
              </div>
              <ModelMetrics metrics={data.model.test_metrics} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-950">Comparação na validação temporal</h2>
                <p className="mt-1 text-sm text-slate-500">A escolha do algoritmo acontece antes do teste final.</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Modelo</th>
                        <th className="px-4 py-3">ROC-AUC</th>
                        <th className="px-4 py-3">PR-AUC</th>
                        <th className="px-4 py-3">Brier</th>
                        <th className="px-4 py-3">F1</th>
                        <th className="px-4 py-3">Lift 10%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map(([name, metrics]) => (
                        <tr key={name} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-semibold text-slate-800">{name}</td>
                          <td className="px-4 py-3">{formatMetric(metrics.roc_auc)}</td>
                          <td className="px-4 py-3">{formatMetric(metrics.pr_auc)}</td>
                          <td className="px-4 py-3">{formatMetric(metrics.brier)}</td>
                          <td className="px-4 py-3">{formatMetric(metrics.f1)}</td>
                          <td className="px-4 py-3">{formatMetric(metrics.lift_10, 2)}x</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-950">Variáveis mais importantes</h2>
                <p className="mt-1 text-sm text-slate-500">Importância por permutação no conjunto de teste.</p>
                <div className="mt-4 space-y-3">
                  {(data.model.feature_importance ?? []).slice(0, 8).map((item, index) => (
                    <div key={item.feature} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-xs font-bold text-slate-500 ring-1 ring-slate-200">{index + 1}</span>
                        <span className="text-sm font-semibold text-slate-700">{item.feature.replaceAll("_", " ")}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-500">{item.importance.toFixed(4).replace(".", ",")}</span>
                    </div>
                  ))}
                  {(data.model.feature_importance ?? []).length === 0 && <p className="text-sm text-slate-400">Sem importância calculada.</p>}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.faixas.map((band) => (
                <div key={band.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${riskClass(band.label)}`}>{band.label}</span>
                  <p className="mt-3 text-2xl font-bold text-slate-950">{formatInteger(band.clientes)}</p>
                  <p className="text-sm text-slate-500">clientes · {formatMoney(band.valor)}</p>
                  <p className="mt-2 text-xs text-slate-400">Score {band.min}–{band.max}</p>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-bold text-slate-950">Prioridade de retenção</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Ordenado do maior para o menor score. São exibidos até {formatInteger(data.clientes_retornados)} clientes nesta tabela.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[1250px] w-full text-left">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Plano</th>
                      <th className="px-4 py-3">Vencimento</th>
                      <th className="px-4 py-3">Último acesso</th>
                      <th className="px-4 py-3">Sinais</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clientes.map((item) => <ClientRow key={item.empresa_id} item={item} />)}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
