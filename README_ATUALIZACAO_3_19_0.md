# Atualização 3.19.0 — Página Pagamentos

## Entrega

- Nova página **Pagamentos**, posicionada abaixo de **Perfil**.
- A análise considera somente eventos de renovação; a contratação inicial fica fora.
- Cards mensais:
  - antes do vencimento;
  - no dia do vencimento;
  - durante a prorrogação (1 a 3 dias);
  - atrasados (4 a 59 dias);
  - reativações (60 dias ou mais);
  - tempo médio de pagamento das renovações comuns.
- Nos cinco cards de distribuição, o destaque é percentual sem casas decimais.
- Rodapé dos cards com quantidade de clientes e faturamento.
- Repetição dos mesmos cards para o acumulado anual.
- Cards por plano mostrando o tempo médio de pagamento.
- Clique no plano abre:
  - os seis cards somente daquele plano;
  - seis gráficos de evolução mensal desde 2024.
- Seção geral com seis gráficos de evolução desde 2024.
- Dados salvos no cache diário do Supabase; o backup oficial é consultado uma vez ao dia por combinação de filtros.

## Regra de reativação

- 60 dias ou mais entre vencimento e retorno = reativação.
- Reativações não entram no cálculo do tempo médio de pagamento.
- Pagamentos de contratação não entram na análise.
