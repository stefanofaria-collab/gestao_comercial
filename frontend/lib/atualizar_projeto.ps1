# ============================================================
# ATUALIZADOR DO PROJETO GESTÃO DE CLIENTES
# ============================================================

$ErrorActionPreference = "Stop"


# ============================================================
# CAMINHOS
# ============================================================

$BasePath = "C:\Users\stefano.faria\Desktop\Projetos\gestao_clientes"

$ZipPath = Join-Path `
    $BasePath `
    "download.zip"

$ProjectPath = Join-Path `
    $BasePath `
    "gestao_clientes_dashboard"


# ============================================================
# PASTA TEMPORÁRIA
# ============================================================

$TempPath = Join-Path `
    $env:TEMP `
    ("gestao_clientes_update_" + [Guid]::NewGuid().ToString())


# ============================================================
# BACKUP
# ============================================================

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

$BackupPath = Join-Path `
    $BasePath `
    ("backup_gestao_clientes_" + $Timestamp)


# ============================================================
# ARQUIVOS QUE DEVEM SER ATUALIZADOS
# ============================================================

$FilesToUpdate = @(

    "README_SUPABASE.md",

    "backend\.env.example",

    "backend\requirements.txt",

    "backend\app\config.py",

    "backend\app\database.py",

    "backend\app\constants.py",

    "backend\app\main.py",

    "backend\app\source_queries.py",

    "backend\app\routes\dashboard.py",

    "backend\app\services\dashboard_service.py",

    "backend\scripts\sincronizar_indicadores.py",

    "backend\sql\001_indicadores_mensais.sql",

    ".github\workflows\atualizar-indicadores.yml"
)


# ============================================================
# CABEÇALHO
# ============================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "GESTÃO DE CLIENTES - ATUALIZAÇÃO DO PROJETO" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""


# ============================================================
# VALIDAR ZIP
# ============================================================

if (-not (Test-Path $ZipPath)) {

    Write-Host "[ERRO] ZIP não encontrado:" -ForegroundColor Red
    Write-Host $ZipPath -ForegroundColor Yellow

    exit 1
}


# ============================================================
# VALIDAR PROJETO
# ============================================================

if (-not (Test-Path $ProjectPath)) {

    Write-Host "[ERRO] Projeto não encontrado:" -ForegroundColor Red
    Write-Host $ProjectPath -ForegroundColor Yellow

    exit 1
}


# ============================================================
# CRIAR PASTA TEMPORÁRIA
# ============================================================

Write-Host "[1/6] Criando pasta temporária..." -ForegroundColor Yellow

New-Item `
    -ItemType Directory `
    -Path $TempPath `
    -Force `
    | Out-Null


# ============================================================
# EXTRAIR ZIP
# ============================================================

Write-Host "[2/6] Extraindo download.zip..." -ForegroundColor Yellow

Expand-Archive `
    -Path $ZipPath `
    -DestinationPath $TempPath `
    -Force


# ============================================================
# VALIDAR CONTEÚDO DO ZIP
# ============================================================

Write-Host "[3/6] Validando arquivos..." -ForegroundColor Yellow

$MissingFiles = @()


foreach ($RelativePath in $FilesToUpdate) {

    $SourcePath = Join-Path `
        $TempPath `
        $RelativePath


    if (-not (Test-Path $SourcePath)) {

        $MissingFiles += $RelativePath
    }
}


if ($MissingFiles.Count -gt 0) {

    Write-Host ""
    Write-Host "[ERRO] Alguns arquivos não foram encontrados no ZIP:" -ForegroundColor Red

    foreach ($MissingFile in $MissingFiles) {

        Write-Host "  - $MissingFile" -ForegroundColor Red
    }


    Write-Host ""
    Write-Host "Nenhum arquivo foi alterado." -ForegroundColor Yellow


    Remove-Item `
        -Path $TempPath `
        -Recurse `
        -Force `
        -ErrorAction SilentlyContinue


    exit 1
}


# ============================================================
# CRIAR BACKUP
# ============================================================

Write-Host "[4/6] Criando backup dos arquivos atuais..." -ForegroundColor Yellow

New-Item `
    -ItemType Directory `
    -Path $BackupPath `
    -Force `
    | Out-Null


foreach ($RelativePath in $FilesToUpdate) {

    $CurrentFile = Join-Path `
        $ProjectPath `
        $RelativePath


    if (Test-Path $CurrentFile) {

        $BackupFile = Join-Path `
            $BackupPath `
            $RelativePath


        $BackupDirectory = Split-Path `
            $BackupFile `
            -Parent


        if (-not (Test-Path $BackupDirectory)) {

            New-Item `
                -ItemType Directory `
                -Path $BackupDirectory `
                -Force `
                | Out-Null
        }


        Copy-Item `
            -Path $CurrentFile `
            -Destination $BackupFile `
            -Force
    }
}


Write-Host ""
Write-Host "Backup criado em:" -ForegroundColor DarkGray
Write-Host $BackupPath -ForegroundColor DarkGray
Write-Host ""


# ============================================================
# ATUALIZAR ARQUIVOS
# ============================================================

Write-Host "[5/6] Atualizando projeto..." -ForegroundColor Yellow
Write-Host ""


foreach ($RelativePath in $FilesToUpdate) {

    $SourcePath = Join-Path `
        $TempPath `
        $RelativePath


    $DestinationPath = Join-Path `
        $ProjectPath `
        $RelativePath


    $DestinationDirectory = Split-Path `
        $DestinationPath `
        -Parent


    if (-not (Test-Path $DestinationDirectory)) {

        New-Item `
            -ItemType Directory `
            -Path $DestinationDirectory `
            -Force `
            | Out-Null
    }


    Copy-Item `
        -Path $SourcePath `
        -Destination $DestinationPath `
        -Force


    Write-Host "[OK] $RelativePath" -ForegroundColor Green
}


# ============================================================
# REMOVER TEMPORÁRIOS
# ============================================================

Write-Host ""
Write-Host "[6/6] Limpando arquivos temporários..." -ForegroundColor Yellow


Remove-Item `
    -Path $TempPath `
    -Recurse `
    -Force `
    -ErrorAction SilentlyContinue


# ============================================================
# FINAL
# ============================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "ATUALIZAÇÃO CONCLUÍDA COM SUCESSO" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

Write-Host "Projeto atualizado:" -ForegroundColor Cyan
Write-Host $ProjectPath
Write-Host ""

Write-Host "Backup:" -ForegroundColor Cyan
Write-Host $BackupPath
Write-Host ""

Write-Host "IMPORTANTE:" -ForegroundColor Yellow
Write-Host "O arquivo backend\.env NÃO foi alterado." -ForegroundColor Yellow
Write-Host ""

Write-Host "Próximo passo:" -ForegroundColor Cyan
Write-Host "Atualize manualmente o backend\.env com as variáveis do Supabase."
Write-Host ""