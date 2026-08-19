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
#
# -PublishOnly skips the build and uploads the APK already on disk (v0.42.3, owner).
#
# This exists because of how v0.42.2 shipped. A full build takes long enough that it has to be run in
# the foreground, so the release was published afterwards with a hand-written `gh release create` --
# which uploaded the versioned asset and not the stable-named one. The site's Android button points
# at /releases/latest/download/RuneKeep-android.apk, so it 404'd for everybody until it was noticed.
#
# There is now no reason to ever type `gh release create` by hand: build with -NoRelease, then run
# this script again with -PublishOnly. Both assets go up, and the check below refuses to publish if
# either is missing.
param([switch]$NoRelease, [switch]$PublishOnly)

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

# 7-Zip (fast extract), else bsdtar, else Expand-Archive.
$sevenZip = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
# v0.43.0: `tar` sits between them, and it matters. Expand-Archive takes MINUTES on the 600 MB NDK
# zip, so the fallback path on a machine without 7-Zip read as a hang rather than as a slow install.
# bsdtar has shipped in system32 since Windows 10 and handles zip, so there is now no machine where
# this step is slow.
$bsdTar = (Get-Command tar.exe -ErrorAction SilentlyContinue).Source

function Expand-Zip($zip, $dest) {
  New-Item -ItemType Directory -Force $dest | Out-Null
  if ($sevenZip)   { & $sevenZip x $zip "-o$dest" -y | Out-Null; return }
  if ($bsdTar)     { & $bsdTar -xf $zip -C $dest; return }
  Expand-Archive -Path $zip -DestinationPath $dest -Force
}

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
  Expand-Zip $zip $tmp
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
Write-Host "Unzip: $(if ($sevenZip) { $sevenZip } elseif ($bsdTar) { $bsdTar } else { 'Expand-Archive (slow)' })"

Section "JDK"
# Gradle needs a JDK, and finds it through JAVA_HOME rather than through PATH. A machine with only a
# JRE answers `java -version` and then fails the build 39 seconds in with "No Java compiler found",
# which is why this resolves javac explicitly and says so up front instead.
#
# Order: an already-correct JAVA_HOME, then whatever javac is on PATH, then the copy
# bootstrap-sdk.ps1 unpacks. First one with a real compiler in it wins.
# Built step by step rather than as one array literal: `Split-Path $null` is an ERROR in PS 5.1, so
# on a machine with no javac on PATH the whole expression blew up and this found nothing at all --
# including the JDK the bootstrap had just unpacked, which is the one case it exists for.
$jdkCandidates = New-Object System.Collections.ArrayList
if ($env:JAVA_HOME) { [void]$jdkCandidates.Add($env:JAVA_HOME) }
$javacCmd = Get-Command javac -ErrorAction SilentlyContinue
if ($javacCmd) { [void]$jdkCandidates.Add((Split-Path (Split-Path $javacCmd.Source -Parent) -Parent)) }
[void]$jdkCandidates.Add((Join-Path $env:LOCALAPPDATA 'RuneKeep\jdk-21'))
$jdk = $jdkCandidates | Where-Object { Test-Path (Join-Path $_ 'bin\javac.exe') } | Select-Object -First 1
if (-not $jdk) { Fail "no JDK found (a JRE is not enough) - run: powershell -ExecutionPolicy Bypass -File apk-build/bootstrap-sdk.ps1" }
$env:JAVA_HOME = $jdk
$env:PATH = (Join-Path $jdk 'bin') + ';' + $env:PATH
Write-Host "JDK  : $jdk" -ForegroundColor Green
& (Join-Path $jdk 'bin\javac.exe') -version

Section "bash"
# react-native-audio-api's `downloadPrebuiltBinaries` task SHELLS OUT TO BASH, and Gradle inherits
# this process's PATH. With no bash on it the task dies as "A problem occurred starting process
# 'command 'bash''" nine minutes into the build, which names neither bash nor the module that wanted
# it in any useful way.
#
# Git for Windows ships one, and `Git\bin\bash.exe` is the wrapper that sets up a real MSYS
# environment (so the script it runs can find `unzip`, which is the other thing this task needs).
# Only `Git\bin` goes on the PATH, never `Git\usr\bin`: that one carries find.exe and sort.exe, which
# would shadow the Windows tools of the same name for every child process of this build.
if (-not (Get-Command bash -ErrorAction SilentlyContinue)) {
  $gitBin = @("$env:ProgramFiles\Git\bin", "${env:ProgramFiles(x86)}\Git\bin", "$env:LOCALAPPDATA\Programs\Git\bin") |
    Where-Object { Test-Path (Join-Path $_ 'bash.exe') } | Select-Object -First 1
  if (-not $gitBin) { Fail "no bash found - install Git for Windows (react-native-audio-api's build shells out to it)" }
  $env:PATH = $gitBin + ';' + $env:PATH
  Write-Host "bash : $(Join-Path $gitBin 'bash.exe')" -ForegroundColor Green
} else {
  Write-Host "bash : $((Get-Command bash).Source)" -ForegroundColor Green
}

Section "Clean sdkmanager staging"
foreach ($p in @((Join-Path $sdk '.temp'), (Join-Path $sdk '.downloadIntermediates'))) {
  if (Test-Path $p) { Write-Host "  removing $p"; Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue }
}

Section "SDK components (direct download; cmake + licenses already present)"
Install-SdkZip "platform-tools"       "$base/platform-tools-latest-windows.zip" (Join-Path $sdk 'platform-tools')        'source.properties'
Install-SdkZip "build-tools;35.0.0"   "$base/build-tools_r35_windows.zip"       (Join-Path $sdk 'build-tools\35.0.0')    'source.properties'
Install-SdkZip "platforms;android-35" "$base/platform-35_r02.zip"               (Join-Path $sdk 'platforms\android-35')  'android.jar'
Install-SdkZip "ndk;27.1.12297006"    "$base/android-ndk-r27b-windows.zip"      (Join-Path $sdk 'ndk\27.1.12297006')     'source.properties'
if (-not (Test-Path (Join-Path $sdk 'cmake\3.22.1\bin\cmake.exe'))) { Fail "cmake;3.22.1 missing - run: powershell -ExecutionPolicy Bypass -File apk-build/bootstrap-sdk.ps1" }
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
    Expand-Zip $nz $nx
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
    Expand-Zip $az $extDir
    Remove-Item -Recurse -Force (Join-Path $extDir '__MACOSX') -ErrorAction SilentlyContinue
    Remove-Item -Force $az -ErrorAction SilentlyContinue
    if (Test-Path $extAndroid) { Write-Host "  prebuilt libs -> $extAndroid" -ForegroundColor Green } else { Fail "audio-api prebuilt android libs missing after extract" }
  } else { Write-Host "  audio-api prebuilt libs present." -ForegroundColor Green }
}

if ($PublishOnly) { Section "Publish only: skipping the build, using the APK on disk" }
if (-not $PublishOnly) {
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
}

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
Write-Host "LATEST: $latestApk" -ForegroundColor Green

if ($NoRelease) {
  Write-Host "`n===ALL DONE=== APK $mb MB at $niceApk (not published: -NoRelease)" -ForegroundColor Green
  exit 0
}

Section "Upload GitHub release"
Set-Location $repo
$tag = $ver
# Both assets, or nothing (v0.42.3). The stable-named one is what the website's Android button
# resolves to, so a release without it is a release that breaks updating for everyone who has the
# app. It is not optional and it is not a nice-to-have; publishing stops here if it is missing.
if (-not (Test-Path $niceApk))   { Fail "versioned asset missing: $niceApk" }
if (-not (Test-Path $latestApk)) { Fail "stable-named asset missing: $latestApk - /releases/latest/download/RuneKeep-android.apk would 404" }
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

# Read the release back and prove BOTH assets are on it. The upload can partly succeed (a dropped
# connection on the second 90 MB file looks like success from here), and the whole point of this
# section is that nobody finds out from a player.
$assets = (gh release view $tag --json assets --jq '.assets[].name') -join ' '
if ($assets -notmatch 'RuneKeep-android\.apk') { Fail "published $tag WITHOUT RuneKeep-android.apk - run again with -PublishOnly" }
Write-Host "ASSETS: $assets" -ForegroundColor Green

Write-Host "`n===ALL DONE=== APK $mb MB uploaded to release $tag" -ForegroundColor Green
