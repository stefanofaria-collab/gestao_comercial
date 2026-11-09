# Intranet 2.0 — consulta via Supabase

## Problema corrigido

A Vercel nao tem acesso de rede ao MySQL da AWS. A pagina Intranet 2.0 carregava
os filtros, mas os endpoints de busca/exportacao consultavam o MySQL diretamente
na Vercel e retornavam HTTP 500.

A partir desta alteracao, a busca e a exportacao consultam a tabela
`clickdados_private.intranet2_clients` no Supabase. Esse schema privado
nao e exposto a API REST publica do Supabase. As rotas exigem sessao
autenticada e permissao para a pagina Intranet 2.0.

## Carga inicial no Windows (uma unica vez apos o deploy)

Abra o PowerShell e execute:

```powershell
$ErrorActionPreference = "Stop"
$base = "C:\Users\stefano.faria\Desktop\Projetos\gestao_clientes"
$repositorio = Join-Path $base "clickdados_sync\codigo"
$backend = Join-Path $repositorio "backend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Python do ClickDados nao encontrado em: $python"
}

& git -C $repositorio pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw "Falha ao atualizar o codigo Git." }

Push-Location $backend
try {
    & $python "scripts\sincronizar_intranet2.py"
    if ($LASTEXITCODE -ne 0) {
        throw "Falha na sincronizacao da Intranet. Consulte o erro acima."
    }
} finally {
    Pop-Location
}
```

A atualizacao pode processar muitos clientes e consultar medias historicas de
pagamento. Nao feche a janela enquanto estiver em execucao. O MySQL e acessado
somente para leitura e os dados vao para o PostgreSQL do Supabase.

## Execucao diaria

Apos o `git pull`, a tarefa Windows existente para as 08:00 continua executando:

1. `scripts/sincronizar_indicadores.py`
2. `scripts/atualizar_snapshots_dashboard.py`

O segundo script agora tambem executa `sync_intranet2_snapshot()`.
Nenhuma nova tarefa agendada e necessaria.

## Como validar

1. Abra https://clickdados.vercel.app/intranet-2 ja autenticado.
2. Selecione os filtros e clique **Filtrar Informacoes**.
3. Os clientes devem aparecer sem erro HTTP 500.
4. Se aparecer HTTP 503 antes da carga local, execute a carga inicial acima.

## Restricoes conhecidas

- O snapshot de clientes utiliza a selecao do registro atual, seguindo a
  consulta padrao da Intranet no MySQL. Historicos completos e filtros que
  dependeriam de um plano mais antigo para a mesma empresa podem precisar
  de uma migracao complementar.
- O endpoint de detalhamento completo por cliente ainda consulta o MySQL
  em ambiente local. Na Vercel ele retorna mensagem explicita de
  indisponibilidade ate a migracao das tabelas historicas.
- A exportacao de dezenas de milhares de linhas pode ultrapassar o limite
  de resposta da Vercel e exigir paginacao/streaming em uma etapa futura.
- Os dados sao fotografias diarias. Se o Windows nao rodar a tarefa,
  os dados podem ficar desatualizados.
