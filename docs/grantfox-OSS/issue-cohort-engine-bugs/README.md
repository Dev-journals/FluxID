# Issue #26 — Cohort Engine bugs (evidence)

Local verification for `[Bug] Cohort Engine: Cold start error, account not found, scoring data loss`.

App under test: frontend `http://localhost:3000` + backend `http://localhost:8000` (`NEXT_PUBLIC_AI_BACKEND_URL=http://localhost:8000`).

## Before (QA baseline)

Original failure modes are documented in the GrantFox QA walkthrough (PR #18 / Issue #1): cold-start `ERR_CONNECTION_CLOSED`, "Account not found" with no next steps, and "Scored 3/3 · 0.1s" while Protocol Intelligence stayed at all zeros.

## After (this branch)

| File | What it shows |
|------|----------------|
| `after-protocol-testnet.png` | Testnet Protocol page after scoring: Average Liquidity Score **52.0**, Active Wallets **1**, Risk Heatmap populated |
| `after-segment-query.png` | Custom segment returns the scored wallet (`1 match`, score 52) |
| `after-mainnet-empty.png` | Mainnet with no scored wallets uses the distinct empty copy: "No wallets scored yet…" |
| `after-account-not-found.png` | Analyze flow shows the three guidance bullets + Switch network / Account activation guide links |
| `after-add-wallets-panel.png` | Add Wallets panel with Mainnet/Testnet switcher |
| `after-protocol-page.png` | Initial Protocol load with improved empty-state messaging |

## Backend API proof (localhost)

| File | Result |
|------|--------|
| `02-score-testnet.json` | Fresh Horizon score: `durationMs: 4055`, `horizonQueried: true`, `cachedCount: 0` |
| `03-health-testnet.json` | `totalWallets: 1`, `avgScore: 52` (not zeros) |
| `05-segments-testnet.json` | Segment list returns the scored wallet |
| `06-health-mainnet.json` | Mainnet stays empty (`totalWallets: 0`) — no cross-network leak |
| `08-score-cached-hit.json` | `refresh:false` → `durationMs: 1`, `cached: true`, cache age reported |
| `09-score-refresh.json` | `refresh:true` → Horizon again (`horizonQueried: true`) |

## Builds / tests

| File | Command |
|------|---------|
| `frontend-test.txt` | `cd frontend && npm test` |
| `backend-test.txt` | `cd backend && npm test -- --run src/services/history.service.test.ts src/services/protocol.service.test.ts` |

Also verified locally:

```bash
cd frontend && npm install --legacy-peer-deps && npm run build
cd backend && npm run build
```
