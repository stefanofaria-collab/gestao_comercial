# Gestão Comercial 3.20.1

Correção da atualização diária após a virada do dia/mês.

## Problemas encontrados

1. Algumas funções de Faturamento, Churn e Perfil mantinham resultados em memória com `lru_cache` usando apenas ano/mês/filtros como chave. Se o backend atravessasse a madrugada sem reiniciar, a rotina diária podia atualizar o Supabase com o mesmo resultado do dia anterior.
2. O cache do navegador aceitava um snapshot antigo como definitivo para o dia quando ele não era um fallback de outro período.
3. O histórico de clientes ativos da página Ativos e Atrasados dependia de `indicadores_mensais`, que ainda terminava em setembro/2026. Outubro, portanto, não aparecia.
4. O período corrente de Faturamento incluía o dia atual. Como o banco corporativo é um backup diário, o correto é consumir somente dias encerrados: no dia 02/10, o limite é 02/10 exclusivo, portanto são utilizados os dados até 01/10.
5. A soma mensal direta de notas fiscais podia atingir o limite máximo de execução do MySQL.

## Correções

- Supabase continua sendo a fonte de leitura do dashboard.
- Resultados dinâmicos deixaram de usar cache permanente em memória; o cache diário persistente do Supabase é a fonte de verdade.
- Snapshots antigos agora são marcados como "em atualização" mesmo quando pertencem ao mesmo mês.
- O browser não fixa como cache do dia um snapshot cuja `source_date` seja anterior à data atual.
- Travas de atualização deixadas por um processo encerrado são liberadas quando o backend inicia.
- Faturamento do mês atual usa leitura recente por ID das notas, evitando varredura completa por data no backup.
- O histórico de Faturamento reaproveita o histórico já salvo no Supabase e substitui apenas o ponto do mês corrente.
- Ativos e Atrasados reaproveita os meses históricos já salvos e calcula apenas o mês que estiver faltando.
- Se outubro ainda não existir em `indicadores_mensais`, o número de clientes ativos de 01/10 é calculado diretamente no backup com a regra de clientes ativos e incorporado ao snapshot diário.
