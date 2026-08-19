# RuneKeep -> Android SDK bootstrap (v0.43.0)
#
#   powershell -ExecutionPolicy Bypass -File apk-build/bootstrap-sdk.ps1
#
# build-apk.ps1 installs most of the SDK itself, but it ASSUMES three things are already there and
# fails with a bare "cmake;3.22.1 missing (expected already installed)" when they are not:
#
#   1. cmdline-tools  - not used by the build, but it is what `sdkmanager` lives in, and having it
#                       means the SDK can be inspected and repaired by hand later.
#   2. cmake;3.22.1   - react-native-audio-api compiles C++ and Gradle looks for exactly this version.
#   3. the LICENCES   - the Android Gradle plugin refuses to use a component whose licence has not
#                       been accepted, and it looks for hash files rather than asking.
#
# That was fine on a machine where somebody had once run Android Studio. On a clean one it is a dead
# end, so this puts the three in place and nothing else. Idempotent: everything already installed is
# left alone, so re-running it costs a few seconds.
#
# Extraction is `tar` (bsdtar, in system32 since Windows 10) rather than Expand-Archive, which takes
# minutes on a 600 MB zip.

$ErrorActionPreference = 'Continue'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$base = 'https://dl.google.com/android/repository'

function Section($m) { Write-Host "`n==== $m ====" -ForegroundColor Cyan }
function Fail($m)    { Write-Host "FAILED: $m" -ForegroundColor Red; exit 1 }

# Download $url and place its single top-level folder at $target. Skips when $target/$marker exists.
function Get-SdkZip($name, $url, $target, $marker) {
  if (Test-Path (Join-Path $target $marker)) { Write-Host "  $name already installed." -ForegroundColor Green; return }
  if (Test-Path $target) { Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue }
  $safe = ($name -replace '[^\w]', '_')
  $zip = Join-Path $env:TEMP "rk-bs-$safe.zip"
  $tmp = Join-Path $env:TEMP "rk-bs-$safe-x"
  if (Test-Path $zip) { Remove-Item -Force $zip }
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  Write-Host "  downloading $name ..." -ForegroundColor Yellow
  curl.exe -L --retry 3 -o $zip $url
  if (-not (Test-Path $zip) -or (Get-Item $zip).Length -lt 1MB) { Fail "$name download failed" }
  Write-Host ("  extracting $name ({0:N0} MB)..." -f ((Get-Item $zip).Length / 1MB))
  New-Item -ItemType Directory -Force $tmp | Out-Null
  tar.exe -xf $zip -C $tmp
  if ($LASTEXITCODE -ne 0) { Fail "$name extract failed" }
  $inner = Get-ChildItem $tmp -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $inner) { Fail "$name extract produced no folder" }
  New-Item -ItemType Directory -Force (Split-Path $target -Parent) | Out-Null
  Move-Item $inner.FullName $target
  Remove-Item -Force $zip -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  if (-not (Test-Path (Join-Path $target $marker))) { Fail "$name install incomplete (no $marker)" }
  Write-Host "  $name -> $target" -ForegroundColor Green
}

Section "Android SDK bootstrap"
Write-Host "SDK: $sdk"
New-Item -ItemType Directory -Force $sdk | Out-Null

Section "cmdline-tools"
Get-SdkZip 'cmdline-tools' "$base/commandlinetools-win-11076708_latest.zip" (Join-Path $sdk 'cmdline-tools\latest') 'bin'

Section "cmake;3.22.1"
# This one unpacks its contents at the ROOT of the zip rather than inside a folder, so it is placed
# directly instead of going through Get-SdkZip's move-the-inner-folder step.
$cmakeDir = Join-Path $sdk 'cmake\3.22.1'
if (Test-Path (Join-Path $cmakeDir 'bin\cmake.exe')) {
  Write-Host "  cmake;3.22.1 already installed." -ForegroundColor Green
} else {
  $zip = Join-Path $env:TEMP 'rk-bs-cmake.zip'
  Write-Host "  downloading cmake;3.22.1 ..." -ForegroundColor Yellow
  curl.exe -L --retry 3 -o $zip "$base/cmake-3.22.1-windows.zip"
  if (-not (Test-Path $zip) -or (Get-Item $zip).Length -lt 1MB) { Fail 'cmake download failed' }
  New-Item -ItemType Directory -Force $cmakeDir | Out-Null
  Write-Host ("  extracting cmake ({0:N0} MB)..." -f ((Get-Item $zip).Length / 1MB))
  tar.exe -xf $zip -C $cmakeDir
  if ($LASTEXITCODE -ne 0) { Fail 'cmake extract failed' }
  # Some builds of this zip DO wrap everything in one folder. Flatten it if so, because Gradle looks
  # for cmake/3.22.1/bin/cmake.exe at exactly that depth and nowhere else.
  if (-not (Test-Path (Join-Path $cmakeDir 'bin\cmake.exe'))) {
    $inner = Get-ChildItem $cmakeDir -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'bin\cmake.exe') } | Select-Object -First 1
    if ($inner) { Get-ChildItem $inner.FullName -Force | Move-Item -Destination $cmakeDir -Force; Remove-Item -Recurse -Force $inner.FullName }
  }
  Remove-Item -Force $zip -ErrorAction SilentlyContinue
  if (-not (Test-Path (Join-Path $cmakeDir 'bin\cmake.exe'))) { Fail 'cmake install incomplete (no bin/cmake.exe)' }
  Write-Host "  cmake;3.22.1 -> $cmakeDir" -ForegroundColor Green
}

Section "Licences"
# The published SHA-1s of the licence texts, which is the whole of what `sdkmanager --licenses`
# writes when you hold down y. Written directly because sdkmanager is interactive and this script is
# not; the file format is one hash per line, and the plugin compares rather than parses.
$licDir = Join-Path $sdk 'licenses'
New-Item -ItemType Directory -Force $licDir | Out-Null
$licences = @{
  'android-sdk-license'         = @('24333f8a63b6825ea9c5514f83c2829b004d1fee', '8933bad161af4178b1185d1a37fbf41ea5269c55', 'd56f5187479451eabf01fb78af6dfcb131a6481e')
  'android-sdk-preview-license' = @('84831b9409646a918e30573bab4c9c91346d8abd')
  'android-sdk-arm-dbt-license' = @('859f317696f67ef3d7f30a50a5560e7834b43903')
}
foreach ($name in $licences.Keys) {
  $path = Join-Path $licDir $name
  # No BOM: the plugin reads these as plain ASCII and an invisible leading character fails the match.
  [System.IO.File]::WriteAllText($path, ($licences[$name] -join "`n") + "`n", (New-Object System.Text.UTF8Encoding $false))
  Write-Host "  accepted $name" -ForegroundColor Green
}

Section "Done"
Write-Host "cmdline-tools, cmake;3.22.1 and the licences are in place." -ForegroundColor Green
Write-Host "Next: npm run prebuild:android, then npm run build:apk" -ForegroundColor Green
Write-Host "`n===BOOTSTRAP OK===" -ForegroundColor Green
