# Video Compression Platform — Architecture Handoff

Status: **Implemented with deviations (see below). This file is the original design proposal; treat the details in it as reference, and use `RESUME.md` for the actual current state.**  
Scope: Web application first, with a shared domain layer for a future Expo/React Native mobile app.

### Deviations from this proposal in the shipped implementation

- Repository layout is flat, not `apps/`/`packages/` exploded: `src/` (web), `mobile/`, `server/`, `shared/domain.ts`. The shared "package" is the single `shared/domain.ts` file consumed by both apps (web + mobile) via Vite/TS and Metro (see `mobile/metro.config.js`).
- Concrete progress/profile types live in `shared/domain.ts` (`PROFILES`, `outputNameFor`, `formatBytes`, Codec/Crf); they differ slightly from the proposed TS interfaces above (e.g. output name template `{baseName}.compressed.{codec}.crf{crf}.mp4`).
- Built the platform contracts *in practice* rather than formally: the web compression adapter wraps `@ffmpeg/core-mt` (`src/App.tsx`, `src/persistence.ts`); the mobile compression adapter is a client for the local `server/` (Express + ffmpeg) HTTP service — the "no upload by default" guideline now reads "the web app never uploads; the mobile app uploads to a local/self-hosted service by design."
- "On-device for the initial release" applied to the web app only; the mobile app's compression runs server-side (native ffmpeg on the host Mac) because iOS on-device HEVC encoding is constrained and a local server was the pragmatic path.
- Jobs on the server are sequential (single queue), matching the "sequential processing as the safe initial default" recommendation.
- Status/UX follow the proposal: card states, per-card progress, individual CRF override (via a per-card profile re-select), original/compressed open, re-convert. The web app adds IndexedDB persistence + Wake Lock on top.
- Batch concurrency: jobs queue and run one-at-a-time on both the web app (`startBatch` runs the next queued item as each finishes — see `src/App.tsx` ~line 336) and the server (single sequential queue).
- The `packages/ui-tokens` idea landed as `shared/tokens.ts` (single source of truth for colors, 4px spacing grid, radius, `tokenCssVars()`): mobile's `mobile/src/theme.ts` imports and re-exports the shared tokens and adds platform-specific `typography`/`surfaces`/`buttons`/`gaps`; web injects them as CSS custom properties (`--t-*`) from `src/main.tsx`. Web-only colors (shell, card-bg, status tints, etc.) live in `src/index.css`. Closed PROGRESS #8.
- Both apps use a **component + hooks structure** instead of the proposed flat `VideoGrid`/`AppShell` plan: mobile is `mobile/App.tsx` (9-line shell) → `mobile/src/screens/HomeScreen.tsx` → components/hooks/types/utils; web is `src/App.tsx` (~98-line composer) → `src/components`/`src/hooks`/`src/types.ts`/`src/utils`. All UI files are single-purpose and ≤ ~160 lines (closed PROGRESS #9). Mobile stores per-component `StyleSheet`s colocated in each component; web keeps one global `src/App.css` (selectors overlap too much to split safely).
- Mobile storage visibility extends the proposal: `getStorageStats()`/`clearStoredFiles()` (tracked outputs + cache orphans + `DocumentPicker/` + `tmp/`) and a full-disk `inspectStorage()` (`Documents`, `Caches`, `Application Support`, `tmp`) surfaced by a dedicated `StorageInspector` component, so on-device usage matches what iOS Settings reports.

## 1. Product goal

Create a video-compression platform that lets a user:

1. Choose a local folder.
2. Preview and browse its video files in a card/grid view.
3. Select one global compression profile for the loaded videos.
4. Convert videos while showing per-video progress.
5. Open either the original or compressed result for quality review.
6. Re-compress an individual video with a different quality setting, initially CRF 25 or CRF 28.

The application must not upload videos by default. Files should be processed locally whenever the selected platform and codec engine support it.

## 2. Technology decisions

### UI framework

- React + TypeScript + Vite for the web application.
- Expo + React Native for the mobile application.
- Shared TypeScript packages for domain models, validation, profiles, job state, and use cases.
- A platform adapter boundary for folder access, video metadata, preview URLs, compression, progress, and output opening.

React is the only web UI framework in the initial release. Vite is the web build tool and development server; it is not a replacement for React. React Router may be added as a routing library if the application grows beyond the initial workspace screen. React Router Framework Mode and TanStack Start are not required for this local-first application.

TanStack Query is also optional. It should be introduced only if the product gains remote/server state such as accounts, synchronized history, or cloud processing. It is not needed for local video files and conversion jobs in the first release.

React Native and Expo are used for the mobile client. Business logic remains framework-neutral so it can be consumed by both clients without duplicating compression rules or job orchestration.

### Design system

The Revolut design-system analysis and tokens are already available in [`Design.md`](./Design.md). Treat that file as the source of truth for visual direction, color tokens, typography, spacing, surfaces, and component guidance.

Use the generated design-system components in the React web app, wrapped behind a small UI layer where practical. Feature and domain code should not depend directly on vendor-specific component APIs. Mobile components should follow the same tokens and interaction language, using React Native equivalents where web components cannot be shared.

## 3. Proposed repository structure

```text
video-compressor/
├── apps/
│   ├── web/                         # React + TypeScript web client
│   └── mobile/                      # Expo + React Native client
├── packages/
│   ├── domain/                      # Framework-independent business logic
│   │   ├── models/
│   │   ├── compression/
│   │   ├── jobs/
│   │   └── use-cases/
│   ├── platform-contracts/          # Interfaces implemented per platform
│   ├── profiles/                    # Validated compression presets
│   ├── validation/                  # Shared input and capability validation
│   └── ui-tokens/                   # Shared theme tokens, if supported
├── tooling/
│   └── config/                      # Shared TypeScript/lint/test configuration
├── Design.md                         # Revolut design-system analysis and tokens
├── ARCHITECTURE.md
└── package.json
```

The web and mobile apps own presentation, navigation, permissions, and platform-specific file handling. They call shared use cases rather than implementing compression rules in components.

## 4. Business/domain layer

### Core entities

```ts
type VideoAsset = {
  id: string;
  name: string;
  sourceUri: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  codec?: string;
  thumbnailUri?: string;
};

type CompressionProfile = {
  id: string;
  label: string;
  codec: 'h264' | 'h265';
  crf: 25 | 28;
  preset: 'fast' | 'medium' | 'slow';
  audioBitrateKbps: number;
  outputExtension: 'mp4';
};

type ConversionJob = {
  id: string;
  assetId: string;
  profileId: string;
  status: 'queued' | 'converting' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  outputUri?: string;
  outputSizeBytes?: number;
  errorMessage?: string;
};
```

### Initial profiles

```ts
const profiles = {
  quality: {
    label: 'Higher quality',
    codec: 'h265',
    crf: 25,
    preset: 'medium',
    audioBitrateKbps: 128,
    outputExtension: 'mp4',
  },
  compact: {
    label: 'Smaller file',
    codec: 'h265',
    crf: 28,
    preset: 'medium',
    audioBitrateKbps: 128,
    outputExtension: 'mp4',
  },
} as const;
```

CRF is a quality target: lower CRF generally means higher quality and a larger file. The profile, not the card component, owns this rule.

### Use cases

- `LoadVideoFolder`: choose folder, enumerate supported files, read metadata, create thumbnails.
- `SetGlobalProfile`: validate and store the profile for the current batch.
- `QueueBatchConversion`: create one conversion job per selected video.
- `ConvertVideo`: execute one job through the platform compression adapter.
- `RetryVideoWithProfile`: requeue one completed/failed asset with CRF 25 or CRF 28.
- `OpenOriginal`: request the platform to open/play the source.
- `OpenCompressed`: request the platform to open/play the generated output.
- `CancelConversion`: cancel a queued or active job where supported.

## 5. Platform contracts

The domain layer should depend on interfaces, not browser or Expo APIs:

```ts
interface VideoSourceAdapter {
  chooseFolder(): Promise<VideoAsset[]>;
  getMetadata(asset: VideoAsset): Promise<Partial<VideoAsset>>;
  createThumbnail(asset: VideoAsset): Promise<string>;
}

interface CompressionAdapter {
  convert(
    asset: VideoAsset,
    profile: CompressionProfile,
    onProgress: (progress: number) => void,
  ): Promise<{ outputUri: string; outputSizeBytes: number }>;
  cancel?(jobId: string): Promise<void>;
}

interface MediaViewerAdapter {
  open(uri: string): Promise<void>;
}
```

### Web implementation

- Use the File System Access API where available for folder selection.
- Provide a file-input fallback for browsers without directory access.
- Use object URLs for local previews and revoke them when no longer needed.
- Use a Web Worker for CPU-heavy work.
- The compression engine must be selected explicitly: a WASM FFmpeg build is the likely portable option, but its memory, browser, and codec limitations must be tested before committing to it.

### Expo/mobile implementation

- Use Expo-compatible document/media pickers and request the required media permissions.
- Treat “folder selection” as platform-dependent: mobile operating systems generally expose file/document selection rather than arbitrary folder access.
- Use a native or Expo-compatible FFmpeg/compression adapter. Keep it behind `CompressionAdapter`; do not import native FFmpeg APIs into shared packages.
- Store generated outputs in the app cache or document directory and expose them through the platform viewer/share APIs.

## 6. Web screen and component plan

### Main workspace

- `AppShell`
- `FolderPicker`
- `GlobalCompressionProfileSelect`
- `BatchActions`
- `VideoGrid`
- `VideoCard`
- `ConversionProgress`
- `VideoPreviewModal`
- `EmptyState`
- `ErrorBanner`

### Video card states

Each card displays:

- thumbnail and video name;
- original size, duration, resolution, and codec when available;
- selected/global CRF profile;
- conversion status and progress indicator;
- compressed size and estimated savings after completion;
- buttons for `Open original` and `Open compressed`;
- an individual CRF selector with values 25 and 28;
- `Convert` or `Re-convert` action;
- error details and retry action when conversion fails.

The card must visibly distinguish `queued`, `converting`, `completed`, and `failed`. While a card is converting, disable conflicting actions and show progress rather than leaving the user uncertain whether work started.

## 7. State management

Keep state in feature-level stores/hooks, with the domain state shape shared across clients:

- `library`: chosen folder and discovered assets;
- `selection`: selected assets and global profile;
- `jobs`: job records keyed by asset ID;
- `viewer`: currently opened original/compressed URI;
- `capabilities`: supported codecs, folder access, cancellation, and platform limitations.

The UI should subscribe to state changes and render them. It should not calculate output size, infer job completion, or build FFmpeg commands itself.

## 8. Main user flow

```text
Choose folder
  → enumerate video files
  → read metadata and generate thumbnails
  → show VideoGrid
  → choose global profile (CRF 25 or 28)
  → start batch
  → queue individual jobs
  → show per-card progress
  → save output
  → show compressed size and review actions
  → optionally re-convert one card with the other CRF
```

## 9. Compression command model

The domain should create a structured request. Only the platform adapter converts it to FFmpeg arguments:

```ts
type CompressionRequest = {
  inputUri: string;
  outputUri: string;
  codec: 'h264' | 'h265';
  crf: 25 | 28;
  preset: 'fast' | 'medium' | 'slow';
  audioBitrateKbps: number;
};
```

For the current H.265 DJI workflow, the equivalent CLI command is:

```bash
ffmpeg -i input.MP4 \
  -c:v libx265 -crf 25 -preset medium \
  -c:a aac -b:a 128k output.mp4
```

This command is a reference for the native/CLI adapter, not something the React component should execute directly.

## 10. Safety and file handling

- Never overwrite the original by default.
- Generate deterministic but collision-safe output names, for example `DJI_..._crf25.mp4`.
- Validate MIME type and extension before queuing.
- Enforce available storage checks before a batch begins where the platform allows it.
- Revoke browser object URLs when cards/unmounts are removed.
- Keep temporary files separate from user-selected originals.
- Make cancellation and partial-output cleanup explicit.
- Do not upload files without a clear, separate user action and consent.

## 11. Testing strategy

### Unit tests

- profile validation and CRF constraints;
- output-name generation;
- job state transitions;
- progress normalization;
- batch queue creation;
- retry behavior;
- capability fallbacks.

### Adapter tests

- folder/file enumeration;
- metadata extraction;
- thumbnail creation;
- compression command construction;
- cancellation and failed-process handling.

### UI tests

- folder loaded into grid;
- global profile applied to all queued jobs;
- converting indicator appears on the correct card;
- original/compressed viewer actions use the correct URI;
- individual CRF override only changes the selected card;
- failed conversion can be retried.

### Acceptance test

Use a representative DJI 4K HEVC sample and confirm that CRF 25 and CRF 28 produce playable MP4 outputs, preserve the original, report output sizes, and can both be opened for comparison.

## 12. Recommended implementation order

1. Scaffold the React + TypeScript + Vite web app and Expo app, using the existing Revolut design-system setup and [`Design.md`](./Design.md).
2. Implement shared models, profiles, contracts, and use cases with mock adapters.
3. Build the React web grid and card states against the mock adapter.
4. Add real web folder access, metadata, thumbnails, and preview playback.
5. Add the web compression adapter and worker-based job queue.
6. Add output review and individual CRF retry.
7. Create the Expo app using the same domain packages and mobile adapters.
8. Add native compression only after validating the target iOS/Android codec and file-permission constraints.

## 13. Resolved decisions before implementation

### Video codec coverage

Support both H.264 and H.265 because the library will contain many video sources, not only DJI footage.

- H.264 is the compatibility-oriented profile and should play on the widest range of devices and services.
- H.265/HEVC is the compact-storage profile and is useful when the target device or service supports it.
- The codec must be part of the compression profile, not hardcoded in a component.
- CRF values should be validated per codec. CRF 25 and 28 are useful starting points, but equivalent visual quality and output sizes may differ between H.264 and H.265.

### Routing

Keep the first release as a single-screen Vite application. Add React Router after the next screen is introduced. Use React Router as a routing library in declarative or data mode; React Router Framework Mode is not required for the local-first application.

### Browser support and Safari

The first web target is modern Chromium browsers such as Chrome and Edge. Safari is not a first-class target for the initial release.

This matters because the web app needs to:

- let the user choose a folder;
- read video files from that folder;
- write compressed files back into that folder; and
- retain permission to access the folder during the session.

Chromium provides the strongest support for this workflow through the File System Access API. Other browsers may support only a file picker or drag-and-drop. In those fallbacks, the app can read and preview selected files, but it may not be able to write automatically beside the original. The UI must explain this limitation and offer a download/save fallback.

The mobile app is separate from Safari and will use Expo/React Native native file and media APIs on iPhone.

### Processing location

Run compression on-device for the initial release:

- Chrome/Chromium: use a Web Worker and a WASM FFmpeg adapter where performance and memory allow.
- iPhone: use a native Expo-compatible compression adapter behind the same `CompressionAdapter` contract.
- No server worker or video upload is required initially.

If a browser cannot run the local encoder reliably, show a clear capability error rather than silently uploading the video. A server worker can be considered later as an explicit opt-in feature.

### Batch job control

Do not expose a fixed concurrency setting to the user. The batch may contain any number of videos, but the platform scheduler must avoid starting unlimited encoders simultaneously because 4K video encoding can exhaust CPU, memory, battery, or browser worker resources.

The scheduler should support:

- queued, converting, paused, completed, failed, and cancelled states;
- cancel for queued or active jobs;
- pause and resume when the selected encoder supports it;
- graceful fallback when pause is unavailable; and
- retry from the beginning when checkpointed resume is not supported.

The number of active jobs should be chosen by the platform adapter based on device capabilities, with sequential processing as the safe initial default for iPhone and browser WASM encoding.

### Output location and naming

Web outputs should be written into the selected source folder when the browser grants directory write access. The output filename must be configurable rather than hardcoded in UI code. The initial default template is:

```text
{baseName}.compressed.{codec}.crf{crf}.mp4
```

The template belongs in configuration and should be changeable later through settings. The app must never overwrite the original by default and must handle filename collisions safely.

On iPhone, outputs should initially be stored in the app's document/cache area, with an explicit export/share action to Photos or Files. A later mobile settings flow can allow the user to choose a persistent destination.

### Initial design-system components

Use the existing [`Design.md`](./Design.md) tokens and Revolut design direction. Wrap the components needed by the first workspace rather than importing the entire design system indiscriminately:

- typography and layout primitives;
- buttons and icon buttons;
- cards for video assets;
- chips or segmented controls for codec and CRF profile selection;
- badges for queued, converting, completed, paused, and failed states;
- progress indicator for per-video conversion;
- select/menu control for global profile selection;
- dialog or sheet for original/compressed preview actions;
- alert/toast for errors and capability warnings; and
- navigation primitives when the second screen is added.

The design-system wrapper should expose product language such as `CompressionProfileSelect`, `ConversionStatusBadge`, and `VideoCard`, so feature code is not coupled to vendor-specific component names.
