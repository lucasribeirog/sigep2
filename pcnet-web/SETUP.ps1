$ErrorActionPreference = 'Stop'
Write-Host ''
Write-Host '=============================================================' -ForegroundColor Cyan
Write-Host ' Nexus V17.10.1 - Laudos + PCNet Bridge V2.11 (aba gerenciada oculta)' -ForegroundColor Cyan
Write-Host '=============================================================' -ForegroundColor Cyan
Write-Host ''

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js nao encontrado no PATH.' }
$nodeVersion = (& node -p "process.versions.node")
Write-Host "Node.js: $nodeVersion"

if (Test-Path '.\backend\database.sqlite') {
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backupDir = '.\backend\backups'
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    Copy-Item '.\backend\database.sqlite' "$backupDir\database_pre_v17_10_$stamp.sqlite" -Force
    Write-Host "Backup do banco criado em $backupDir" -ForegroundColor Yellow
}

Write-Host ''
Write-Host '[1/4] Dependencias do backend...' -ForegroundColor Cyan
Push-Location '.\backend'
npm ci
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'npm ci do backend falhou.' }

Write-Host '[2/4] Testes do backend...' -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Os testes do backend falharam.' }
Pop-Location

Write-Host '[3/4] Dependencias/build do frontend...' -ForegroundColor Cyan
Push-Location '.\frontend'
npm ci
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'npm ci do frontend falhou.' }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Build do frontend falhou.' }
Pop-Location

Write-Host '[4/4] Verificando PCNet Bridge V2.11...' -ForegroundColor Cyan
foreach ($js in @('background.js','content-pcnet.js','content-nexus.js','popup.js')) {
    & node --check (Join-Path $root "pcnet-bridge-firefox\$js")
    if ($LASTEXITCODE -ne 0) { throw "Sintaxe invalida em $js." }
}
Write-Host 'Bridge V2.11: sintaxe OK' -ForegroundColor Green

Write-Host ''
Write-Host 'Setup concluido.' -ForegroundColor Green
Write-Host 'Backend:  cd backend  ; npm run dev'
Write-Host 'Frontend: cd frontend ; npm run dev'
Write-Host ''
Write-Host 'Firefox: about:debugging#/runtime/this-firefox' -ForegroundColor Yellow
Write-Host 'Carregue pcnet-bridge-firefox\manifest.json como extensao temporaria.'
Write-Host ''
