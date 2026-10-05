# Atualização 3.26.1

## Churn Score
- Nova página **Churn Score** no menu principal.
- Score de 1 a 100 para clientes com vencimento futuro.
- Treino supervisionado com histórico de ciclos de planos desde 2024 e regra de churn em 60 dias.
- Comparação entre Regressão Logística, Random Forest e Extra Trees.
- Validação temporal separando treino, validação e teste.
- Métricas exibidas: ROC-AUC, PR-AUC, Brier, Log Loss, Accuracy, Precision, Recall, F1, Lift Top 10% e captura de churn no Top 10%.
- `dias_vencido` não entra no modelo para evitar vazamento.
- `ultimo_acesso` e `ultimo_acesso_vencimento` entram como ajuste comportamental transparente no score final, sem contaminar o treino histórico.
- Ranking de clientes com link direto para a intranet, vencimento, plano, valor, acesso recente e principais sinais.

## Instalação
- O instalador treina o modelo automaticamente após subir o backend.
- O resultado do treino também é salvo localmente em `backend\modelos\churn_score_resultados.json`.

## Validação adicional do score
- A taxa real de churn agora é calculada no conjunto de teste para as faixas **90–100**, **80–89**, **70–79**, **60–69** e **1–59**.
- Cada faixa mostra quantidade de clientes, churns, taxa real de churn, lift em relação à taxa-base e captura dos churns.
- A página informa se a progressão das faixas é monotônica/consistente.
- Esta validação usa somente o score base do ML; o ajuste de último acesso fica fora porque não existem snapshots históricos desse campo.
- O instalador imprime a distribuição completa no PowerShell após o treinamento.
