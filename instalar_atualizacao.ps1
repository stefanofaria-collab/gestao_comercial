$ErrorActionPreference = "Stop"

$base = "C:\Users\stefano.faria\Desktop\Projetos\gestao_clientes"
$zip = Join-Path $base "download.zip"
$projeto = Join-Path $base "gestao_clientes_dashboard"
$temp = Join-Path $base "_atualizacao_temp"

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " GESTAO COMERCIAL - ATUALIZACAO 3.28.0"
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

Write-Host "[1/8] Encerrando frontend e backend..." -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 3000,8000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

Write-Host "[2/8] Preparando arquivos..." -ForegroundColor Cyan
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp -Force | Out-Null
Expand-Archive -Path $zip -DestinationPath $temp -Force

$obrigatorios = @(
    "backend\app\main.py",
    "backend\app\database.py",
    "backend\app\services\global_filter_context.py",
    "backend\app\services\churn_score_service.py",
    "backend\app\routes\churn_score.py",
    "frontend\components\layout\AppShell.tsx",
    "frontend\contexts\GlobalFiltersContext.tsx",
    "frontend\lib\browser-daily-cache.ts",
    "aplicar_padronizacao_filtros.py",
    "README_ATUALIZACAO_3_28_0.md",
    "instalar_atualizacao.ps1"
)
foreach ($arquivo in $obrigatorios) {
    if (-not (Test-Path (Join-Path $temp $arquivo))) {
        Write-Host "ERRO: arquivo ausente no ZIP: $arquivo" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[3/8] Atualizando arquivos principais..." -ForegroundColor Cyan
Copy-Item -Path "$temp\*" -Destination $projeto -Recurse -Force

Write-Host "[4/8] Padronizando filtros em todas as paginas..." -ForegroundColor Cyan
$pythonVenv = Join-Path $projeto "backend\.venv\Scripts\python.exe"
if (Test-Path $pythonVenv) {
    & $pythonVenv (Join-Path $projeto "aplicar_padronizacao_filtros.py")
} else {
    python (Join-Path $projeto "aplicar_padronizacao_filtros.py")
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: falha ao aplicar a padronizacao dos filtros." -ForegroundColor Red
    exit 1
}
Remove-Item $temp -Recurse -Force
Write-Host "[OK] Filtros atualizados." -ForegroundColor Green

Write-Host "[5/8] Limpando build antigo do frontend..." -ForegroundColor Cyan
$next = Join-Path $projeto "frontend\.next"
if (Test-Path $next) { Remove-Item $next -Recurse -Force }

Write-Host "[6/8] Iniciando backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", "cd '$projeto'; .\iniciar_backend.ps1"
)

$backendOnline = $false
for ($i = 1; $i -le 90; $i++) {
    Start-Sleep -Seconds 2
    try {
        $api = Invoke-RestMethod -Uri "http://127.0.0.1:8000/" -TimeoutSec 5
        Write-Host "[OK] Backend respondeu. Versao: $($api.version)" -ForegroundColor Green
        $backendOnline = $true
        break
    }
    catch {
        Write-Host "Aguardando backend... $i/90"
    }
}

if (-not $backendOnline) {
    Write-Host "AVISO: backend ainda nao respondeu. Verifique a janela do backend." -ForegroundColor Yellow
}

Write-Host "[7/8] Iniciando frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", "cd '$projeto'; .\iniciar_frontend.ps1"
)

Write-Host "[8/8] Finalizando..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " ATUALIZACAO CONCLUIDA - 3.28.0"
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Filtros globais: periodo, empresa, origem, pagador, plano e duracao." -ForegroundColor Cyan
Write-Host "Para varios meses: abra Mes e use Shift para selecionar o intervalo." -ForegroundColor Cyan
