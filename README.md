# Video Compression App (Clippress)

Local-first video compression across the web and iPhone, powered by FFmpeg.

- **Web app** (`src/`) — React + TypeScript + Vite, compresses entirely in the browser via `@ffmpeg/core-mt` (WASM). No uploads.
- **Mobile app** (`mobile/`) — Expo SDK 54 app for iOS. Converts by uploading to a local compression service on your Mac.
- **Compression service** (`server/`) — small Node/Express service backed by the host's `ffmpeg`, run by the mobile app.

## Docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — architecture decisions, platform contracts, and deviations from the original proposal.
- [`DESIGN.md`](./DESIGN.md) — Revolut-inspired design system, tokens, and UI direction.
- [`PROGRESS.md`](./PROGRESS.md) — milestone status, current limitations, and next work.
- [`RESUME.md`](./RESUME.md) — detailed session notes: every bug fixed (H.265 hangs, 4K OOM, iOS 1.5 GB crashes, "stuck at 1%") and how to resume work.
- [`server/README.md`](./server/README.md) — how the compression service works: API, job lifecycle, storage, and troubleshooting.

## Requirements

- Node 20+ (mobile tooling works best on a Node 24 LTS — Node 26 breaks Expo's type-stripped config plugins)
- [FFmpeg](https://ffmpeg.org/) installed at `/opt/homebrew/bin/ffmpeg` (Homebrew: `brew install ffmpeg`) — needed by the compression service
- Chrome/Edge for the web encoder (cross-origin isolation required); Safari is not a target
- Xcode + CocoaPods for the iOS build

## Web app

```bash
npm install
npm run dev        # http://localhost:5173/ (must be localhost for H.265)
npm run build      # typecheck + production build
npm run preview    # serve the production build
```

The browser encoder needs COOP/COEP isolation headers (set in `vite.config.ts`). Any production static host must serve these headers too.

## Compression service

```bash
npm install
npm run server     # binds 0.0.0.0:8787, spawns the host's ffmpeg
```

Health check: `curl http://localhost:8787/api/health`

## Mobile app

```bash
cd mobile
npm install
npx expo start     # run in Expo Go on the phone (SDK 54)
```

In Expo Go the app auto-discovers the host Mac; for a compiled build, set `http://<your-Mac-LAN-IP>:8787` in the in-app Compression service field.

### Standalone iOS build

```bash
cd mobile
npx expo prebuild -p ios && npx pod-install   # once, when native deps change
npx expo run:ios --configuration Release --device
```

Compiled builds embed the JS bundle (no Metro needed at runtime) and require the local-networking keys already present in `mobile/app.json`. Free Apple ID builds need developer-trust approval on the device and expire after 7 days. See `RESUME.md` → "Standalone iOS build" for details.

## Verified profile

Default is **H.265 / CRF 25**. Server-side output is tagged `hvc1` so HEVC plays (with video, not audio-only) on Apple devices.

## Notes

- Watch out for zombie compression-server processes: `pkill -f "server.mjs"` before restarting, or port 8787 serves stale code (`EADDRINUSE`).
- Media folders (`DJI/`) and test clips (`*.MP4`) are gitignored.