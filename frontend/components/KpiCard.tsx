"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
} from "lucide-react";
import React from "react";


type Props = {
  label: string;
  value: string;
  subtitle?: string;
  delta?: number | null;
  inverseDelta?: boolean;
  icon?: React.ReactNode;
};


export default function KpiCard({
  label,
  value,
  subtitle,
  delta,
  inverseDelta = false,
  icon,
}: Props) {
  const hasDelta =
    delta !== null &&
    delta !== undefined;

  const positive =
    hasDelta &&
    delta > 0;

  const negative =
    hasDelta &&
    delta < 0;

  let deltaClass =
    "bg-slate-100 text-slate-600";

  if (positive) {
    deltaClass = inverseDelta
      ? "bg-rose-50 text-rose-700"
      : "bg-emerald-50 text-emerald-700";
  }

  if (negative) {
    deltaClass = inverseDelta
      ? "bg-emerald-50 text-emerald-700"
      : "bg-rose-50 text-rose-700";
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="mb-5 flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-slate-500">
          {label}
        </p>

        {icon ? (
          <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
            {icon}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <p className="text-2xl font-bold tracking-tight text-slate-950">
          {value}
        </p>

        {hasDelta ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${deltaClass}`}
          >
            {positive ? (
              <ArrowUpRight size={14} />
            ) : negative ? (
              <ArrowDownRight size={14} />
            ) : (
              <Minus size={14} />
            )}

            {Math.abs(delta).toLocaleString(
              "pt-BR",
              {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              },
            )}
            %
          </span>
        ) : null}
      </div>

      {subtitle ? (
        <p className="mt-2 text-xs leading-5 text-slate-400">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
