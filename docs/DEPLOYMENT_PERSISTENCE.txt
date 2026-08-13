# Making FluxID data survive restarts on Render

## The problem

The backend stores usage events, feedback, and wallet/protocol history. By
default these are append-only JSONL files on the local filesystem:

| File                     | Written by                                          |
| ------------------------ | --------------------------------------------------- |
| `events.jsonl`           | `metrics.service.ts` (wallet connects, score runs)  |
| `feedback.jsonl`         | `metrics.service.ts` (user feedback)                |
| `wallet_history.jsonl`   | `history.service.ts` (per-wallet score history)     |
| `protocol_history.jsonl` | `history.service.ts` (Protocol Intelligence cohort) |

By default they live in `<cwd>/data` — see `FLUXID_DATA_DIR` in
`metrics.service.ts` and `history.service.ts`.

On Render, that default location is on the **ephemeral filesystem**. It is
wiped:

- on every deploy (each push rebuilds a fresh container), and
- on free-tier **cold starts** — the instance sleeps after ~15 min idle and
  starts clean when it wakes.

When that happens the store is empty, so `/admin/stats` and `/admin/feedback`
honestly return all-zeros. That's what made the admin panel look like the
Refresh button was wiping data — it wasn't; the underlying files were gone.

The frontend keeps the last good snapshot on an empty refresh, but that's only
cosmetic. **To actually stop losing data, the store must live somewhere that
survives restarts.** Two ways to do that:

- **Option A — Upstash Redis (free, recommended).** No paid plan, no code
  change, works on Render's free tier. The metrics service auto-switches to
  Redis when its two env vars are present.
- **Option B — Render persistent disk (needs a paid instance).**

---

## Option A — Upstash Redis (free, recommended)

`metrics.service.ts` already supports this. When both env vars below are set it
writes usage events and feedback to Upstash Redis instead of local files; when
they're unset it falls back to JSONL. **No redeploy of code needed — just add
the env vars.**

### 1. Create a free Redis database

1. Go to <https://console.upstash.com> and sign up (free).
2. **Create Database** → any name → pick a region close to your Render region.
3. Open the database → **REST API** section → copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 2. Add them to Render

1. Backend service → **Settings → Environment → Add Environment Variable**.
2. Add both:
   ```
   UPSTASH_REDIS_REST_URL   = https://<your-db>.upstash.io
   UPSTASH_REDIS_REST_TOKEN = <your-token>
   ```
3. Save. Render redeploys. On boot the logs will show
   `Metrics store: Upstash Redis (durable)` — that confirms it switched.

### 3. Verify

```bash
# record an event
curl -X POST https://<your-backend>/events \
  -H 'content-type: application/json' \
  -d '{"type":"wallet_connect","wallet":"GABC...","network":"testnet"}'

# confirm it's counted
curl https://<your-backend>/admin/stats
```

Then trigger a manual redeploy (or let the instance cold-start) and hit
`/admin/stats` again — the count should **persist** instead of resetting to
zero. That's the durable proof you need for the 10+ wallet-interactions
screenshot.

> Free-tier Upstash allows a generous daily command quota — far more than a
> demo/campaign needs. Usage events and feedback are tiny.

---

## Option B — Render persistent disk (paid instance)

If you're already on a paid Render instance, a mounted disk also works and
keeps the JSONL files.

1. Backend service → **Settings → Disks → Add Disk**:
   - **Name:** `fluxid-data` (any name)
   - **Mount Path:** `/var/data`
   - **Size:** `1 GB` (JSONL is tiny)
2. **Settings → Environment** → add:
   ```
   FLUXID_DATA_DIR = /var/data
   ```
   Must match the mount path exactly. The backend does `mkdir -p` on startup.
3. Save and redeploy. Verify with the same curl steps as Option A.

> Persistent disks require a **paid instance type** — free-tier services can't
> attach one. That's why Option A (Upstash) is the recommended free path.

---

==================================================

## On-chain score save — "Contract not configured"

==================================================

When you click **Save on-chain** on the dashboard and get `Contract not
configured`, that is **not a frontend bug**. The button faithfully relays a
message the backend returned. Here's the whole chain.

### What happens on click

1. Frontend `lib/onchain.ts` (`syncOnChain`) → `POST {AI_BACKEND_URL}/wallet/:wallet/sync`
   with the selected `network` in the body.
2. Backend `ContractService.isConfigured()` (`contract.service.ts:89`) checks
   that **both** a contract ID and an oracle signing key are present. If either
   is missing it returns exactly `"Contract not configured"`
   (`contract.service.ts:280`) — which the UI shows as a toast.

### The two values it needs

| Needs                         | Sourced from                                                         | Notes                                                             |
| ----------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `contractId`                  | `MAINNET_CONTRACT_ID` **or** `TESTNET_CONTRACT_ID`                   | picked by the network you analyzed on (`stellar.config.ts:17,23`) |
| `adminSecret` (oracle signer) | `ORACLE_SECRET_KEY` → `ADMIN_SECRET_KEY` → `FLUXID_ADMIN_SECRET_KEY` | first one set wins (`contract.service.ts:82`)                     |

The oracle key is what signs the `set_score` transaction — the contract stores
the score, risk, timestamp and a hash of the scoring inputs, then emits a
`score_set` event. No user wallet signature and no admin approval is involved;
the backend is a registered oracle and signs it itself.

### Current state (as of this campaign)

- The Soroban contract is deployed to **testnet only**. `TESTNET_CONTRACT_ID`
  is set; `MAINNET_CONTRACT_ID` is not.
- So analyzing a **mainnet** wallet and clicking Save on-chain hits the missing
  mainnet config → `Contract not configured`. On **testnet** the full flow
  works (save, event, verify).

### Decision — stay testnet-only for now

We are **not** deploying to mainnet during the test campaign, because:

- **Real cost.** Mainnet needs a funded oracle account holding real XLM to pay
  fees on every `set_score`. Testnet uses free faucet XLM.
- **Test phase, not launch.** Testnet exercises the identical flow (stamp,
  event, verification). The demo gains nothing from real-money writes.
- **Key exposure.** A mainnet oracle secret in Render env is a real-value
  target; not worth it until mainnet writes are actually needed.
- **Nothing rots.** The mainnet path is already coded — enabling it later is
  purely a config switch, no code change.

### Graceful UX (shipped)

`app/components/OnChainSync.tsx` now detects a **mainnet** analysis and, instead
of letting the click fail with the raw backend error, renders a disabled
pill: **"On-chain save · testnet only"** with a tooltip explaining to switch to
testnet. The testnet flow is unchanged. Testers on mainnet see it's
intentional, not broken.

### Enabling mainnet later (when you get there)

No code change needed — set these on the backend host (Render) and redeploy:

```
MAINNET_CONTRACT_ID = <deployed mainnet contract id>
ORACLE_SECRET_KEY   = <funded mainnet oracle account secret>
```

The oracle account must exist and hold enough XLM for transaction fees on
mainnet. Then flip the `isMainnet` gate in `OnChainSync.tsx` (or generalize it
to read a `configured` flag from the backend) so the button re-enables on
mainnet.

> Never commit the oracle secret. It belongs only in the host's env, alongside
> the other secrets — the same rule as the Upstash token above.

---

## One caveat — payment requests

`payment.service.ts` writes `.payment-requests.json` to `process.cwd()`
directly, **not** to Redis or `FLUXID_DATA_DIR`. These are short-lived payment
challenges (they expire via TTL), so losing them on restart is low-impact — a
user just requests a fresh challenge. Neither option above changes this, and
none is required for the metrics/feedback durability fix.
