"use client";

import {
  formatCurrency,
  formatInteger,
  formatPercent,
} from "@/lib/format";
import type {
  DashboardDetail,
} from "@/types/dashboard";


type Props = {
  rows: DashboardDetail[];
};


export default function DetailedTable({
  rows,
}: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-lg font-bold text-slate-950">
          Detalhamento por plano e duração
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Mesmos indicadores da planilha,
          calculados para o mês selecionado.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[2200px] border-collapse text-sm">
          <thead className="bg-slate-950 text-white">
            <tr>
              <Th>Plano</Th>
              <Th>Duração</Th>
              <Th numeric>
                Clientes ativos
              </Th>
              <Th numeric>
                Renovações previstas
              </Th>
              <Th numeric>
                % Renov. / Ativos
              </Th>
              <Th numeric>
                Receita vencendo
              </Th>
              <Th numeric>
                Ticket vencimentos
              </Th>
              <Th numeric>
                Renovações clientes
              </Th>
              <Th numeric>
                Renovações receita
              </Th>
              <Th numeric>
                Ticket renovado
              </Th>
              <Th numeric>
                Tx. renovação clientes
              </Th>
              <Th numeric>
                Tx. renovação receita
              </Th>
              <Th numeric>
                Churn clientes
              </Th>
              <Th numeric>
                Churn receita
              </Th>
              <Th numeric>
                Ticket perdido
              </Th>
              <Th numeric>
                % Churn ativos
              </Th>
              <Th numeric>
                % Churn vencimentos
              </Th>
              <Th numeric>
                % Churn receita
              </Th>
            </tr>
          </thead>

          <tbody>
            {rows.map(
              (row, index) => (
                <tr
                  key={`${row.nome_plano}-${row.duracao}-${index}`}
                  className="border-b border-slate-100 transition hover:bg-slate-50"
                >
                  <Td strong>
                    {row.nome_plano}
                  </Td>

                  <Td>
                    {row.duracao_label}
                  </Td>

                  <Td numeric>
                    {formatInteger(
                      row.clientes_ativos,
                    )}
                  </Td>

                  <Td numeric>
                    {formatInteger(
                      row.renovacoes_previstas,
                    )}
                  </Td>

                  <Td numeric>
                    {formatPercent(
                      row.percentual_renovacoes_clientes_ativos,
                    )}
                  </Td>

                  <Td numeric>
                    {formatCurrency(
                      row.receita_vencendo,
                    )}
                  </Td>

                  <Td numeric>
                    {formatCurrency(
                      row.ticket_medio_vencimentos,
                    )}
                  </Td>

                  <Td numeric>
                    {formatInteger(
                      row.renovacoes_clientes,
                    )}
                  </Td>

                  <Td numeric>
                    {formatCurrency(
                      row.renovacoes_receita,
                    )}
                  </Td>

                  <Td numeric>
                    {formatCurrency(
                      row.ticket_medio_renovado,
                    )}
                  </Td>

                  <Td numeric>
                    {formatPercent(
                      row.taxa_renovacao_clientes,
                    )}
                  </Td>

                  <Td numeric>
                    {formatPercent(
                      row.taxa_renovacao_receita,
                    )}
                  </Td>

                  <Td numeric>
                    {formatInteger(
                      row.churn_clientes,
                    )}
                  </Td>

                  <Td numeric>
                    {formatCurrency(
                      row.churn_receita,
                    )}
                  </Td>

                  <Td numeric>
                    {formatCurrency(
                      row.ticket_medio_perdido,
                    )}
                  </Td>

                  <Td numeric>
                    {formatPercent(
                      row.percentual_churn_clientes_ativos,
                    )}
                  </Td>

                  <Td numeric>
                    {formatPercent(
                      row.percentual_churn_vencimentos,
                    )}
                  </Td>

                  <Td numeric>
                    {formatPercent(
                      row.percentual_churn_receita_vencendo,
                    )}
                  </Td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function Th({
  children,
  numeric = false,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      className={`whitespace-nowrap px-4 py-4 text-xs font-bold uppercase tracking-wider ${
        numeric
          ? "text-right"
          : "text-left"
      }`}
    >
      {children}
    </th>
  );
}


function Td({
  children,
  numeric = false,
  strong = false,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  strong?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap px-4 py-3 ${
        numeric
          ? "text-right tabular-nums"
          : "text-left"
      } ${
        strong
          ? "font-bold text-slate-900"
          : "text-slate-600"
      }`}
    >
      {children}
    </td>
  );
}
