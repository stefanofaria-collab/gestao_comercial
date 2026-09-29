# Atualização 3.12.0 — Página Vencimentos Futuros

## O que foi entregue

- Nova página **Vencimentos Futuros** em `/vencimentos-futuros`.
- API nova em `/api/vencimentos-futuros`.
- Seletor local de **mês** e **ano**, incluindo a opção **Ano completo**.
- Calendário em formato de **mapa de calor** com as regras:
  - azul = ainda vai vencer;
  - laranja = já venceu;
  - vermelho = vencimento com **60 dias ou mais**, representando churn.
- Cards de resumo do período.
- Gráfico de vencimentos por plano.
- Tabelas com:
  - 10 maiores planos que vencem no período;
  - 10 clientes mais antigos que vencem no período;
  - 10 maiores clientes que estão para fazer a primeira renovação.
- Para clientes com histórico de renovação, o backend calcula a **média de dias de pagamento**.

## Arquivos adicionados ou alterados

### Backend
- `backend/app/main.py`
- `backend/app/routes/vencimentos_futuros.py`
- `backend/app/services/vencimentos_futuros_service.py`

### Frontend
- `frontend/app/vencimentos-futuros/page.tsx`
- `frontend/components/vencimentos-futuros/VencimentosFuturosDashboard.tsx`
- `frontend/lib/vencimentos-futuros-api.ts`
- `frontend/types/vencimentos-futuros.ts`

### Instalação
- `instalar_atualizacao.ps1`

## Observações

- O recorte utiliza o mesmo conjunto de filtros globais: empresa, origem e responsável pelo pagamento.
- O ano completo monta os 12 mini calendários do ano selecionado.
- O ranking de primeira renovação considera clientes com **até 1 pagamento histórico**.
