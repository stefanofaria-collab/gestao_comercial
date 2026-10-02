"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarDays,
  CircleHelp,
  MessageCircleMore,
  MousePointerClick,
  RefreshCw,
  SmilePlus,
  ThumbsDown,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";

import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";
import { fetchAtendimentosDashboard, fetchAtendimentosMeta, fetchAtendimentosStatus } from "@/lib/atendimentos-api";
import type {
  AtendimentosDashboardResponse,
  AtendimentosMetaResponse,
  AtendimentoMotivoDemografia,
} from "@/types/atendimentos";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatInteger(value: number | null | undefined) {
  return integer.format(Math.round(value ?? 0));
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${decimal.format(value)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return `${MONTHS[(month || 1) - 1].slice(0, 3)}/${String(year).slice(-2)}`;
}

function sexLabel(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "M" || normalized === "MASCULINO") return "Masculino";
  if (normalized === "F" || normalized === "FEMININO") return "Feminino";
  if (!normalized || normalized === "NÃO INFORMADO" || normalized === "NAO INFORMADO") return "Não informado";
  return value;
}

function HelpTip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-label="Explicação"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
      >
        <CircleHelp size={14} />
      </button>
      <div className="pointer-events-none invisible absolute right-0 top-8 z-40 w-80 rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
        {text}
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle, help }: { title: string; subtitle: string; help: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-slate-950">{title}</h2>
        <HelpTip text={help} />
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
    </div>
  );
}

function MetricCard({
  title,
  value,
  footer,
  help,
  icon,
}: {
  title: string;
  value: string;
  footer: string;
  help: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500">{icon}</div>
        <HelpTip text={help} />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-400">{footer}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  help,
  option,
  height = 360,
  onEvents,
  interactive = false,
}: {
  title: string;
  subtitle: string;
  help: string;
  option: any;
  height?: number;
  onEvents?: Record<string, (params: any) => void>;
  interactive?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <SectionTitle title={title} subtitle={subtitle} help={help} />
      {interactive ? (
        <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
          <MousePointerClick size={12} /> Clique em um motivo para ver a evolução mensal
        </div>
      ) : null}
      <ReactECharts option={option} style={{ height }} notMerge lazyUpdate onEvents={onEvents} />
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="text-center">
        <RefreshCw className="mx-auto animate-spin text-blue-600" size={24} />
        <p className="mt-3 text-sm font-semibold text-slate-700">Carregando atendimentos...</p>
        <p className="mt-1 text-xs text-slate-400">Lendo as informações já salvas no banco do projeto.</p>
      </div>
    </div>
  );
}

function ErrorBlock({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
      <p className="font-semibold">Não foi possível carregar os atendimentos.</p>
      <p className="mt-2 text-sm">{message}</p>
      <button type="button" onClick={retry} className="mt-4 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold">
        Tentar novamente
      </button>
    </div>
  );
}

function motivesBySex(rows: AtendimentoMotivoDemografia[]) {
  const motives = Array.from(new Set(rows.map((row) => row.motivo)));
  const sexes = Array.from(new Set(rows.map((row) => sexLabel(row.sexo))));
  return { motives, sexes };
}

type MotiveMode = "geral" | "sexo" | "idade";

export default function AtendimentosDashboard() {
  const { filters } = useGlobalFilters();
  const [meta, setMeta] = useState<AtendimentosMetaResponse | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [data, setData] = useState<AtendimentosDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMotive, setSelectedMotive] = useState<string | null>(null);
  const [selectedMotiveMode, setSelectedMotiveMode] = useState<MotiveMode>("geral");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetchAtendimentosMeta();
        if (!active) return;
        setMeta(response);
        setYear(response.ano_padrao);
        setMonth(response.mes_padrao);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Erro inesperado.");
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const load = async (targetYear: number, targetMonth: number, silent = false, force = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await fetchAtendimentosDashboard(targetYear, targetMonth, filters, force);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (year === null || month === null) return;
    void load(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, filters.empresa, filters.origem, filters.pagador]);

  useEffect(() => {
    const cacheRefreshing = Boolean(data?._cache_info?.refreshing || data?._cache_info?.fallback);
    if (!data || (data.sincronizacao.atualizado && !cacheRefreshing)) return;

    const timer = globalThis.setInterval(async () => {
      try {
        const status = await fetchAtendimentosStatus();
        if (status.atualizado && year !== null && month !== null) {
          const response = await fetchAtendimentosDashboard(year, month, filters, true);
          setData(response);
          if (!response._cache_info?.refreshing && !response._cache_info?.fallback) {
            globalThis.clearInterval(timer);
          }
        }
      } catch {
        // O painel continua funcionando com os dados já salvos.
      }
    }, 15000);
    return () => globalThis.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.sincronizacao.atualizado, data?._cache_info?.refreshing, data?._cache_info?.fallback, year, month]);

  const historyOption = useMemo(() => {
    const rows = data?.historico ?? [];
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0, data: ["Atendimentos", "Clientes únicos", "% da base ativa"] },
      grid: { left: 55, right: 65, top: 55, bottom: 45 },
      xAxis: { type: "category", data: rows.map((row) => monthLabel(row.mes)), boundaryGap: false },
      yAxis: [
        { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
        { type: "value", axisLabel: { formatter: (value: number) => `${decimal.format(value)}%` }, splitLine: { show: false } },
      ],
      series: [
        { name: "Atendimentos", type: "line", smooth: true, showSymbol: false, data: rows.map((row) => row.atendimentos) },
        { name: "Clientes únicos", type: "line", smooth: true, showSymbol: false, data: rows.map((row) => row.clientes_unicos) },
        { name: "% da base ativa", type: "line", smooth: true, showSymbol: false, yAxisIndex: 1, data: rows.map((row) => row.percentual_base) },
      ],
    };
  }, [data]);

  const planOption = useMemo(() => {
    const rows = data?.planos_historico ?? [];
    const months = Array.from(new Set(rows.map((row) => row.mes))).sort();
    const totals = new Map<string, number>();
    rows.forEach((row) => totals.set(row.plano, (totals.get(row.plano) ?? 0) + row.clientes_unicos));
    const plans = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([plan]) => plan);
    return {
      tooltip: { trigger: "axis" },
      legend: { type: "scroll", top: 0, data: plans },
      grid: { left: 55, right: 25, top: 65, bottom: 45 },
      xAxis: { type: "category", data: months.map(monthLabel), boundaryGap: false },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      series: plans.map((plan) => ({
        name: plan,
        type: "line",
        smooth: true,
        showSymbol: false,
        data: months.map((monthValue) => rows.find((row) => row.mes === monthValue && row.plano === plan)?.clientes_unicos ?? 0),
      })),
    };
  }, [data]);

  const lifecycleOption = useMemo(() => {
    const rows = data?.ciclo_vida_historico ?? [];
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0, data: ["Até 30 dias após contratação", "Até 30 dias antes do churn"] },
      grid: { left: 55, right: 25, top: 55, bottom: 45 },
      xAxis: { type: "category", data: rows.map((row) => monthLabel(row.mes)), boundaryGap: false },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      series: [
        { name: "Até 30 dias após contratação", type: "line", smooth: true, showSymbol: false, data: rows.map((row) => row.ate_30_dias_contratacao) },
        { name: "Até 30 dias antes do churn", type: "line", smooth: true, showSymbol: false, data: rows.map((row) => row.ate_30_dias_antes_churn) },
      ],
    };
  }, [data]);

  const usersOption = useMemo(() => {
    const rows = data?.historico ?? [];
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0, data: ["Atendimentos", "Usuários únicos por e-mail"] },
      grid: { left: 55, right: 25, top: 55, bottom: 45 },
      xAxis: { type: "category", data: rows.map((row) => monthLabel(row.mes)), boundaryGap: false },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      series: [
        { name: "Atendimentos", type: "line", smooth: true, showSymbol: false, data: rows.map((row) => row.atendimentos) },
        { name: "Usuários únicos por e-mail", type: "line", smooth: true, showSymbol: false, data: rows.map((row) => row.usuarios_unicos) },
      ],
    };
  }, [data]);

  const sexOption = useMemo(() => {
    const rows = data?.demografia.sexo ?? [];
    return {
      tooltip: { trigger: "item", formatter: (params: any) => `${params.name}: ${formatInteger(params.value)} usuário(s)` },
      legend: { bottom: 0 },
      series: [{
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "44%"],
        label: { formatter: "{b}\n{d}%" },
        data: rows.map((row) => ({ name: sexLabel(row.sexo), value: row.usuarios })),
      }],
    };
  }, [data]);

  const ageOption = useMemo(() => {
    const rows = (data?.demografia.sexo ?? []).filter((row) => row.idade_media !== null);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 90, right: 35, top: 20, bottom: 35 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => `${decimal.format(value)} anos` } },
      yAxis: { type: "category", data: rows.map((row) => sexLabel(row.sexo)) },
      series: [{ type: "bar", data: rows.map((row) => row.idade_media) }],
    };
  }, [data]);

  const motiveSexOption = useMemo(() => {
    const rows = data?.demografia.motivos ?? [];
    const { motives, sexes } = motivesBySex(rows);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { type: "scroll", top: 0, data: sexes },
      grid: { left: 150, right: 25, top: 55, bottom: 35 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      yAxis: { type: "category", data: motives },
      series: sexes.map((sex) => ({
        name: sex,
        type: "bar",
        stack: "sexo",
        data: motives.map((motive) => rows.filter((row) => row.motivo === motive && sexLabel(row.sexo) === sex).reduce((sum, row) => sum + row.atendimentos, 0)),
      })),
    };
  }, [data]);

  const motiveAgeOption = useMemo(() => {
    const rows = data?.demografia.motivos ?? [];
    const motives = Array.from(new Set(rows.map((row) => row.motivo)));
    const values = motives.map((motive) => {
      const filtered = rows.filter((row) => row.motivo === motive && row.idade_media !== null);
      const denominator = filtered.reduce((sum, row) => sum + row.usuarios_unicos, 0);
      const numerator = filtered.reduce((sum, row) => sum + (row.idade_media ?? 0) * row.usuarios_unicos, 0);
      return denominator ? Math.round((numerator / denominator) * 10) / 10 : null;
    });
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 150, right: 35, top: 25, bottom: 35 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => `${decimal.format(value)} anos` } },
      yAxis: { type: "category", data: motives },
      series: [{ type: "bar", data: values }],
    };
  }, [data]);

  const motiveGeneralOption = useMemo(() => {
    const rows = data?.motivos_geral ?? [];
    const sorted = [...rows].sort((a, b) => b.atendimentos - a.atendimentos);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 220, right: 35, top: 20, bottom: 45 },
      xAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      yAxis: { type: "category", inverse: true, data: sorted.map((row) => row.motivo) },
      dataZoom: sorted.length > 18 ? [{ type: "inside", yAxisIndex: 0, startValue: 0, endValue: 17 }, { type: "slider", yAxisIndex: 0, right: 4, width: 12 }] : [],
      series: [{ name: "Atendimentos", type: "bar", data: sorted.map((row) => row.atendimentos) }],
    };
  }, [data]);

  const motiveEvolutionOption = useMemo(() => {
    if (!data || !selectedMotive) return {};
    const allMonths = Array.from(new Set(data.motivos_historico.map((row) => row.mes))).sort();
    const rows = data.motivos_historico.filter((row) => row.motivo === selectedMotive);

    if (selectedMotiveMode === "sexo") {
      const sexes = Array.from(new Set(rows.map((row) => sexLabel(row.sexo))));
      return {
        tooltip: { trigger: "axis" },
        legend: { type: "scroll", top: 0, data: sexes },
        grid: { left: 55, right: 25, top: 55, bottom: 45 },
        xAxis: { type: "category", data: allMonths.map(monthLabel), boundaryGap: false },
        yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
        series: sexes.map((sex) => ({
          name: sex,
          type: "line",
          smooth: true,
          showSymbol: false,
          data: allMonths.map((monthValue) => rows
            .filter((row) => row.mes === monthValue && sexLabel(row.sexo) === sex)
            .reduce((sum, row) => sum + row.atendimentos, 0)),
        })),
      };
    }

    if (selectedMotiveMode === "idade") {
      const values = allMonths.map((monthValue) => {
        const monthRows = rows.filter((row) => row.mes === monthValue && row.idade_media !== null);
        const denominator = monthRows.reduce((sum, row) => sum + row.usuarios_unicos, 0);
        const numerator = monthRows.reduce((sum, row) => sum + (row.idade_media ?? 0) * row.usuarios_unicos, 0);
        return denominator ? Math.round((numerator / denominator) * 10) / 10 : null;
      });
      return {
        tooltip: { trigger: "axis", valueFormatter: (value: number | null) => value === null ? "—" : `${decimal.format(value)} anos` },
        grid: { left: 65, right: 25, top: 25, bottom: 45 },
        xAxis: { type: "category", data: allMonths.map(monthLabel), boundaryGap: false },
        yAxis: { type: "value", axisLabel: { formatter: (value: number) => `${decimal.format(value)} anos` } },
        series: [{ name: "Idade média", type: "line", smooth: true, showSymbol: false, data: values }],
      };
    }

    return {
      tooltip: { trigger: "axis" },
      grid: { left: 55, right: 25, top: 25, bottom: 45 },
      xAxis: { type: "category", data: allMonths.map(monthLabel), boundaryGap: false },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => formatInteger(value) } },
      series: [{
        name: "Atendimentos",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: allMonths.map((monthValue) => rows.filter((row) => row.mes === monthValue).reduce((sum, row) => sum + row.atendimentos, 0)),
      }],
    };
  }, [data, selectedMotive, selectedMotiveMode]);

  const openMotive = (motive: string, mode: MotiveMode) => {
    if (!motive) return;
    setSelectedMotive(motive);
    setSelectedMotiveMode(mode);
  };

  const retry = () => {
    if (year !== null && month !== null) void load(year, month, false, true);
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-[1680px]">
        <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600">Gestão Comercial</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Atendimentos</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
              Entenda quantos clientes procuram o suporte, quando eles entram em contato e quais características aparecem com mais frequência nos atendimentos.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500"><CalendarDays size={18} /></div>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Mês
                <select value={month ?? 1} onChange={(event) => setMonth(Number(event.target.value))} className="min-w-[160px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                  {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-500">
                Ano
                <select value={year ?? 2024} onChange={(event) => setYear(Number(event.target.value))} className="min-w-[110px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
                  {(meta?.anos ?? [2024]).map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
          </div>
        </div>

        {data && (!data.sincronizacao.atualizado || data.sincronizacao.executando) ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            <p className="font-semibold">
              {data.sincronizacao.contexto_pendente
                ? "Os planos e o contexto dos atendimentos estão sendo preparados em segundo plano."
                : "Os atendimentos mais recentes estão sendo atualizados em segundo plano."}
            </p>
            <p className="mt-1 text-xs leading-5">
              A tela continua usando os dados já salvos. Último atendimento disponível: {formatDate(data.dados.ultima_data)}. Data esperada: {formatDate(data.sincronizacao.data_alvo)}.
              {data.sincronizacao.contexto_pendente ? " Os gráficos de plano e ciclo de vida aparecerão assim que essa preparação terminar." : ""}
            </p>
          </div>
        ) : null}

        {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} retry={retry} /> : data ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                title="Atendimentos no mês"
                value={formatInteger(data.cards.atendimentos)}
                footer={`${MONTHS[data.periodo.mes - 1]} de ${data.periodo.ano}`}
                help="Conta todos os atendimentos de suporte registrados no período escolhido. Se a mesma pessoa entrou em contato mais de uma vez, cada atendimento é contado."
                icon={<MessageCircleMore size={20} />}
              />
              <MetricCard
                title="Clientes únicos que entraram em contato"
                value={formatInteger(data.cards.clientes_unicos)}
                footer="Cada empresa é contada apenas uma vez."
                help="Mostra quantas empresas diferentes procuraram o suporte. Uma empresa com dez atendimentos continua contando como apenas um cliente neste card."
                icon={<UsersRound size={20} />}
              />
              <MetricCard
                title="Percentual da base ativa que entrou em contato"
                value={formatPercent(data.cards.percentual_base)}
                footer={data.cards.clientes_ativos ? `Base ativa usada: ${formatInteger(data.cards.clientes_ativos)} clientes.` : "A base ativa ainda não está disponível para este filtro."}
                help="Compara a quantidade de clientes que procuraram o suporte com o total de clientes ativos no mesmo mês."
                icon={<UserRoundCheck size={20} />}
              />
              <MetricCard
                title="Avaliações positivas"
                value={formatInteger(data.cards.positivas)}
                footer="Quantidade de atendimentos avaliados positivamente."
                help="Conta somente os atendimentos que receberam uma avaliação positiva do usuário. Atendimentos sem avaliação não entram neste número."
                icon={<SmilePlus size={20} />}
              />
              <MetricCard
                title="Avaliações negativas"
                value={formatInteger(data.cards.negativas)}
                footer="Quantidade de atendimentos avaliados negativamente."
                help="Conta somente os atendimentos que receberam uma avaliação negativa do usuário. Atendimentos sem avaliação não entram neste número."
                icon={<ThumbsDown size={20} />}
              />
            </div>

            <ChartCard
              title="Evolução dos atendimentos e clientes desde 2024"
              subtitle="As duas primeiras linhas usam quantidade. A terceira mostra qual percentual da base ativa procurou o suporte."
              help="A linha de atendimentos conta todas as conversas. Clientes únicos contam cada empresa uma vez no mês. O percentual mostra o tamanho desse grupo em relação à carteira ativa."
              option={historyOption}
              height={390}
            />

            <ChartCard
              title="Clientes únicos atendidos por plano"
              subtitle="Cada linha mostra quantos clientes diferentes daquele plano procuraram o suporte em cada mês."
              help="O plano é identificado pelo contrato que correspondia ao período do atendimento. Se o mesmo cliente abriu vários chamados no mês, ele aparece apenas uma vez na linha do plano."
              option={planOption}
              height={420}
            />

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard
                title="Contato perto da contratação e perto do churn"
                subtitle="Compara clientes que procuraram suporte nos primeiros 30 dias com clientes que procuraram suporte nos 30 dias anteriores ao vencimento de um ciclo que terminou em churn."
                help="A primeira linha ajuda a identificar necessidade de suporte logo depois da contratação. A segunda considera somente ciclos que realmente viraram churn e verifica se houve contato até 30 dias antes do vencimento."
                option={lifecycleOption}
              />
              <ChartCard
                title="Atendimentos e usuários únicos por e-mail"
                subtitle="A primeira linha mostra todas as conversas. A segunda conta cada e-mail apenas uma vez por mês."
                help="Aqui não importa qual empresa está vinculada ao usuário. O objetivo é entender quantas pessoas diferentes, identificadas pelo e-mail, procuraram o suporte em cada mês."
                option={usersOption}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard
                title="Sexo dos usuários que entraram em contato"
                subtitle={`Distribuição de usuários únicos no período selecionado.`}
                help="Usamos o e-mail para evitar contar a mesma pessoa várias vezes. Quando não existe informação confiável de sexo, o usuário aparece como não informado."
                option={sexOption}
              />
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionTitle
                  title="Idade média dos usuários"
                  subtitle={data.demografia.idade_media !== null ? `Média geral do período: ${decimal.format(data.demografia.idade_media)} anos.` : "Ainda não há idade suficiente para calcular a média."}
                  help="A idade é calculada na data em que o atendimento aconteceu. Idades abaixo de 16 ou acima de 90 anos são ignoradas para evitar cadastros claramente incorretos."
                />
                <ReactECharts option={ageOption} style={{ height: 360 }} notMerge lazyUpdate />
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard
                title="Motivo do atendimento por sexo"
                subtitle="Mostra os principais motivos do período e como os atendimentos se dividem entre os grupos de sexo informados."
                help="Este gráfico ajuda a verificar se determinados assuntos aparecem com mais frequência em algum grupo. Ele mostra associação nos dados, não prova que o sexo é a causa do motivo do atendimento. Clique em um motivo para acompanhar sua evolução mensal desde 2024."
                option={motiveSexOption}
                height={470}
                interactive
                onEvents={{ click: (params: any) => openMotive(String(params?.name ?? ""), "sexo") }}
              />
              <ChartCard
                title="Idade média por motivo do atendimento"
                subtitle="Compara a idade média dos usuários nos principais motivos do período selecionado."
                help="A média usa apenas usuários com idade considerada válida. Diferenças de idade entre motivos mostram um padrão observado, mas não significam necessariamente que a idade causou aquele tipo de contato. Clique em um motivo para acompanhar a idade média daquele assunto desde 2024."
                option={motiveAgeOption}
                height={470}
                interactive
                onEvents={{ click: (params: any) => openMotive(String(params?.name ?? ""), "idade") }}
              />
            </div>

            <ChartCard
              title="Quantidade de atendimentos por motivo"
              subtitle="Conta quantos atendimentos do período selecionado foram classificados em cada motivo."
              help="Cada barra representa um motivo de contato e mostra quantos atendimentos receberam aquela classificação. Clique em uma barra para ver a evolução mensal daquele motivo desde o início da análise."
              option={motiveGeneralOption}
              height={Math.max(430, Math.min(900, (data.motivos_geral?.length ?? 0) * 30 + 120))}
              interactive
              onEvents={{ click: (params: any) => openMotive(String(params?.name ?? ""), "geral") }}
            />

            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs leading-5 text-slate-500">
              Dados de atendimentos disponíveis de <strong>{formatDate(data.dados.primeira_data)}</strong> até <strong>{formatDate(data.dados.ultima_data)}</strong>. A coleta busca somente os dias ainda não gravados no banco, sempre até o dia anterior ao acesso.
            </div>
          </div>
        ) : null}
      </div>

      {selectedMotive ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Evolução mensal desde 2024</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">{selectedMotive}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedMotiveMode === "sexo"
                    ? "Veja como os atendimentos deste motivo evoluíram mês a mês, separados por sexo."
                    : selectedMotiveMode === "idade"
                      ? "Veja como a idade média dos usuários deste motivo mudou ao longo do tempo."
                      : "Veja quantos atendimentos deste motivo aconteceram em cada mês."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMotive(null)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <ReactECharts option={motiveEvolutionOption} style={{ height: 520 }} notMerge lazyUpdate />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
