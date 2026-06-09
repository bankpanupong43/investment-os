#Requires -Version 5
<#
.SYNOPSIS
    Investment OS - One-command startup

.DESCRIPTION
    Detects the current machine, pulls latest code, syncs data, installs
    dependencies if needed, regenerates the Prisma client, syncs the DB schema,
    runs a health check, starts the Next.js dev server, and opens the browser.

.EXAMPLE
    .\boot.ps1
#>

$ErrorActionPreference = 'Continue'

function Write-Step {
    param([int]$n, [int]$of, [string]$msg)
    Write-Host ''
    Write-Host "[boot] Step $n/$of - $msg" -ForegroundColor Cyan
}

function Abort {
    param([string]$msg)
    Write-Host ''
    Write-Host "[FATAL] $msg" -ForegroundColor Red
    Write-Host ''
    exit 1
}

# ========================================================================
Write-Host ''
Write-Host '=======================================' -ForegroundColor Cyan
Write-Host '  Investment OS  -  Boot'              -ForegroundColor Cyan
Write-Host '=======================================' -ForegroundColor Cyan

# ---- Load machine config ------------------------------------------------
$configPath = Join-Path $PSScriptRoot 'config\machine-config.json'
if (-not (Test-Path $configPath)) {
    Abort "config\machine-config.json not found at: $configPath"
}

$config  = Get-Content $configPath -Raw | ConvertFrom-Json
$machine = $config.machines | Where-Object { $_ -and $_.projectRoot -and (Test-Path $_.projectRoot) } | Select-Object -First 1

if (-not $machine) {
    Abort "No matching machine found in config\machine-config.json.`n        Add an entry whose projectRoot exists on this machine."
}

Write-Host ''
Write-Host "  Machine : $($machine.name)"
Write-Host "  Project : $($machine.projectRoot)"
Set-Location $machine.projectRoot

# ---- Resolve shared root ------------------------------------------------
$sharedRoot = $null
if ($machine.sharedRoot -and (Test-Path $machine.sharedRoot)) {
    $sharedRoot = $machine.sharedRoot
} else {
    . (Join-Path $machine.projectRoot 'shared-paths.ps1')
    $sharedRoot = resolveSharedPath -CallerRoot $machine.projectRoot
}

# ========================================================================
# Step 1 - git pull
# ========================================================================
Write-Step 1 8 'Pulling latest code...'
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Abort "git pull failed (exit $LASTEXITCODE).`n        Check your network or resolve merge conflicts, then retry."
}
Write-Host '[boot] Code up to date.' -ForegroundColor Green

# ========================================================================
# Step 2 - Sync shared data
# ========================================================================
Write-Step 2 8 'Syncing shared data...'
& (Join-Path $machine.projectRoot 'sync-data.ps1')
if ($LASTEXITCODE -ne 0) {
    Abort "sync-data.ps1 failed. Shared folder may not be accessible."
}

$envFile = Join-Path $machine.projectRoot '.env'
$dbFile  = Join-Path $machine.projectRoot 'prisma\dev.db'

if (-not (Test-Path $envFile)) { Abort ".env not found after sync: $envFile" }
if (-not (Test-Path $dbFile))  { Abort "prisma\dev.db not found after sync: $dbFile" }
Write-Host '[boot] .env and dev.db verified.' -ForegroundColor Green

# ========================================================================
# Step 3 - Install dependencies if needed
# ========================================================================
Write-Step 3 8 'Checking Node dependencies...'

$lockFile = Join-Path $machine.projectRoot 'package-lock.json'
$hashFile = Join-Path $machine.projectRoot 'node_modules\.package-lock-hash'

$installNeeded = $true
if ((Test-Path $lockFile) -and (Test-Path $hashFile)) {
    $currentHash = (Get-FileHash $lockFile -Algorithm SHA256).Hash
    $storedHash  = (Get-Content $hashFile -Raw -ErrorAction SilentlyContinue).Trim()
    if ($currentHash -eq $storedHash) { $installNeeded = $false }
}

if ($installNeeded) {
    Write-Host '[boot] package-lock.json changed - running npm install...'
    npm install
    if ($LASTEXITCODE -ne 0) { Abort 'npm install failed.' }
    (Get-FileHash $lockFile -Algorithm SHA256).Hash | Out-File $hashFile -Encoding utf8 -NoNewline
    Write-Host '[boot] npm install complete.' -ForegroundColor Green
} else {
    Write-Host '[boot] Dependencies up to date (skipped npm install).' -ForegroundColor Green
}

# ========================================================================
# Step 4 - Generate Prisma client
# ========================================================================
Write-Step 4 8 'Generating Prisma client...'
npx prisma generate
if ($LASTEXITCODE -ne 0) { Abort 'prisma generate failed.' }
Write-Host '[boot] Prisma client generated.' -ForegroundColor Green

# ========================================================================
# Step 5 - Sync database schema
# ========================================================================
Write-Step 5 8 'Verifying database schema...'
$pushOut = npx prisma db push --skip-generate 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host '[boot] prisma db push output:' -ForegroundColor Yellow
    $pushOut | ForEach-Object { Write-Host "       $_" }
    Abort 'Schema sync failed. The database may need manual migration.'
}
if ($pushOut -join ' ' -match 'in sync') {
    Write-Host '[boot] Schema up to date.' -ForegroundColor Green
} else {
    Write-Host '[boot] Schema changes applied.' -ForegroundColor Yellow
    $pushOut | ForEach-Object { Write-Host "       $_" }
}

# ========================================================================
# Step 6 - Health check
# ========================================================================
Write-Step 6 8 'Running health check...'
& (Join-Path $machine.projectRoot 'health-check.ps1') -ProjectRoot $machine.projectRoot

# ========================================================================
# Step 7 - Start dev server
# ========================================================================
Write-Step 7 8 'Starting dev server...'

# Warn if port 3000 is already occupied
$portInUse = $null
try { $portInUse = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop | Select-Object -First 1 } catch { }
if ($portInUse) {
    Write-Host '[boot] WARNING: Port 3000 is already in use. Dev server may already be running.' -ForegroundColor Yellow
    Write-Host '[boot] Skipping server start - opening browser directly.'
} else {
    $devArgs  = "-NoExit -NoProfile -Command `"Set-Location '$($machine.projectRoot)'; Write-Host 'Investment OS Dev Server' -ForegroundColor Cyan; npm run dev`""
    $devProc  = Start-Process powershell -ArgumentList $devArgs -PassThru
    Write-Host "[boot] Dev server started in new window (PID $($devProc.Id))." -ForegroundColor Green
}

# ========================================================================
# Step 8 - Open browser
# ========================================================================
Write-Step 8 8 'Opening browser...'

if (-not $portInUse) {
    Write-Host '[boot] Waiting for Next.js to be ready...'
    $ready = $false
    for ($i = 1; $i -le 20; $i++) {
        Start-Sleep -Seconds 2
        try {
            $null = Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            $ready = $true
            break
        } catch { }
        if ($i % 3 -eq 0) { Write-Host "[boot] Still waiting... ($($i * 2)s)" }
    }
    if ($ready) {
        Write-Host '[boot] Server ready.' -ForegroundColor Green
    } else {
        Write-Host '[boot] Server taking longer than expected. Opening browser now.' -ForegroundColor Yellow
    }
}

Start-Process 'http://localhost:3000'

Write-Host ''
Write-Host '=======================================' -ForegroundColor Green
Write-Host '  Investment OS is running.'            -ForegroundColor Green
Write-Host '  http://localhost:3000'               -ForegroundColor Green
Write-Host '=======================================' -ForegroundColor Green
Write-Host ''
