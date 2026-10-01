# Atualização 3.17.0 — Ativos e Atrasados (Fase 1)

## Nova página
- Nova rota `/ativos-atrasados`, posicionada logo abaixo de Churn.
- Evolução mensal dos clientes ativos, sempre no dia 1 de cada mês.
- Saldo mensal de clientes e comparação YoY com 2025 e 2024.
- Gráfico com três visões da carteira:
  1. clientes ativos;
  2. ativos + clientes com 1 a 30 dias de atraso;
  3. ativos + clientes ainda dentro da média real de atraso (`dias_pgto_real`).
- Cards de prorrogação, atraso dentro da média, até 30, até 45 e até 60 dias.
- Visão financeiro/quantitativo respeitando o filtro global.
- Clique nos cards para listar clientes e exportar em CSV/XLSX/Google Sheets.
- Cinco gráficos por plano, com drill-down plano → duração → clientes/exportação.

## Vencimentos Futuros
- Tempo como cliente passou a aceitar mínimo e máximo independentes.
- Unidade em meses ou anos.
- Novo filtro: somente clientes que ultrapassaram a média real de atraso.

## Churn
- No detalhamento de permanência, cada tempo exato agora é clicável.
- Exibe a lista de clientes daquele mês/ano exato e permite exportar CSV/XLSX/Google Sheets.

## Performance
- `iniciar_frontend.ps1` reutiliza o build de produção quando o código não mudou.
- A página Ativos e Atrasados usa `dashboard_daily_cache`: a origem é atualizada uma vez por dia e os acessos seguintes usam o snapshot do Supabase.
