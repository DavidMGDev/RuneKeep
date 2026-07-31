# RuneKeep -> Android APK builder
# Run via the npm front-door from the repo root (no admin needed):
#   npm run build:apk
# ...or directly:  powershell -ExecutionPolicy Bypass -File apk-build/build-apk.ps1
#
# Produces a small arm64-v8a release APK (offline, all card data bundled) from `main`, renames it to
# "Runekeep <version>.apk", and uploads it as a GitHub release. Versioning restarts at v0.2 (#220).
#
# sdkmanager's downloader STALLS on this machine, so every SDK component is fetched by DIRECT
# download (curl) + 7-Zip extract instead. cmake + licenses are already in place.
#
# PS 5.1-safe: ErrorActionPreference = Continue, no 2>&1 on native commands, explicit exit checks.
# Tell Claude when it prints  ===ALL DONE===  (with the size), or paste any line containing FAILED.

# -NoRelease builds the APK and stops there, for when the build is wanted but publishing it is not
# the same decision.
param([switch]$NoRelease)

$ErrorActionPreference = 'Continue'
$repo = Split-Path $PSScriptRoot -Parent   # repo root = parent of apk-build/ (portable; no hardcoded path)
# Release version, READ FROM app.json so it cannot drift from the version the app reports about
# itself. It used to be a hardcoded string here, and the v0.24.3 build shipped as v0.24.2 because
# that string was the one thing nobody remembered to change: it names the tag, the asset and the
# title, and `gh release delete --cleanup-tag` then OVERWRITES the older release with the new build.
$ver  = 'v' + (Get-Content (Join-Path $repo 'app.json') -Raw | ConvertFrom-Json).expo.version
$sdk  = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$base = 'https://dl.google.com/android/repository'

function Section($m) { Write-Host "`n==== $m ====" -ForegroundColor Cyan }
function Fail($m)    { Write-Host "FAILED: $m" -ForegroundColor Red; exit 1 }

# 7-Zip (fast extract); fall back to Expand-Archive
$sevenZip = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1

# Download $url, extract, and place its single top folder at $target. Skips if $target/$marker exists.
function Install-SdkZip($name, $url, $target, $marker) {
  if (Test-Path (Join-Path $target $marker)) { Write-Host "  $name already installed." -ForegroundColor Green; return }
  if (Test-Path $target) { Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue }  # drop any partial
  $safe = ($name -replace '[^\w]', '_')
  $zip  = Join-Path $env:TEMP "rk-$safe.zip"
  $tmp  = Join-Path $env:TEMP "rk-$safe-x"
  if (Test-Path $zip) { Remove-Item -Force $zip }
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  Write-Host "  downloading $name ..." -ForegroundColor Yellow
  curl.exe -L -o $zip $url
  if (-not (Test-Path $zip) -or (Get-Item $zip).Length -lt 1MB) { Fail "$name download failed" }
  Write-Host ("  extracting $name ({0:N0} MB)..." -f ((Get-Item $zip).Length / 1MB))
  New-Item -ItemType Directory -Force $tmp | Out-Null
  if ($sevenZip) { & $sevenZip x $zip "-o$tmp" -y | Out-Null } else { Expand-Archive -Path $zip -DestinationPath $tmp -Force }
  $inner = Get-ChildItem $tmp -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $inner) { Fail "$name extract produced no folder" }
  New-Item -ItemType Directory -Force (Split-Path $target -Parent) | Out-Null
  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  Move-Item $inner.FullName $target
  Remove-Item -Force $zip -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  if (-not (Test-Path (Join-Path $target $marker))) { Fail "$name install incomplete (no $marker)" }
  Write-Host "  $name -> $target" -ForegroundColor Green
}

Section "Environment"
Write-Host "Repo : $repo"
Write-Host "SDK  : $sdk"
Write-Host "7-Zip: $(if ($sevenZip) { $sevenZip } else { 'not found (Expand-Archive fallback)' })"

Section "Clean sdkmanager staging"
foreach ($p in @((Join-Path $sdk '.temp'), (Join-Path $sdk '.downloadIntermediates'))) {
  if (Test-Path $p) { Write-Host "  removing $p"; Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue }
}

Section "SDK components (direct download; cmake + licenses already present)"
Install-SdkZip "platform-tools"       "$base/platform-tools-latest-windows.zip" (Join-Path $sdk 'platform-tools')        'source.properties'
Install-SdkZip "build-tools;35.0.0"   "$base/build-tools_r35_windows.zip"       (Join-Path $sdk 'build-tools\35.0.0')    'source.properties'
Install-SdkZip "platforms;android-35" "$base/platform-35_r02.zip"               (Join-Path $sdk 'platforms\android-35')  'android.jar'
Install-SdkZip "ndk;27.1.12297006"    "$base/android-ndk-r27b-windows.zip"      (Join-Path $sdk 'ndk\27.1.12297006')     'source.properties'
if (-not (Test-Path (Join-Path $sdk 'cmake\3.22.1\bin\cmake.exe'))) { Fail "cmake;3.22.1 missing (expected already installed)" }
Write-Host "All SDK components present." -ForegroundColor Green

# ---------------------------------------------------------------------------
# react-native-audio-api native prerequisites (#255). This module compiles C++ on Android and is
# fussy on this Windows/WSL machine. Two self-heal steps so a fresh `npm install` still builds:
#  1) Long-path-aware ninja. The CMake-bundled ninja is 1.10.2 (NOT long-path-aware). audio-api keeps
#     its C++ in common/cpp, so ninja mirrors the full absolute source path under the obj dir and
#     blows past MAX_PATH (260) even with the OS LongPathsEnabled flag on -> "ninja: error: mkdir(...)
#     No such file or directory". ninja 1.12.1 carries the longPathAware manifest and fixes it.
#  2) Prebuilt native binaries. audio-api's gradle task shells to a WSL bash script that needs `unzip`
#     (absent in WSL here) to extract the prebuilt opus/vorbis static libs -> the native link fails.
#     The script SKIPS extraction if the target dir already exists, so we pre-extract with 7-Zip.
$rnaDir = Join-Path $repo 'node_modules\react-native-audio-api'
if (Test-Path $rnaDir) {
  Section "react-native-audio-api native prerequisites"
  # (1) ninja
  $ninja = Join-Path $sdk 'cmake\3.22.1\bin\ninja.exe'
  $ninjaVer = if (Test-Path $ninja) { (& $ninja --version) } else { '0' }
  if ([version]($ninjaVer -replace '[^0-9.].*$','') -lt [version]'1.11') {
    Write-Host "  ninja $ninjaVer is not long-path-aware; installing 1.12.1 ..." -ForegroundColor Yellow
    $nz = Join-Path $env:TEMP 'rk-ninja.zip'; $nx = Join-Path $env:TEMP 'rk-ninja-x'
    curl.exe -fsSL 'https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip' -o $nz
    if (Test-Path $nx) { Remove-Item -Recurse -Force $nx }
    New-Item -ItemType Directory -Force $nx | Out-Null
    if ($sevenZip) { & $sevenZip x $nz "-o$nx" -y | Out-Null } else { Expand-Archive -Path $nz -DestinationPath $nx -Force }
    if (Test-Path $ninja) { Copy-Item -Force $ninja (Join-Path $sdk 'cmake\3.22.1\bin\ninja-old.exe.bak') }
    Copy-Item -Force (Join-Path $nx 'ninja.exe') $ninja
    Remove-Item -Force $nz -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force $nx -ErrorAction SilentlyContinue
    Write-Host "  ninja -> $(& $ninja --version)" -ForegroundColor Green
  } else { Write-Host "  ninja $ninjaVer is long-path-aware." -ForegroundColor Green }
  # (2) prebuilt static libs (android.zip -> common/cpp/audioapi/external/android)
  $extAndroid = Join-Path $rnaDir 'common\cpp\audioapi\external\android'
  if (-not (Test-Path $extAndroid)) {
    Write-Host "  extracting audio-api prebuilt android libs ..." -ForegroundColor Yellow
    $az = Join-Path $env:TEMP 'rk-rna-android.zip'
    curl.exe -fsSL 'https://github.com/software-mansion-labs/rn-audio-libs/releases/download/v3.1.0/android.zip' -o $az
    $extDir = Join-Path $rnaDir 'common\cpp\audioapi\external'
    New-Item -ItemType Directory -Force $extDir | Out-Null
    if ($sevenZip) { & $sevenZip x $az "-o$extDir" -y | Out-Null } else { Expand-Archive -Path $az -DestinationPath $extDir -Force }
    Remove-Item -Recurse -Force (Join-Path $extDir '__MACOSX') -ErrorAction SilentlyContinue
    Remove-Item -Force $az -ErrorAction SilentlyContinue
    if (Test-Path $extAndroid) { Write-Host "  prebuilt libs -> $extAndroid" -ForegroundColor Green } else { Fail "audio-api prebuilt android libs missing after extract" }
  } else { Write-Host "  audio-api prebuilt libs present." -ForegroundColor Green }
}

Section "Build release APK (arm64-v8a). First run downloads Gradle + compiles native (~10-20 min)."
Set-Location (Join-Path $repo 'android')
Section 'Prebuild (regenerate android/ from app.json)'
# Without this the native manifest is whatever it was the FIRST time android/ was generated, so any
# app.json change since -- intent filters, permissions, orientation -- is silently dropped from the
# APK. v0.22.0 shipped its .rkp file association this way and it did nothing.
Push-Location $repo
# The forged-card cache signature (v0.27.4). It decides whether installs re-capture every card
# bitmap on device, so it is regenerated as part of the build rather than trusted to be current.
node scripts/forge-hash.mjs
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'forge hash generation failed' }
npx expo prebuild -p android --no-install
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'expo prebuild failed' }
Pop-Location

& .\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a" --console=plain
if ($LASTEXITCODE -ne 0) { Fail "gradle build (exit $LASTEXITCODE) - paste the red error lines to Claude" }

Section "Locate APK"
$apk = Get-ChildItem (Join-Path $repo 'android\app\build\outputs\apk\release') -Filter *.apk -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $apk) { Fail "no APK produced" }
$mb = [math]::Round($apk.Length / 1MB, 1)
Write-Host "APK : $($apk.FullName)"
Write-Host "SIZE: $mb MB" -ForegroundColor Green

Section "Rename APK to a friendly asset name"
# The release asset (and the file the player downloads) is named "Runekeep <ver>.apk".
$niceApk = Join-Path (Split-Path $apk.FullName -Parent) "Runekeep $ver.apk"
Copy-Item -Force $apk.FullName $niceApk
Write-Host "ASSET: $niceApk" -ForegroundColor Green
# A SECOND copy under a name that never changes, uploaded alongside the versioned one. GitHub serves
# /releases/latest/download/<name> only for an asset whose name is stable, so this is what lets the
# website's /android-app link keep working without being edited every release. The versioned name
# stays, because that is the one a player ends up with in their downloads folder.
$latestApk = Join-Path (Split-Path $apk.FullName -Parent) 'RuneKeep-android.apk'
Copy-Item -Force $apk.FullName $latestApk

if ($NoRelease) {
  Write-Host "`n===ALL DONE=== APK $mb MB at $niceApk (not published: -NoRelease)" -ForegroundColor Green
  exit 0
}

Section "Upload GitHub release"
Set-Location $repo
$tag = $ver
# Release notes live in apk-build/release-notes.md, NOT in this script. They were a literal here
# once, and the v0.24.3 build shipped v0.24.2's notes because a string buried in a build script
# is the thing nobody remembers to edit. `$mb` is substituted so the size stays accurate.
$notesPath = Join-Path $PSScriptRoot 'release-notes.md'
$notes = if (Test-Path $notesPath) { (Get-Content $notesPath -Raw).Replace('$mb', $mb) } else { "RuneKeep $ver (Android). Offline APK, arm64-v8a, $mb MB." }
# The notes go through a FILE, not --notes.
#
# PowerShell 5.1 re-quotes an argument on its way to a native program, and it splits on double quotes
# inside the string rather than escaping them. A release note containing a quoted phrase therefore
# arrived at gh as several arguments, and the build failed at the last step with an error naming a
# word from the middle of a sentence. Both v0.25.0 and v0.26.0 were uploaded by hand because of it.
$notesFile = Join-Path $env:TEMP "rk-notes-$($ver -replace '[^\w.]', '').md"
# WriteAllText, not Set-Content: PS 5.1's `-Encoding utf8` writes a BYTE ORDER MARK, and GitHub
# renders it as an invisible character at the very start of the release notes.
[System.IO.File]::WriteAllText($notesFile, $notes, (New-Object System.Text.UTF8Encoding $false))
# Nothing to delete on a first upload, so this prints "release not found" and that is fine; the exit
# code is deliberately not checked.
gh release delete $tag --yes --cleanup-tag
gh release create $tag "$niceApk" "$latestApk" --target main --title "RuneKeep $ver (Android)" --notes-file $notesFile
Remove-Item -Force $notesFile -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) {
  Write-Host "gh release step failed (gh not logged in? run: gh auth login). APK is built at the path above." -ForegroundColor Yellow
  exit 2
}

Write-Host "`n===ALL DONE=== APK $mb MB uploaded to release $tag" -ForegroundColor Green
