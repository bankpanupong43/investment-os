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
    Write-Host "[ERROR] investment-os-data not found at: $shared"
    exit 1
}

$srcEnv = Join-Path $shared '.env'
$srcDb  = Join-Path $shared 'dev.db'
$dstEnv = Join-Path $PSScriptRoot '.env'
$dstDb  = Join-Path $PSScriptRoot 'prisma\dev.db'

Write-Host '[sync-data] Syncing investment-os data files...'
Write-Host "[sync-data] Source: $shared"
Write-Host ''

$errors = 0
foreach ($pair in @(@($srcEnv, $dstEnv, '.env'), @($srcDb, $dstDb, 'dev.db'))) {
    $src, $dst, $label = $pair
    if (-not (Test-Path $src)) {
        Write-Host "[ERROR] Source not found: $src"
        $errors++
    } else {
        Copy-Item -Force $src $dst
        Write-Host "[OK]    $label > $dst"
    }
}

Write-Host ''
if ($errors -gt 0) {
    Write-Host '[sync-data] Completed with errors.'
    exit 1
} else {
    Write-Host '[sync-data] Done.'
    exit 0
}
