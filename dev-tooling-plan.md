# Dev Tooling & Maintainability Plan

What we have today: ESLint, strict TypeScript, Vite, a Makefile, and decent file organization.
What's missing: formatting enforcement, git hooks, CI, tests, and documented conventions that both humans and AI agents can follow.

This plan is ordered by impact-to-effort ratio. Each section is a standalone chunk of work.

---

## 1. CLAUDE.md — AI Agent Context File

**Why:** AI agents (Claude Code, Copilot, Cursor) look for this file first. It's the single highest-leverage thing for AI-assisted development. Humans benefit too since it doubles as a quick-reference conventions doc.

**What goes in it:**
- Project structure summary (what lives where)
- Build/run commands (`make dev`, `make build`, `make install`)
- Code conventions (naming, file organization, patterns — see section 4)
- "Don't do this" rules (e.g., don't add barrel exports, don't add comments to obvious code)
- Store architecture: how slices work, how to add a new slice
- WASM boundary: what Rust handles vs what TypeScript handles

**Rules for this file:**
- Keep it under 150 lines. If it's too long nobody reads it (including agents).
- No aspirational content — only describe what IS, not what should be.
- Update it when conventions change.

---

## 2. Prettier — Formatting That Nobody Argues About

**Why:** ESLint catches logic issues but doesn't enforce formatting. Right now two contributors can write valid code that looks completely different. Prettier removes all formatting decisions.

**Setup:**
- `prettier` + `eslint-config-prettier` (disables ESLint rules that conflict)
- Single `.prettierrc` in `ui/`:
  ```json
  {
    "semi": false,
    "singleQuote": true,
    "trailingComma": "all",
    "printWidth": 100,
    "tabWidth": 2,
    "plugins": ["prettier-plugin-tailwindcss"]
  }
  ```
- `prettier-plugin-tailwindcss` to auto-sort Tailwind classes (eliminates a whole class of inconsistency)
- Add `format` and `format:check` scripts to `package.json`
- One-time `npx prettier --write .` to normalize everything, committed as a standalone "format" commit

**Effort:** ~30 min setup + one bulk-format commit.

---

## 3. Git Hooks via `lefthook` — Catch Problems Before They Land

**Why:** Without hooks, lint/format rules are suggestions. With hooks, they're enforced.

**Why lefthook over husky:** Zero dependencies (single binary), faster, config is a single YAML file, works in monorepos natively. No `node_modules/.cache/husky` weirdness.

**Setup:**
- Install `lefthook` (available via npm, brew, or binary)
- `lefthook.yml` at repo root:
  ```yaml
  pre-commit:
    parallel: true
    commands:
      lint:
        root: "ui/"
        glob: "*.{ts,tsx}"
        run: npx eslint {staged_files}
      format:
        root: "ui/"
        glob: "*.{ts,tsx,css,json}"
        run: npx prettier --check {staged_files}
      typecheck:
        root: "ui/"
        run: npx tsc --noEmit
      rust-check:
        root: "engine/"
        glob: "*.rs"
        run: cargo clippy -- -D warnings
  ```
- Add `lefthook install` to `make install` target

**Effort:** ~20 min.

---

## 4. Code Conventions — Write Once, Follow Everywhere

These aren't aspirational. They describe what the codebase already mostly does, plus a few tightenings. Put them in `CLAUDE.md` and enforce what's automatable via ESLint rules.

### Naming
| Thing | Convention | Example |
|-------|-----------|---------|
| Components | PascalCase, match filename | `EditorCanvas` in `editor-canvas.tsx` |
| Hooks | `use` prefix, camelCase | `useCanvasCompositor` |
| Store slices | `create*Slice` | `createLayersSlice` |
| Types/Interfaces | PascalCase, no `I` prefix | `Layer`, `LayerTransform` |
| Constants | UPPER_SNAKE_CASE | `ZOOM_MIN`, `HISTORY_MAX` |
| Utilities | camelCase functions | `decodeBitmap`, `exportToPng` |
| Files | kebab-case | `editor-canvas.tsx`, `canvas-utils.ts` |
| CSS classes | Tailwind only, no custom class names | — |

### File Organization
- One component per file. The filename IS the documentation of what's inside.
- Co-locate: if a util is only used by one component, it lives next to that component, not in `lib/`.
- `lib/` is for utilities shared across 2+ features.
- `components/ui/` is shadcn only — never put custom components here.
- New features get their own directory under `components/` (e.g., `components/crop/`).

### Patterns
- **State:** All app state goes through Zustand store slices. No `useState` for shared state.
- **Component-local state:** `useState`/`useRef` is fine for UI-only state (hover, open/closed, local input values).
- **Side effects in hooks:** Canvas rendering, keyboard listeners, pointer interactions — always as custom hooks, never inline in components.
- **No barrel exports:** Import from the actual file, not from an `index.ts`. Exception: `store/index.ts` which exports the single `useEditorStore` hook.
- **No `any`:** Already enforced by strict TS. If you need escape hatches, use `unknown` and narrow.

### What NOT to Do
- Don't add JSDoc to obvious functions. `addLayer(layer: Layer)` doesn't need a docstring.
- Don't create wrapper components for single-use layouts.
- Don't abstract things used only once. Three similar lines > one premature abstraction.
- Don't put WASM calls directly in components — they go through the store's wasm slice.

---

## 5. Vitest — Testing That Actually Runs

**Why:** Zero test coverage today. We don't need 90% coverage, but we need tests for the things that break — store logic, utils, and the WASM boundary.

**Setup:**
- `vitest` (already uses Vite config, zero extra setup)
- `@testing-library/react` for component tests if needed later
- Test files live next to source: `layers-slice.test.ts` next to `layers-slice.ts`
- Add to `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`

**What to test first (in priority order):**
1. **Store slices** — `layers-slice`, `history-slice`, `viewport-slice`. These are pure functions with clear inputs/outputs. Highest ROI.
2. **Utils** — `export-utils`, `canvas-utils`, `layer-factory`. Small, testable, critical.
3. **WASM functions** — `invert_colors`, `adjust_image`, `apply_filter`. Catches Rust regressions before they hit the browser.

**What NOT to test:**
- shadcn/ui components (tested upstream)
- CSS/layout (use your eyes)
- Simple passthrough components

**Effort:** ~1 hour for setup + first batch of store tests.

---

## 6. GitHub Actions CI — The Safety Net

**Why:** Hooks protect the happy path. CI protects against `--no-verify`, new contributors, and AI agents that skip hooks.

**Single workflow file** `.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo install wasm-pack
      - run: make install
      - run: make build-wasm
      - run: cd ui && npx tsc --noEmit
      - run: cd ui && npx eslint .
      - run: cd ui && npx prettier --check .
      - run: cd ui && npx vitest run
      - run: cd ui && npx vite build
```

Keep it as one job until it gets slow. Splitting into parallel jobs is premature optimization for a project this size.

**Effort:** ~30 min. Mostly waiting for the first green run.

---

## 7. `rustfmt` + `clippy` — Rust Side Consistency

**Why:** Same reasoning as Prettier but for Rust. `rustfmt` handles formatting, `clippy` catches common mistakes.

**Setup:**
- `rustfmt.toml` in `engine/`:
  ```toml
  edition = "2021"
  max_width = 100
  ```
- `clippy` is already installed with the Rust toolchain
- Add to Makefile:
  ```makefile
  lint-rust:
  	cd engine && cargo fmt --check
  	cd engine && cargo clippy -- -D warnings
  ```
- Already covered by the lefthook config in section 3

**Effort:** ~10 min.

---

## 8. `.editorconfig` — Consistency Across Editors

**Why:** Not everyone uses VS Code. This ensures basic settings (indentation, line endings, trailing whitespace) are consistent regardless of editor.

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.rs]
indent_size = 4

[Makefile]
indent_style = tab
```

**Effort:** 5 min.

---

## 9. Makefile Improvements

The current Makefile is good. A few additions to make it the single entry point for everything:

```makefile
lint:        ## Run all linters (TS + Rust)
format:      ## Format all code (TS + Rust)
format-check:## Check formatting without writing
test:        ## Run all tests
check:       ## Run everything CI runs (format-check + lint + typecheck + test + build)
```

The `check` target is the "run this before pushing" command. It mirrors CI exactly, so you never get surprised by a red build.

**Effort:** 15 min.

---

## 10. VSCode Workspace Settings (Optional)

A `.vscode/settings.json` committed to the repo so VS Code users get sensible defaults:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer"
  }
}
```

Add a `.vscode/extensions.json` recommending `prettier`, `eslint`, `rust-analyzer`, and `tailwindcss`.

**Effort:** 10 min.

---

## Implementation Order

| Phase | Items | Total Effort |
|-------|-------|-------------|
| **Phase 1: Foundations** | `.editorconfig`, Prettier (+ bulk format), `CLAUDE.md` | ~1 hour |
| **Phase 2: Enforcement** | lefthook, Makefile improvements, rustfmt/clippy | ~45 min |
| **Phase 3: Testing** | Vitest setup, first store slice tests | ~1.5 hours |
| **Phase 4: CI** | GitHub Actions workflow, VSCode settings | ~45 min |

Total: ~4 hours of actual work spread across 4 PRs.

---

## What This Plan Deliberately Skips

- **Monorepo tools (nx, turborepo):** Two packages don't need a monorepo framework. The Makefile is fine.
- **Storybook:** Not enough UI components to justify the overhead. Revisit if the component library grows.
- **E2E tests (Playwright, Cypress):** Canvas-based apps are hard to E2E test meaningfully. Manual testing + unit tests on store/utils is the better tradeoff right now.
- **Commit message linting (commitlint):** Nice in theory, annoying in practice for a small team. Good commit messages come from good habits, not tooling.
- **Code coverage thresholds:** Coverage targets incentivize writing bad tests. Write tests for things that break.
- **Auto-generated docs:** The code should be readable without generated docs. `CLAUDE.md` + type signatures is enough.
