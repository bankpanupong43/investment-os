#Requires -Version 5
$ErrorActionPreference = 'Stop'

# Candidate 1: any subfolder on G: named investment-os-data (Google Drive, language-agnostic)
$gdrive = Get-Item 'G:\*\*\investment-os-data' -ErrorAction SilentlyContinue |
          Select-Object -First 1 -ExpandProperty FullName

# Candidate 2: sibling shared folder (original layout, other machines)
$sibling = Join-Path $PSScriptRoot '..\shared\investment-os-data'

$shared = @($gdrive, $sibling) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $shared) {
    Write-Host '[ERROR] Data source not found. Tried:'
    Write-Host '        G:\*\*\investment-os-data  (Google Drive, any language)'
    Write-Host "        $sibling"
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
