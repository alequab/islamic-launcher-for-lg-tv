# Packages the launcher for a GitHub release: app/ without the adhan and voice recordings (they have no licence,
# so a release never carries them; the boot script keeps a TV's own and puts them back after an update) and
# without the copied icons. The version is app/appinfo.json's; TVs update to a release whose tag (vX.Y.Z) is newer.
#   powershell -ExecutionPolicy Bypass -File tools\release.ps1
# Then: gh release create vX.Y.Z output\release\tv.afnon.launcher_X.Y.Z_all.ipk --notes-file <notes>
$ErrorActionPreference = 'Stop'
$local = Join-Path $PSScriptRoot 'env.local.ps1'
if (Test-Path $local) { . $local }
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $root 'app\appinfo.json') -Raw | ConvertFrom-Json).version
$stage = Join-Path $env:TEMP "islamic-launcher-$version"
$out = Join-Path $root 'output\release'
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $out | Out-Null
Remove-Item (Join-Path $out '*.ipk') -ErrorAction SilentlyContinue
robocopy (Join-Path $root 'app') $stage /E /XD sounds icons /NFL /NDL /NJH /NJS /NP | Out-Null
ares-package.cmd $stage -o $out --no-minify 2>&1 | Where-Object { $_ -match 'Create|Success|rror' }
Remove-Item -Recurse -Force $stage
$ipk = Get-ChildItem (Join-Path $out '*.ipk') | Select-Object -First 1
"v$version  {0}  {1:N1} MB" -f $ipk.FullName, ($ipk.Length / 1MB)
