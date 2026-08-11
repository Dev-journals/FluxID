# FluxID — Backend

**Liquidity Identity Layer on Stellar** — Node.js scoring engine with AI integration.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933)](https://nodejs.org)
[![Stellar](https://img.shields.io/badge/Built%20on-Stellar-14B48E)](https://stellar.org)
[![AI](https://img.shields.io/badge/AI-Anthropic%20Claude-orange)](https://anthropic.com/)

---

## Overview

Backend provides the **scoring engine** that calculates liquidity scores from Stellar transactions and enriches them with AI insights.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/score/{wallet}` | Get liquidity score |
| GET | `/paid/score/{wallet}` | Paid request (X402) |
| POST | `/paid/verify/{requestId}` | Verify payment |
| GET | `/health` | Health check |

---

## Stellar Integration

### Horizon API

| File | What It Does |
|------|------------|
| [horizon.service.ts](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/services/horizon.service.ts#L7) | Horizon API client |
| [getPayments()](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/services/horizon.service.ts#L36) | Fetch wallet payments |
| [Swap filtering](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/services/horizon.service.ts#L62) | Exclude self-swaps |
| [stellar.types.ts](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/types/stellar.types.ts) | Type definitions |

### Soroban Contract

| File | What It Does |
|------|------------|
| [contract.routes.ts](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/routes/contract.routes.ts) | Contract interaction |
| [publishScore()](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/routes/contract.routes.ts#L35) | Store score on-chain |
| [getScore()](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/routes/contract.routes.ts#L71) | Read from contract |

---

## AI Integration

### Claude AI

| File | What It Does |
|------|------------|
| [llm.ts](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/services/explainability/llm.ts#L10) | Anthropic Claude API |
| [DEFAULT_MODEL](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/services/explainability/llm.ts#L11) = `claude-haiku-4-5-20251001` |
| [index.ts](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/services/explainability/index.ts) | Entry point |
| [mcp.routes.ts](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/routes/mcp.routes.ts#L10) | AI explainability layer |

**What Claude analyzes:**
- Transaction patterns
- Volume trends
- Risk factors
- Behavior suggestions

---

## X402 Payment Flow

| File | What It Does |
|------|------------|
| [paid.routes.ts](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/routes/paid.routes.ts) | X402 endpoints |
| [HTTP 402](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/routes/paid.routes.ts#L184) | Payment required response |
| [payment.service.ts](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/services/payment.service.ts) | On-chain verification |

---

## Scoring Engine

### Core Functions

| File | What It Does |
|------|------------|
| [scoring.service.ts](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/services/scoring.service.ts) | Main scoring logic |
| [scoring.ts utils](https://github.com/StellarVhibes/FluxID/blob/main/backend/src/utils/scoring.ts) | Rule-based calculations |

### Factors Analyzed

| Factor | Description |
|--------|------------|
| Inflow Consistency | Regularity of incoming funds |
| Outflow Stability | Predictability of spending |
| Transaction Frequency | Activity level |
| Flow Stability | Consistent patterns over time |

---

## Tech Stack

| Technology | Usage |
|------------|-------|
| Node.js 18+ | Runtime |
| TypeScript | Type safety |
| Fastify | HTTP server |
| Stellar SDK | Blockchain interaction |
| Anthropic Claude | AI insights |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port |
| `HORIZON_URL` | Stellar Horizon URL |
| `ANTHROPIC_API_KEY` | Claude AI key |
| `PAYMENT_RECEIVE_ADDRESS` | X402 payment receiver |

---

## Getting Started

```bash
npm install
cp .env.example .env
npm run dev
```

---

## Related

- [FluxID Frontend](https://github.com/StellarVhibes/FluxID) - Next.js PWA
- [FluxID Smart Contracts](https://github.com/StellarVhibes/FluxID) - Soroban contracts

---

*Built on Stellar by @bbkenny*