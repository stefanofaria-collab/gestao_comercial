# Atualização 3.19.2 — Cache diário tolerante à virada de mês

## Problema corrigido

No primeiro dia de um novo mês, ainda não existe um snapshot do período atual no Supabase. A versão anterior fazia as consultas de total, composição e histórico do Faturamento simultaneamente no backup MySQL. Se o backup demorasse mais que o timeout, a página exibia erro técnico e SQL para o usuário.

## Nova regra

- O dashboard continua lendo o Supabase primeiro.
- Se o snapshot exato de hoje existir, ele é usado imediatamente.
- Se o snapshot do período atual ainda não existir, o último snapshot compatível é exibido temporariamente.
- O novo período é atualizado em segundo plano.
- Apenas uma consulta pesada ao backup pode rodar por vez no backend.
- O timeout da leitura diária do backup foi ampliado para permitir que a única atualização do dia conclua sem derrubar a tela.
- Respostas temporárias não são gravadas como cache definitivo no navegador.
- O Faturamento mostra um aviso claro quando está exibindo o último snapshot disponível.
- SQL, nomes de tabelas e detalhes técnicos não são mais mostrados nos erros de Faturamento.

## Versão

Backend: 3.19.2
