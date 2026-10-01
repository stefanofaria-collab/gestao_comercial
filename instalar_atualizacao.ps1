$ErrorActionPreference = "Stop"

$base = "C:\Users\stefano.faria\Desktop\Projetos\gestao_clientes"
$zip = Join-Path $base "download.zip"
$projeto = Join-Path $base "gestao_clientes_dashboard"
$temp = Join-Path $base "_atualizacao_temp"

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " GESTAO COMERCIAL - ATUALIZACAO 3.19.0"
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

Write-Host "[2/8] Preparando pasta temporaria..." -ForegroundColor Cyan
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp -Force | Out-Null

Write-Host "[3/8] Extraindo download.zip..." -ForegroundColor Cyan
Expand-Archive -Path $zip -DestinationPath $temp -Force

$obrigatorios = @(
    "backend\app\services\pagamentos_service.py",
    "backend\app\routes\pagamentos.py",
    "backend\app\main.py",
    "frontend\app\pagamentos\page.tsx",
    "frontend\components\pagamentos\PagamentosDashboard.tsx",
    "frontend\lib\pagamentos-api.ts",
    "frontend\types\pagamentos.ts",
    "frontend\components\layout\AppShell.tsx",
    "iniciar_frontend.ps1"
)

foreach ($arquivo in $obrigatorios) {
    if (-not (Test-Path (Join-Path $temp $arquivo))) {
        Write-Host "ERRO: arquivo ausente no ZIP: $arquivo" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[4/8] Atualizando projeto..." -ForegroundColor Cyan
Copy-Item -Path "$temp\*" -Destination $projeto -Recurse -Force
Remove-Item $temp -Recurse -Force
Write-Host "[OK] Projeto atualizado." -ForegroundColor Green

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
for ($i = 1; $i -le 20; $i++) {
    Start-Sleep -Seconds 2
    try {
        $api = Invoke-RestMethod -Uri "http://127.0.0.1:8000/" -TimeoutSec 5
        Write-Host "[OK] Backend respondeu. Versao: $($api.version)" -ForegroundColor Green
        $backendOnline = $true
        break
    } catch {
        Write-Host "Aguardando backend... $i/20"
    }
}

Write-Host "[7/8] Preparando a primeira leitura de Pagamentos..." -ForegroundColor Cyan
if ($backendOnline) {
    try {
        Invoke-RestMethod `
            -Uri "http://127.0.0.1:8000/api/pagamentos?empresa=todos&origem=todos&pagador=todos" `
            -TimeoutSec 300 | Out-Null
        Write-Host "[OK] Snapshot de Pagamentos pronto." -ForegroundColor Green
    } catch {
        Write-Host "AVISO: o snapshot de Pagamentos ainda nao ficou pronto." -ForegroundColor Yellow
        Write-Host "A pagina tentara concluir automaticamente no primeiro acesso." -ForegroundColor Yellow
    }
}

Write-Host "[8/8] Iniciando frontend..." -ForegroundColor Cyan
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
Write-Host "Dashboard: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Pagamentos: http://localhost:3000/pagamentos" -ForegroundColor Cyan
Write-Host "Backend: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host ""
Write-Host "A primeira leitura do dia atualiza o snapshot salvo no banco do projeto." -ForegroundColor Yellow
