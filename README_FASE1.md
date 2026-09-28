# Gestão Comercial — Fase 1 da reestruturação

Esta pasta contém somente os arquivos novos/alterados da primeira fase.

## O que foi criado

- Menu lateral recolhível.
- Rotas:
  - `/faturamento`
  - `/churn`
  - `/indicadores`
  - `/perfil`
  - `/vencimentos-futuros`
- Página inicial redirecionando para `/faturamento`.
- Nova API `/api/faturamento` consultando diretamente o MySQL de origem.
- Faturamento mensal selecionável desde 2024.
- Comparação automática com o mês anterior.
- Composição do faturamento:
  - Novos clientes
  - Renovações
  - Recursos adicionais
  - Serviços prestados
  - CertClick
  - Outros / não classificados
- Origem do faturamento de planos por:
  - Empresa: GestãoClick / ClickNotas
  - Origem: GestãoClick / Parceiro
  - Pagador: Cliente / Parceiro
- Histórico mensal desde 2024.
- Tabela por plano, empresa, origem, pagador e duração.

## Como aplicar no seu projeto local

1. Faça uma cópia de segurança da sua pasta atual.
2. Extraia o ZIP na raiz do repositório `gestao_comercial`.
3. Permita substituir os arquivos existentes.
4. Não apague seu `backend/.env` nem seu `frontend/.env.local`.

Os arquivos não incluídos no ZIP permanecem como estão.

## Como iniciar

Na raiz do projeto, abra dois PowerShells.

### Backend

```powershell
.\iniciar_backend.ps1
```

### Frontend

```powershell
.\iniciar_frontend.ps1
```

Depois abra:

```text
http://localhost:3000
```

## Observação importante

O bloco “Onde ganhamos e perdemos” representa aumento ou redução de **faturamento** em relação ao mês anterior. Ele ainda não representa lucro, margem ou resultado financeiro, porque as consultas desta fase não contêm custos.
