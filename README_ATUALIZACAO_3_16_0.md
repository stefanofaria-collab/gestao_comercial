# Atualização 3.16.0 — snapshots diários no Supabase

## Objetivo

O dashboard não deve consultar o MySQL oficial a cada abertura de página. A partir desta versão, as respostas das páginas principais ficam persistidas no Supabase em `public.dashboard_daily_cache`.

## Regra

- A tela sempre tenta ler primeiro o snapshot salvo no Supabase.
- Se o snapshot foi atualizado no dia atual, nenhuma consulta ao MySQL é feita.
- Se o snapshot é de um dia anterior, a resposta antiga é entregue imediatamente e a atualização do dia é disparada em segundo plano.
- Se nunca existiu snapshot para aquele recorte/filtro, a primeira consulta busca o MySQL, grava no Supabase e passa a servir dali.
- Falhas de atualização mantêm o snapshot anterior e são temporariamente bloqueadas para evitar várias conexões simultâneas ao banco oficial.

## Páginas abrangidas

- Faturamento
- Churn
- Perfil
- Vencimentos Futuros
- Drilldowns e consultas auxiliares dessas páginas

## Primeira instalação

O instalador aquece os principais recortes do mês atual quando a tabela de snapshots ainda estiver vazia. Nas próximas execuções, não repete esse aquecimento se o cache já existir.
