$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\frontend"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " FRONTEND - MODO RAPIDO DE NAVEGACAO"
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Instala dependencias somente quando necessario.
# A exportacao XLSX usa o pacote xlsx; se uma atualizacao adicionou essa dependencia,
# executamos npm install mesmo que node_modules ja exista.
if ((-not (Test-Path "$PWD\node_modules")) -or (-not (Test-Path "$PWD\node_modules\xlsx"))) {
    Write-Host "Dependencias novas ou ausentes. Executando npm install..." -ForegroundColor Yellow
    npm install
}

# Em modo 'next dev', cada pagina e compilada somente no primeiro acesso,
# causando esperas como 'Compiling /perfil... 36s'. Para o uso normal do
# dashboard executamos um build completo uma unica vez e depois iniciamos
# com 'next start'. Assim todas as rotas ficam prontas para navegacao imediata.
Write-Host "Gerando build de producao..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: o build do frontend falhou." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[OK] Build concluido." -ForegroundColor Green
Write-Host "Iniciando frontend em http://localhost:3000 ..." -ForegroundColor Cyan
Write-Host ""

npm run start
