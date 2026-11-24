# Builds out\Inkgrid-Setup.exe on Windows. Used by CI; also works locally from a repo checkout.
#   powershell -ExecutionPolicy Bypass -File packaging\build.ps1 -Version 1.2.3
param(
  [string]$Version = "",
  [switch]$SkipNpm,           # reuse an existing dist/ and dist-server/
  [string]$NodeLine = "latest-v24.x"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pkgDir = $PSScriptRoot
$stage = Join-Path $pkgDir "stage"
Set-Location $root

$pkgVersion = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
if (-not $Version) { $Version = $pkgVersion }
$fileVersion = (($Version -split '[-+]')[0]) + ".0"
Write-Host "Building Inkgrid $Version (file version $fileVersion)"

# 1. Web app (single self-contained index.html) and the network server bundle
if (-not $SkipNpm) {
  npm ci --no-audit --no-fund; if ($LASTEXITCODE) { throw "npm ci failed" }
  npm run build; if ($LASTEXITCODE) { throw "npm run build failed" }
}
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$stage\app", "$stage\server" | Out-Null
Copy-Item "$root\dist\index.html" "$stage\app\index.html"
Copy-Item "$root\src\fonts\OFL-JetBrainsMono.txt" "$stage\app\"
Copy-Item "$pkgDir\README.txt" "$stage\README.txt"

# 2. Launcher, compiled with the .NET Framework compiler that ships with Windows
$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw "csc.exe not found at $csc" }
& $csc /nologo /langversion:5 /target:winexe /optimize+ "/win32icon:$pkgDir\inkgrid.ico" `
  /r:System.Windows.Forms.dll "/out:$stage\Inkgrid.exe" "$pkgDir\launcher\Launcher.cs"
if ($LASTEXITCODE) { throw "launcher compile failed" }

# 3. Optional network server: official Node.js runtime, checksum-verified
$cache = Join-Path $pkgDir ".cache"
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$base = "https://nodejs.org/dist/$NodeLine"
$sums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content -split "`n"
$line = $sums | Where-Object { $_ -match 'node-v[\d.]+-win-x64\.zip$' } | Select-Object -First 1
if (-not $line) { throw "win-x64 zip not listed in $base/SHASUMS256.txt" }
$sha, $zipName = ($line.Trim() -split '\s+')
$zip = Join-Path $cache $zipName
if (-not (Test-Path $zip)) { Invoke-WebRequest "$base/$zipName" -OutFile $zip -UseBasicParsing }
$actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if ($actual -ne $sha.ToLower()) { Remove-Item $zip; throw "Node.js checksum mismatch for $zipName" }
$nodeDir = Join-Path $cache ($zipName -replace '\.zip$', '')
if (-not (Test-Path $nodeDir)) { Expand-Archive $zip -DestinationPath $cache }
Copy-Item "$nodeDir\node.exe" "$stage\server\node.exe"
Copy-Item "$nodeDir\LICENSE" "$stage\server\NODE-LICENSE.txt"
Copy-Item "$root\dist-server\serve.mjs" "$stage\server\serve.mjs"
Copy-Item "$pkgDir\start-network.cmd" "$stage\server\start-network.cmd"
Write-Host "Bundled $zipName"
New-Item -ItemType Directory -Force -Path (Join-Path $root "out") | Out-Null
"node=$($zipName -replace '-win-x64\.zip$','')" | Out-File -Encoding ascii (Join-Path $root "out\node-version.txt")

# 4. Installer
$iscc = (Get-Command iscc.exe -ErrorAction SilentlyContinue).Source
if (-not $iscc) { $iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" }
if (-not (Test-Path $iscc)) {
  choco install innosetup -y --no-progress | Out-Host
  $iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
}
& $iscc /Qp "/DAppVersion=$Version" "/DFileVersion=$fileVersion" "/DStageDir=$stage" "$pkgDir\inkgrid.iss"
if ($LASTEXITCODE) { throw "ISCC failed" }
Get-Item "$root\out\Inkgrid-Setup.exe" | Format-List Name, Length, LastWriteTime
