param(
    [switch]$Todos,
    [switch]$SomenteDocumentos,
    [switch]$Status,
    [int]$Limite = 0,
    [double]$Delay = 0.5
)

$ErrorActionPreference = "Stop"

$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $base "backend"
$python = Join-Path $backend ".venv\Scripts\python.exe"
$script = Join-Path $backend "scripts\sincronizar_perfil_empresas.py"

if (-not (Test-Path $python)) {
    Write-Host "ERRO: ambiente virtual do backend nao encontrado." -ForegroundColor Red
    Write-Host "Inicie o backend pelo menos uma vez antes desta sincronizacao." -ForegroundColor Yellow
    Write-Host $python
    exit 1
}

if (-not (Test-Path $script)) {
    Write-Host "ERRO: script de sincronizacao nao encontrado." -ForegroundColor Red
    Write-Host $script
    exit 1
}

$argsPython = @($script)

if ($Todos) {
    $argsPython += "--todos"
}
elseif ($Limite -gt 0) {
    $argsPython += @("--limite", "$Limite")
}

if ($SomenteDocumentos) {
    $argsPython += "--somente-documentos"
}

if ($Status) {
    $argsPython += "--status"
}

$argsPython += @("--delay", "$Delay")

Write-Host "" 
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " SINCRONIZACAO DO PERFIL EMPRESARIAL" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Push-Location $backend
try {
    & $python @argsPython
}
finally {
    Pop-Location
}
