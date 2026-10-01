$ErrorActionPreference = "Stop"

$base = "C:\Users\stefano.faria\Desktop\Projetos\gestao_clientes"
$zip = Join-Path $base "download.zip"
$projeto = Join-Path $base "gestao_clientes_dashboard"
$temp = Join-Path $base "_atualizacao_temp"

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " GESTAO COMERCIAL - HOTFIX 3.19.2"
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

Write-Host "[1/7] Encerrando frontend e backend..." -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 3000,8000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

Write-Host "[2/7] Preparando pasta temporaria..." -ForegroundColor Cyan
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp -Force | Out-Null

Write-Host "[3/7] Extraindo download.zip..." -ForegroundColor Cyan
Expand-Archive -Path $zip -DestinationPath $temp -Force

$obrigatorios = @(
    "backend\app\services\dashboard_cache_service.py",
    "backend\app\routes\faturamento.py",
    "backend\app\database.py",
    "backend\app\main.py",
    "frontend\components\faturamento\FaturamentoDashboard.tsx",
    "frontend\lib\browser-daily-cache.ts",
    "frontend\app\pagamentos\page.tsx",
    "iniciar_frontend.ps1"
)

foreach ($arquivo in $obrigatorios) {
    if (-not (Test-Path (Join-Path $temp $arquivo))) {
        Write-Host "ERRO: arquivo ausente no ZIP: $arquivo" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[4/7] Atualizando projeto..." -ForegroundColor Cyan
Copy-Item -Path "$temp\*" -Destination $projeto -Recurse -Force
Remove-Item $temp -Recurse -Force
Write-Host "[OK] Projeto atualizado." -ForegroundColor Green

Write-Host "[5/7] Limpando build antigo..." -ForegroundColor Cyan
$next = Join-Path $projeto "frontend\.next"
if (Test-Path $next) { Remove-Item $next -Recurse -Force }

Write-Host "[6/7] Iniciando backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", "cd '$projeto'; .\iniciar_backend.ps1"
)

for ($i = 1; $i -le 20; $i++) {
    Start-Sleep -Seconds 2
    try {
        $api = Invoke-RestMethod -Uri "http://127.0.0.1:8000/" -TimeoutSec 5
        Write-Host "[OK] Backend respondeu. Versao: $($api.version)" -ForegroundColor Green
        break
    } catch {
        Write-Host "Aguardando backend... $i/20"
    }
}

Write-Host "[7/7] Iniciando frontend..." -ForegroundColor Cyan
Write-Host "A atualizacao diaria do backup sera feita em segundo plano quando necessaria." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", "cd '$projeto'; .\iniciar_frontend.ps1"
)

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " HOTFIX INSTALADO"
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Dashboard: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Faturamento: http://localhost:3000/faturamento" -ForegroundColor Cyan
Write-Host "Pagamentos: http://localhost:3000/pagamentos" -ForegroundColor Cyan
Write-Host "Backend: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Aguarde o frontend mostrar Ready." -ForegroundColor Yellow
