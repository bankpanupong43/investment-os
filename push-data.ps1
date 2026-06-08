#Requires -Version 5
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\shared-paths.ps1"
$sharedRoot = resolveSharedPath -CallerRoot $PSScriptRoot

if (-not $sharedRoot) {
    Write-Host '[ERROR] Shared root not found. Set SHARED_ROOT env var or ensure the shared folder is accessible.'
    exit 1
}

$shared = Join-Path $sharedRoot 'investment-os-data'

if (-not (Test-Path $shared)) {
    New-Item -ItemType Directory -Path $shared -Force | Out-Null
    Write-Host "[push-data] Created: $shared"
}

$srcDb  = Join-Path $PSScriptRoot 'prisma\dev.db'
$srcEnv = Join-Path $PSScriptRoot '.env'
$dstDb  = Join-Path $shared 'dev.db'
$dstEnv = Join-Path $shared '.env'

Write-Host '[push-data] Pushing investment-os data files...'
Write-Host "[push-data] Destination: $shared"
Write-Host ''

$errors = 0

# --- dev.db: always copy ---
if (-not (Test-Path $srcDb)) {
    Write-Host "[ERROR] Source not found: $srcDb"
    $errors++
} else {
    Copy-Item -Force $srcDb $dstDb
    Write-Host "[OK]    dev.db  >  $dstDb"
}

# --- .env: copy only if source is newer than destination ---
if (-not (Test-Path $srcEnv)) {
    Write-Host "[SKIP]  .env not found at source, skipping"
} elseif (-not (Test-Path $dstEnv)) {
    Copy-Item -Force $srcEnv $dstEnv
    Write-Host "[OK]    .env  >  $dstEnv  (destination did not exist)"
} else {
    $srcTime = (Get-Item $srcEnv).LastWriteTimeUtc
    $dstTime = (Get-Item $dstEnv).LastWriteTimeUtc
    if ($srcTime -gt $dstTime) {
        Copy-Item -Force $srcEnv $dstEnv
        Write-Host "[OK]    .env  >  $dstEnv  (source newer by $([int]($srcTime - $dstTime).TotalSeconds)s)"
    } else {
        Write-Host "[SKIP]  .env  --  destination is up to date (not older than source)"
    }
}

Write-Host ''
if ($errors -gt 0) {
    Write-Host '[push-data] Completed with errors.'
    exit 1
} else {
    Write-Host '[push-data] Done.'
    exit 0
}
