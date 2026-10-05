# Atualização 3.27.3

## Intranet 2.0
- Adicionada a coluna Razão Social logo após Empresa ID na tabela de resultados.

## Churn Score
- Os campos utm_source, utm_medium, utm_campaign, utm_term e utm_content passam a ser avaliados no treinamento.
- O treinamento compara a configuração atual contra a configuração com UTMs usando a validação temporal.
- Os UTMs só entram no modelo final quando melhoram o resultado da validação.
- O modelo é invalidado e retreinado em segundo plano após a atualização, mantendo o último snapshot disponível enquanto o novo cálculo é preparado.
