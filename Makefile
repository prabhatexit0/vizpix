.PHONY: install build-wasm build-wasm-release dev build clean

# Install all dependencies across both workspaces
install:
	cd ui && npm install
	cd engine && cargo fetch

# Build WASM module (debug) and output into ui/src/wasm/
build-wasm:
	cd engine && wasm-pack build --target web --out-dir ../ui/src/wasm/vizpix-core --no-opt

# Build WASM module (release, optimized)
build-wasm-release:
	cd engine && wasm-pack build --target web --out-dir ../ui/src/wasm/vizpix-core --release

# Start development: build WASM then launch Vite dev server
dev: build-wasm
	cd ui && npm run dev

# Full production build
build: build-wasm-release
	cd ui && npm run build

# Clean all build artifacts
clean:
	rm -rf ui/src/wasm ui/node_modules ui/dist engine/target
