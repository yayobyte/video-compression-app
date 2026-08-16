# Progress

## Current milestone — Full platform: web WASM + local server + iOS app (working end-to-end)

Completed:

- Scaffolded the React + TypeScript + Vite web app.
- Implemented the Revolut-inspired video workspace UI from `Design.md`.
- Added folder and multi-file selection, local preview playback, metadata extraction, global/per-card H.264/H.265 and CRF controls, and sequential job states.
- Added `ffmpeg.wasm` local browser conversion with progress, cancellation, compressed-output preview, and safe fallback download.
- Added Chromium File System Access API support: when a folder is chosen with Chrome's folder picker, the app attempts to save the compressed output beside the original.
- Configured the project to build successfully with Vite 6 on the current Node runtime.
- Excluded ffmpeg.wasm packages from Vite dependency pre-bundling and self-hosted the FFmpeg core/worker assets through Vite so its module worker resolves correctly in development.
- Made the workspace survive browser reloads (IndexedDB persistence + Wake Lock during encodes).
- Extracted the shared domain/profile contracts into `shared/domain.ts`, consumed by both apps.
- Switched to the multi-threaded `@ffmpeg/core-mt` core so H.265 actually works in the browser (libx265 hangs in the ST core); served via COOP/COEP headers.
- Added a pixel pre-flight guard (`MAX_ENCODE_PIXELS = 1080×2400`) with an honest "too large for the in-browser encoder" message, and post-exec output validation so an OOM-truncated file can never report success.
- Fixed "stuck at 1%" on bigger files: `-movflags +faststart` removed from the web encode args (it FS-errors/deadlocks in the WASM MT core) and `-tag:v hvc1 -pix_fmt yuv420p` added so HEVC output plays video (not audio-only) on Apple devices.
- Scaffolded the Expo (React Native) app in `mobile/` on SDK 54 (pinned to the iPhone's Expo Go), wired to the shared domain via Metro monorepo config; it typechecks, bundles via `expo export`, and boots Metro.
- Added a local Node compression service (`server/`, `npm run server`, ffmpeg-backed) with timestamped logging, hvc1/faststart flags, and a `filename` form-field fallback; wired the mobile app to it: `createUploadTask` (streaming, safe for 1.5 GB+ files) → poll progress → download to a persistent `clippress/` folder → share sheet. In Expo Go the app auto-discovers the host machine; an in-app field points at any address for a compiled build.
- Mobile card upgrades: in-card video preview (`expo-video`), compression-ratio readout (`Original → Compressed · ×N smaller · saved N%`), and skip-already-converted detection (`findExistingCompressed`) so re-imported or profile-changed files load as Completed.
- Generated a standalone native project (`npx expo prebuild -p ios` + pod install, currently 80 deps incl. `ExpoVideo`), with ATS local-networking + local-network-usage keys in `app.json` so a compiled app can reach the `http://` LAN server. Release configuration embeds the JS bundle (no Metro at runtime).
- Repo hygiene: `.gitignore` covers `DJI/`, `*.MP4`, `*.mov`, `*.MOV` (Xcode's git had been diffing untracked video binaries at ~97% CPU).

Current limitations:

- Browser FFmpeg/WASM is memory- and CPU-intensive; true 4K x265 is blocked up-front by the pixel guard (works verified up to 1080×2288). The mobile app converts any size via the server.
- Pause/resume of an in-browser encode is not implemented (no safe checkpoint). Cancel is supported.
- Folder enumeration is currently top-level only; nested subfolders are not scanned.
- The compression service is in-memory (jobs lost on restart), single-queue, and unauthenticated — fine for a self-hosted LAN server, not for public exposure.
- Standalone iOS builds are signed with a free Apple ID: "Untrusted Developer" workaround + 7-day expiry. A paid dev account (or EAS) removes that.

Next work:

1. Rebuild + reinstall the standalone app on the phone so the in-card preview renders (`cd mobile && npx expo run:ios --configuration Release --device`), then set `http://<Mac-LAN-IP>:8787` in the app.
2. Commit the now-safe code (media is gitignored; repo currently only tracks `README.md`).
3. Move the output naming template into a dedicated app configuration module.
4. Add filtering, sort, removal, and output-savings totals to the web workspace (per-card ratio already exists on mobile).
5. 4K strategy decision for the web (automatic downscale vs. shipping the guard as the honest limit).
6. If the compression service goes public: add auth, per-request limits, and job persistence.
