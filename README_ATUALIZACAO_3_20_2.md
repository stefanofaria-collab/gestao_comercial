# Atualização 3.20.2

## Atendimentos
- Página passa a usar snapshot diário no Supabase e cache da sessão do navegador.
- A atualização do Zendesk ocorre no máximo uma vez por dia e nunca inclui o dia atual.
- Registros acidentais da data atual/futura são removidos automaticamente antes da sincronização.
- O percentual da base ativa passa a ler o histórico usado por Ativos e Atrasados, incluindo a estrutura nova `historico_ativos` / `historico_tres_linhas`.
- Quando a fotografia de ativos do mês selecionado ainda não estiver no snapshot, é usada a mesma regra de clientes ativos da página Ativos e Atrasados para obter a fotografia do dia 1.

## Motivos
- Novo gráfico geral com quantidade de atendimentos por motivo.
- Clique em um motivo abre a evolução mensal desde 2024.
- O gráfico Motivo por sexo também é clicável e abre a evolução mensal por sexo.
- O gráfico Idade média por motivo também é clicável e abre a evolução mensal da idade média.

## Correção de dados
Os 60 registros de 01/10/2026 que haviam sido inseridos durante o próprio dia 01/10 foram removidos do Supabase antes desta atualização. Após instalar a versão, a rotina incremental consulta novamente 01/10 porque, em 02/10, essa data já é o dia anterior permitido pela regra.
