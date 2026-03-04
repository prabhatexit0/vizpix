.PHONY: install build-wasm build-wasm-release dev build clean lint lint-rust format format-check test check

# Install all dependencies across both workspaces
install:
	cd ui && npm install
	cd engine && cargo fetch
	npx lefthook install

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

# Run all linters (TS + Rust)
lint: lint-rust
	cd ui && npx eslint .

# Rust linting
lint-rust:
	cd engine && cargo fmt --check
	cd engine && cargo clippy -- -D warnings

# Format all code (TS + Rust)
format:
	cd ui && npx prettier --write .
	cd engine && cargo fmt

# Check formatting without writing
format-check:
	cd ui && npx prettier --check .
	cd engine && cargo fmt --check

# Run all tests
test:
	cd ui && npx vitest run

# Run everything CI runs (format-check + lint + typecheck + test + build)
check: format-check lint
	cd ui && npx tsc --noEmit
	cd ui && npx vitest run
	$(MAKE) build
