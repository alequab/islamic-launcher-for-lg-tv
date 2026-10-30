# Builds the website and publishes it to the gh-pages branch, which GitHub Pages serves: site/ (the page),
# docs/screenshots/ and the launcher itself (app/, without the recordings and the TV's icons) as the live demo at
# /demo/. No build step and no workflow: the app is already a web page, and the demo runs it with the TV stubbed.
#   powershell -ExecutionPolicy Bypass -File tools\site.ps1            # build into output\site and publish
#   powershell -ExecutionPolicy Bypass -File tools\site.ps1 -NoPublish # build only (try it with any static server)
param([switch]$NoPublish)
$ErrorActionPreference = 'Stop'
$local = Join-Path $PSScriptRoot 'env.local.ps1'
if (Test-Path $local) { . $local }
$root = Split-Path $PSScriptRoot -Parent
$site = Join-Path $root 'output\site'
Remove-Item -Recurse -Force $site -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $site | Out-Null
Copy-Item (Join-Path $root 'site\*') $site -Recurse
Copy-Item (Join-Path $root 'docs\screenshots') (Join-Path $site 'screenshots') -Recurse
robocopy (Join-Path $root 'app') (Join-Path $site 'demo') /E /XD sounds icons /NFL /NDL /NJH /NJS /NP | Out-Null
New-Item -ItemType File (Join-Path $site '.nojekyll') | Out-Null
"Built $site"
if ($NoPublish) { return }

# One commit on its own: the branch only ever holds the latest site.
$git = if (Get-Command git -ErrorAction SilentlyContinue) { 'git' } else { 'C:\Users\6\tv-setup\sdk\git\cmd\git.exe' }
$url = & $git -C $root remote get-url origin
Push-Location $site
try {
    & $git init -q -b gh-pages
    & $git add -A
    & $git -c user.name=alequab -c user.email=73583487+alequab@users.noreply.github.com commit -q -m 'Website'
    & $git push -f $url gh-pages 2>&1 | Select-Object -Last 1
} finally {
    Pop-Location
    Remove-Item -Recurse -Force (Join-Path $site '.git') -ErrorAction SilentlyContinue
}
