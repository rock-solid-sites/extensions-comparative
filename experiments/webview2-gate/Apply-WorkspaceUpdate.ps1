[CmdletBinding(DefaultParameterSetName='Update')]
param(
    [Parameter(Mandatory,ParameterSetName='Update')][string]$Module,
    [Parameter(Mandatory,ParameterSetName='Rollback')][switch]$Rollback,
    [string]$InstallDir = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'
function Assert-Module([string]$File) {
    if ((Get-Item -LiteralPath $File).Length -gt 2000000) { throw 'Module is too large' }
    $m = Get-Content -LiteralPath $File -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($m.contract -ne 1 -or $m.version -notmatch '^[0-9a-fA-F]{40}$' -or $m.script -isnot [string] -or -not $m.script) { throw 'Invalid module or incompatible host contract' }
    $actual = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($m.script)))
    if ($actual -ne $m.sha256) { throw 'Module hash mismatch' }
    return $m.version
}
$root = (Resolve-Path -LiteralPath $InstallDir).Path
if (-not (Test-Path -LiteralPath (Join-Path $root 'ChatWorkspaceWebViewGate.runtimeconfig.json') -PathType Leaf)) { throw 'Install the framework-dependent baseline first' }
if (Get-Process -Name ChatWorkspaceWebViewGate -ErrorAction SilentlyContinue) { throw 'Close Chat Workspace before updating' }
$target = Join-Path $root 'workspace-module.json'
$backup = "$target.bak"
$source = if ($Rollback) { $backup } else { (Resolve-Path -LiteralPath $Module).Path }
if ($source -eq $target) { throw 'Extract the downloaded module in a separate folder' }
$stage = Join-Path $root ('.module-' + [Guid]::NewGuid().ToString('N') + '.tmp')
try {
    Copy-Item -LiteralPath $source -Destination $stage
    $version = Assert-Module $stage
    if (Test-Path -LiteralPath $target) {
        # Keep one rollback generation, including when rolling back (swap).
        [IO.File]::Replace($stage,$target,$backup)
    } else {
        [IO.File]::Move($stage,$target)
    }
    Write-Output "Installed module $version. Restart Chat Workspace."
} finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Force }
}
