$ErrorActionPreference = "Stop"

$base = "C:\Users\stefano.faria\Desktop\Projetos\gestao_clientes"
$zip = Join-Path $base "download.zip"
$projeto = Join-Path $base "gestao_clientes_dashboard"
$temp = Join-Path $base "_atualizacao_temp"

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " GESTAO COMERCIAL - ATUALIZACAO 3.20.2"
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $zip)) {
    Write-Host "ERRO: download.zip nao encontrado:" -ForegroundColor Red
    Write-Host $zip -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $projeto)) {
    Write-Host "ERRO: projeto nao encontrado:" -ForegroundColor Red
    Write-Host $projeto -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/9] Encerrando frontend e backend..." -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 3000,8000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

Write-Host "[2/9] Preparando pasta temporaria..." -ForegroundColor Cyan
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp -Force | Out-Null

Write-Host "[3/9] Extraindo download.zip..." -ForegroundColor Cyan
Expand-Archive -Path $zip -DestinationPath $temp -Force

$obrigatorios = @(
    "backend\app\services\atendimentos_service.py",
    "backend\app\services\zendesk_sync_service.py",
    "backend\app\routes\atendimentos.py",
    "backend\app\services\ativos_atrasados_service.py",
    "backend\app\main.py",
    "frontend\components\atendimentos\AtendimentosDashboard.tsx",
    "frontend\lib\atendimentos-api.ts",
    "frontend\types\atendimentos.ts"
)

foreach ($arquivo in $obrigatorios) {
    if (-not (Test-Path (Join-Path $temp $arquivo))) {
        Write-Host "ERRO: arquivo ausente no ZIP:" -ForegroundColor Red
        Write-Host $arquivo -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "[4/9] Atualizando projeto..." -ForegroundColor Cyan
Copy-Item -Path "$temp\*" -Destination $projeto -Recurse -Force
Remove-Item $temp -Recurse -Force
Write-Host "[OK] Arquivos atualizados." -ForegroundColor Green

Write-Host "[5/9] Limpando build antigo do frontend..." -ForegroundColor Cyan
$next = Join-Path $projeto "frontend\.next"
if (Test-Path $next) { Remove-Item $next -Recurse -Force }

Write-Host "[6/9] Iniciando backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", "cd '$projeto'; .\iniciar_backend.ps1"
)

$backendOnline = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 2
    try {
        $api = Invoke-RestMethod -Uri "http://127.0.0.1:8000/" -TimeoutSec 5
        Write-Host "[OK] Backend respondeu. Versao: $($api.version)" -ForegroundColor Green
        $backendOnline = $true
        break
    }
    catch {
        Write-Host "Aguardando backend... $i/30"
    }
}

Write-Host ""
Write-Host "[7/9] Atualizando atendimentos somente ate ontem..." -ForegroundColor Cyan
if ($backendOnline) {
    try {
        Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/atendimentos/sincronizar" -TimeoutSec 20 | Out-Null

        $syncOk = $false
        for ($i = 1; $i -le 60; $i++) {
            Start-Sleep -Seconds 10
            try {
                $status = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/atendimentos/status" -TimeoutSec 10
                Write-Host "Zendesk: $($status.ultima_data) / esperado: $($status.data_alvo)" -ForegroundColor DarkGray
                if ($status.atualizado -eq $true) {
                    $syncOk = $true
                    Write-Host "[OK] Atendimentos atualizados ate o dia anterior." -ForegroundColor Green
                    break
                }
            }
            catch {
                Write-Host "Aguardando sincronizacao..." -ForegroundColor DarkGray
            }
        }

        if (-not $syncOk) {
            Write-Host "AVISO: a sincronizacao continuara em segundo plano." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "AVISO: nao foi possivel iniciar a sincronizacao agora." -ForegroundColor Yellow
        Write-Host "Ela sera tentada automaticamente no primeiro acesso a pagina." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "[8/9] Criando o cache diario da pagina Atendimentos..." -ForegroundColor Cyan
if ($backendOnline) {
    try {
        $meta = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/atendimentos/meta" -TimeoutSec 20
        $ano = $meta.ano_padrao
        $mes = $meta.mes_padrao
        Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/atendimentos?ano=$ano&mes=$mes&empresa=todos&origem=todos&pagador=todos" -TimeoutSec 300 | Out-Null
        Write-Host "[OK] Cache diario de Atendimentos preparado." -ForegroundColor Green
    }
    catch {
        Write-Host "AVISO: o cache sera concluido automaticamente no primeiro acesso." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "[9/9] Iniciando frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", "cd '$projeto'; .\iniciar_frontend.ps1"
)

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " ATUALIZACAO CONCLUIDA"
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Atendimentos: http://localhost:3000/atendimentos" -ForegroundColor Cyan
Write-Host "Backend: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "Status: http://127.0.0.1:8000/api/atendimentos/status" -ForegroundColor Cyan
