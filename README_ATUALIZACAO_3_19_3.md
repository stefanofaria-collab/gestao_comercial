# Atualização 3.19.3

Correção da atualização diária de Faturamento.

## Mudança principal
As consultas de notas fiscais agora usam também a coluna anual existente na base oficial
como filtro de apoio (`data_emissao_ano`), além do intervalo exato de `data_emissao`.

Esse era o padrão já usado nas rotinas antigas do projeto e evita que a atualização diária
precise varrer toda a tabela de notas fiscais antes de aplicar o período.

## Comportamento
- O dashboard continua lendo primeiro o Supabase.
- Enquanto o novo snapshot não fica pronto, o último snapshot válido continua visível.
- Somente uma leitura pesada do backup é executada por vez.
- O timeout da leitura diária foi ampliado para 300 segundos como margem de segurança.
- Nenhuma regra financeira foi alterada.
