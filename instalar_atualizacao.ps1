$ErrorActionPreference = "Stop"

$base = "C:\Users\stefano.faria\Desktop\Projetos\gestao_clientes"
$zip = Join-Path $base "download.zip"
$projeto = Join-Path $base "gestao_clientes_dashboard"
$temp = Join-Path $base "_atualizacao_temp"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " ATUALIZANDO GESTAO CLIENTES"
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $zip)) {
    Write-Host "ERRO: download.zip nao encontrado:" -ForegroundColor Red
    Write-Host $zip -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $projeto)) {
    Write-Host "ERRO: pasta do projeto nao encontrada:" -ForegroundColor Red
    Write-Host $projeto -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/7] Encerrando backend e frontend antigos..." -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 3000,8000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
Start-Sleep -Seconds 1
Write-Host "[OK] Portas 3000 e 8000 liberadas." -ForegroundColor Green

Write-Host "[2/7] Preparando pasta temporaria..." -ForegroundColor Cyan
if (Test-Path $temp) {
    Remove-Item $temp -Recurse -Force
}
New-Item -ItemType Directory -Path $temp -Force | Out-Null

Write-Host "[3/7] Extraindo download.zip..." -ForegroundColor Cyan
Expand-Archive -Path $zip -DestinationPath $temp -Force

$arquivosObrigatorios = @(
    "backend\app\database.py",
    "backend\app\services\perfil_service.py",
    "backend\app\services\payment_metrics_service.py",
    "backend\app\services\vencimentos_futuros_service.py",
    "backend\app\repositories\perfil_supabase_repository.py",
    "backend\app\routes\perfil.py",
    "backend\app\routes\vencimentos_futuros.py",
    "frontend\components\perfil\PerfilDashboard.tsx",
    "frontend\components\vencimentos-futuros\VencimentosFuturosDashboard.tsx",
    "frontend\lib\perfil-api.ts",
    "frontend\lib\vencimentos-futuros-api.ts",
    "frontend\package.json",
    "iniciar_frontend.ps1"
)

foreach ($arquivo in $arquivosObrigatorios) {
    if (-not (Test-Path (Join-Path $temp $arquivo))) {
        Write-Host "ERRO: o ZIP nao possui a estrutura esperada." -ForegroundColor Red
        Write-Host "Arquivo ausente: $arquivo" -ForegroundColor Yellow
        Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
        exit 1
    }
}

Write-Host "[4/7] Copiando atualizacao para o projeto..." -ForegroundColor Cyan
Copy-Item -Path "$temp\*" -Destination $projeto -Recurse -Force

Write-Host "[5/7] Limpando build antigo do Next.js..." -ForegroundColor Cyan
$nextCache = Join-Path $projeto "frontend\.next"
if (Test-Path $nextCache) {
    Remove-Item $nextCache -Recurse -Force
}

Remove-Item $temp -Recurse -Force
Write-Host "[OK] Arquivos instalados." -ForegroundColor Green

Write-Host "[6/7] Iniciando backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "cd '$projeto'; .\iniciar_backend.ps1"
)

Start-Sleep -Seconds 6

try {
    $api = Invoke-RestMethod -Uri "http://127.0.0.1:8000/" -TimeoutSec 10
    Write-Host "[OK] Backend respondeu. Versao: $($api.version)" -ForegroundColor Green
} catch {
    Write-Host "AVISO: backend ainda nao respondeu. Confira a janela do backend." -ForegroundColor Yellow
}

Write-Host "[7/7] Iniciando frontend em modo de producao..." -ForegroundColor Cyan
Write-Host "O primeiro inicio pode demorar porque todas as paginas serao compiladas agora." -ForegroundColor Yellow
Write-Host "Depois do Ready, a troca entre paginas sera imediata." -ForegroundColor Yellow

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "cd '$projeto'; .\iniciar_frontend.ps1"
)

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " ATUALIZACAO CONCLUIDA"
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Backend : http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Perfil  : http://localhost:3000/perfil" -ForegroundColor Cyan
Write-Host "Vencim. : http://localhost:3000/vencimentos-futuros" -ForegroundColor Cyan
Write-Host ""
Write-Host "Aguarde a janela do frontend mostrar Ready antes de abrir o site." -ForegroundColor Yellow
