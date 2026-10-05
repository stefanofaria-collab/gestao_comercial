$ErrorActionPreference = "Stop"

$base = "C:\Users\stefano.faria\Desktop\Projetos\gestao_clientes"
$zip = Join-Path $base "download.zip"
$projeto = Join-Path $base "gestao_clientes_dashboard"
$temp = Join-Path $base "_atualizacao_temp"

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " GESTAO COMERCIAL - ATUALIZACAO 3.27.3"
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
    "backend\app\services\intranet2_service.py",
    "backend\app\routes\intranet2.py",
    "backend\app\services\churn_score_service.py",
    "backend\app\routes\churn_score.py",
    "backend\app\main.py",
    "frontend\app\intranet-2\page.tsx",
    "frontend\components\intranet2\Intranet2Dashboard.tsx",
    "frontend\components\layout\AppShell.tsx",
    "frontend\lib\intranet2-api.ts",
    "frontend\types\intranet2.ts",
    "README_ATUALIZACAO_3_27_3.md",
    "instalar_atualizacao.ps1"
)

foreach ($arquivo in $obrigatorios) {
    if (-not (Test-Path (Join-Path $temp $arquivo))) {
        Write-Host "ERRO: arquivo ausente no ZIP:" -ForegroundColor Red
        Write-Host $arquivo -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "[4/8] Atualizando projeto..." -ForegroundColor Cyan
Copy-Item -Path "$temp\*" -Destination $projeto -Recurse -Force
Remove-Item $temp -Recurse -Force
Write-Host "[OK] Arquivos atualizados." -ForegroundColor Green

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

Write-Host "[7/8] Iniciando frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", "cd '$projeto'; .\iniciar_frontend.ps1"
)

Write-Host "[8/8] Preparando dados em segundo plano..." -ForegroundColor Cyan
if ($backendOnline) {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command",
        "try { Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/intranet-2/opcoes' -TimeoutSec 300 | Out-Null } catch {}"
    )

    try {
        Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/churn-score/atualizar?empresa=todos&origem=todos&pagador=todos" -TimeoutSec 15 | Out-Null
        Write-Host "[OK] Atualizacao do Churn Score iniciada em segundo plano." -ForegroundColor Green
    }
    catch {
        Write-Host "AVISO: o Churn Score sera atualizado no proximo acesso." -ForegroundColor Yellow
    }

    try {
        Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/atendimentos/sincronizar" -TimeoutSec 15 | Out-Null
        Write-Host "[OK] Atendimentos atualizando em segundo plano." -ForegroundColor Green
    }
    catch {
        Write-Host "AVISO: atendimentos serao atualizados no proximo acesso." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " ATUALIZACAO CONCLUIDA - 3.27.3"
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Intranet 2.0: http://localhost:3000/intranet-2" -ForegroundColor Cyan
Write-Host "Backend: http://127.0.0.1:8000" -ForegroundColor Cyan
