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
- Generated a standalone native project (`npx expo prebuild -p ios` + pod install, currently 80 deps incl. `ExpoVideo`), with ATS local-networking + local-network-usage keys in `app.json` so a compiled app can reach the `http://` LAN server. Release configuration embeds the JS bundle (no Metro at runtime); verified: **`expo run:ios --configuration Release` built 0 errors on the iPhone and the app launched standalone** (iPhone 16 Yayo2, UDID `00008140-000D44CA26C1801C`, LAN IP `192.168.50.183:8787`).
- App branding: vector `logo.svg` master rasterized via `sharp` into icon/splash PNGs, with `icon.png`+`icon-adaptive.png` (1024 transparent), `splash-icon.png` (512), `icon-solid.png` (1024, opaque ink `#0a0a0a` baked in — iOS icons must be opaque), `favicon.png` (64). `app.json` now sets `icon`/`ios.icon` = the solid PNG, `android.adaptiveIcon` = transparent fg on `#0a0a0a`, and the `expo-splash-screen` plugin (`imageWidth:180 contain` on `#0a0a0a`); prebuild succeeds and the generated AppIcon is byte-identical to the source PNG. NOTE: this SDK's icon pipeline rejects SVG (`Invalid mimeType`) — the PNGs are sourced from the SVG, the SVG stays the editable master. Rasterize helper not yet saved as a script.
- Mobile UX: codec/compression switched from segmented buttons to aligned `Switch` rows (global card + per-card mini-switches wired to `setProfileOn`), a **health check** (`checkServerHealth()` → `/api/health` with 4s abort; runs on load, Apply, and foreground), a teal-accent **Check** pill, a divider between the PROFILE and COMPRESSION SERVICE groups, and an AppState foreground handler that re-pings health and resumes any card stuck in `converting` (busy-guarded, ref-keyed to avoid stale closures).
- **Theme system**: `mobile/src/theme.ts` is now the single source of truth — `colors`, `spacing` (strict 4px grid: 4/8/12/16/20/24/32/40/48), `radius`, `typography` (fixed ramp incl. a lineHeight-free `input` variant so iOS TextInputs center correctly), plus reusable `surfaces`/`buttons`/`gaps`. `App.tsx` carries no hardcoded hex or magic numbers; DESIGN.md documents the tokens and deliberate deviations. Web still hardcodes literals in `src/App.css` (see #9).
- README rewritten (no Vite boilerplate): project description, doc-file references, and install/run steps for web, server, mobile, and the standalone iOS build.
- Repo hygiene: `.gitignore` covers `DJI/`, `*.MP4`, `*.mov`, `*.MOV` (Xcode's git had been diffing untracked video binaries at ~97% CPU) and now `.playwright-cli/` (untracked Playwright debug artifacts, ~120 MB).

Current limitations:

- Browser FFmpeg/WASM is memory- and CPU-intensive; true 4K x265 is blocked up-front by the pixel guard (works verified up to 1080×2288). The mobile app converts any size via the server.
- Pause/resume of an in-browser encode is not implemented (no safe checkpoint). Cancel is supported.
- Folder enumeration is currently top-level only; nested subfolders are not scanned.
- The compression service is in-memory (jobs lost on restart), single-queue, and unauthenticated — fine for a self-hosted LAN server, not for public exposure.
- Standalone iOS builds are signed with a free Apple ID: "Untrusted Developer" workaround + 7-day expiry. A paid dev account (or EAS) removes that.

Next work:

1. Commit the now-safe code (media is gitignored; repo currently only tracks `README.md`).
2. Move the output naming template into a dedicated app configuration module.
3. Add filtering, sort, removal, and output-savings totals to the web workspace (per-card ratio already exists on mobile).
4. 4K strategy decision for the web (automatic downscale vs. shipping the guard as the honest limit).
5. If the compression service goes public: add auth, per-request limits, and job persistence.
6. **Server cleanup on startup**: sweep `server/tmp/in` leftovers and orphaned `server/tmp/out` outputs on boot (jobs are in-memory so a restart orphans files; app crashes after download-but-before-DELETE leak too). Small change in `server/server.mjs`.
7. **On-device compression engine** (real fix for the "Mac must stay awake" limitation): link a native FFmpeg library (e.g. `ffmpeg-kit`/`mobile-ffmpeg`) into the app and invoke it from the app process — videos never leave the phone, works offline, but binary grows ~30–80 MB and encodes are slower than the Mac's CPU. Add a **per-card or global engine toggle** (Server ⇄ On device) so the app can use whichever is available; health check then applies only to the Server path.
8. **Share design tokens between web and mobile**: mobile has a proper token system (`mobile/src/theme.ts` — colors, 4px spacing grid, radius, type ramp, reusable `surfaces`/`buttons`/`gaps`); web (`src/App.css`) still hardcodes hex literals and does NOT follow `DESIGN.md`. Extract tokens to a single source (e.g. `shared/tokens.ts`), have mobile build `StyleSheet` from it, and generate CSS custom properties from the same file for web so both platforms share identical palette/spacing/radius. Alignment-class type fixes can't directly port (no text inputs on web), only token values.
