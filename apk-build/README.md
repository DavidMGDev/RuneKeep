# apk-build

Builds a small **offline Android APK** (arm64-v8a) and publishes it as a GitHub release. All card data is
bundled — no server, no database, no launch-time download.

## Run

From the repo root:

```bash
powershell -ExecutionPolicy Bypass -File apk-build/bootstrap-sdk.ps1   # first time on a machine
npm run prebuild:android      # first time only — generates the native android/ project
git checkout -- package.json  # revert expo-prebuild's package.json flip
npm run build:apk             # == powershell -File apk-build/build-apk.ps1
```

`bootstrap-sdk.ps1` installs the four things `build-apk.ps1` assumes are already there and cannot
install itself: a **JDK** (a JRE is not enough — Gradle needs `javac`), **cmdline-tools**,
**cmake;3.22.1**, and the accepted **licences**. It needs no admin, touches nothing outside
`%LOCALAPPDATA%`, and is a no-op on a machine that already has them.

The script is idempotent: first run is ~15-25 min (Gradle + native C++ compile), re-runs are fast.

## What `build-apk.ps1` does

1. Points `ANDROID_HOME`/`ANDROID_SDK_ROOT` at the local SDK and cleans `sdkmanager` staging dirs.
2. Installs the SDK components (`platform-tools`, `build-tools;35.0.0`, `platforms;android-35`,
   `ndk;27.1.12297006`) by **direct download + 7-Zip extract** — `sdkmanager`'s own downloader stalls on
   this machine. `cmake;3.22.1` must already be present.
3. Self-heals the `react-native-audio-api` native build: installs long-path-aware **ninja 1.12.1** and
   pre-extracts the prebuilt opus/vorbis static libs (its gradle task needs `unzip`, absent in WSL here).
4. Runs `gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` (minify + resource-shrink on,
   debug-signed so it sideloads).
5. Renames the APK to `Runekeep <ver>.apk` and uploads it via `gh release create <ver>`.

## What publishing a release also does (v0.43.0)

`gh release create` fires `.github/workflows/production.yml`, which moves the **`production`** branch
to the commit that release's tag points at. Cloudflare Pages watches that branch and rebuilds the web
build from it, so the site and the APK are always the same version of the app and there is nothing to
deploy by hand. See `docs/web-deploy.md`.

Publishing with `-NoRelease` therefore does NOT update the site, which is the point of that flag.

## Bumping the release version

Edit `$ver` at the top of `build-apk.ps1` (drives the tag, the APK filename, and the release title), bump
`expo.version` in `app.json`, and rewrite the `$notes` prose for the release. Requires `gh auth login`.

## Notes

- JDK 21 and the Android SDK live under `%LOCALAPPDATA%` (`RuneKeep\jdk-21` and `Android\Sdk`); the
  bootstrap puts them there. `build-apk.ps1` sets `JAVA_HOME` itself, so the machine's own `java`
  never has to be the right one.
- The generated `android/` project is gitignored; only this `apk-build/` folder is committed.
