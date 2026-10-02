# Atualização 3.23.0

- Tempo médio por atendente: barras fixas; scroll do mouse não altera a quantidade exibida.
- Churn em Atendimentos: usa a consulta Churn e atrasados e considera somente dias_vencido >= 60.
- Depois do levantamento, os empresa_id são cruzados com os empresa_id dos atendimentos do período.
- Cache de Atendimentos separado por ano/mês, impedindo fallback de um período para outro.
- Cache invalidado pela versão 3.23.0.
