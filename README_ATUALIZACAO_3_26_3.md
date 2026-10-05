# Atualização 3.26.3

## Carregamento rápido
- O Churn Score passa a abrir usando primeiro o último snapshot salvo no banco do dashboard.
- Quando o snapshot tiver mais de 30 minutos, a nova atualização é feita em segundo plano sem bloquear a tela.
- A página mostra em itálico a data e a hora da última atualização.
- Enquanto uma atualização estiver rodando, a própria página informa isso ao lado do horário.
- O frontend consulta novamente o snapshot de forma silenciosa até receber a versão nova.
- No primeiro uso absoluto, a tela também não fica presa: mostra que a primeira fotografia está sendo preparada e atualiza automaticamente quando terminar.

## Atualização do projeto
- O instalador não treina novamente o Churn Score quando já existe um modelo válido.
- A sincronização de atendimentos deixa de bloquear o instalador e continua em segundo plano.
- O frontend é iniciado antes das atualizações demoradas terminarem.
- Os gráficos de plano e duração usam toda a carteira calculada, não apenas as linhas visíveis da tabela.
