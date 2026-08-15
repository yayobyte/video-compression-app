# Video Compression App

A local-first video compression platform for macOS/Chrome and iPhone. The application will let users select videos, preview them, compress them with configurable H.264 or H.265 profiles, monitor conversion progress, and compare original and compressed outputs.

The project is currently in the architecture and planning phase.

## Project documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — application architecture, domain model, platform adapters, job lifecycle, browser/mobile behavior, output naming, testing strategy, and resolved decisions.
- [`Design.md`](./Design.md) — Revolut-inspired design-system analysis, visual tokens, typography, colors, surfaces, and component guidance.

## Planned stack

- **Web:** React + TypeScript + Vite
- **Mobile:** Expo + React Native
- **Shared logic:** framework-independent TypeScript packages
- **Web compression:** local Web Worker with a WASM FFmpeg adapter
- **iPhone compression:** Expo-compatible native compression adapter
- **Design system:** Revolut design direction and generated design-system components

Vue is not part of the planned stack. React is used for the web and React Native is used for mobile. Vite is the web build tool and development server, not a replacement for React.

## Core functionality

1. Choose a local folder or select video files.
2. Read video metadata and generate previews/thumbnails.
3. Display videos in a card/grid workspace.
4. Choose a global compression profile for a batch.
5. Convert videos locally on the device when supported.
6. Show per-video queued, converting, paused, completed, failed, and cancelled states.
7. Open the original or compressed result for quality review.
8. Re-compress an individual video with a different profile.
9. Save web outputs beside the originals using a configurable filename template.
10. Export or share generated files from iPhone.

## Initial compression profiles

The first profiles will support both codecs:

- **H.264:** compatibility-oriented output.
- **H.265/HEVC:** smaller output when supported by the target device or service.
- **CRF:** initially 25 and 28, with values validated per codec.
- **Preset:** initially `medium`.
- **Audio:** AAC at 128 kbps by default.

The default web output naming template is:

```text
{baseName}.compressed.{codec}.crf{crf}.mp4
```

Original files are never overwritten by default.

## Platform scope

### Web

The first web target is modern Chromium browsers such as Chrome and Edge. Chromium provides the strongest support for selecting a folder, reading its files, and writing outputs back into that folder through the File System Access API.

Safari is not a first-class target initially. Browsers without equivalent folder-write support will use file selection or drag-and-drop and offer a download/save fallback instead of silently uploading files.

### iPhone

The mobile app will use Expo and React Native. Files will initially be stored in the app’s document or cache area, with explicit export/share actions to Photos or Files. Mobile folder selection is platform-dependent and will use native document/media APIs rather than assuming desktop-style folder access.

## Job behavior

Users can select any number of videos without configuring a concurrency limit. Internally, the platform scheduler will avoid starting unlimited encoders simultaneously because video conversion can consume substantial CPU, memory, battery, and browser-worker resources.

The job system will support:

- queueing;
- progress reporting;
- cancellation;
- pause/resume where the encoder supports it;
- retry from the beginning when checkpointed resume is unavailable; and
- per-video profile overrides.

Sequential processing is the safe initial default for iPhone and browser-based WASM encoding.

## Routing and data libraries

The first release will be a single-screen Vite app. React Router can be added as a routing library when the next screen is introduced. React Router Framework Mode and TanStack Start are not required for the initial local-first application.

TanStack Query is optional future tooling for remote/server state such as accounts, synchronized history, or cloud processing. It is not needed for the first local-only workflow.

## Planned repository structure

```text
video-compression-app/
├── apps/
│   ├── web/                 # React + TypeScript + Vite web app
│   └── mobile/              # Expo + React Native app
├── packages/
│   ├── domain/              # Shared business logic and use cases
│   ├── platform-contracts/  # File, metadata, compression, and viewer interfaces
│   ├── profiles/            # Compression profiles and validation
│   └── validation/          # Shared validation rules
├── Design.md               # Design-system analysis and tokens
├── ARCHITECTURE.md         # Detailed architecture handoff
└── README.md               # Project overview
```

## Recommended next steps

1. Scaffold the React + TypeScript + Vite web app and Expo app.
2. Create the shared domain models, profiles, contracts, and use cases.
3. Build the first workspace UI with mock video and compression adapters.
4. Add local file selection, metadata, thumbnails, and video previews.
5. Add the web WASM FFmpeg adapter and worker-based job queue.
6. Add output review and individual CRF re-conversion.
7. Add the Expo mobile adapter and iPhone file handling.
8. Add React Router when the second screen is introduced.
