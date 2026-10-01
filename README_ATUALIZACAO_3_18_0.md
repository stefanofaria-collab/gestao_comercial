# Atualização 3.18.0 — Ativos e Atrasados (Fase 2)

## Performance
- Navegação do menu agora faz prefetch explícito das páginas.
- Faturamento, Churn, Vencimentos Futuros e Ativos e Atrasados reutilizam durante a sessão do navegador o último resultado carregado no mesmo dia e atualizam silenciosamente em segundo plano.
- A primeira carga de Ativos e Atrasados ficou mais leve para o filtro padrão: a linha de clientes ativos é lida de `public.indicadores_mensais` no Supabase e o backup da empresa é usado somente para montar as informações históricas de atraso que não existem nessa tabela.
- O instalador aquece o snapshot padrão de Ativos e Atrasados após subir o backend. Assim a primeira abertura da página após a atualização tende a usar o snapshot já pronto.

## Refinamentos visuais em Ativos e Atrasados
- Data de referência mais visível.
- Gráfico de saldo mensal diferencia visualmente meses positivos e negativos e inclui linha zero.
- Linhas de evolução receberam tooltips mais claros e espessura maior.
- Modal de clientes agora mostra resumo do recorte: quantidade, valor, atraso médio atual e média real histórica.
- Drill-down por plano agora mostra resumo do plano e barras por duração antes de abrir os clientes.

## Churn
- Ao abrir um plano, agora é possível filtrar os clientes por duração.
- Cada duração mostra quantidade e LTV.
- A lista do plano/duração pode ser exportada diretamente em CSV, XLSX ou copiada para Google Sheets.

## Versão
- Backend: `3.18.0`.
