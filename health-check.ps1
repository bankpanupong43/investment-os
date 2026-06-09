#Requires -Version 5
<#
.SYNOPSIS
    Investment OS - Health Report

.DESCRIPTION
    Prints a status table covering: Git, Database, .env, SMTP, Shared Folder,
    Brain OS, and Dev Server. Called by boot.ps1 and usable standalone.

.PARAMETER ProjectRoot
    Path to the investment-os project root. Defaults to the script's own directory.

.EXAMPLE
    .\health-check.ps1
    .\health-check.ps1 -ProjectRoot "D:\Projects\investment-os"
#>
param(
    [string]$ProjectRoot = $PSScriptRoot
)

. (Join-Path $ProjectRoot 'shared-paths.ps1')

$rows = @()

# ---- Git ----
$branch     = & git -C $ProjectRoot rev-parse --abbrev-ref HEAD 2>&1
$shortHash  = & git -C $ProjectRoot rev-parse --short HEAD 2>&1
$dirty      = @(& git -C $ProjectRoot status --porcelain 2>&1 | Where-Object { $_ })
$gitOk      = ($LASTEXITCODE -eq 0)
$dirtyLabel = if ($dirty.Count -gt 0) { "DIRTY ($($dirty.Count) files)" } else { "Clean" }
$rows += [PSCustomObject]@{
    Component = 'Git'
    Status    = if ($gitOk) { 'OK' } else { 'ERROR' }
    Detail    = if ($gitOk) { "$branch @ $shortHash  $dirtyLabel" } else { 'git not available' }
}

# ---- Database ----
$dbPath = Join-Path $ProjectRoot 'prisma\dev.db'
if (Test-Path $dbPath) {
    $dbItem = Get-Item $dbPath
    $dbMb   = [math]::Round($dbItem.Length / 1MB, 1)
    $dbAge  = $dbItem.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
    $rows += [PSCustomObject]@{ Component = 'Database'; Status = 'OK'; Detail = "${dbMb} MB  modified $dbAge" }
} else {
    $rows += [PSCustomObject]@{ Component = 'Database'; Status = 'MISSING'; Detail = 'Run .\sync-data.ps1' }
}

# ---- .env ----
$envPath = Join-Path $ProjectRoot '.env'
if (Test-Path $envPath) {
    $rows += [PSCustomObject]@{ Component = '.env'; Status = 'OK'; Detail = $envPath }
} else {
    $rows += [PSCustomObject]@{ Component = '.env'; Status = 'MISSING'; Detail = 'Run .\sync-data.ps1' }
}

# ---- SMTP ----
$envContent = if (Test-Path $envPath) { Get-Content $envPath -Raw -ErrorAction SilentlyContinue } else { '' }
$smtpHost   = $envContent -match 'SMTP_HOST=\S+'
$smtpUser   = $envContent -match 'SMTP_USER=\S+'
$smtpPass   = $envContent -match 'SMTP_PASS=\S+'
if ($smtpHost -and $smtpUser -and $smtpPass) {
    $rows += [PSCustomObject]@{ Component = 'SMTP'; Status = 'OK'; Detail = 'Host, user and password configured' }
} else {
    $missing = @()
    if (-not $smtpHost) { $missing += 'SMTP_HOST' }
    if (-not $smtpUser) { $missing += 'SMTP_USER' }
    if (-not $smtpPass) { $missing += 'SMTP_PASS' }
    $rows += [PSCustomObject]@{ Component = 'SMTP'; Status = 'MISSING'; Detail = ($missing -join ', ') + ' not set in .env' }
}

# ---- Shared Folder ----
$sharedRoot = resolveSharedPath -CallerRoot $ProjectRoot
if ($sharedRoot) {
    $rows += [PSCustomObject]@{ Component = 'Shared Folder'; Status = 'OK'; Detail = $sharedRoot }
} else {
    $rows += [PSCustomObject]@{ Component = 'Shared Folder'; Status = 'NOT FOUND'; Detail = 'Set SHARED_ROOT env var or mount the drive' }
}

# ---- Brain OS ----
$brainOsPath = if ($sharedRoot) { Join-Path $sharedRoot 'Brain OS' } else { $null }
if ($brainOsPath -and (Test-Path $brainOsPath)) {
    $rows += [PSCustomObject]@{ Component = 'Brain OS'; Status = 'OK'; Detail = $brainOsPath }
} else {
    $rows += [PSCustomObject]@{ Component = 'Brain OS'; Status = 'NOT FOUND'; Detail = if ($sharedRoot) { 'Brain OS subfolder missing' } else { 'Shared folder required first' } }
}

# ---- Dev Server (port 3000) ----
$listening = $null
try {
    $listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop | Select-Object -First 1
} catch { }
$rows += [PSCustomObject]@{
    Component = 'Dev Server'
    Status    = if ($listening) { 'RUNNING' } else { 'STOPPED' }
    Detail    = if ($listening) { 'http://localhost:3000  (PID ' + $listening.OwningProcess + ')' } else { 'Not started' }
}

# ---- Print table ----
Write-Host ''
Write-Host '  Investment OS - Health Report'
Write-Host '  ==============================='
foreach ($row in $rows) {
    $color = switch ($row.Status) {
        'OK'        { 'Green'  }
        'RUNNING'   { 'Green'  }
        'MISSING'   { 'Red'    }
        'NOT FOUND' { 'Red'    }
        'ERROR'     { 'Red'    }
        default     { 'Yellow' }
    }
    Write-Host ("  {0,-14}  " -f $row.Component) -NoNewline
    Write-Host ("{0,-12}" -f "[$($row.Status)]") -ForegroundColor $color -NoNewline
    Write-Host "  $($row.Detail)"
}
Write-Host ''
