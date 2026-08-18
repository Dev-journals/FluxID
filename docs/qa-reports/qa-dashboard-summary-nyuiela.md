# QA Report — Dashboard score summary + on-chain save

**Issue:** [#6](https://github.com/StellarVhibes/FluxID/issues/6)  
**Tester:** nyuiela  
**Date:** 2026-08-17 (sync re-checked 2026-08-18)  
**App under test:** https://fluxid.vercel.app/dashboard  
**Backend observed:** `https://fluxid.onrender.com`  
**Screenshots:** [`docs/grantfox-OSS/issue6-QA_dashboard_summary/`](../grantfox-OSS/issue6-QA_dashboard_summary/)

---

## Scope

Manual walkthrough of `/dashboard` after wallet analysis:

- Score orb + risk color
- Risk badge, Recent Flow, Score Breakdown, Top Risk Factors, Suggestions
- Testnet **Save on-chain** (tx hash)
- Give Feedback / Join Beta CTAs
- Suggestion consistency vs score

No source files were modified for this submission.

---

## Wallets exercised

| Network | Address | Backend score | Risk | Notes |
|---------|---------|---------------|------|-------|
| mainnet | `GAVA7FY3KBXJVZDBX254LPM53YXRUEVLM5BXMXZOC7ZIW3HXFP6LT4SR` | 42 | Medium | Seed list wallet; 200 txs |
| mainnet | `GBACI4PCHZQXZFAADCMG4TICARUDZAGF5CI3A4RPTD7SOSW2VPKLGDCX` | 32 | High | Seed list wallet; 62 txs |
| testnet | `GBPIMUEJFYS7RT23QO2ACH2JMKGXLXZI4E5ACBSQMF32RKZ5H3SVNL5F` | 7 | High | Used for Save on-chain |

No **Low** (≥70) wallet appeared in `docs/demo-wallets.txt` or the short additional mainnet probes I ran during this session. Low=green was therefore not screenshot-verified live; Medium=yellow and High=red were.

---

## Acceptance criteria

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Score orb uses correct risk color (Low green / Medium yellow / High red) | **Partial** | Medium → yellow `#eab308` (wallet GAVA…). High → red `#ef4444` (GBACI…, GBPIMU…). Low not found in session. **Also:** center number often stuck at `0` while the ring already uses the real score (see BUG-01). |
| Risk badge, Recent Flow, Score Breakdown, Top Risk Factors, Suggestions all render | **Pass** | All five areas populated after Analyze on each wallet above. Top Risk Factors correctly picks the two lowest breakdown bars. |
| Testnet Save on-chain writes score + capture tx hash | **Fail (blocker)** | Button appears on testnet. Click → backend returns DNS failure; no tx hash. See BUG-02 + `05-sync-api-response.json`. |
| Give Feedback → Google Form; Join Beta → in-app widget | **Pass** | Give Feedback `href` = `https://forms.gle/kLYwDRdJo8WV1RTE7` (`target=_blank`). Join Beta opens the floating “Send feedback” modal (stars + textarea). |
| Suggestions match the score (no contradictions) | **Pass (with note)** | High/Medium suggestions matched weak inflow / concentration / consistency themes. They did **not** contradict the risk badge. Separate narrative conflict exists between **Behavior Insight** and **Recent Flow** (BUG-03) — not the suggestion list itself. |
| Screenshots: score summary + on-chain save success (with tx hash) | **Partial** | Score summaries captured (`01` Medium, `02`/`03` High, `04`/`06` testnet). On-chain **success** screenshot impossible while sync is broken; failure + API JSON captured instead. |

---

## Findings

| ID | Severity | Area | Description |
|----|----------|------|-------------|
| BUG-01 | **HIGH** | Score orb / `AnimatedScore` | After re-analysis, the large center number frequently stays at **0** while the SVG ring `stroke-dasharray` already reflects the real score (e.g. testnet score **7** → dash ≈ `29 / 414.7`; High mainnet **32** → dash ≈ `132.7 / 414.7`). Users can read “0” next to a “High Risk” badge. Intermittent — later frames sometimes catch up to the true number. |
| BUG-02 | **CRITICAL** | Save on-chain (prod backend) | `POST https://fluxid.onrender.com/wallet/{addr}/sync` with `{"network":"testnet"}` returns `success: false` and `error: "getaddrinfo ENOTFOUND rpc.testnet.stellar.org"`. That hostname does not resolve on public DNS. Repo config uses it in `backend/src/config/stellar.config.ts` (`rpcUrl: 'https://rpc.testnet.stellar.org'`). Working public RPC used elsewhere in this repo is `https://soroban-testnet.stellar.org`. **No tx hash can be captured until this is fixed and redeployed.** Same class of dead host exists for mainnet (`rpc.mainnet.stellar.org`). |
| BUG-03 | **MEDIUM** | Recent Flow vs insight | For GAVA… (mainnet), Behavior Insight describes frequent **sending** / outflow-heavy behavior (`inflowCount=22`, `outflowCount=178` from API), but Recent Flow showed **14 inflows / 0 outflows**. Horizon’s newest payments for that account are currently all inflows (including dust `0.0000001` XLM). Recent Flow only samples the frontend’s capped Horizon payment list (newest ~30), so it can disagree with the overall metrics/insight and look like the wallet only receives. |
| BUG-04 | **MEDIUM** | Save on-chain UX | Even on a successful path, `syncOnChain` returns `txHash` but the UI only toasts “Score saved on-chain” — **no hash is shown or copyable**. Acceptance asks for a captured tx hash; the product does not surface it. |
| OBS-01 | LOW | Decorative orb PNG | Background image `fluxid_trust_score_orb.png` still shows a faint hardcoded **82**, which reads like a second score beside the live orb. |
| OBS-02 | LOW | Network toggle | Switching mainnet ↔ testnet (or pasting a new address) keeps the previous analysis visible until Analyze is clicked again. Save on-chain enables from the network toggle alone, so a user can attempt sync against a stale address/network pairing. |
| OBS-03 | LOW | In-app feedback submit | Join Beta modal opened correctly. During this session the modal button stayed on **Sending…** for a long time after click; a direct browser `POST /feedback` with the same payload shape returned `{"success":true}`. Worth checking for hung client promises / missing timeout. |

---

## Walkthrough notes

### Medium (mainnet) — GAVA…

- Orb ring yellow; badge **Medium Risk**.
- Mainnet correctly shows **On-chain save · testnet only** (disabled).
- Score Breakdown: Inflow Consistency 0% (red), Outflow Stability 58% (yellow), Transaction Frequency 100% (green).
- Top Risk Factors = the two lowest bars (0%, 58%).
- Suggestions talked about recipient concentration and incoming activity — consistent with Medium + weak inflow.

Screenshot: `01-mainnet-medium-score-summary.png`

### High (mainnet) — GBACI…

- Badge **High Risk**; ring stroke `#ef4444`.
- Breakdown low on inflow + frequency (~11%); Top Risk Factors matched.
- Suggestions about new counterparties + consistent inflow — consistent with High.
- Center number hit the BUG-01 “stuck at 0” state while the ring already showed ~32%.
- A later frame recovered to **32** (same wallet).

Screenshots: `02-mainnet-high-score-summary.png` (stuck at 0), `03-testnet-score-before-save.png` (filename is historical; this frame is the same **mainnet** High wallet with the number recovered to 32)

### Testnet Save on-chain — GBPIMU…

- Analyze on **testnet** succeeded (score 7 / High; 44 txs).
- **Save on-chain** enabled.
- Repeated clicks did not produce an on-chain stamp (`GET /onchain/wallet/...` still “not synced”).
- API body (also saved as `05-sync-api-response.json`):

```json
{
  "success": false,
  "data": {
    "accountId": "GBPIMUEJFYS7RT23QO2ACH2JMKGXLXZI4E5ACBSQMF32RKZ5H3SVNL5F",
    "score": 7,
    "risk": "High",
    "error": "getaddrinfo ENOTFOUND rpc.testnet.stellar.org"
  }
}
```

Screenshots: `04-testnet-save-onchain-error.png` (center stuck at 0 + Save on-chain enabled), `06-join-beta-widget.png` (same testnet analysis with the number recovered to 7; Give Feedback / Join Beta CTAs visible). API error body: `05-sync-api-response.json`.

**Tx hash:** not available — sync never submitted a Soroban transaction. Re-posted `POST /wallet/GBPIMU…/sync` on 2026-08-18; same `ENOTFOUND`.

### Feedback CTAs

- Give Feedback → Google Form URL confirmed.
- Join Beta → in-app widget confirmed (`06-join-beta-widget.png`).
- In-app feedback content describing BUG-01 / BUG-02 was submitted to `/feedback` (success response observed).

---

## Must-do checklist

- [x] QA report at `docs/qa-reports/qa-dashboard-summary-nyuiela.md`
- [x] Screenshots under `docs/grantfox-OSS/issue6-QA_dashboard_summary/`
- [ ] Tx hash where money/state moves — **blocked by BUG-02** (re-checked 2026-08-18: same `ENOTFOUND rpc.testnet.stellar.org`)
- [x] Google Form https://forms.gle/kLYwDRdJo8WV1RTE7
- [x] In-app feedback sent once
- [x] Unique walkthrough (own wallets/screenshots/API traces)
- [x] PR with `Closes #6` + issue comment tagging `@thebabalola`

---

## Suggested maintainer fixes (out of QA scope)

1. Point `STELLAR_CONFIGS.testnet.rpcUrl` (and mainnet) at real Soroban RPC hosts (`soroban-testnet.stellar.org` / current mainnet RPC), redeploy Render backend, re-test Save on-chain.
2. Fix `AnimatedScore` so the displayed integer cannot lag/stick at 0 after remount (e.g. sync initial display to `value`, or drop spring for the first paint).
3. Show `txHash` (link to stellar.expert testnet) after a successful sync.
4. Label Recent Flow as “latest Horizon sample” or pull a window that cannot silently omit the dominant flow direction.
