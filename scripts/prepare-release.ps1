param([Parameter(Mandatory=$true)][string]$BaselineZip)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$version = (Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw | ConvertFrom-Json).version
if (Test-Path -LiteralPath (Join-Path $sourceRoot "releases/kids-board-game-kingdom-v$version.zip")) { throw '封存已存在，不可覆寫。' }
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('kids-release-' + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $temporary 'stage'
$extract = Join-Path $temporary 'verify'
$null = New-Item -ItemType Directory -Path $stage
$files = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
# 只沿用前版必要證據的清單，內容一律來自目前來源。
$old = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $BaselineZip).Path)
try {
  foreach ($entry in $old.Entries) {
    $name = $entry.FullName.Replace('\','/')
    if ($entry.Name -and $name -notmatch '^dist/' -and $name -ne 'MANIFEST.sha256') { $null = $files.Add($name) }
  }
} finally { $old.Dispose() }
Push-Location $sourceRoot
try {
  foreach ($name in (git -c "safe.directory=$($sourceRoot.Replace('\','/'))" -c core.quotepath=false ls-files --cached --others --exclude-standard)) {
    $relativeName = $name.Replace('\','/')
    $null = $files.Add($relativeName)
  }
  if ($LASTEXITCODE -ne 0) { throw '來源清單讀取失敗' }
} finally { Pop-Location }
foreach ($item in Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'dist') -File -Recurse) { $null = $files.Add([IO.Path]::GetRelativePath($sourceRoot,$item.FullName).Replace('\','/')) }
foreach ($name in $files) {
  if ($name -match '(^|/)(node_modules|releases|handoff|\.git|test-results|playwright-report)/|\.(zip|log|tmp|bak|old)$|(^|/)\.env$' -or ($name -match '(^|/)\.env\.' -and $name -ne '.env.example')) { throw "封包含禁止項目：$name" }
  $source = [IO.Path]::GetFullPath((Join-Path $sourceRoot $name))
  if (!$source.StartsWith($sourceRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw '來源路徑越界' }
  if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "必要來源遺失：$name" }
  $destination = [IO.Path]::GetFullPath((Join-Path $stage $name))
  if (!$destination.StartsWith($stage + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw '輸出路徑越界' }
  $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))
  Copy-Item -LiteralPath $source -Destination $destination
}
$manifest = foreach ($name in ($files | Sort-Object)) { (Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash + '  ' + $name }
[IO.File]::WriteAllLines((Join-Path $stage 'MANIFEST.sha256'),$manifest,[Text.UTF8Encoding]::new($false))
$zip = Join-Path $temporary "kids-board-game-kingdom-v$version.zip"
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$zip)
[IO.Compression.ZipFile]::ExtractToDirectory($zip,$extract)
foreach ($line in Get-Content -LiteralPath (Join-Path $extract 'MANIFEST.sha256')) {
  $hash,$name = $line -split '  ',2
  if ((Get-FileHash -LiteralPath (Join-Path $extract $name) -Algorithm SHA256).Hash -ne $hash) { throw "雜湊不符：$name" }
}
# 尚未移入封存；必須完成乾淨解壓 check/build 等 Gate。
[pscustomobject]@{Version=$version;Candidate=$zip;Verify=$extract;Files=$files.Count;SHA256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash} | ConvertTo-Json
