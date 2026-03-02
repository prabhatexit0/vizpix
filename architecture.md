# Vizpix: Architecture & Implementation Guide

## Project Context
Vizpix is a standalone, browser-native media editing application. It allows users to edit photos, stitch multiple images together into a sequence, and export the result as a GIF or MP4. All processing happens strictly on the client-side utilizing WebAssembly; there is no backend server.

## Core Tech Stack
* **Frontend:** React 19 built with Vite.
* **Styling:** TailwindCSS and `shadcn/ui`.
* **WASM Engine:** Rust compiled to `cdylib` via `wasm-pack`.
* **Image Processing (Rust):** `image` crate (transformations, filters) and `gif` crate (GIF encoding).
* **Video Export (JS/WASM):** `@ffmpeg/ffmpeg` (FFmpeg.wasm) for in-browser MP4 encoding.
* **Orchestration:** `Make` for all cross-ecosystem build and dev scripts.

## Monorepo Organization
The repository is structured as a lightweight monorepo separating the frontend from the systems-level code.



* `/` (Root): Contains global configurations, `.gitignore`, and the `Makefile`.
* `/web`: The Vite + React frontend workspace.
* `/wasm-engine`: The Rust library workspace.

## Orchestration (Makefile)
The `Makefile` at the root acts as the sole task runner for the project. The LLM should configure the following targets:
* `make install`: Installs Node dependencies in `/web` and fetches Cargo crates in `/wasm-engine`.
* `make build-wasm`: Runs `wasm-pack build` with appropriate target settings (e.g., `web` or `bundler`) and outputs the pkg to a directory consumable by the Vite app.
* `make dev`: Concurrently watches Rust files for WASM recompilation and runs the Vite development server.
* `make build`: Produces the final production-ready WASM bundle and Vite static site.

## Architecture & Data Flow
The architectural priority is keeping heavy data manipulation off the JavaScript main thread.



1. **Input:** The React frontend handles file selection and reads files as `Uint8Array` buffers.
2. **Processing:** Pointers to these byte arrays are passed into the Rust WASM memory space. Rust performs pixel manipulation (crop, filter, adjust) without copying the data back and forth unnecessarily.
3. **Preview:** Rust passes the processed byte array back to the JS thread to be rendered onto a hidden HTML `<canvas>` or object URL for the user to preview.
4. **Export:** For GIFs, an array of processed frames is passed back to Rust to be encoded into a single GIF blob. For MP4s, the frames are piped into FFmpeg.wasm within the browser to output the video file.

## UX & UI Constraints
* **Mobile-First:** Target a mobile viewport. Assume 70% mobile usage. The UI must feel like a native iOS/Android application.
* **Component Strategy:** Traditional desktop modals are strictly forbidden. Utilize bottom sheets (Drawers) and Sliders from `shadcn/ui` for all editing controls.
* **Layout:** The top 60% of the screen is dedicated to the canvas/preview area. The bottom section houses the horizontal scrolling timeline and toolbars.

## Execution Directives for the LLM
Do not generate the entire codebase at once. Use this document as your architectural anchor and wait for my specific commands to implement the following phases step-by-step:
1. **Phase 1: Scaffolding.** Setting up the folder structure, `Makefile`, Vite config, and Cargo.toml.
2. **Phase 2: The WASM Bridge.** Establishing the memory passing between React and Rust with a simple "invert colors" proof-of-concept.
3. **Phase 3: Mobile UI.** Building the responsive canvas, bottom navigation, and `shadcn` Drawer components.
4. **Phase 4: Single Image Engine.** Implementing crop, rotate, and basic filters in Rust.
5. **Phase 5: The Stitcher.** Building the timeline UI, integrating the Rust GIF encoder, and hooking up FFmpeg.wasm for MP4 export.
