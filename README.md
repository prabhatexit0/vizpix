# Vizpix

Browser-native image editor. Layer-based compositing with blend modes, filters, and adjustments — all client-side, no server.

## Stack

- **UI:** React 19, Vite, Tailwind CSS, shadcn/ui
- **Engine:** Rust compiled to WebAssembly via wasm-pack
- **State:** Zustand (modular slices)

## Quick Start

```bash
make install   # install npm + cargo dependencies
make dev       # build WASM, start Vite dev server
```

## Project Structure

```
vizpix/
├── ui/          # React frontend
│   └── src/
│       ├── components/   # UI components (canvas, layout, panels, dialogs)
│       ├── hooks/        # Canvas compositor, interactions, shortcuts
│       ├── store/        # Zustand store with slices
│       ├── lib/          # Utilities, constants, export logic
│       └── wasm/         # WASM bindings (generated)
├── engine/      # Rust WASM library (image processing, filters)
└── Makefile     # Build orchestration
```

## Make Targets

| Command | Description |
|---------|-------------|
| `make install` | Install all dependencies |
| `make dev` | Build WASM + start dev server |
| `make build` | Production build |
| `make build-wasm` | Build WASM only (debug) |
| `make clean` | Remove all build artifacts |

## Features

- Layer management (add, reorder, duplicate, lock, visibility)
- Transform layers (move, resize, rotate)
- 12 blend modes
- WASM-powered filters and adjustments (brightness, contrast, saturation)
- Canvas size presets (social media, standard, square)
- Export to PNG / JPEG
- Undo / redo
- Responsive layout (desktop sidebar + mobile drawer)
