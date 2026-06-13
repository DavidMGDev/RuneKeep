# RuneKeep -> Android APK builder (#173)
# Run from a normal PowerShell window (NOT admin needed):
#   powershell -ExecutionPolicy Bypass -File "D:\Tools\Homebrew\Daggerheart\RuneKeep\apk-build\build-apk.ps1"
#
# Produces a small arm64-v8a release APK (offline, all card data bundled) from the asset-optimized
# `apk-optimize` branch, then uploads it as a GitHub release.
#
# The NDK is installed by DIRECT download + 7-Zip extract, NOT sdkmanager (sdkmanager's NDK install
# stalls badly on Windows). sdkmanager is used only for the small platform/build-tools packages.
#
# PS 5.1 notes baked in: ErrorActionPreference = Continue (native tools write to stderr normally),
# no 2>&1 on native commands, explicit $LASTEXITCODE checks.
#
# Tell Claude when it prints  ===ALL DONE===  (with the size), or paste any line containing FAILED.

$ErrorActionPreference = 'Continue'
$repo   = 'D:\Tools\Homebrew\Daggerheart\RuneKeep'
$sdk    = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$ndkVer = '27.1.12297006'          # NDK r27b == the version Expo SDK 54 / RN 0.81 pins
$ndkUrl = 'https://dl.google.com/android/repository/android-ndk-r27b-windows.zip'

function Section($m) { Write-Host "`n==== $m ====" -ForegroundColor Cyan }
function Fail($m)    { Write-Host "FAILED: $m" -ForegroundColor Red; exit 1 }

# locate sdkmanager.bat (layout can vary)
$sm = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sm)) {
  $found = Get-ChildItem (Join-Path $sdk 'cmdline-tools') -Recurse -Filter 'sdkmanager.bat' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $sm = $found.FullName }
}
if (-not (Test-Path $sm)) { Fail "sdkmanager.bat not found under $sdk\cmdline-tools" }

# locate 7-Zip
$sevenZip = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1

Section "Environment"
Write-Host "Repo : $repo"
Write-Host "SDK  : $sdk"
Write-Host "7-Zip: $(if ($sevenZip) { $sevenZip } else { 'not found (will use Expand-Archive)' })"

# --- 0. is the NDK already valid? ---
$ndkDir = Join-Path $sdk "ndk\$ndkVer"
$ndkOK  = (Test-Path (Join-Path $ndkDir 'source.properties')) -and
          ((Get-Content (Join-Path $ndkDir 'source.properties') -Raw -ErrorAction SilentlyContinue) -match [regex]::Escape($ndkVer))

Section "Clean half-installed NDK + sdkmanager staging"
if (-not $ndkOK) {
  foreach ($p in @((Join-Path $sdk 'ndk'), (Join-Path $sdk '.temp'), (Join-Path $sdk '.downloadIntermediates'))) {
    if (Test-Path $p) { Write-Host "  removing $p"; Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue }
  }
  if (Test-Path (Join-Path $sdk 'ndk')) { Fail "could not delete old NDK (is another build/sdkmanager still running? close it, then re-run)" }
  Write-Host "Clean." -ForegroundColor Green
} else {
  Write-Host "NDK $ndkVer already valid, keeping it." -ForegroundColor Green
}

# --- 1. small SDK packages via sdkmanager (NO ndk here) ---
Section "SDK packages (platform-35, build-tools 35, platform-tools, cmake)"
1..80 | ForEach-Object { 'y' } | & $sm --licenses | Out-Null
& $sm "platform-tools" "platforms;android-35" "build-tools;35.0.0" "cmake;3.22.1"
if (-not (Test-Path (Join-Path $sdk 'platforms\android-35'))) { Fail "platforms;android-35 missing" }
if (-not (Test-Path (Join-Path $sdk 'build-tools\35.0.0')))   { Fail "build-tools;35.0.0 missing" }
Write-Host "SDK packages OK." -ForegroundColor Green

# --- 2. NDK via direct download + 7-Zip ---
Section "NDK $ndkVer (direct install)"
if (-not $ndkOK) {
  $zip = Join-Path $env:TEMP 'ndk-r27b.zip'
  $tmp = Join-Path $env:TEMP 'ndk-r27b-x'
  if (Test-Path $zip) { Remove-Item -Force $zip }
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  Write-Host "Downloading NDK r27b (~700 MB)..."
  curl.exe -L -o $zip $ndkUrl
  if (-not (Test-Path $zip) -or (Get-Item $zip).Length -lt 100MB) { Fail "NDK download failed" }
  Write-Host ("Downloaded {0:N0} MB. Extracting..." -f ((Get-Item $zip).Length / 1MB))
  New-Item -ItemType Directory -Force $tmp | Out-Null
  if ($sevenZip) { & $sevenZip x $zip "-o$tmp" -y -bso0 -bsp0 } else { Expand-Archive -Path $zip -DestinationPath $tmp -Force }
  $inner = Get-ChildItem $tmp -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'android-ndk-*' } | Select-Object -First 1
  if (-not $inner) { Fail "NDK extract produced no android-ndk-* folder" }
  New-Item -ItemType Directory -Force (Join-Path $sdk 'ndk') | Out-Null
  if (Test-Path $ndkDir) { Remove-Item -Recurse -Force $ndkDir }
  Move-Item $inner.FullName $ndkDir
  Remove-Item -Force $zip -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
if (-not (Test-Path (Join-Path $ndkDir 'source.properties'))) { Fail "NDK still missing after install" }
Write-Host "NDK ready: $ndkDir" -ForegroundColor Green

# --- 3. build the APK (arm64-v8a only -> small + fast) ---
Section "Build release APK (arm64-v8a). First run downloads Gradle + compiles native (~10-20 min)."
Set-Location (Join-Path $repo 'android')
& .\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a" --console=plain
if ($LASTEXITCODE -ne 0) { Fail "gradle build (exit $LASTEXITCODE) - paste the red error lines to Claude" }

# --- 4. locate + release ---
Section "Locate APK"
$apk = Get-ChildItem (Join-Path $repo 'android\app\build\outputs\apk\release') -Filter *.apk -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $apk) { Fail "no APK produced" }
$mb = [math]::Round($apk.Length / 1MB, 1)
Write-Host "APK : $($apk.FullName)"
Write-Host "SIZE: $mb MB" -ForegroundColor Green

Section "Upload GitHub release"
Set-Location $repo
$tag = 'v1.0.0-android'
$notes = "Offline Android APK (arm64-v8a, $mb MB). All card data bundled, no download needed. Built from the asset-optimized apk-optimize branch. Sideload: enable Install unknown apps, then open the APK."
gh release delete $tag --yes --cleanup-tag
gh release create $tag "$($apk.FullName)" --target apk-optimize --title "RuneKeep v1.0.0 (Android)" --notes $notes
if ($LASTEXITCODE -ne 0) {
  Write-Host "gh release step failed (gh not logged in? run: gh auth login). APK is built at the path above." -ForegroundColor Yellow
  exit 2
}

Write-Host "`n===ALL DONE=== APK $mb MB uploaded to release $tag" -ForegroundColor Green
