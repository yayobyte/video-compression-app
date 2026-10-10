# Clippress

Compress videos on your phone. Clippress is an Expo (React Native) app for iOS and Android that re-encodes videos with the phone's own hardware encoder through [`react-native-compressor`](https://github.com/numandev1/react-native-compressor). Nothing is uploaded, and no server is involved.

- **Output:** H.264 `.mp4`, which plays everywhere, including web browsers. iPhone HEVC/HDR sources are converted too.
- **Quality:** High / Balanced / Small. Each preset sets a bitrate from the video's pixel count (0.09 / 0.06 / 0.04 bits per pixel per frame at an assumed 30 fps), never above 80% of the source bitrate.
- **Max resolution:** Original / 1080p / 720p / 480p. It caps the long edge and never upscales.
- **Global default + per-video override:** the home screen sets the profile new imports get, and each card can change its own before converting.
- **On a card:** Cancel, Preview, Share, Save to gallery and Delete original. The library survives app restarts.

## Requirements

- Node 20+ (Node 24 LTS recommended)
- **Android:** Android Studio / SDK, with `ANDROID_HOME` set:
  ```sh
  export ANDROID_HOME=$HOME/Library/Android/sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
  ```
- **iOS:** Xcode + CocoaPods.

## Run

```sh
npm install            # also applies patches/ via patch-package
npx expo run:android   # or: npx expo run:ios
```

The compressor is a native (Nitro) module, so the app needs a dev or Release build. It does not run in Expo Go: the app opens there, but Convert reports that compression is unavailable.

After changing native dependencies or `app.json`, regenerate the native projects with `npx expo prebuild --clean`. `android/` and `ios/` are generated and git-ignored.

`npm run typecheck` runs TypeScript.

## Where compressed videos go

Outputs are saved to the app's `Documents/clippress/` folder as `<name>.compressed.<quality>.<resolution>.mp4`.

- **iOS:** the folder is visible in the Files app under *On My iPhone › Clippress*.
- **Android:** the folder is private to the app. Use **Save to gallery** (a *Clippress* album in Gallery / Photos) or **Share**.

## Samsung Exynos patch

`react-native-compressor@2.0.3` sets `KEY_PRIORITY`/`KEY_OPERATING_RATE` on the Android encoder. Exynos chips (most Galaxy A models) accept them in `configure()` and then fail `start()` with `NO_MEMORY`. `patches/react-native-compressor+2.0.3.patch` removes the two keys, and the version is pinned exactly because the patch is version-specific. Drop the patch once a release includes the upstream fix. See [`VIDEO-COMPRESSION-HANDOFF.md`](./VIDEO-COMPRESSION-HANDOFF.md) for the full investigation.

## Project layout

```
App.tsx, index.ts      entry
src/screens/           HomeScreen
src/components/        UI pieces (ProfilePicker, VideoCard, SegmentedControl, …)
src/hooks/             useAssets (library + conversions), usePersistence, useStorage
src/compressor.ts      react-native-compressor wrapper + bitrate/size math
src/domain.ts          profile model, output names, formatting
src/storage.ts         output folder, storage inspection and cleanup
src/persistence.ts     AsyncStorage library save/restore
src/theme.ts           design tokens (see DESIGN.md)
```

## Docs

- [`DESIGN.md`](./DESIGN.md): design system and tokens.
- [`VIDEO-COMPRESSION-HANDOFF.md`](./VIDEO-COMPRESSION-HANDOFF.md): library choice, API gotchas, the Exynos bug and test recipes.
