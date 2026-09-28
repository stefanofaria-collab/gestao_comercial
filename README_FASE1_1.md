# Gestão Comercial — Fase 1.1

Correções desta versão:

- o carregamento inicial do Faturamento não busca mais todo o histórico desde 2024 na mesma requisição;
- resumo mensal e histórico foram separados em endpoints diferentes;
- o frontend aborta consultas principais após 30 segundos e mostra o erro, em vez de ficar carregando indefinidamente;
- filtros globais adicionados no topo da aplicação:
  - Empresa;
  - Origem;
  - Responsável pelo pagamento;
- filtros ficam preservados ao trocar de página;
- menu lateral recolhível continua no layout raiz;
- histórico é carregado separadamente e não bloqueia os KPIs e demais componentes.

## Regra dos filtros globais

Empresa:
- ERP = GestãoClick
- NFE ou FIS = ClickNotas

Origem:
- empresa_indicacao_id = 1 = GestãoClick
- diferente de 1 = Parceiro

Responsável pelo pagamento:
- E = Cliente
- P = Parceiro

Quando algum filtro dimensional estiver ativo na página Faturamento, o total filtrado considera somente notas vinculadas a planos/empresas classificáveis por essas dimensões. Serviços sem plano e CertClick ficam fora desse recorte.
