#Requires -Version 5
<#
.SYNOPSIS
    Centralized shared-folder path resolution for Investment OS scripts.

.DESCRIPTION
    Returns the root Shared folder (not a subfolder). Callers append their own
    subfolder — e.g. 'investment-os-data' or 'Brain OS'.

    Discovery order:
      1. D:\Projects\shared           Work PC — local mirrored shared folder
      2. G:\*\*\Shared                Home PC — Google Drive, Shared 3 levels from root
      3. G:\*\*\*\Shared              Home PC — Google Drive, Shared 4 levels from root
      4. <CallerRoot>\..\shared       Sibling relative fallback (portable across machines)

.PARAMETER CallerRoot
    Pass $PSScriptRoot from the calling script so the sibling fallback resolves
    correctly relative to the caller's location.

.EXAMPLE
    . "$PSScriptRoot\shared-paths.ps1"
    $sharedRoot = resolveSharedPath -CallerRoot $PSScriptRoot
    $dataDir = Join-Path $sharedRoot 'investment-os-data'
#>

function resolveSharedPath {
    param([string]$CallerRoot = "")

    # 0. Explicit override via environment variable
    $c0 = $env:SHARED_ROOT

    # 1. Work PC — direct path
    $c1 = 'D:\Projects\shared'

    # 2. Home machine — Google Drive wildcard, Shared at depth 3 from G:
    $c2 = Get-Item 'G:\*\*\Shared' -ErrorAction SilentlyContinue |
          Select-Object -First 1 -ExpandProperty FullName

    # 3. Home machine — Google Drive wildcard, Shared at depth 4 from G:
    $c3 = Get-Item 'G:\*\*\*\Shared' -ErrorAction SilentlyContinue |
          Select-Object -First 1 -ExpandProperty FullName

    # 4. Sibling relative to caller's script root
    $c4 = if ($CallerRoot) { Join-Path $CallerRoot '..\shared' } else { $null }

    return @($c0, $c1, $c2, $c3, $c4) |
           Where-Object { $_ -and (Test-Path $_) } |
           Select-Object -First 1
}
