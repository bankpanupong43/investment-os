#Requires -Version 5
$ErrorActionPreference = 'Stop'

# Same auto-detection as sync-data.ps1 — exact path first, then wildcards, then sibling
$exact = 'G:\คอมพิวเตอร์เครื่องอื่นๆ\คอมพิวเตอร์ของฉัน\Shared\investment-os-data'

$gdrive3 = Get-Item 'G:\*\*\*\investment-os-data' -ErrorAction SilentlyContinue |
           Select-Object -First 1 -ExpandProperty FullName

$gdrive2 = Get-Item 'G:\*\*\investment-os-data' -ErrorAction SilentlyContinue |
           Select-Object -First 1 -ExpandProperty FullName

$sibling = Join-Path $PSScriptRoot '..\shared\investment-os-data'

$shared = @($exact, $gdrive3, $gdrive2, $sibling) |
          Where-Object { $_ -and (Test-Path $_) } |
          Select-Object -First 1

if (-not $shared) {
    Write-Host '[ERROR] Destination not found. Tried:'
    Write-Host "        $exact"
    Write-Host '        G:\*\*\*\investment-os-data'
    Write-Host '        G:\*\*\investment-os-data'
    Write-Host "        $sibling"
    exit 1
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
