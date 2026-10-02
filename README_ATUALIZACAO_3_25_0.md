# Atualização 3.25.0

## Atendimentos dos clientes que churnaram
- Todos os cards agora possuem ajuda no ponto de interrogação.
- Mantida a correlação entre quantidade de atendimentos e tempo total de atendimento.
- A correlação de tempo médio agora é calculada por atendente, usando `email_atendente` para identificar cada pessoa.
- Novo card de associação entre churn e motivo do atendimento, calculado com V de Cramér por o motivo ser uma variável categórica.
- Os textos de ajuda explicam como interpretar Pearson (-1 a +1) e V de Cramér (0 a 1).

## Cache
- Versão do snapshot de Atendimentos alterada para `3.25.0`, evitando reutilizar o snapshot da versão anterior.
