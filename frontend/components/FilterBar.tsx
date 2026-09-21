"use client";

import { Building2 } from "lucide-react";
import { MONTHS } from "@/lib/format";

import type {
  CompanyFilter,
  DurationFilter,
  MetaResponse,
  OriginFilter,
  PlanFilter,
} from "@/types/dashboard";

type FilterBarProps = {
  meta: MetaResponse;
  year: number;
  month: number;
  company: CompanyFilter;
  origin: OriginFilter;
  plan: PlanFilter;
  duration: DurationFilter;
  loading: boolean;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onCompanyChange: (company: CompanyFilter) => void;
  onOriginChange: (origin: OriginFilter) => void;
  onPlanChange: (plan: PlanFilter) => void;
  onDurationChange: (duration: DurationFilter) => void;
};

export default function FilterBar({
  meta,
  year,
  month,
  company,
  origin,
  plan,
  duration,
  loading,
  onYearChange,
  onMonthChange,
  onCompanyChange,
  onOriginChange,
  onPlanChange,
  onDurationChange,
}: FilterBarProps) {
  const monthOptions = MONTHS.map((name, index) => ({
    value: index + 1,
    name,
  })).filter((item) => {
    if (year < meta.ultimo_ano) {
      return true;
    }

    if (year > meta.ultimo_ano) {
      return false;
    }

    return item.value <= meta.ultimo_mes;
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="hidden rounded-xl bg-white/10 p-2 text-white 2xl:flex">
          <Building2 size={20} />
        </div>

        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Ano
            </span>

            <select
              value={year}
              disabled={loading}
              onChange={(event) => {
                onYearChange(Number(event.target.value));
              }}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {meta.anos.map((item) => (
                <option
                  key={item}
                  value={item}
                  className="bg-white text-slate-950"
                >
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Mês
            </span>

            <select
              value={month}
              disabled={loading}
              onChange={(event) => {
                onMonthChange(Number(event.target.value));
              }}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {monthOptions.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                  className="bg-white text-slate-950"
                >
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Empresa
            </span>

            <select
              value={company}
              disabled={loading}
              onChange={(event) => {
                const nextCompany = event.target.value as CompanyFilter;
                onCompanyChange(nextCompany);
              }}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option
                value="gestaoclick"
                className="bg-white text-slate-950"
              >
                GestãoClick
              </option>

              <option
                value="clicknotas"
                className="bg-white text-slate-950"
              >
                ClickNotas
              </option>

              <option
                value="todos"
                className="bg-white text-slate-950"
              >
                Todos
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Origem
            </span>

            <select
              value={origin}
              disabled={loading}
              onChange={(event) => {
                const nextOrigin = event.target.value as OriginFilter;
                onOriginChange(nextOrigin);
              }}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option
                value="gestaoclick"
                className="bg-white text-slate-950"
              >
                GestãoClick
              </option>

              <option
                value="parceiro"
                className="bg-white text-slate-950"
              >
                Parceiro
              </option>

              <option
                value="todos"
                className="bg-white text-slate-950"
              >
                Todos
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Plano
            </span>

            <select
              value={plan}
              disabled={loading}
              onChange={(event) => {
                onPlanChange(event.target.value);
              }}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option
                value="todos"
                className="bg-white text-slate-950"
              >
                Todos
              </option>

              {meta.planos.map((item) => (
                <option
                  key={item}
                  value={item}
                  className="bg-white text-slate-950"
                >
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Duração
            </span>

            <select
              value={duration}
              disabled={loading}
              onChange={(event) => {
                const nextDuration = event.target.value as DurationFilter;
                onDurationChange(nextDuration);
              }}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-white outline-none transition focus:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option
                value="todos"
                className="bg-white text-slate-950"
              >
                Todas
              </option>

              {meta.duracoes.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                  className="bg-white text-slate-950"
                >
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
