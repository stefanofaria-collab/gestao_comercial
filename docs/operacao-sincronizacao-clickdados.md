# Sincronizacao ClickDados — MySQL de origem → Supabase

## Diagnostico de novembro de 2026

- O backend publicado na Vercel consegue consultar o Supabase.
- Acoes agendadas do GitHub falharam em execucoes recentes.
- O acesso ao MySQL AWS RDS falha com timeout a partir da Vercel.
- Nao ha como obter novos dados do RDS apenas com uma consulta ao Supabase.
- A consulta de Intranet 2.0 ainda usa diretamente o MySQL em varias funcionalidades; isto requer migracao especifica para uma estrutura sincronizada no Supabase.

## Arquitetura proposta

Runner autorizado (rede interna/servidor Linux) → script de sincronizacao → Supabase → site Vercel.

O servidor Linux que ja acessou o RDS pode executar o runner, mas a configuracao deve ser feita
por quem administra o Linux e o repositorio. Nao libere a porta 3306 para a internet.

## Configurar o runner (uma vez)

1. GitHub → repositorio `stefanofaria-collab/gestao_comercial` → Settings → Actions → Runners.
2. Clique em **New self-hosted runner** e selecione **Linux / x64**.
3. Em um usuario de servico isolado do Ubuntu, execute os comandos de download e
   configuracao da versao de runner apresentados pelo proprio GitHub.
4. Na etapa `./config.sh`, adicione o rotulo **clickdados-rds**.
   Por exemplo, substitua o comando `./config.sh` exibido pelo GitHub pelo mesmo
   comando acrescido de `--labels clickdados-rds`.
5. Inicie o runner como servico usando o `svc.sh` fornecido pelo GitHub.
   Confira se o runner aparece como **Idle** na pagina de Runners.
6. Confirme que o runner esta registrado com os rotulos **self-hosted, Linux, X64, clickdados-rds**.
   O workflow exige esse runner; nao ha mais necessidade da variavel `CLICKDADOS_SYNC_RUNNER`.
7. GitHub → Actions → **Atualizar indicadores de clientes** → **Run workflow**.
   Verifique os passos "Diagnosticar acesso ao MySQL de origem",
   "Atualizar indicadores" e "Atualizar snapshots padrao dos dashboards".

Nao cole tokens de registro nem senhas em conversas. O token do runner e temporario;
use apenas os comandos exibidos pelo GitHub.

## Validacao

- `https://clickdados.vercel.app/health` → `"supabase":"connected"`.
- `https://clickdados.vercel.app/api/cache/status` → verificar `atualizados_hoje`.
- `/api/churn?ano=2026&mes=11` → resposta HTTP 200 depois de gerar o snapshot de novembro.
- `/api/indicadores?ano=2026&meses=11` → resposta HTTP 200 para os filtros padrao.
- A busca e o detalhe da Intranet 2.0 continuam dependendo do MySQL ate serem migrados para dados espelhados no Supabase.

## Operacao e seguranca

- Use runner isolado de outros servicos e com permissao minima.
- Restrinja quem pode alterar o codigo e disparar workflows no repositorio.
- Guarde segredos apenas em GitHub Actions Secrets e no ambiente do runner;
  nunca os imprima nos logs.
- Nao execute codigo de pull requests de fontes nao confiaveis no runner.
- O runner precisa de saida de rede para o MySQL e Supabase, sem portas de entrada publicas.
- O workflow agendado e manual usam exclusivamente o runner autorizado. Caso ele
  nao esteja instalado ou esteja offline, o job ficara aguardando um runner elegivel.
- Nao habilite o runner hospedado pelo GitHub para essa sincronizacao enquanto
  a rede nao permitir acesso seguro ao MySQL de origem.

## Protecao contra fallback MySQL na Vercel

- Na Vercel, o backend de dashboards usa os snapshots do Supabase e nao tenta reconstruir snapshots pelo MySQL.
- Quando existe snapshot antigo do mesmo periodo/filtros, ele e mostrado com a data de referencia, sem consulta ao MySQL.
- Se ainda nao existe snapshot para os filtros escolhidos, a rota retorna HTTP 503 informando a necessidade de sincronizar pelo GitHub Actions. Isso nao significa que o MySQL de origem esteja indisponivel.
- O runner autorizado continua responsavel por executar `scripts/sincronizar_indicadores.py` e `scripts/atualizar_snapshots_dashboard.py`. O job atual gera os snapshots de Churn e Indicadores para mes atual e anterior com filtros padrao. Outros filtros requerem snapshots proprios ou sincronizacao expandida.

## Compatibilidade das chaves de snapshot (novembro/2026)

- A interface envia `ano_global` e `meses_global` no filtro de periodo, por exemplo `2026` e `[11]`.
- O script de sincronizacao passa a gravar snapshots com esses mesmos campos, garantindo que a Vercel encontre o recorte.
- A API tambem reconhece snapshots antigos do **mesmo** periodo com filtros globais padrao, gravados antes dessa correcao. Dados de outros meses ou filtros nao sao usados como substitutos.
- Para outros filtros, continua necessario gerar os snapshots correspondentes no runner autorizado.
