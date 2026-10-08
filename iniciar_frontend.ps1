$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\frontend"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " CLICKDADOS - FRONTEND"
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "$PWD\node_modules")) {
    Write-Host "Dependencias ausentes. Executando npm install..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: npm install falhou." -ForegroundColor Red
        exit 1
    }
}

$buildId = Join-Path $PWD ".next\BUILD_ID"
if (-not (Test-Path $buildId)) {
    Write-Host "Build de producao nao encontrado. Gerando build..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: o build do frontend falhou." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Iniciando ClickDados em http://localhost:3000 ..." -ForegroundColor Green
Write-Host ""
npm run start
