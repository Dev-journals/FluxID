# QA Report — Cohort & Segmentation Engine

**Issue:** #7  
**Tester:** Josie123-Dev  
**Date:** 2026-08-18  
**App under test:** https://fluxid.vercel.app/dashboard/protocol  
**Backend observed:** `https://fluxid.onrender.com`  
**Screenshots:** [`docs/grantfox-OSS/issue7-QA_cohort_segmentation/`](../grantfox-OSS/issue7-QA_cohort_segmentation/)

---

## Scope

Manual walkthrough of `/dashboard/protocol` — Cohort Engine card:

- Quick segments (preset filters with counts + progress bars)
- Custom segment query (min/max score, risk, activity, consistent flag)
- Counts returned vs wallet list (spot-check)
- Empty state when no wallets match
- Console errors, stale data after filter changes

No source files were modified for this submission.

---

## Wallets exercised

| Network | Address | Backend score | Risk | Notes |
|---------|---------|---------------|------|-------|
| mainnet | `GCSFXEGBZIRU5FEATF4U5L3U3NHZOUUTINQZSZIRLBC4II7Y5IHAJR5Z` | 0 | — | Scored 3/3 in 0.1s but all metrics returned zero |
| mainnet | `GB2WIXKPTBJWVNN5O3V474KB3LH7F7ZSOAOJ3HH7HAY2IFTHROBFDUHJ` | 0 | — | Same — scored but no data in cohort engine |
| mainnet | `GBHMIHBTFTZIPJLGAPF3ME7X3BEAWESZCN5G4TLA5U2YQBVPYABXYI7B` | 0 | — | Same — scored but no data in cohort engine |

All three wallets were submitted on mainnet. The app confirmed "Scored 3/3 · 0.1s" but every downstream metric remained at zero.

---

## Acceptance criteria

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Quick segments render with correct counts and progress bars | **FAIL** | All four quick segments (High Trust, Steady Earners, At Risk, Dormant Wallets) show count 0 after 3 wallets were scored. No progress bars rendered. |
| Custom segment query works (min score, max score, risk, activity, consistent flag) | **FAIL** | Default query (min 1, max 100, any risk, any activity) returns "0 matches" with message "No wallets match these criteria yet." |
| Counts match expectations (spot-check one segment) | **FAIL (blocked)** | Cannot spot-check — all counts are 0 despite 3 wallets being scored. |
| Empty state when no wallets match filters | **Pass** | Empty state displays "No wallets match these criteria yet." — clean message, no crash. However, this is also the state even when wallets SHOULD have matched, so the empty state may be masking a data pipeline bug. |
| No console errors, no stale data after changing filters | **TODO** | Need to verify console output. |
| Screenshots: one per segment + one for custom query result | **Partial** | Full page screenshot captured showing all zeros. Individual segment screenshots not needed since all show identical 0 state. |

---

## Findings

| ID | Severity | Area | Description |
|----|----------|------|-------------|
| BUG-01 | **CRITICAL** | Backend availability | First visit returned `net::ERR_CONNECTION_CLOSED` when the frontend called `https://fluxid.onrender.com/protocol/wallets`. Backend appeared to be sleeping (Render free-tier cold start) or crashed. Connection dropped before any response was received. Retrying after 1-2 minutes resolved the issue. |
| BUG-02 | **MEDIUM** | Error messaging | After backend reconnected, the app showed "Account not found on this network" for the connected wallet. The message does not guide the user to try a different network or a wallet with transaction history. |
| BUG-03 | **CRITICAL** | Cohort Engine — data pipeline | After scoring 3 wallets (app confirmed "Scored 3/3 · 0.1s"), the entire Cohort Engine shows zero data: Average Liquidity Score 0.0, Active Wallets Monitored 0, Low Risk User-Base 0%, High Risk Alerts 0. All four quick segments (High Trust, Steady Earners, At Risk, Dormant Wallets) show count 0. Risk Heatmap displays "No scored wallets yet." Custom segment query with default filters returns "0 matches." The scoring endpoint appears to succeed but the cohort engine receives no wallet data. |
| BUG-04 | **MEDIUM** | Scoring speed | Scoring completed in 0.1s for 3 wallets, which is suspiciously fast. May indicate the backend returned immediately without actually querying blockchain data, resulting in empty/null scores that the cohort engine correctly displays as zeros. |
| OBS-01 | **LOW** | Cohort Engine — empty state ambiguity | The empty state message "No wallets match these criteria yet" is the same message shown whether (a) no wallets have been scored yet, or (b) wallets were scored but the cohort engine has no data. This makes it impossible for the user to distinguish between "I haven't scored anything" and "something went wrong." |

---

## Walkthrough notes

### Backend cold start — ERR_CONNECTION_CLOSED

- First attempt to load `/dashboard/protocol` failed immediately.
- DevTools Network tab showed the request to `https://fluxid.onrender.com/protocol/wallets` with status `(failed)` and error `net::ERR_CONNECTION_CLOSED`.
- Waited approximately 1-2 minutes, refreshed, and the backend responded.
- This is a known issue with Render free-tier hosting but impacts UX significantly.

Screenshot: `01-err-connection-closed.png`

### Account not found on current network

- After backend recovered, connected wallet and attempted to score.
- App displayed: "Account not found on this network."
- The wallet may not have had activity on the queried network.
- No guidance was given to switch networks or try a different wallet.

Screenshot: `02-account-not-found.png`

### Scoring 3 wallets — all metrics zero

- Pasted three mainnet Stellar addresses into the wallet input field on the mainnet tab.
- Clicked "Score & Add" — app responded with "Scored 3/3 · 0.1s".
- After scoring completed, the entire Cohort Engine remained at zero:
  - Average Liquidity Score: 0.0
  - Active Wallets Monitored: 0
  - Low Risk User-Base: 0%
  - High Risk Alerts: 0
- Risk Heatmap: "No scored wallets yet — heatmap will populate as wallets are analyzed."
- All four quick segments: High Trust 0, Steady Earners 0, At Risk 0, Dormant Wallets 0
- Custom segment query (min 1, max 100, any risk, any activity): "0 matches — No wallets match these criteria yet."
- The "reset protocol data" button is visible but was not clicked during this test.

Screenshot: `03-scored-3-of-3-all-zeros.png`

### Quick segments

All four quick segments showed count 0 after scoring:
- High Trust: 0
- Steady Earners: 0
- At Risk: 0
- Dormant Wallets: 0

No progress bars rendered. This is the primary bug — the cohort engine is completely non-functional.

### Custom segment query

Default query settings used:
- Min Score: 1
- Max Score: 100
- Risk: Any
- Activity: Any
- Consistent risk: unchecked

Result: "0 matches — No wallets match these criteria yet."

Tried clicking "Find Wallets" multiple times — same result each time.

### Empty state

The empty state is technically handled (no crash, clean message), but it is the DEFAULT state even after wallets are scored. This means the empty state feature cannot be properly verified — it may be the only state the app ever shows.

---

## Must-do checklist

- [x] QA report at `docs/qa-reports/qa-cohort-segmentation-Josie123-Dev.md`
- [ ] Screenshots under `docs/grantfox-OSS/issue7-QA_cohort_segmentation/`
- [ ] Tx hash where money/state moves (if applicable)
- [ ] Google Form https://forms.gle/kLYwDRdJo8WV1RTE7
- [ ] In-app feedback sent once
- [ ] Unique walkthrough (own wallets/screenshots)
- [ ] PR with `Closes #7` + issue comment tagging `@thebabalola`

---

## Suggested maintainer fixes (out of QA scope)

1. **Fix cohort engine data pipeline** — scoring returns "3/3" but cohort engine receives no data. Check whether the scored wallets are being stored in state/context that the Cohort Engine reads from.
2. **Investigate 0.1s scoring time** — if the backend is returning empty scores immediately without querying blockchain data, the cohort engine will always show zeros.
3. Improve cold start experience — consider a loading spinner or "waking up server" message when the backend is unreachable.
4. Improve "Account not found" error to suggest switching networks or trying an active wallet.
5. Differentiate empty state messages — distinguish "no wallets scored yet" from "wallets scored but no matches."
