# RuneKeep -> Android APK builder (#173)
# Run from a normal PowerShell window (no admin needed):
#   powershell -ExecutionPolicy Bypass -File "D:\Tools\Homebrew\Daggerheart\RuneKeep\apk-build\build-apk.ps1"
#
# Produces a small arm64-v8a release APK (offline, all card data bundled) from the asset-optimized
# `apk-optimize` branch, then uploads it as a GitHub release.
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

Section "Upload GitHub release"
Set-Location $repo
$tag = 'v1.1.2-android'
$notes = "RuneKeep v1.1.2 - card-driven character sheet (UX polish 2). Offline Android APK (arm64-v8a, $mb MB), all card data bundled, no download needed.`n`nEquip/enable any card by pressing and holding it in the carousel; weapons, armor, ancestry, subclass, domain, loot, and your own custom cards apply their stat modifiers automatically (HP, Stress, Armor, Evasion, traits, Proficiency, damage thresholds), tier-aware. Focused card's Modifiers button shows what it applies; the float-menu Modifiers panel shows every base stat + what each equipped card layers on. Add tier 1-4 gear + loot from the catalog in New Card.`n`nThis build: deck-switch indicator glides in + 40% normal over-scroll + 0.4s hold; equip scan fades in; smaller equipped-corner check; experiences now have long auto-fitting titles + a visible bonus and their own editor; level-up rebuilt with a real full-screen card carousel (and the sheet carousel unloads while it's open); all float-menu panels animate in.`n`nSideload: enable Install unknown apps, then open the APK."
gh release delete $tag --yes --cleanup-tag 2>$null
gh release create $tag "$($apk.FullName)" --target main --title "RuneKeep v1.1.2 (Android)" --notes $notes
if ($LASTEXITCODE -ne 0) {
  Write-Host "gh release step failed (gh not logged in? run: gh auth login). APK is built at the path above." -ForegroundColor Yellow
  exit 2
}

Write-Host "`n===ALL DONE=== APK $mb MB uploaded to release $tag" -ForegroundColor Green
