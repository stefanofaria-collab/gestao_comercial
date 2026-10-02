# Atualização 3.22.0

## Correções
- Ativos e Atrasados deixa de usar cache diário no navegador e força novo snapshot 3.22.0; outubro passa a ser buscado no backend no primeiro acesso.
- Todo valor de tempo exibido em Atendimentos usa o formato `hh:mm:ss`, inclusive eixos, tooltips, modais e tabelas.
- A análise de churn em Atendimentos passa a reutilizar exatamente os `empresa_id` retornados pela página de Churn para o mesmo mês e filtros.
- O bloco de churn mostra também quantos clientes existem na página de Churn antes de cruzar com os atendimentos.
