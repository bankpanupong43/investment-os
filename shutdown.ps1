#Requires -Version 5
<#
.SYNOPSIS
    Investment OS - One-command shutdown

.DESCRIPTION
    Shows git status, optionally commits changes, pushes code to GitHub,
    pushes data files to the shared folder, and confirms it is safe to
    power off the machine.

.EXAMPLE
    .\shutdown.ps1
#>

$ErrorActionPreference = 'Continue'

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
Write-Host '  Investment OS  -  Shutdown'           -ForegroundColor Cyan
Write-Host '=======================================' -ForegroundColor Cyan

# ---- Load machine config ------------------------------------------------
$configPath = Join-Path $PSScriptRoot 'config\machine-config.json'
if (-not (Test-Path $configPath)) {
    Abort "config\machine-config.json not found at: $configPath"
}

$config  = Get-Content $configPath -Raw | ConvertFrom-Json
$machine = $config.machines | Where-Object { $_ -and $_.projectRoot -and (Test-Path $_.projectRoot) } | Select-Object -First 1

if (-not $machine) {
    Abort "No matching machine found in config\machine-config.json."
}

Write-Host ''
Write-Host "  Machine : $($machine.name)"
Write-Host "  Project : $($machine.projectRoot)"
Set-Location $machine.projectRoot

# ========================================================================
# Step 1 - Git status
# ========================================================================
Write-Host ''
Write-Host '--- Git Status ---' -ForegroundColor Cyan

$branch    = & git rev-parse --abbrev-ref HEAD 2>&1
$shortHash = & git rev-parse --short HEAD 2>&1
Write-Host "  Branch: $branch  ($shortHash)"

$modified  = @(& git diff --name-only 2>&1 | Where-Object { $_ })
$untracked = @(& git ls-files --others --exclude-standard 2>&1 | Where-Object { $_ })
$staged    = @(& git diff --cached --name-only 2>&1 | Where-Object { $_ })

if ($modified.Count -eq 0 -and $untracked.Count -eq 0 -and $staged.Count -eq 0) {
    Write-Host '  Working tree clean - nothing to commit.' -ForegroundColor Green
} else {
    if ($staged.Count -gt 0) {
        Write-Host ''
        Write-Host "  Staged ($($staged.Count)):"
        $staged | ForEach-Object { Write-Host "    + $_" -ForegroundColor Green }
    }
    if ($modified.Count -gt 0) {
        Write-Host ''
        Write-Host "  Modified ($($modified.Count)):"
        $modified | ForEach-Object { Write-Host "    M $_" -ForegroundColor Yellow }
    }
    if ($untracked.Count -gt 0) {
        Write-Host ''
        Write-Host "  Untracked ($($untracked.Count)):"
        $untracked | ForEach-Object { Write-Host "    ? $_" -ForegroundColor DarkGray }
    }
}

# ========================================================================
# Step 2 - Offer to commit
# ========================================================================
$commitOk = $false

if ($modified.Count -gt 0 -or $untracked.Count -gt 0 -or $staged.Count -gt 0) {
    Write-Host ''
    $answer = Read-Host 'Commit changes? [Y/N]'
    if ($answer -match '^[Yy]') {
        $msg = 'checkpoint ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')

        git add .
        if ($LASTEXITCODE -ne 0) { Abort 'git add failed.' }

        git commit -m $msg
        if ($LASTEXITCODE -ne 0) { Abort 'git commit failed.' }

        $commitOk = $true
        Write-Host "[shutdown] Committed: $msg" -ForegroundColor Green
    } else {
        Write-Host '[shutdown] Skipping commit.' -ForegroundColor Yellow
    }
} else {
    $commitOk = $true
}

# ========================================================================
# Step 3 - Push code
# ========================================================================
Write-Host ''
Write-Host '--- Pushing Code ---' -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '[WARNING] git push failed.' -ForegroundColor Red
    Write-Host '          Data will NOT be pushed. Push manually before powering off:'
    Write-Host '            git push origin main'
    Write-Host '            .\push-data.ps1'
    Write-Host ''
    Write-Host 'NOT SAFE TO SHUT DOWN - code not pushed.' -ForegroundColor Red
    exit 1
}
Write-Host '[shutdown] Code pushed.' -ForegroundColor Green

# ========================================================================
# Step 4 - Push data
# ========================================================================
Write-Host ''
Write-Host '--- Pushing Data ---' -ForegroundColor Cyan
& (Join-Path $machine.projectRoot 'push-data.ps1')
$pushDataOk = ($LASTEXITCODE -eq 0)

if (-not $pushDataOk) {
    Write-Host ''
    Write-Host '[WARNING] push-data.ps1 reported errors.' -ForegroundColor Yellow
    Write-Host '          Verify shared folder is accessible and re-run .\push-data.ps1'
}

# ========================================================================
# Step 5 - Verify backup files
# ========================================================================
Write-Host ''
Write-Host '--- Verifying Backup ---' -ForegroundColor Cyan

. (Join-Path $machine.projectRoot 'shared-paths.ps1')
$sharedRoot = $null
if ($machine.sharedRoot -and (Test-Path $machine.sharedRoot)) {
    $sharedRoot = $machine.sharedRoot
} else {
    $sharedRoot = resolveSharedPath -CallerRoot $machine.projectRoot
}

$dataDir    = if ($sharedRoot) { Join-Path $sharedRoot 'investment-os-data' } else { $null }
$sharedEnv  = if ($dataDir) { Join-Path $dataDir '.env' } else { $null }
$sharedDb   = if ($dataDir) { Join-Path $dataDir 'dev.db' } else { $null }

$envVerified = $sharedEnv -and (Test-Path $sharedEnv)
$dbVerified  = $sharedDb  -and (Test-Path $sharedDb)

if ($envVerified) {
    Write-Host "[shutdown] .env   verified: $sharedEnv" -ForegroundColor Green
} else {
    Write-Host "[shutdown] .env   NOT FOUND in shared folder." -ForegroundColor Red
}
if ($dbVerified) {
    $dbItem = Get-Item $sharedDb
    $dbMb   = [math]::Round($dbItem.Length / 1MB, 1)
    Write-Host "[shutdown] dev.db verified: $sharedDb  (${dbMb} MB)" -ForegroundColor Green
} else {
    Write-Host "[shutdown] dev.db NOT FOUND in shared folder." -ForegroundColor Red
}

# ========================================================================
# Step 6 - Summary
# ========================================================================
Write-Host ''
Write-Host '--- Shutdown Summary ---' -ForegroundColor Cyan

$finalHash   = & git rev-parse --short HEAD 2>&1
$finalBranch = & git rev-parse --abbrev-ref HEAD 2>&1

$localDb  = Join-Path $machine.projectRoot 'prisma\dev.db'
$dbStamp  = if (Test-Path $localDb) { (Get-Item $localDb).LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss') } else { 'n/a' }
$shStamp  = if ($dbVerified)        { (Get-Item $sharedDb).LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss') } else { 'n/a' }

Write-Host "  Last commit    : $finalBranch @ $finalHash"
Write-Host "  DB local       : $dbStamp"
Write-Host "  DB shared      : $shStamp"
Write-Host "  Shared folder  : $(if ($sharedRoot) { $sharedRoot } else { 'NOT FOUND' })"

Write-Host ''
if ($pushDataOk -and $dbVerified) {
    Write-Host '=======================================' -ForegroundColor Green
    Write-Host '  SAFE TO SHUT DOWN'                    -ForegroundColor Green
    Write-Host '=======================================' -ForegroundColor Green
} else {
    Write-Host '=======================================' -ForegroundColor Yellow
    Write-Host '  CAUTION: Backup may be incomplete.'   -ForegroundColor Yellow
    Write-Host '  Verify shared folder before shutdown.' -ForegroundColor Yellow
    Write-Host '=======================================' -ForegroundColor Yellow
}
Write-Host ''
