# RuneKeep -> Android APK builder
# Run from a normal PowerShell window (no admin needed):
#   powershell -ExecutionPolicy Bypass -File "D:\Tools\Homebrew\Daggerheart\RuneKeep\apk-build\build-apk.ps1"
#
# Produces a small arm64-v8a release APK (offline, all card data bundled) from `main`, renames it to
# "Runekeep <version>.apk", and uploads it as a GitHub release. Versioning restarts at v0.2 (#220).
#
# sdkmanager's downloader STALLS on this machine, so every SDK component is fetched by DIRECT
# download (curl) + 7-Zip extract instead. cmake + licenses are already in place.
#
# PS 5.1-safe: ErrorActionPreference = Continue, no 2>&1 on native commands, explicit exit checks.
# Tell Claude when it prints  ===ALL DONE===  (with the size), or paste any line containing FAILED.

$ErrorActionPreference = 'Continue'
$repo = 'D:\Tools\Homebrew\Daggerheart\RuneKeep'
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

Section "Build release APK (arm64-v8a). First run downloads Gradle + compiles native (~10-20 min)."
Set-Location (Join-Path $repo 'android')
& .\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a" --console=plain
if ($LASTEXITCODE -ne 0) { Fail "gradle build (exit $LASTEXITCODE) - paste the red error lines to Claude" }

Section "Locate APK"
$apk = Get-ChildItem (Join-Path $repo 'android\app\build\outputs\apk\release') -Filter *.apk -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $apk) { Fail "no APK produced" }
$mb = [math]::Round($apk.Length / 1MB, 1)
Write-Host "APK : $($apk.FullName)"
Write-Host "SIZE: $mb MB" -ForegroundColor Green

Section "Rename APK to a friendly asset name"
# The release asset (and the file the player downloads) is named "Runekeep v0.2.6.apk".
$niceApk = Join-Path (Split-Path $apk.FullName -Parent) 'Runekeep v0.2.6.apk'
Copy-Item -Force $apk.FullName $niceApk
Write-Host "ASSET: $niceApk" -ForegroundColor Green

Section "Upload GitHub release"
Set-Location $repo
$tag = 'v0.2.6'
$notes = "RuneKeep v0.2.6 - token fixes + Card Management. Offline Android APK (arm64-v8a, $mb MB), all card data bundled, no download needed.`n`nTokens: holding a placed token now removes it with a grow-and-drop animation instead of crashing, and tapping a placed token (drawer open) copies its colour without crashing. Tokens look like the same bevelled buttons whether a card is far away in the deck or full-screen, the drawer and the Modifiers button fade in instead of popping, and the three default tokens are subtly different sizes.`n`nCard Management: the float menu's Cards panel is now a full manager. CATEGORIES tab - turn categories on/off, reorder them, tap one to switch the carousel to it, and create your own custom categories with a name and an icon (delete custom ones, built-ins are protected). CARDS tab - an image gallery of every card grouped by category; move any card into a different category, delete a card (with confirmation), and add a new card straight into a category. You can also manage custom card 'types' (the middle ribbon), chosen from a picker of built-in + your own types. Custom categories work with over-scroll just like the built-in ones.`n`nSideload: enable Install unknown apps, then open the APK."
gh release delete $tag --yes --cleanup-tag 2>$null
gh release create $tag "$niceApk" --target main --title "RuneKeep v0.2.6 (Android)" --notes $notes
if ($LASTEXITCODE -ne 0) {
  Write-Host "gh release step failed (gh not logged in? run: gh auth login). APK is built at the path above." -ForegroundColor Yellow
  exit 2
}

Write-Host "`n===ALL DONE=== APK $mb MB uploaded to release $tag" -ForegroundColor Green
