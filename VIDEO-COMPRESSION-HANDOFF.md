# Handoff: on-device video compression for React Native / Expo

Self-contained. Copy this file into the target repo (or point Claude at it) and start with the prompt below.
Source of the findings: ServiceFusion mobile app (ticket SF-43005, follow-up SF-43189). Proven on an iPhone and a Samsung Galaxy A56.

## Start prompt

```
Read VIDEO-COMPRESSION-HANDOFF.md. It describes a working on-device video compression approach
(react-native-compressor, H.264) proven in another React Native app, including a library bug on
Samsung Exynos phones and its patch. First read this repo's own CLAUDE.md / conventions, then map
where this app picks and uploads videos, and propose a plan adapted to this repo. Ask me before
adding packages, patching dependencies, or running native builds.
```

## Goal

- Compress videos on the phone before upload: smaller files, faster uploads, and they fit upload size limits.
- Output H.264 `.mp4`. Web browsers can't reliably play HEVC, and iPhone gallery videos are usually HEVC (often 10-bit HDR / Dolby Vision).

## Library decision

- Chosen: `react-native-compressor@2.0.3` (MIT) + `react-native-nitro-modules@0.37.1` (its required peer). Native, autolinked, needs a rebuild.
  - iOS: AVFoundation. Android: MediaCodec/MediaMuxer (behavior depends on each chip maker's encoder driver).
  - H.264 output only. That's fine when web playback matters.
- Rejected:
  - `ffmpeg-kit`: retired January 2025, binaries deleted. Successors are build-it-yourself, ~100 MB, GPL with x265.
  - `@bsky.app/video-compressor` 0.2.0: HEVC + H.264, but one release, public repo not available, and it strips metadata. Its HEVC advantage goes away when H.264 is required.
- The Expo config plugin `react-native-compressor` does nothing (`config => config`). Autolinking is enough.

## API gotchas (verified in source)

- `Video.compress(uri, options, onProgress) → Promise<string path>`. `onProgress` gets 0..1.
- Defaults bite: in JS, `compressionMethod` defaults to `auto` and `maxSize` to 640. Native manual mode defaults to 1920. The README contradicts the code. **Always pass `compressionMethod: "manual"`, `bitrate` and `maxSize`** (the source long edge, to keep resolution).
- `auto` mode only changes how bitrate and size are chosen (WhatsApp-style, 640px). It's the same encoder path.
- `getVideoMetaData(path)` → `{ width, height, size, duration, extension }`. Duration is in **seconds** on both platforms. There's **no frame rate or bitrate**, so derive source bitrate as `size × 8 ÷ duration` and assume 30 fps.
- The output is written to a temp/cache dir and the returned path may lack `file://`. Add it, then **move** the file somewhere persistent if an upload can happen later (offline queue).
- Cancel: `getCancellationId: (id) => ...` in options, then `Video.cancelCompression(id)`.
- Background: `Video.activateBackgroundTask()` before and `deactivateBackgroundTask()` after. iOS stops the hardware encoder when the app is backgrounded.
- **It throws on import when the native code is missing** (Expo Go, an old dev build, Jest): `src/Main.tsx` creates the Nitro object at import time. Guard it:
  - `TurboModuleRegistry.get("NitroModules")` returns null instead of throwing.
  - Then `require("react-native-nitro-modules").NitroModules.hasHybridObject("Compressor")`.
  - Then `require("react-native-compressor")` inline. Not a top-level import, which would crash at app start. Not `await import()` either: Jest without `--experimental-vm-modules` can't run it.

## Android bug on Samsung Exynos (must patch)

- Symptom: `Video.compress` always rejects on Exynos phones (most Galaxy A models, some Galaxy S). Logcat:
  ```
  ExynosVideoEncCodec-H264-Intf: [checkRealTimeResource] real-time(32767 fps) is not supported
  ExynosC2H264EncComponent: [tryGetResource] obtaining real time resource is failed
  MediaCodec: Codec reported err 0xfffffff4/NO_MEMORY, actionCode 0, while in state 5/STARTING
  ```
- Cause:
  - `CompressorUtils.kt:106-107` sets `KEY_PRIORITY = 0` (realtime) + `KEY_OPERATING_RATE = Short.MAX_VALUE` as a speed hint.
  - Exynos accepts them in `configure()`, then refuses them in `start()`.
  - The library's fallback (`Compressor.kt:697-712`) only covers `configure()` failures.
  - No JS option controls these keys.
- Why iOS is unaffected: AVFoundation has no such setting.
- Fix: delete the two keys. A 94 MB, 43.6 s 1080p video then compresses to 32 MB on the Galaxy A56.
- Apply it as a dependency patch:
  - **Yarn Berry:** `yarn patch react-native-compressor@npm:2.0.3`, edit the printed folder, then `yarn patch-commit -s <folder>`. This writes `.yarn/patches/...` and a `resolutions` entry. Check `.gitignore`: a bare `.yarn` line ignores the folder, and `!.yarn/patches` can't re-include it. Use `.yarn/*` + `!.yarn/patches`.
  - **npm:** `patch-package` dev dependency + `"postinstall": "patch-package"`. Edit `node_modules/...`, then `npx patch-package react-native-compressor`. Pin the version exactly (`"2.0.3"`), because the patch is version-specific.
- Upstream: an issue and PR to `numandev1/react-native-compressor` are being prepared. Check whether a fixed release exists before patching.

Patch (Yarn format; same hunk for patch-package):

```diff
diff --git a/android/src/main/java/com/reactnativecompressor/Video/VideoCompressor/utils/CompressorUtils.kt b/android/src/main/java/com/reactnativecompressor/Video/VideoCompressor/utils/CompressorUtils.kt
index b24b9cbbcfc09161089b764b1f05fcdd4e313aa0..35dcd627741f77eabb6517a644257b783e05446e 100644
--- a/android/src/main/java/com/reactnativecompressor/Video/VideoCompressor/utils/CompressorUtils.kt
+++ b/android/src/main/java/com/reactnativecompressor/Video/VideoCompressor/utils/CompressorUtils.kt
@@ -99,13 +99,11 @@ object CompressorUtils {
           MediaFormat.KEY_BITRATE_MODE,
           MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR
         )
-        // Hint the hardware codec to run as fast as it can (not throttled to
-        // realtime playback) and at the highest scheduling priority. These keys
-        // unlock full throughput on Qualcomm / Exynos / MTK SoCs that accept them.
-        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
-          setInteger(MediaFormat.KEY_PRIORITY, 0)
-          setInteger(MediaFormat.KEY_OPERATING_RATE, Short.MAX_VALUE.toInt())
-        }
+        // KEY_PRIORITY = 0 (realtime) with KEY_OPERATING_RATE = Short.MAX_VALUE is not set.
+        // Exynos encoders (c2.exynos.h264.encoder) accept it in configure() and then fail
+        // start() with NO_MEMORY ("real-time(32767 fps) is not supported"), which the
+        // configure() fallback in prepareEncoder does not catch. Offline transcoding runs
+        // as fast as the codec allows without a realtime priority.
       }
 
       getColorStandard(inputFormat)?.let {
```

## Bitrate and size rules (tested)

- Bitrate = `width × height × 30 × 0.09` bits per pixel (1080p30 ≈ 5.6 Mbps), at least 1 Mbps, at most 80% of the source bitrate (or the file grows).
- With an upload limit: cap the bitrate at `limit × 8 × 0.9 ÷ duration − 256 kbps` (Android audio is about 256 kbps AAC). Shrink the long edge by `√(cap ÷ pixel bitrate)`, so bits per pixel stay the same, with 640px as the minimum.
- Example for a 15 MB limit: a 43.6 s 1080p clip comes out at 2.34 Mbps and 1242px, about 13.5 MB. Up to about 45 s fits at 720p.
- Skip compression above a hard ceiling (250 MB in ServiceFusion) and let the size check reject the file.
- Run the size check **after** compression, so large originals can pass.

## Results

| Device | Source | Output |
|---|---|---|
| iPhone, iOS 27 | 31.8 MB HEVC Main 10, Dolby Vision 8.4, 1080p portrait, 18.8 s | 13.4 MB H.264 High 8-bit, 1080×1920, 5.6 Mbps. Rotation baked in, AAC 44.1 kHz stereo (spatial audio + metadata tracks dropped) |
| Galaxy A56, patched | 94.1 MB H.264, 1080×1920, 43.6 s | 32.0 MB H.264 High, 5.6 Mbps |

- Quality (iPhone): SSIM 0.968–0.990 and PSNR 38–42 dB against the original at 3 / 9 / 15 s. Brightness within 0.5/255.
- HDR: the output keeps BT.2020/HLG tags on 8-bit video. It rendered correctly, but check one bright daytime clip in a browser.

## Integration design (from ServiceFusion; adapt to the target repo)

- Hook at pick time: the gallery and file-picker conversion step, next to image compression. Not at upload time, because a queued offline upload reads the file later.
- Skip camera recordings if they're already low-resolution H.264 (ServiceFusion records 720p `avc1`).
- Progress text "Compressing video n of m... x%" through the screen's existing processing overlay.
- Any failure or missing module returns `null`, and the original uploads (the old behavior).
- Output goes to `Documents/<app>/compressed-videos/<timestamp>-<name>.mp4`. Delete it after a successful (not queued) upload, and when the size check rejects it.
- Pass each screen's upload limit into compression (in ServiceFusion: Jobs 15 MB, Customer documents 50 MB).
- Check **server** upload limits before raising any app limit. In ServiceFusion the 15 MB was the server's (`Document::MAX_FILE_SIZE`). Raising only the app limit made uploads stick in the offline queue.

### Reference implementation (JS, ServiceFusion conventions)

`utils/VideoUtilities.js`:

```js
import { Directory, File, Paths } from "expo-file-system";
import { TurboModuleRegistry } from "react-native";
import { fileSettings, localFilePaths } from "./Constants";
import { captureError } from "./errorCapture";

const helpers = {
  // react-native-compressor is a Nitro module and throws on import in Expo Go.
  // TurboModuleRegistry.get returns null there instead of throwing, so check it before the inline require.
  isCompressorAvailable: () => {
    const nitroModule = TurboModuleRegistry.get("NitroModules");
    let isAvailable = false;

    if (nitroModule) {
      try {
        const { NitroModules } = require("react-native-nitro-modules");

        isAvailable = NitroModules.hasHybridObject("Compressor");
      } catch {
        isAvailable = false;
      }
    }

    return isAvailable;
  },
  // The compressor writes to a temp folder. A queued offline upload reads the file later, so it moves to Documents.
  moveToCompressedVideosDirectory: (outputPath, fileName) => {
    const outputUri = outputPath.startsWith("file://") ? outputPath : `file://${outputPath}`;
    const outputFile = new File(outputUri);
    const directory = new Directory(Paths.document, localFilePaths.serviceFusionCompressedVideos);
    const uniqueFileName = `${Date.now()}-${fileName}`;
    const destinationFile = new File(directory, uniqueFileName);

    if (!directory.exists) {
      directory.create({ intermediates: true });
    }

    outputFile.move(destinationFile);

    return destinationFile;
  },
};

const videoUtilities = {
  // Returns the compressed file, or null when compression is unavailable (Expo Go) or fails, so the original uploads.
  compressVideo: async ({ uri, fileName, maximumFileSize, onProgress }) => {
    const isAvailable = helpers.isCompressorAvailable();
    let compressedVideo = null;

    if (isAvailable) {
      try {
        const { Video, getVideoMetaData } = require("react-native-compressor");
        const metadata = await getVideoMetaData(uri);
        const { bitrate, maxSize } = videoUtilities.getCompressionSettings(metadata, maximumFileSize);
        const handleProgress = (fraction) => onProgress?.(Math.round(fraction * 100));

        // iOS stops the hardware encoder when the app goes to the background. The background task asks for extra time.
        await Video.activateBackgroundTask();

        try {
          // maxSize is always passed because the default downscales to 1920px.
          const outputPath = await Video.compress(uri, { bitrate, compressionMethod: "manual", maxSize }, handleProgress);
          const destinationFile = helpers.moveToCompressedVideosDirectory(outputPath, fileName);

          compressedVideo = { uri: destinationFile.uri, size: destinationFile.size };
        } finally {
          await Video.deactivateBackgroundTask();
        }
      } catch (error) {
        captureError(error, { error_type: "Error compressing video:" });
      }
    }

    return compressedVideo;
  },
  // The H.264 encoder takes a bitrate, not a quality level. 0.09 bits per pixel per frame keeps 1080p30 near 5.6 Mbps.
  // Metadata has no frame rate, so 30 is assumed. Never aim above 80% of the source, or the output grows.
  // When the output must fit maximumFileSize, the bitrate is capped to that budget (90% of it, less up to 256 kbps of
  // audio) and the long edge shrinks with the square root of the cut, so the bits per pixel stay the same. 640px is the floor.
  getCompressionSettings: ({ width = 0, height = 0, size = 0, duration = 0 }, maximumFileSize) => {
    const bitsPerPixel = 0.09;
    const assumedFrameRate = 30;
    const minimumBitrate = 1000000;
    const maximumSourceShare = 0.8;
    const fileSizeShare = 0.9;
    const audioBitrate = 256000;
    const minimumLongEdge = 640;
    const sourceLongEdge = Math.max(width, height);
    const pixelBitrate = width * height * assumedFrameRate * bitsPerPixel;
    const sourceBitrate = duration > 0 ? (size * 8) / duration : 0;
    const ceilingBitrate = sourceBitrate ? sourceBitrate * maximumSourceShare : pixelBitrate;
    const hasSizeBudget = Boolean(maximumFileSize) && duration > 0;
    const budgetBitrate = hasSizeBudget ? (maximumFileSize * 8 * fileSizeShare) / duration - audioBitrate : Infinity;
    const isOverBudget = budgetBitrate < pixelBitrate;
    const scale = isOverBudget ? Math.sqrt(Math.max(budgetBitrate, 0) / pixelBitrate) : 1;
    const scaledLongEdge = Math.round((sourceLongEdge * scale) / 2) * 2;
    const maxSize = Math.min(sourceLongEdge, Math.max(minimumLongEdge, scaledLongEdge));
    const cappedBitrate = Math.min(pixelBitrate, ceilingBitrate, budgetBitrate);
    const floorBitrate = Math.min(minimumBitrate, Math.max(budgetBitrate, 0));
    const bitrate = Math.round(Math.max(floorBitrate, cappedBitrate));
    const compressionSettings = { bitrate, maxSize };

    return compressionSettings;
  },
  isCompressedVideoUri: (uri = "") => {
    const isCompressedVideo = uri.includes(localFilePaths.serviceFusionCompressedVideos);

    return isCompressedVideo;
  },
  deleteCompressedVideo: (uri) => {
    const isCompressedVideo = videoUtilities.isCompressedVideoUri(uri);

    if (isCompressedVideo) {
      try {
        const fileUri = uri.startsWith("file://") ? uri : `file://${uri}`;
        const compressedFile = new File(fileUri);

        if (compressedFile.exists) {
          compressedFile.delete();
        }
      } catch (error) {
        captureError(error, { error_type: "Error deleting compressed video:" });
      }
    }
  },
  isWithinCompressibleSize: (size) => {
    const isWithinSize = !size || size <= fileSettings.maxVideoSize;

    return isWithinSize;
  },
};

export { videoUtilities };
```

Caller in `utils/FileUtilities.js` (runs from `convertPickedAssets`, before the size check):

```js
  convertVideoAssetsToCompressedMp4: async (assets = [], { maximumFileSize, onCompressProgress } = {}) => {
    const renamedAssets = fileUtilities.convertVideoAssetsToMp4(assets);
    const videoCount = renamedAssets.length;
    const convertedAssets = [];

    for (const [index, asset] of renamedAssets.entries()) {
      const videoNumber = index + 1;
      const size = asset.size || asset.fileSize;
      const isWithinCompressibleSize = videoUtilities.isWithinCompressibleSize(size);
      const fileName = helpers.getAssetFileName(asset);
      const { fileNameWithoutExtension } = helpers.parseFileNameExtension(fileName);
      const compressedFileName = `${fileNameWithoutExtension}.mp4`;
      const handleProgress = (percent) =>
        onCompressProgress?.(messages.compressingVideo.format(videoNumber, videoCount, percent));
      const compressedVideo = isWithinCompressibleSize
        ? await videoUtilities.compressVideo({
            uri: asset.uri,
            fileName: compressedFileName,
            maximumFileSize,
            onProgress: handleProgress,
          })
        : null;
      const compressedAsset = {
        ...asset,
        fileName: compressedFileName,
        fileSize: compressedVideo?.size,
        mimeType: "video/mp4",
        name: compressedFileName,
        size: compressedVideo?.size,
        uri: compressedVideo?.uri,
      };
      const convertedAsset = compressedVideo ? compressedAsset : asset;

      convertedAssets.push(convertedAsset);
    }

    return convertedAssets;
  },
```

Jest: mock `react-native` (`TurboModuleRegistry.get`), `react-native-nitro-modules`, `react-native-compressor`, `expo-file-system` (`File`, `Directory`, `Paths`) and the app's constants module. Test the settings math, the Expo Go fallback, a compression failure, and the delete guard.

## Testing and debugging recipes

- Probe a file: `ffprobe -v error -show_entries format=duration,size,bit_rate:stream=codec_name,profile,width,height,r_frame_rate,bit_rate,pix_fmt,color_transfer -of compact <file>`
- Compare colors the way Safari shows them: grab frames with AVFoundation (`AVAssetImageGenerator`, `appliesPreferredTrackTransform = true`, a small Swift script), then `ffmpeg -i a.png -i b.png -lavfi ssim|psnr -f null -`. Homebrew ffmpeg may lack `zscale`, so it can't tone-map HDR itself.
- Android logs: `adb logcat -d | grep -E "Compressor|MediaCodec|Exynos|ReactNativeJS"`. The `encoder selected: <name>` line shows the codec.
- Pull app files on Android (debug build): `adb exec-out run-as <package> cat files/<path> > out.mp4`.
- Reinstall a debug APK over an older one: `adb install -r -d app-debug.apk` (debug over debug only; a newer release build must be uninstalled first). Then `adb reverse tcp:8081 tcp:8081`.
- iOS link error `_OBJC_CLASS_$_RCTPackagerConnection` from `libexpo-dev-launcher.a` after adding pods: delete DerivedData, `ios/Pods`, `ios/build`, run `pod install` again, and build Debug.

## Still unverified

- Fit-to-limit on a device.
- Offline queue then later upload.
- iOS backgrounding mid-compression.
- Qualcomm Android phones, without the speed hint.
- 4K sources (about 22 Mbps target).
