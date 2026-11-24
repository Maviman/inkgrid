# CI smoke test for the installer. Fails (throws) on any problem; the release job depends on it.
#   smoke.ps1 -Setup out\Inkgrid-Setup.exe -Version 1.2.3 [-OldSetup out\Inkgrid-Setup-old.exe]
param(
  [Parameter(Mandatory)] [string]$Setup,
  [Parameter(Mandatory)] [string]$Version,
  [string]$OldSetup = ""
)
$ErrorActionPreference = "Stop"
$appId = "{711D6B85-BFF1-4623-AF5E-C3913A91802F}_is1"
$uninstKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$appId"
$app = Join-Path $env:LOCALAPPDATA "Programs\Inkgrid"
$data = Join-Path $env:LOCALAPPDATA "Inkgrid"
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$desktop = [Environment]::GetFolderPath("Desktop")
$logs = Join-Path (Get-Location) "smoke-logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Step($m) { Write-Host "`n=== $m" -ForegroundColor Cyan }
function Check($cond, $m) { if (-not $cond) { throw "FAIL: $m" } ; Write-Host "  ok  $m" }

function Install($exe, $log, $extra = @()) {
  $argList = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=$log") + $extra
  $p = Start-Process $exe -ArgumentList $argList -Wait -PassThru
  Check ($p.ExitCode -eq 0) "installer exit code 0 (got $($p.ExitCode)), log $log"
}

function Uninstall($extra = @()) {
  $un = Join-Path $app "unins000.exe"
  Check (Test-Path $un) "uninstaller present"
  $p = Start-Process $un -ArgumentList (@('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') + $extra) -Wait -PassThru
  Check ($p.ExitCode -eq 0) "uninstaller exit code 0"
  # unins000.exe hands over to a temp copy and returns early: poll until it is really gone
  $deadline = (Get-Date).AddSeconds(120)
  while ((Test-Path $un) -or (Test-Path $uninstKey)) {
    if ((Get-Date) -gt $deadline) { throw "FAIL: uninstall did not finish in 120 s" }
    Start-Sleep -Milliseconds 500
  }
  Write-Host "  ok  uninstall finished"
}

function LinkTarget($lnk) {
  $sh = New-Object -ComObject WScript.Shell
  return $sh.CreateShortcut($lnk).TargetPath
}

# --- clean slate
if (Test-Path $uninstKey) { throw "Inkgrid is already installed on this runner" }
Remove-Item $data -Recurse -Force -ErrorAction SilentlyContinue

# --- 1. older version first, to prove upgrade in place
if ($OldSetup) {
  Step "Install old version"
  Install $OldSetup "$logs\install-old.log" @('/COMPONENTS=main')
  $old = (Get-ItemProperty $uninstKey).DisplayVersion
  Write-Host "  installed $old"
  New-Item -ItemType Directory -Force -Path $data | Out-Null
  Set-Content (Join-Path $data "marker.txt") "user data from the old version"
}

# --- 2. this version, with the optional component and the desktop task
Step "Install $Version (silent, all components)"
Install $Setup "$logs\install.log" @('/COMPONENTS=main,netserver', '/TASKS=desktopicon')
Get-Content "$logs\install.log" | Select-String -Pattern '\[OK\]|\[!!\]|PREREQ' | ForEach-Object { Write-Host "  log: $($_.Line.Trim())" }

Check (Test-Path "$app\Inkgrid.exe") "Inkgrid.exe installed"
Check (Test-Path "$app\app\index.html") "app\index.html installed"
Check (Test-Path "$app\server\node.exe") "optional network server installed"
Check (Test-Path "$app\server\serve.mjs") "serve.mjs installed"
$reg = Get-ItemProperty $uninstKey
Check ($reg.DisplayVersion -eq $Version) "Add/Remove Programs shows version $Version (got $($reg.DisplayVersion))"
Check ($reg.DisplayName -eq "Inkgrid") "Add/Remove Programs name"
$keys = @(Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" | Where-Object { $_.PSChildName -like "*711D6B85*" })
Check ($keys.Count -eq 1) "exactly one Add/Remove Programs entry"
$lnk = Join-Path $startMenu "Inkgrid.lnk"
Check (Test-Path $lnk) "Start Menu shortcut"
Check (Test-Path (Join-Path $startMenu "Inkgrid network server.lnk")) "Start Menu network server shortcut"
Check (Test-Path (Join-Path $desktop "Inkgrid.lnk")) "Desktop shortcut"
if ($OldSetup) { Check (Test-Path (Join-Path $data "marker.txt")) "user data kept across the upgrade" }

# --- 3. launch the app from the shortcut's own target and confirm it renders
Step "Launch app"
$target = LinkTarget $lnk
Write-Host "  shortcut target: $target"
$smokeLog = "$logs\app-smoke.log"
$p = Start-Process $target -ArgumentList @('--smoke', $smokeLog) -PassThru
if (-not $p.WaitForExit(120000)) { $p.Kill(); throw "FAIL: app smoke test timed out" }
Get-Content $smokeLog | ForEach-Object { Write-Host "  $_" }
Check ($p.ExitCode -eq 0) "app rendered (exit $($p.ExitCode))"

# --- 4. network server component starts and serves the app
Step "Network server"
$env:APP_DIR = "$app\app"; $env:HOST = "127.0.0.1"; $env:PORT = "4199"
$srv = Start-Process "$app\server\node.exe" -ArgumentList "`"$app\server\serve.mjs`"" -PassThru `
  -RedirectStandardOutput "$logs\server.out.log" -RedirectStandardError "$logs\server.err.log"
try {
  $ok = $false
  for ($i = 0; $i -lt 40 -and -not $ok; $i++) {
    Start-Sleep -Milliseconds 250
    try { $r = Invoke-WebRequest "http://127.0.0.1:4199/" -UseBasicParsing -TimeoutSec 2; $ok = ($r.StatusCode -eq 200 -and $r.Content -match '<title>Inkgrid</title>') } catch {}
  }
  Check $ok "network server answered with the app"
} finally { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue }
Remove-Item Env:APP_DIR, Env:HOST, Env:PORT

# --- 5. uninstall keeps user data by default
Step "Uninstall (keep data)"
New-Item -ItemType Directory -Force -Path $data | Out-Null
Set-Content (Join-Path $data "marker.txt") "user data"
Uninstall
Check (-not (Test-Path "$app\Inkgrid.exe")) "program files removed"
Check (-not (Test-Path "$app\app")) "app folder removed"
Check (-not (Test-Path $lnk)) "Start Menu shortcut removed"
Check (-not (Test-Path (Join-Path $desktop "Inkgrid.lnk"))) "Desktop shortcut removed"
Check (Test-Path (Join-Path $data "marker.txt")) "user data kept"

# --- 6. reinstall, then uninstall with /PURGE removes user data too
Step "Reinstall + uninstall with /PURGE"
Install $Setup "$logs\install-2.log" @('/COMPONENTS=main')
Check (-not (Test-Path "$app\server")) "compact install has no network server"
Uninstall @('/PURGE')
Check (-not (Test-Path $data)) "user data deleted on opt-in"

Write-Host "`nSMOKE TEST PASSED" -ForegroundColor Green
