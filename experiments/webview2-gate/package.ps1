[CmdletBinding()]
param([Parameter(Mandatory)][string]$PublishDir,[Parameter(Mandatory)][string]$ModuleDir,[Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$Version)
$ErrorActionPreference = 'Stop'
$publish = (Resolve-Path -LiteralPath $PublishDir).Path
New-Item -ItemType Directory -Path $ModuleDir -Force | Out-Null
$module = (Resolve-Path -LiteralPath $ModuleDir).Path
$script = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'workspace.js'))
$hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($script))).ToLowerInvariant()
$envelope = [ordered]@{contract=1;version=$Version;sha256=$hash;script=$script}
$moduleFile = Join-Path $module 'workspace-module.json'
$envelope | ConvertTo-Json -Depth 3 -Compress | Set-Content -LiteralPath $moduleFile -Encoding utf8NoBOM
Copy-Item -LiteralPath $moduleFile -Destination $publish
$updater = Join-Path $PSScriptRoot 'Apply-WorkspaceUpdate.ps1'
Copy-Item -LiteralPath $updater -Destination $publish
$manifest = @(Get-ChildItem -LiteralPath $publish -File -Recurse | Sort-Object FullName | ForEach-Object {
    [ordered]@{path=[IO.Path]::GetRelativePath($publish,$_.FullName).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
})
[ordered]@{version=$Version;contract=1;files=$manifest} | ConvertTo-Json -Depth 5 -Compress | Set-Content -LiteralPath (Join-Path $publish 'baseline-manifest.json') -Encoding utf8NoBOM
# Test update, failed integrity check and rollback on isolated synthetic install.
$temp = Join-Path ([IO.Path]::GetTempPath()) ('chatws-package-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    Set-Content -LiteralPath (Join-Path $temp 'ChatWorkspaceWebViewGate.runtimeconfig.json') -Value '{}'
    $target = Join-Path $temp 'workspace-module.json'
    Copy-Item -LiteralPath $moduleFile -Destination $target
    $oldHash = (Get-FileHash -LiteralPath $target).Hash
    $newFile = Join-Path $temp 'next.json'
    $envelope.version = 'a'*40
    $envelope | ConvertTo-Json -Depth 3 -Compress | Set-Content -LiteralPath $newFile -Encoding utf8NoBOM
    & $updater -InstallDir $temp -Module $newFile
    if ((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $newFile).Hash) { throw 'Update test failed' }
    $envelope.sha256 = '0'*64
    $envelope | ConvertTo-Json -Depth 3 -Compress | Set-Content -LiteralPath $newFile -Encoding utf8NoBOM
    $before = (Get-FileHash -LiteralPath $target).Hash
    $rejected = $false
    try { & $updater -InstallDir $temp -Module $newFile } catch { if ($_.Exception.Message -match 'hash mismatch') { $rejected = $true } else { throw } }
    if (-not $rejected -or (Get-FileHash -LiteralPath $target).Hash -ne $before) { throw 'Corrupt update was not safely rejected' }
    & $updater -InstallDir $temp -Rollback
    if ((Get-FileHash -LiteralPath $target).Hash -ne $oldHash) { throw 'Rollback failed' }
    Write-Output 'PASS update, corruption rejection and rollback'
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }
$baselineBytes = (Get-ChildItem -LiteralPath $publish -File -Recurse | Measure-Object Length -Sum).Sum
Write-Output "Baseline uncompressed bytes: $baselineBytes"
Write-Output "Module uncompressed bytes: $((Get-Item -LiteralPath $moduleFile).Length)"
