# Clippress Compression Service

A small Node/Express HTTP service that compresses videos with the host's native **ffmpeg**. It exists so the iPhone app can offload encoding to the Mac — the phone uploads, the Mac encodes at full CPU speed, and the phone downloads the (much smaller) result. The web app does not use it (the browser compresses locally via WASM).

## Quick start

```bash
npm install
npm run server        # binds 0.0.0.0:8787 by default
```

Health check: `curl http://localhost:8787/api/health`

Stops with `Ctrl+C`. If the port is taken by a stale process, `pkill -f "server.mjs"` first (or it logs `EADDRINUSE` and exits).

## How it works

Everything lives in one file: `server.mjs`. There is no state beyond a single Node process.

### Job lifecycle

1. **Upload** — the mobile app streams the raw video file to `POST /api/compress`. The body is written straight to `tmp/in/<uuid>.mp4` as it arrives (`readBodyToFile`) — nothing is buffered in memory, so multi-GB uploads are safe. The server disables Node's default 5-minute `requestTimeout`/`headersTimeout` so a 1.4 GB upload that streams for minutes is never killed mid-body.
2. **Validate + queue** — codec/crf must be valid (`h264`/`h265`, `crf 25`/`28`), otherwise the upload is rejected and deleted. A job object is created and added to an in-memory queue (`jobs` Map) with status `queued`.
3. **Process** — a single worker (`runWorker`) drains the queue one job at a time (no parallel encodes). It probes the source duration with `ffprobe`, then spawns ffmpeg:
   - `-c:v libx264`/`libx265 -crf <25|28> -preset medium -pix_fmt yuv420p`
   - H.265 additionally gets `-tag:v hvc1` so Apple devices play the video (not audio-only)
   - `-c:a aac -b:a 128k -movflags +faststart`
   - Output goes to `tmp/out/<jobId>.mp4`, so the UUID job id survives colliding filenames.
   The source file is deleted when encoding finishes.
4. **Poll** — the app polls `GET /api/jobs/:id` every second for `status`/`progress` (progress parsed from ffmpeg's stderr `time=` lines, capped at 99 until completion).
5. **Download** — on `status: completed` the app downloads the file from `GET /api/jobs/:id/output` and stores it in its own Documents folder (`clippress/`).
6. **Cleanup** — the app calls `DELETE /api/jobs/:id`, which removes the output file and the job from the map.

### Timeouts for the client

The app gives up after ~30 minutes of polling (`1800 × 1s`). If ffmpeg fails, the job goes `failed` with the last lines of ffmpeg's stderr as `error`.

## API reference

### `GET /api/health`
Always `200`. Returns `{ ok, service, ffmpeg }`.

### `POST /api/compress`

Raw binary upload (no multipart). The mobile client streams the video with `Content-Type: video/mp4` and carries metadata in request headers:

| Header | Value | Example |
| --- | --- | --- |
| `X-Codec` | `h264` or `h265` | `h265` |
| `X-Crf` | `25` or `28` | `25` |
| `X-Filename` | URL-encoded original filename | `DJI_0421.MP4` |

Returns `201` with the job snapshot, `400` if the body didn't fully arrive or codec/crf is invalid, `413` if the upload exceeds the 16 GB cap.

### `GET /api/jobs/:id`
Returns the current job state: `{ id, status, progress, codec, crf, outputName, outputSize, error }`. `404` if unknown.

### `GET /api/jobs/:id/output`
Streams the completed MP4 (`video/mp4`, attachment). `409` if not ready, `404` if unknown.

### `DELETE /api/jobs/:id`
Deletes the output file and forgets the job → `{ ok: true }`.

### Curl example (upload)

```bash
curl -X POST http://localhost:8787/api/compress \
  -H "Content-Type: video/mp4" \
  -H "X-Codec: h265" -H "X-Crf: 25" \
  -H "X-Filename: clip.mp4" \
  --data-binary @clip.mp4
```

## Storage

- `tmp/in/` — incoming uploads, deleted after encoding (or on rejection/failure).
- `tmp/out/` — completed outputs, deleted by the client's `DELETE`.
- On boot the server **sweeps both directories** — jobs are in-memory, so any file on disk without a live job is orphaned (crash, restart, or a client that downloaded but never deleted). It logs how many files it removed.

Because jobs live only in memory, a server restart loses the queue; active uploads are interrupted. That's acceptable for a LAN tool.

## Configuration

All optional:

| Env var | Default | Meaning |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8787` | Listen port |
| `FFMPEG_PATH` | `ffmpeg` (uses `PATH`) | Full path to ffmpeg if not on PATH |

The iPhone reaches it at `http://<your-Mac-LAN-IP>:8787` (`ipconfig getifaddr en0` to find the IP).

## Limitations

- Single-queue: encodes run one at a time (safe, predictable — but a big batch backs up).
- In-memory jobs: a restart drops the queue and orphans disk files (cleaned on next boot).
- Unauthenticated and open to your LAN by design.
- ffmpeg must be installed on the host (`brew install ffmpeg`).

## Troubleshooting

- **`Upload FAILED: aborted`** — the client cut the connection mid-upload (app backgrounded, Wi-Fi dropped). The log now includes how many MB arrived.
- **`Upload REJECTED (codec "", crf "0")`** — metadata headers didn't arrive (usually the phone is running an app build older than the header-based protocol). Rebuild the app.
- **`EADDRINUSE`** — a stale server is still running: `pkill -f "server.mjs"`.
- **ffmpeg stream errors in the log** — the previous run's file was deleted *after* the job was created (see `tmp`). If it happens on a real upload, the source file is invalid or corrupted.