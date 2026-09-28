# Gestão Comercial — Fase 1.2

Correção do carregamento do Faturamento.

## Mudanças

- Faturamento dividido em 3 chamadas independentes:
  - `/api/faturamento/total`: consulta leve e prioritária.
  - `/api/faturamento/detalhes`: composição, dimensões e planos.
  - `/api/faturamento/historico`: histórico desde 2024.
- O dashboard não fica mais preso em uma única tela de carregamento.
- Timeout explícito no frontend e no MySQL para falhas ficarem visíveis.
- Queries de comparação atual x mês anterior consolidadas para reduzir leituras repetidas.
- Menu lateral e filtros globais também são aplicados diretamente nas páginas para evitar dependência de cache do Root Layout.
- Filtros globais: Empresa, Origem e Responsável pelo pagamento.

## Atualização local

Extraia o conteúdo do ZIP sobre:

`C:\Users\stefano.faria\Desktop\Projetos\gestao_clientes\gestao_clientes_dashboard`

Apague `frontend\.next`, pare backend/frontend e inicie novamente.
