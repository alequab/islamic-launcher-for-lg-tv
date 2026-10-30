# Packages Islamic Launcher (the app and its service) and installs it on a rooted LG TV (Homebrew Channel's root
# telnet on port 23), then puts the boot script in place and opens the launcher. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File tools\install-tv.ps1 -Tv 192.168.0.102
# Needs Node.js and ares-package (npm install -g @webos-tools/cli). The TV downloads the package from this PC,
# so both must be on the same network and Windows may ask to let Node through its firewall once.
param([Parameter(Mandatory = $true)][string]$Tv, [switch]$NoPackage)
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
$local = Join-Path $PSScriptRoot 'env.local.ps1'
if (Test-Path $local) { . $local }
$root = Split-Path $PSScriptRoot -Parent
$shell = Join-Path $PSScriptRoot 'tv-shell.js'

if (-not $NoPackage) {
    Push-Location $root
    New-Item -ItemType Directory -Force output | Out-Null
    Remove-Item output\*.ipk -ErrorAction SilentlyContinue
    # The service shares the app's prayer times, texts and adhan-js: copied in, not kept twice in git.
    Copy-Item app\js\adhan.js, app\js\prayer.js, app\js\text.js service\ -Force
    Remove-Item service\state.json -ErrorAction SilentlyContinue
    # The service can't read the app's folder on the TV: it carries its own spoken lines.
    if (Test-Path app\sounds\announce) {
        New-Item -ItemType Directory -Force service\announce | Out-Null
        Copy-Item app\sounds\announce\*.wav service\announce\ -Force
    }
    ares-package.cmd app service -o output --no-minify 2>&1 | Where-Object { $_ -match 'Create|Success|rror' }
    Pop-Location
}
$ipk = Get-ChildItem (Join-Path $root 'output\*.ipk') | Select-Object -First 1
"{0}  {1:N1} MB" -f $ipk.Name, ($ipk.Length / 1MB)

# This PC's address on the TV's network, and a one-file web server for the TV to fetch the package from.
$prefix = ($Tv -split '\.')[0..2] -join '.'
$pc = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "$prefix.*" } | Select-Object -First 1).IPAddress
if (-not $pc) { throw "No address of this PC on $prefix.x" }
$port = 8731
$serve = "require('http').createServer((q,r)=>{require('fs').createReadStream(process.argv[1]).pipe(r)}).listen($port)"
$server = Start-Process node -ArgumentList '-e', "`"$serve`"", "`"$($ipk.FullName)`"" -PassThru -WindowStyle Hidden
try {
    Start-Sleep 1
    $boot = [IO.File]::ReadAllText((Join-Path $root 'boot\90-afnon-launcher')).Replace("`r", '')
    $cmd = @"
curl -s -o /tmp/afnon-launcher.ipk http://${pc}:$port/ && ls -la /tmp/afnon-launcher.ipk
luna-send -i luna://com.webos.appInstallService/dev/install '{"id":"com.ares.defaultName","ipkUrl":"/tmp/afnon-launcher.ipk","subscribe":true}' > /tmp/afnon-install.log 2>&1 &
i=0; while [ `$i -lt 120 ] && ! grep -q '"installed"\|"failed"\|errorText' /tmp/afnon-install.log; do sleep 1; i=`$((i + 1)); done
kill `$! 2>/dev/null
grep -o '"state": *"[^"]*"\|"errorText": *"[^"]*"' /tmp/afnon-install.log | tail -3
rm -f /tmp/afnon-launcher.ipk /tmp/afnon-install.log
mkdir -p /var/lib/webosbrew/init.d
cat > /var/lib/webosbrew/init.d/90-afnon-launcher <<'__AFNON_EOF__'
$boot
__AFNON_EOF__
chmod +x /var/lib/webosbrew/init.d/90-afnon-launcher
# The new script's watcher replaces the old one.
pkill -f init.d/90-afnon-launcher; pkill -f 'luna-send -i luna://com.webos.applicationManager/listLaunchPoints'
pkill -f 'luna-send -i luna://com.webos.service.tvpower/power/getPowerState'
pkill -f 'luna-send -i luna://com.webos.applicationManager/getAppLifeEvents'
/var/lib/webosbrew/init.d/90-afnon-launcher
luna-send -n 1 luna://com.webos.applicationManager/closeByAppId '{"id":"tv.afnon.launcher"}' >/dev/null
sleep 2
luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"tv.afnon.launcher"}'
"@
    $cmd | node $shell $Tv -
} finally {
    Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
}
