# Contributing to FluxID Protocol

Thank you for your interest in building the liquidity intelligence layer on Stellar — turning any wallet into a real-time, explainable financial identity! This guide will help you contribute effectively.

## 🛠 Tech Stack

- **Smart Contracts:** Soroban (Rust) — `liquidity_identity` + `oracle_registry`
- **Backend:** Node.js (Fastify, TypeScript) — Horizon API, scoring engine, on-chain storage
- **AI Explainability:** Anthropic Claude (with a rule-based fallback, deterministic)
- **Frontend:** Next.js, TypeScript, Tailwind CSS, Freighter Wallet
- **Data:** Stellar SDK, Horizon API, Soroban RPC

## 📝 Commit Guidelines

We follow a **Modular Commit** philosophy to ensure history is readable and revertable.

**The Golden Rule:**
> "Commit after every meaningful change, not every line."

- **Meaningful Change:** Completing a function, finishing a fix, adding a feature block, creating a file, or making a significant modification.
- **Avoid:** Micro-commits for single-line edits unless they are standalone fixes.
- **Frequency:** Commit often, but only when you finish a logical piece of work.

### Example Commit Messages

- `feat(contract): add oracle authorization check to set_score`
- `fix(scoring): normalize inflow outliers before scoring`
- `feat(explainability): surface rule-based fallback when LLM is unavailable`
- `docs: update contract route reference`

## 📋 Issue Tracking

1. Pick an issue from the GitHub Issues tab or from the `docs/` folder.
2. When you start, comment on the issue or mark it as "In Progress".
3. **When Completed:** You MUST update the issue with:
   - A note describing the resolution
   - Append your GitHub username and Date/Time.
   - *Example:* `Resolved: oracle registry fallback handling (@bbkenny - 2025-02-14 10:00)`

## 🧪 Development Workflow

1. **Clone**: Clone the repo locally.
2. **Branch**: Create a feature branch (`feat/my-feature`).
3. **Develop**: Write code following the Style Guide (`STYLE.md`).
4. **Test**:
   - Contracts: `cargo test` (inside `smartcontract/`)
   - Backend: `npm test` (inside `backend/`)
   - Frontend: `npm test` (inside `frontend/`)
5. **Build / Lint**:
   - Contracts: `cargo build --target wasm32v1-none --release`
   - Backend: `npm run build`
   - Frontend: `npm run build` and `npm run lint`
6. **Commit**: Follow the commit guidelines above.

> **Note:** The score is always produced by the deterministic rule engine; the
> AI layer only explains — never computes numbers. Keep both layers N+1-consistent
> in any change that touches scoring.

## Getting Help

Read the **Documentation** located in the `docs/` directory and the repo `README.md` for detailed setup instructions.

---

*Help us build on-chain liquidity identity: behavior, not guesswork!*