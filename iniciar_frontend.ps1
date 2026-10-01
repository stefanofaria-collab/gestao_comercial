$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\frontend"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " FRONTEND - MODO RAPIDO DE NAVEGACAO"
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

if ((-not (Test-Path "$PWD\node_modules")) -or (-not (Test-Path "$PWD\node_modules\xlsx"))) {
    Write-Host "Dependencias novas ou ausentes. Executando npm install..." -ForegroundColor Yellow
    npm install
}

Write-Host "Atualizacao 3.19.2: gerando build com a nova estrategia de cache diario..." -ForegroundColor Cyan

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: o build do frontend falhou." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Build 3.19.2 concluido." -ForegroundColor Green

Write-Host ""
Write-Host "Iniciando frontend em http://localhost:3000 ..." -ForegroundColor Cyan
Write-Host ""

npm run start
