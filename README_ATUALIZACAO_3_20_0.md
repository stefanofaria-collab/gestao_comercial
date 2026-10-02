# Gestão Comercial — versão 3.20.0

## Nova página Atendimentos

Nova rota no menu, logo abaixo de Perfil:

- `/atendimentos`

A página usa os registros já gravados em `public.atendimentos_zendesk` e inicia a atualização incremental do Zendesk em segundo plano no primeiro acesso.

## Sincronização incremental do Zendesk

O período deixou de ser fixo.

1. Consulta `MAX(data)` em `public.atendimentos_zendesk`.
2. Define o início como `última_data + 1 dia`.
3. Define o fim como `ontem`.
4. Se não houver dias pendentes, não chama a API do Zendesk.
5. Se houver dias pendentes, coleta somente esse intervalo, substitui somente esse recorte no Supabase e enriquece os novos registros.

As credenciais são lidas do `.env` do backend:

- `SUBDOMAIN`
- `CLIENT_ID`
- `CLIENT_SECRET`

## Contexto comercial dos atendimentos

Foi criada a tabela auxiliar `public.atendimentos_zendesk_contexto` para manter no Supabase informações calculadas a partir do backup corporativo:

- empresa;
- origem;
- responsável pelo pagamento;
- plano no momento do atendimento;
- duração;
- data de ativação;
- vencimento relacionado;
- contato até 30 dias após a contratação;
- contato até 30 dias antes de um ciclo que terminou em churn.

O preenchimento inicial desse contexto acontece em segundo plano e não bloqueia os cards básicos da página.

## Visuais entregues

- 5 cards do mês selecionado;
- evolução mensal desde janeiro de 2024 com atendimentos, clientes únicos e percentual da base ativa;
- clientes únicos atendidos por plano;
- até 30 dias após contratação x até 30 dias antes do churn;
- atendimentos x usuários únicos por e-mail;
- sexo dos usuários;
- idade média;
- motivo x sexo;
- motivo x idade média.

## Performance

Foram criados índices para data, empresa, e-mail, motivo, avaliação e sexo na tabela de atendimentos, além dos índices da tabela de contexto.
