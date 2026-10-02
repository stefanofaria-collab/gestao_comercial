# Atualização 3.24.0

## Correção do cruzamento Churn x Atendimentos
- A base de churn continua sendo a consulta **Churn e atrasados**, considerando somente `dias_vencido >= 60`.
- Depois de identificar esses `empresa_id`, o cruzamento passa a usar **todo o histórico de atendimentos desde 01/01/2024 até ontem**, e não apenas o mês selecionado na tela.
- Motivos, atendentes, quantidade de atendimentos, tempo médio, tempo total e correlações usam exatamente o mesmo conjunto de clientes cruzados.

## Cache
- Versão do snapshot de Atendimentos alterada para `3.24.0`, invalidando o resultado antigo da lógica incorreta.
- O cache continua separado por ano/mês e o frontend rejeita respostas de um período diferente do solicitado.
