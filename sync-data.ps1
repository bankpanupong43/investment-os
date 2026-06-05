#Requires -Version 5
$ErrorActionPreference = 'Stop'

# Candidate 1: known exact path (Google Drive on this machine)
$exact = 'G:\คอมพิวเตอร์เครื่องอื่นๆ\คอมพิวเตอร์ของฉัน\Shared\investment-os-data'

# Candidate 2: 3-level wildcard (Google Drive, language-agnostic, 3 subdirs)
$gdrive3 = Get-Item 'G:\*\*\*\investment-os-data' -ErrorAction SilentlyContinue |
           Select-Object -First 1 -ExpandProperty FullName

# Candidate 3: 2-level wildcard (older layout)
$gdrive2 = Get-Item 'G:\*\*\investment-os-data' -ErrorAction SilentlyContinue |
           Select-Object -First 1 -ExpandProperty FullName

# Candidate 4: sibling shared folder (local fallback)
$sibling = Join-Path $PSScriptRoot '..\shared\investment-os-data'

$shared = @($exact, $gdrive3, $gdrive2, $sibling) |
          Where-Object { $_ -and (Test-Path $_) } |
          Select-Object -First 1

if (-not $shared) {
    Write-Host '[ERROR] Data source not found. Tried:'
    Write-Host "        $exact"
    Write-Host '        G:\*\*\*\investment-os-data'
    Write-Host '        G:\*\*\investment-os-data'
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
