# Atualização 3.15.0

## Pagamentos
- A média de dias de pagamento agora usa `dias_pgto_real`.
- Reativações (intervalos de 60 dias ou mais) ficam fora da média de atraso/antecipação.
- Reativações passam a ser exibidas no perfil do cliente.

## Perfil
No detalhe do cliente foram adicionados:
- último vencimento;
- tempo como cliente;
- quantidade de renovações;
- quantidade de reativações;
- LTV;
- ticket médio histórico;
- média real de pagamento;
- quantidade de pagamentos encontrados.

Na área **Consultar clientes e dados da empresa** foram adicionados filtros pesquisáveis por:
- regime tributário;
- porte;
- setor;
- segmento;
- plano;
- duração.

Os campos sugerem as opções existentes conforme o usuário digita.

## Vencimentos Futuros
- O tempo médio de pagamento passa a usar `dias_pgto_real`.
- Novo botão **Exportar dados**.
- Filtros da exportação: empresa, origem, responsável pelo pagamento, período, plano, duração, valor mínimo e tempo mínimo como cliente (mês/ano).
- A tabela de exportação contém todos os campos da consulta de Vencimentos Futuros, incluindo a data de contratação, além de métricas históricas úteis.
- Exportação em CSV e XLSX.
- Botão para copiar todas as linhas para a área de transferência e abrir uma nova planilha no Google Sheets.

## Dependência nova
O frontend passa a usar `xlsx` para gerar arquivos Excel no navegador. O script `iniciar_frontend.ps1` instala a dependência automaticamente caso ainda não exista.
