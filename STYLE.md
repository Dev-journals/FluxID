# Code Style Guide - FluxID Protocol

## JavaScript / TypeScript (Frontend & Backend)

- **Formatting:** Use Prettier with standard config
- **Linting:** ESLint with recommended rules (`npm run lint` in `frontend/`)
- **Components:** Functional components with typed props
- **State:** Use React Hooks (useState, useEffect, useContext); React Query for server state
- **Styling:** Tailwind CSS utility classes
- **Async:** Use async/await, handle errors properly
- **Types:** Always define interfaces for data structures; keep scoring and response types in sync (`backend/src/types/scoring.types.ts`)
- **Routes:** Fastify route modules per domain under `backend/src/routes/`

## Rust (Soroban Contracts)

- **Formatting:** Always run `cargo fmt`
- **Errors:** Use `panic!` with clear messages inside `require_auth` and invariant checks
- **Authorization:** Always authenticate with `caller.require_auth()` / `admin.require_auth()` before state changes
- **Storage:** Prefer typed `DataKey` enums; use `instance()` for admin/registry config and `persistent()` for per-wallet state
- **Scoring Integrity:** Never accept a business-rule violation — validate `score <= 100` before persisting
- **Testing:** Write unit tests for each function; keep snapshot fixtures in `test_snapshots/` in lockstep with the live `#[test]`s

## AI Explainability

- The **rule engine (`scoring.service.ts`) is the single source of truth for numbers** (score, risk, metrics).
- The **explainability layer (`services/explainability/`)** only produces human-readable text on top — never numbers.
- LLM is primary when `ANTHROPIC_API_KEY` is present; rule-based text is the deterministic fallback.
- Always return a populated explanation (never `null`); surface `source` so consumers know which layer produced it.

## Project Conventions

### File Naming
- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts`
- Utils: `camelCase.ts`
- Types: `PascalCase.ts`
- Route modules: `kebab-case.route.ts`

### Git Commits
- Follow modular commit philosophy
- Commit after meaningful changes
- Run build/compile before committing

## Integrity Checks

- **Frontend:** `npm run lint` + `npm run build` (inside `frontend/`) before pushing
- **Backend:** `npm run build` + `npm test` (inside `backend/`) before pushing
- **Contracts:** `cargo fmt --check`, `cargo build --target wasm32v1-none --release`, and `cargo test` (inside `smartcontract/`)

---

*Always ensure the workspace is clean and compiles correctly.*