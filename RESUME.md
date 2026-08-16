# Session Resume — Video Compression Platform (web WASM + server + iOS app)

> Status: **Working end-to-end.** Web app compresses locally in Chrome (WASM H.265, progress bar, reload-safe); mobile app (Expo SDK 54) converts through the local Node/ffmpeg server with live upload/compress %, per-card preview, compression-ratio readout, and skip-already-converted detection. Standalone iOS build path exists (Xcode project generated).
> Web gotchas fixed: true-4K is blocked up-front (honest limit), `+faststart` removed (was "stuck at 1%"), outputs validated so OOM can never report false success.
> Server (`server/`) logs every step so you can watch it work.

## Purpose

Resume notes for the "stuck at 1%" investigation and everything that grew from it (mobile app + compression service + standalone iOS build). Captures root causes, every change, verification results, and how to resume.

## Background

- Local-first video compression: a **web app** (React + TS + Vite, `ffmpeg.wasm` in-browser, no uploads) and a **mobile app** (Expo SDK 54 for the user's iPhone Expo Go) whose conversions run by uploading to a local **Node/ffmpeg server** (`server/`) on the host Mac.
- Default profile is **H.265 / CRF 25** everywhere. `shared/domain.ts` holds the codec/CRF types, `PROFILES`, `outputNameFor`, `formatBytes` (shared by web + mobile).
- Real user content: DJI 4K 10-bit HEVC clips (~300–600 MB each, now gitignored), plus phone videos (e.g. 1.5 GB 1080×2288).

## Timeline & Root Cause

1. **Reported bug** — every convert stuck at 1%, never progressed.
2. **Reproduction** (Playwright + dev server, test clips derived from a DJI file).
   - `libx264` (H.264): completes fine.
   - `libx265` (H.265): hangs right after `x265 [info]` encoder init — no frames ever, no error, no progress events. Reproduced for both 8-bit and 10-bit inputs.
3. **Root cause** — known ffmpeg.wasm bug (github.com/ffmpegwasm/ffmpeg.wasm#898 and others): **`libx265` silently hangs in the single-threaded `@ffmpeg/core` build** (the installed `@ffmpeg/core@0.12.10` is a 32-bit, no-asm, single-thread build). Verified the identical CLI command works natively in 0.45s.
4. **Fix chosen** — switch to the multi-threaded core `@ffmpeg/core-mt@0.12.6` (its x265 works). Requires cross-origin isolation for `SharedArrayBuffer`.
5. **Follow-up bug** — "Could not load the local FFmpeg engine: undefined". Cause: when the page is not cross-origin isolated, `ffmpeg.load()` rejects; the worker posts the error as a *string*, so `error.message` → `undefined`. Real error was `ReferenceError: SharedArrayBuffer is not defined`.

## Changes Made

### `package.json`
- Removed `@ffmpeg/core`.
- Added `@ffmpeg/core-mt@^0.12.6`. Kept `@ffmpeg/ffmpeg@^0.12.15`, `@ffmpeg/util@^0.12.2`.

### `vite.config.ts`
- `optimizeDeps.exclude` still excludes `@ffmpeg/ffmpeg`, `@ffmpeg/util`.
- Added COOP/COEP headers to enable cross-origin isolation (needed for core-mt):
  - `server.headers` (dev)
  - `preview.headers` (production preview)
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- NOTE: any production static host must serve these two headers too (nginx/S3/netlify/etc.), otherwise H.265 fails at load.

### `public/ffmpeg-core.worker.js`
- Copy of `node_modules/@ffmpeg/core-mt/dist/esm/ffmpeg-core.worker.js` (pthread worker). Needed because `@ffmpeg/core-mt` does not export `./worker` from its `exports` map, and an alias for it did not intercept Vite's `?url` handling. JS files in `public/` are referenced as plain URL strings, not imports.

### `src/App.tsx`
- Imports core from `@ffmpeg/core-mt`:
  - `coreURL` from `@ffmpeg/core-mt?url`
  - `wasmURL` from `@ffmpeg/core-mt/wasm?url`
  - `const coreWorkerURL = '/ffmpeg-core.worker.js'`
- `ffmpeg.load({ coreURL, wasmURL, workerURL: coreWorkerURL, classWorkerURL })`.
- Added a thread cap to avoid the known Chromium ffmpeg-wasm hang (worker-pool ceiling):
  - `-threads <min(4, hardwareConcurrency)>` before `-i` (input decoder) and again near the output (x265 encoder).
- Capability precheck in `ensureEngine`: if `typeof SharedArrayBuffer === 'undefined' || !crossOriginIsolated`, fail fast with a clear message instead of the cryptic "undefined".
- Load catch now surfaces the real error via `String(error)`.

### Memory ceiling — 4K OOM in the MT core (this session's follow-up bug)
- Even on `@ffmpeg/core-mt`, real DJI 4K 10-bit input OOMs: `Aborted(OOM)` after ~6–12 frames, and the app used to swallow it → marked "completed" with a 44-byte stub file.
- Verified the ceiling is between 1920×1080 (works) and 4K (OOM). Reduced x265 params (`pools=1:frame-threads=1:rc-lookahead=6:ref=1:bframes=2:wpp=0`) and `-vf scale=1920:-2` did NOT save 4K — memory-bound.
- H.264 (libx264) survives; only true-4K x265 is out of reach in the browser engine.

### Guard + validation
- `MAX_ENCODE_PIXELS = 1080 * 2400` (2,592,000) — pre-flight, before the engine loads: if the source exceeds it, fail instantly with *"This video is W × H, which is too large for the in-browser encoder — it runs out of memory above 2,592,000 pixels (about 1080 × 2400)…"*. Uses `width`/`height` captured in `inspectVideo` (via `onloadedmetadata`; new `VideoAsset.width`/`height` fields). Raised from `1920*1080` after a headless-Chrome verification that a 1080×2288 (2,471,040 px) H.265 clip encodes to completion (~92 KB, no OOM; fixture `public/portrait2288.MP4`). True-4K (8.3M px) is still far above the cap and stays blocked.
- Post-exec verification: `isCompleteMp4(data)` requires a non-empty file that starts with an `ftyp` atom and contains a `moov` atom (ffmpeg writes `moov` last, so an OOM-truncated file lacks it). On failure: delete MEMFS files, throw a clear error → status `failed`.
- Catch block now displays `error instanceof Error ? error.message : String(error)` so worker-string rejections aren't hidden as "Conversion failed.".
- NOTE: `ffmpeg.ffprobe` on `@ffmpeg/ffmpeg@0.12.15` threw "ffmpeg.ffprobe is not a function" at runtime in the app even though the served ESM class defines it — abandoned ffprobe in favor of the structural check above.

## Verification (all done in this session)

- Headless Chromium on `http://localhost:5173/` with headers: `crossOriginIsolated === true`; 10-bit HEVC sample → H.265 convert → **completed, ✓ 87 KB compressed**.
- 1920×1080 clip → H.265 → **completed, ✓ 85 KB compressed** (~1.2s encode).
- 4K repro (guard enabled) → **failed instantly** with the "too large" message, 0 completed, no encode attempt.
- 4K repro (guard temporarily lifted to test the safety net) → OOM mid-encode → **failed** with "The encoder ran out of memory and stopped before finishing…" — NOT "completed" with a 44-byte stub. Guard since restored.
- Same page WITHOUT headers: friendly error shown ("This browser can't run the local encoder… cross-origin isolation…"), replacing the old "undefined".
- `npm run build` (tsc -b && vite build) passes; oxlint clean.
- `dist/` contains the hashed core js/wasm assets and `ffmpeg-core.worker.js`.
- Both `vite dev` (5173) and `vite preview` (4173) confirmed to return the COOP/COEP headers.

## How to Resume / Debug Fast

```bash
npm run dev          # then open http://localhost:5173/ (localhost only!)
```

- Test clips used (for quick converts, don't hand-feed a 300 MB DJI file):
  - 10-bit sample: `ffmpeg -y -ss 0 -i DJI/<file>.MP4 -t 3 -vf scale=640:-2 -c:v libx264 -preset fast -crf 28 -an sample.mp4`
  - 8-bit sample: same plus `-pix_fmt yuv420p`
- Playwright CLI (`playwright-cli open/click/eval/console`) was used for browser debugging. To add a file without the picker:
  `fetch("/file.mp4")` → build a `File` → assign via `DataTransfer` on the last `input[type=file]` → dispatch `change`.
- To confirm isolation in the browser console: `crossOriginIsolated` (expect `true`).

### If user reports the isolation error again
Likely causes, in order: (1) stale/cached tab → hard reload `Cmd+Shift+R`; (2) opened via LAN IP or `file://` instead of `http://localhost:5173/` (isolation only activates on secure contexts); (3) interfering Chrome extension → test in Incognito.

### Reload resilience (this session's follow-up: "computer went idle, site restarted", 39 MB / 12.5 min clip)
- Reported: a 12.5-min 640×360 H.264 clip took a long time in WASM; while the screen slept, Chrome reloaded the tab on wake and the whole in-memory workspace (queue + in-flight convert) was wiped.
- Two fixes in `src/App.tsx` + new `src/persistence.ts`:
  1. **Wake Lock** — `grabWakeLock()` calls `navigator.wakeLock.request('screen')` at the start of a conversion (no-op where unsupported), released in `finally`, on cancel, and on unmount. Keeps the display awake so long encodes aren't throttled/killed by idle, and the encode isn't background-tab-throttled.
  2. **IndexedDB persistence** (db `clippress`, stores `files` / `outputs` / `meta`) — the workspace is written best-effort after every state change (debounced 400 ms) and on add/completion:
     - `meta`: global profile + per-video `{ id, name, size, type, lastModified, profile, status, outputName, outputSize }`.
     - `files`: source blob per video id (written in `addFiles`).
     - `outputs`: compressed blob per id (written on successful convert).
     - On mount, `hydratingRef`-guarded restore re-reads these (StrictMode safe), rebuilds `File`s and `URL.createObjectURL`s, keeps `completed` items playable via `Open compressed`, and resets `converting`/`queued` items to `Ready` with the notice "…interrupted encode(s) reset to Ready". `hydratingRef` also blocks the persist effect from wiping saved data mid-restore.
     - Anything evicted from IDB (huge DJI sources can be), or a `completed` item whose output blob is missing, restores as `Ready` instead of lying.
- Verified in headless Chrome: add → IDB populated; convert → output saved, `✓ 85 KB compressed`; hard reload → "Restored 1 video from the previous session" with working `Open compressed`; reload mid-encode → "Restored 2 videos … 1 interrupted encode reset to Ready" and the restored file re-converts to completion.
- NOTE: real *resume* of an interrupted encode (not just re-queue) would need chunked encoding + checkpoints — not implemented.

### Compression server (`server/`) — used by the mobile app
- Small Node (Express + multer) service — `npm run server` (root script) or from `server/`, binds `0.0.0.0:8787`, spawns the host's `ffmpeg`/`ffprobe` (`/opt/homebrew/bin/ffmpeg`). Jobs run one-at-a-time in-memory (sequential queue). Its `tmp/` dir is resolved relative to the script (`import.meta.url`), so it lands under `server/tmp` regardless of where you launch it from.
- API: `GET /api/health`, `POST /api/compress` (multipart: `file`, `codec` h264|h265, `crf` 25|28) → `{ id, status, progress, … }`, `GET /api/jobs/:id` (poll), `GET /api/jobs/:id/output` (download), `DELETE /api/jobs/:id` (cleanup). Progress parsed from ffmpeg `time=` vs ffprobe duration. CRF/codec validated server-side.
- Verified via curl: sample1080 → h265/crf25 → 86 KB HEVC 1920×1080, correct content-disposition filename.
- NOTE (access model): the mobile app does NOT run its own server. In Expo Go, it auto-discovers the host from `Constants.expoConfig.hostUri` (same Mac as Metro) and talks to `http://<host>:<port>`. For a compiled build, target the server's LAN IP or a hosted/deployed URL via the in-app "Compression service" field (persisted with AsyncStorage).
- Privacy: videos are uploaded to the compression service and back. Today that's a local/self-hosted process; exposing it publicly later needs auth. The web app stays fully local (WASM).

### Mobile integration (Expo / React Native, SDK 54)
- `shared/domain.ts` holds the codec/CRF types, `PROFILES`, `outputNameFor`, and `formatBytes`; the web app (`src/App.tsx`, `src/persistence.ts`) and the mobile app both consume it.
- `mobile/` is an Expo SDK 54 app (React 19.1.0, RN 0.81.5, TypeScript), pinned to 54 to match the user's iPhone Expo Go (54.0.2). Note: `create-expo-app` fails on this npm with "Could not parse JSON returned from npm pack … --dry-run", so it was scaffolded manually and then downgraded 57 → 54 via `npx expo install expo@^54.0.0 && npx expo install --fix`.
- `mobile/metro.config.js` adds the repo root as a watch folder and both `node_modules` dirs so `../shared/domain` bundles on-device.
- `mobile/App.tsx`: workspace UI mirroring the web palette (profile codec/CRF segmented controls, per-item cards, `expo-document-picker` import). Conversion is REAL now, via `mobile/src/compressionService.ts`: native streaming upload → poll `/api/jobs/:id` → `downloadAsync` the output to the persistent `clippress/` folder → per-item progress% → completed card with a `Share` sheet (`expo-sharing`). Network failures show "No connection to the compression service …" with the `npm run server` hint.
- Upload vs compress visibility (fix for "stuck on 2%"): the previous `FileSystem.uploadAsync` had no progress events, so a multi-hundred-MB upload (minutes on Wi-Fi) looked like the app was frozen at 2%. Now the upload streams via `FileSystem.createUploadTask` (from `expo-file-system/legacy`) which reports real `totalBytesSent`/`totalBytesExpectedToSend` percentages, and the card phases switch `Uploading… N%` → `Compressing… N%` via an `onPhase` callback (`uploading` | `compressing`). The original filename is sent as a multipart `filename` field because the native uploader names the part from the file URI, and the server prefers `req.body.filename` over `originalname`. NOTE: RN's plain `XMLHttpRequest` multipart upload (used briefly) buffers the request body in JS memory and **crashes the app on ~1.5 GB videos** — always use `createUploadTask` for large files.
- Apple playback fix ("H.265 output plays audio but no video on the Mac"): ffmpeg's `libx265` tags HEVC streams `hev1`, which QuickTime ignores (audio-only). Encode now uses `-tag:v hvc1 -pix_fmt yuv420p`, plus `-movflags +faststart` on the SERVER; verified via curl+ffprobe: output is `codec_tag_string=hvc1`, `yuv420p`, `moov` at byte 32. Re-fresh the server before testing (`pkill -f "node server/server.mjs"` then `npm run server`), and re-convert existing files — old ones are still tagged `hev1`. NOTE: `-tag:v` must come AFTER `-pix_fmt` in the args array (a splice that inserted it before `-preset medium` corrupted argument order and made `hvc1` the output filename).
- WEB `-movflags +faststart` REMOVED (root cause of "stuck at 1%" / `ErrnoError: FS error`): the faststart moov-relocation pass in the ffmpeg.wasm MT core randomly FS-errors on larger files — reproduced immediately on a 90 s 1080×2288 clip and a 140 MB hard-motion clip (`ErrnoError: FS error`), and can leave the worker deadlocked so the UI parks at "Preparing encoder · 1%" forever. Dropping `+faststart` from the web args (`src/App.tsx:302`) makes both complete reliably with smooth 8%→99% progress (`ffmpeg.on('progress')` works; verified in headless Chrome up to 140 MB). Output now has `moov` at the end — fine for download/playback (`isCompleteMp4` only requires ftyp + moov present). The server keeps `+faststart` (native ffmpeg handles it fine).
- Web big-file reality: the whole input is written into the WASM heap (`writeFile`), so a ~1.5 GB clip is memory-pressured and slow in Chrome regardless of this fix; the reliable path for large files is the mobile app → server. In-browser is comfortable up to a few hundred MB.
- Node 26 caveat: Expo's config-plugin loader can't type-strip TS-source plugins under Node 26 (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` on `expo-status-bar`). Rule: keep only **compiled-JS** plugins in `app.json` (`plugins` currently = just `expo-video`, which is safe), and never add back `expo-status-bar`/any TS-plugin while on Node 26.
- Server logging is live (`server.mjs`): startup (address + pid + ffmpeg/`FFMPEG_PATH`), uploads received (name + MB), queue adds with depth, `Encoding <name> → <output> (<codec> crf <crf>, <Ns> of source)`, ≤10%-step progress lines with job-id prefix, `COMPLETED in <Ns>`, ffmpeg FAILED with exit code, output serves, deletions, and validation rejections — all timestamped `[HH:MM:SS]`.
- Verified: `npx tsc --noEmit` clean, `npx expo export --platform ios` bundles (including the shared domain and compression service), and `npx expo start` boots Metro (HTTP 200).
- Mobile card upgrades (preview / ratio / skip-already-converted):
  - **Preview**: each card has a "Preview" toggle that opens an in-card player (`expo-video`, so it works in Expo Go 54 and in the standalone build). It previews the original before completion and the compressed file after.
  - **Compression ratio**: on completion the card shows `Original → Compressed · ×N smaller · saved N%` alongside the sizes.
  - **Skip re-conversion (iOS sandbox caveat)**: iOS won't let the app list the folder the picked video came from, so "same folder" is the app's own persistent output dir `${FileSystem.documentDirectory}clippress/` (visible in Files → On My iPhone → Clippress). `compressVideo` now downloads there instead of cache, and on import (and on profile change) `findExistingCompressed()` checks for an output `outputNameFor(name, codec, crf)`; if found the card loads as **Completed** and is skipped by "Convert batch". NOTE: `expo-video` added a config plugin to `app.json` — it's a compiled JS plugin so it does NOT trigger the Node 26 type-strip bug; regenerate the native project for the standalone build (`npx expo prebuild -p ios` + pod install).
- The "Preview not showing" fix (worth repeating): a JS-only change is NOT enough for a new native module. `expo-video` was added after `ios/` was first generated, so `Podfile.lock` had no `ExpoVideo` pod and the installed app had no native player → tapping Preview did nothing. `npx expo prebuild -p ios` + `npx pod-install` fixed the pod; the app must then be **rebuilt and reinstalled** (`npx expo run:ios --configuration Release --device`). In Expo Go nothing was needed (it ships the module).

### Standalone iOS build (`mobile/ios/` generated)
- `npx expo prebuild -p ios` generated `ios/Clippress.xcworkspace` + Podfile; `pod install` done (80 deps, incl. `ExpoVideo`). CocoaPods 1.16.2 present.
- `mobile/app.json` now ships two required pieces for the compiled app: `ios.infoPlist.NSAppTransportSecurity.NSAllowsLocalNetworking` (allows plain-`http://` to the LAN server — Expo Go didn't need it, a compiled app does) and `NSLocalNetworkUsageDescription` ("Connect to your compression server on the local network." — iOS 14+ local-network permission prompt).
- Build/install: `cd mobile && npx expo run:ios --configuration Release --device`. **Release** is what makes it standalone: the JS bundle is embedded ("Bundle React Native code and images" phase), no Metro needed at runtime (Debug builds load JS from Metro). Alternatively: open `ios/Clippress.xcworkspace` → Scheme Run → Build Configuration → Release → Run.
- Free Apple ID (no paid dev account): after install the phone shows **"Untrusted Developer"** → Settings → General → VPN & Device Management → tap "Apple Development: …" → Trust. Builds expire after 7 days (rebuild to renew); a paid account removes trust/expiry.
- In the compiled app, auto-detect won't work (no Metro hostUri) → set `http://<Mac-LAN-IP>:8787` in the in-app Compression service field (persisted via AsyncStorage). Use the LAN IP, not `localhost`.

### Repo hygiene / gitignore (CPU mystery solved)
- Xcode's Source Control had been diffing the `DJI/` folder's untracked videos (`git diff --no-index -- /dev/null <file>`), pinning CPU at ~97% per file. Fix: killed those git processes and ignored the media: `.gitignore` now has `DJI/`, `*.MP4`, `*.mov`, `*.MOV`. NOTE: repo has almost nothing committed yet (only `README.md` tracked; `.gitignore`, `server/`, `mobile/`, docs, etc. are all untracked) — safe to `git add` now that media is ignored.
## Open Follow-ups (pruned; completed items moved above)

- **4K strategy decision** — web blocks anything above 2,592,000 px / ~1080×2400 with "Use a smaller clip or the native desktop app". Verified working up to 1080×2288 in WASM; true 4K still OOMs. If real 4K is wanted later: (a) automatic downscale in-app (`-vf scale=...` + output-resolution option), (b) chunked encode, or (c) ship with the guard as the honest limit (current behavior). Note the mobile app converts any size via the server.
- Test H.264/H.265 against full 4K DJI clips for real-world speed/memory (H.264 at 4K may still pass).
- Output naming template → dedicated config module (`outputNameFor` lives in `shared/domain.ts` today).
- Filtering/sort/removal/output-savings totals in the web workspace (the per-card ratio already exists on mobile).
- If the compression service ever goes public: auth, per-request limits, job persistence (currently in-memory, single-queue, unauth — fine for LAN).
- Consider npm/EAS for over-the-air installs (EAS Build with a paid dev account) instead of local Xcode signing.
- Test fixtures: `public/repro.MP4`, `public/sample1080.MP4`, `public/portrait2288.MP4`. They're regenerable and now gitignored by `*.MP4`.