# QA Report — Settings, Transfer & mobile responsiveness

**Reviewer:** TCROWN10 (`@TCROWN10`)  
**Date:** 2026-08-16  
**Issue:** [#11](https://github.com/StellarVhibes/FluxID/issues/11)  
**Severity:** CRITICAL (mainnet prep)  
**App under test:** live deploy [https://fluxid.vercel.app](https://fluxid.vercel.app) (same build as `main`)  
**Viewports:** 1440×900 (desktop), 375×812 (iPhone-class), 320×640 (narrow)  
**Wallet analyzed:** `GAVA7FY3KBXJVZDBX254LPM53YXRUEVLM5BXMXZOC7ZIW3HXFP6LT4SR` (demo list, mainnet)  
**Tx hash:** none — Freighter / Albedo / xBull were not available in this session, so no XLM moved. Wallet Kit opened the connect modal (Albedo, xBull, Freighter with an Install CTA) and that was as far as the signed path could go.

Screenshots: [`docs/grantfox-OSS/issue11-QA_settings_transfer_mobile/`](../grantfox-OSS/issue11-QA_settings_transfer_mobile/)

---

## How I walked it

I started at `/dashboard/settings` with a clean `localStorage` except for `fluxid_onboarding_seen=true` (otherwise the first-run tour sits on top of every shot). Then:

1. Clicked Light / Dark / System, reloaded after each, and read `localStorage.theme` plus `document.documentElement.className`.
2. Flipped all three notification switches (ON/ON/OFF → OFF/OFF/ON), reloaded, and compared both the UI and `localStorage.fluxid-notifications`.
3. Clicked **Save Changes**, then the header sun/moon while Settings still had **System** selected.
4. Collapsed / re-expanded the desktop rail and measured `--sidebar-width` against the shell’s `left`.
5. Opened `/dashboard/transfer` by pasting the URL (it is not in any nav). Confirmed destination prefill from `fluxid_last_analyzed_address`.
6. Analyzed the demo wallet on `/dashboard` (mainnet) — score **42 / Medium Risk / 200 transactions** — then reopened Transfer.
7. Tried **Connect Wallet to Send** with an empty amount.
8. Repeated Settings, Transfer, and Dashboard at 375 px and 320 px, including a horizontal swipe of the bottom nav.

In-app feedback was sent once from the floating button; the toast read **“Thanks for the feedback!”**

---

## Acceptance criteria

| Criterion | Result | Notes |
|-----------|--------|-------|
| Theme Light/Dark/System persists after reload | **PASS** | `localStorage.theme` = `light` / `dark` / `system`. System with OS dark → `html` class `dark`. |
| Three notification prefs persist after reload | **PASS** | Writes happen on each toggle (`fluxid-notifications`). After reload the knobs matched `{"scoreAlerts":false,"transactionAlerts":false,"weeklyReports":true}`. |
| `/dashboard/transfer` reachable directly, not in the sidebar | **PASS** | Direct URL works. Sidebar copy is Dashboard / Analytics / Transactions / Insights / Overview / Agent Gateway / Contract Interface / Settings. No Transfer item. |
| Send testnet XLM if funded → capture tx hash | **BLOCKED** | No wallet extension in this environment. Connect modal appeared; nothing was signed. |
| Transfer prefills the analyzed wallet as destination | **PARTIAL** | The G-address is restored from `fluxid_last_analyzed_address`. The “Auto-filled … Score: N/100” line did **not** appear after a real visit (full load of `/dashboard/transfer`). See BUG-02. |
| Sidebar collapse works on desktop | **PASS** | 248 px → 80 px. `--sidebar-width: 80px`, shell `left: 108px`, heading left-edge 184 px — no overlap. |
| Mobile bottom-nav is horizontally scrollable and grouped | **PASS** | At 375 px: `scrollWidth` 708 / `clientWidth` 343. Groups are Wallet Intelligence → Protocol Intelligence → General, with a right-edge fade. Transfer is also missing here. |
| No overflow / clipped content at narrow widths on all 3 pages | **FAIL** | Page `scrollWidth` equals the viewport (no horizontal page scroll), but the **Analyze** button sticks 12 px past 320 px, long G-addresses clip in the destination input, and **Save Changes** sits under the Feedback FAB. See BUG-01, BUG-05, BUG-06. |

---

## Settings (`/dashboard/settings`)

### Theme

Default with no stored theme: **System** is highlighted and the page follows the OS (dark in this run). Clicking **Light** immediately adds class `light` and writes `theme=light`. After reload it is still Light. Same for Dark (`class=dark`, `theme=dark`) and System (`theme=system`, class still `dark` because the OS color-scheme was dark).

That part is solid. The leak is the **header** control, which is not the same three-way picker.

**BUG-04 (MEDIUM) — header sun/moon wipes System.**  
`Header.tsx` does `setTheme(resolvedTheme === "dark" ? "light" : "dark")`. After Settings → System, one click on the header toggle wrote `theme=light` and left **Light** selected in the Appearance card. A user who picks System in Settings and then taps the header icon has silently opted out of System.

**Screenshot:** `10-settings-header-toggle-overwrote-system.png`

### Notification toggles

Defaults on a first visit (no `fluxid-notifications` key): Score Alerts **on**, Transaction Alerts **on**, Weekly Reports **off**. That matches `DEFAULT_NOTIFICATIONS` in `frontend/app/dashboard/settings/page.tsx`.

Each switch writes immediately:

```json
{"scoreAlerts":false,"transactionAlerts":false,"weeklyReports":true}
```

Reload kept that exact object and the three knobs visually matched (off / off / on). Persistence itself is fine.

What is not fine is the **Save Changes** button, and the fact that none of this talks to a real notifier.

**BUG-01 (HIGH) — Save Changes is cosmetic and is covered by the Feedback FAB.**  
`handleSave` only flips a `saved` flag for two seconds. It does not write theme or notifications. Theme is handled by `next-themes`; notifications are written inside `handleNotificationChange`. So:

- Toggle and leave without Save → still persisted.  
- Click Save → button reads “Saved”, but nothing extra happened.

On 1440×900 the Save control’s box was `top: 855 / bottom: 900` — flush with the viewport — and the floating Feedback pill sits on top of it. You can scroll the inner pane, but the FAB still covers the click target.

**Screenshots:** `07-notifications-after-toggle.png`, `08-notifications-after-reload.png`, `09-save-changes-under-feedback-fab.png`

**OBS-02 (LOW) — prefs are localStorage theatre.**  
The header Bell has no `onClick`. Nothing in the backend is consulted. For mainnet prep these three switches currently change a JSON blob in the browser and that is all.

---

## Transfer (`/dashboard/transfer`)

Pasting `/dashboard/transfer` loads **Send Liquidity** every time. Confirmed not in the desktop rail and not in the mobile bottom nav. There is also **no `<Link>` to this route anywhere else in the frontend** (grep for `/dashboard/transfer` only hits the page file itself). Dashboard empty-state copy even says results stay available across Analytics, Transactions, and Insights — Transfer is not mentioned.

### Prefill

With `fluxid_last_analyzed_address` set, the destination input filled with the full G-address on a cold load. Input value:

`GAVA7FY3KBXJVZDBX254LPM53YXRUEVLM5BXMXZOC7ZIW3HXFP6LT4SR`

The green “Auto-filled from currently analyzed wallet. Score: …/100” caption was **absent**.

I then analyzed that wallet on `/dashboard` (AnalyzeBar network = **MAINNET**). UI result:

- Score **42**, Medium Risk  
- 200 transactions analyzed, LLM “Behavior Insight”  
- Inflow Consistency **0%**, Outflow Stability **58%**, Transaction Frequency **100%**  
- Toast: “Analyzed on mainnet”

Immediately after that I opened `/dashboard/transfer` again. Destination still prefilled. Caption still missing. Transfer’s own network toggle was still **Testnet**.

**BUG-02 (MEDIUM) — score caption requires in-memory `analysis`, which a URL visit never has.**  
`AnalysisProvider` restores the address from localStorage and deliberately does **not** re-run analyze on mount. The caption is gated on `analysis && destination === analyzedAddress`. Because Transfer is not a sidebar/Link target, the realistic way in is a full load, so `analysis` is always `null` and the caption never shows.

**BUG-03 (MEDIUM) — Analyze defaults to mainnet, Transfer defaults to testnet.**  
`AnalysisContext` default / stored network is mainnet. Transfer’s `useState` is `"testnet"` and is not persisted. Prefill copies the G-address only — not the network. After a mainnet analyze I was one **Connect Wallet to Send** away from offering a testnet payment to a mainnet-scored destination, with no warning.

**Screenshots:** `16-dashboard-analyzed-mainnet-score-42.png`, `17-transfer-prefill-no-score-hint-testnet.png`

**BUG-06 (LOW) — destination field clips the address.**  
Desktop input `clientWidth` 468 vs `scrollWidth` 534. At 320 px the visible prefix was `GAVA7FY3KBXJVZDBX2`. You can caret-scroll inside the input, but there is no wrap, copy control, or truncation with a title tooltip. Easy to miss that the last characters are there.

**BUG-07 (LOW) — validation does not run until a wallet is connected.**  
`handleSend` returns early into `connect()` when `!isConnected`. Clicking **Connect Wallet to Send** with amount empty opened the Stellar Wallets Kit modal (Albedo / xBull / Freighter Install) instead of the “valid destination and amount” error. That error is unreachable until after connect.

**Screenshot:** `15-transfer-wallet-modal-skips-validation.png`

Transfer also does not validate the G-address format at all (`AnalyzeBar` does: `/^G[A-Z2-7]{55}$/`). An invalid destination would only fail at Horizon submit.

---

## Mobile / responsive

### Desktop collapse

Collapse control is visible at `lg` and works. Width animation 248 → 80, CSS var updates, main shell shifts to `left: 108px`. Content is not hidden under the rail. Collapse state is **not** persisted across reload (not in the AC).

**Screenshots:** `11-sidebar-expanded.png`, `12-sidebar-collapsed.png`

### Bottom nav (375 px)

Desktop `aside` is `hidden lg:flex`. Mobile shows a fixed bottom `nav` with `overflow-x-auto`, section labels, and a right-edge fade. Measured `scrollWidth` 708 vs `clientWidth` 343 — it does scroll. After scrolling, Protocol Intelligence (Overview, Agent Gateway, Contract Interface) and General → Settings come into view. Grouping matches the desktop sections.

Transfer is not in this nav either, so on a phone the only way to send XLM is still typing the URL.

**Screenshots:** `21-mobile-375-bottom-nav-start.png`, `22-mobile-375-bottom-nav-scrolled.png`

Feedback FAB (`bottom-24`) sits 1 px above the nav (`fb.bottom` 716, `nav.top` 717 at 375). They do not overlap.

### Narrow widths (settings / transfer / dashboard)

`document.documentElement.scrollWidth` was equal to the viewport at both 375 and 320, so the *page* does not grow sideways. The overflow I did find is local clipping:

**BUG-05 (MEDIUM) — Analyze button clipped at 320 px.**  
On `/dashboard` the Analyze button’s `getBoundingClientRect().right` was **332** against a 320 px viewport. The right edge of the primary action is cut off by the card.

Theme tiles at 375 px were 80×83 each and sat in a 3-column grid without colliding. Notification row text wraps (`min-w-0`) and the switches stay `shrink-0` — that older overlap bug looks fixed.

Weekly Reports + Save Changes require inner scroll on 320 / 375 because the bottom nav + FAB eat the lower ~80 px. Settings notifications 2 and 3 start under the fold.

**Screenshots:** `20-mobile-375-settings.png`, `23-mobile-375-transfer.png`, `25-mobile-320-settings.png`, `26-mobile-320-transfer.png`, `27-mobile-320-dashboard.png`

---

## Bug summary

| ID | Severity | Area | What’s wrong | Where |
|----|----------|------|----------------|-------|
| BUG-01 | HIGH | Settings | Save Changes writes nothing; Feedback FAB covers it | `frontend/app/dashboard/settings/page.tsx` (`handleSave`); `frontend/app/components/Feedback.tsx` |
| BUG-02 | MEDIUM | Transfer | Address prefills from localStorage; score caption never shows on a URL visit because `analysis` is not restored | `frontend/app/dashboard/context/AnalysisContext.tsx`; `frontend/app/dashboard/transfer/page.tsx` |
| BUG-03 | MEDIUM | Transfer | Analyze network (mainnet) and Transfer network (testnet) are independent; prefill copies the address only | `AnalysisContext.tsx` `readNetworkFromStorage`; `transfer/page.tsx` `useState("testnet")` |
| BUG-04 | MEDIUM | Settings / Header | Header theme toggle forces light/dark and drops System | `frontend/app/components/Header.tsx` |
| BUG-05 | MEDIUM | Dashboard mobile | Analyze button overflows 12 px at 320 px | `frontend/app/dashboard/components/AnalyzeBar.tsx` |
| BUG-06 | LOW | Transfer | 56-char destination is clipped in the input at every width I tried | `transfer/page.tsx` destination `<input>` |
| BUG-07 | LOW | Transfer | Amount/address validation skipped until wallet connect succeeds | `transfer/page.tsx` `handleSend` |
| OBS-01 | LOW | Nav | Transfer has no in-app entry point at all (desktop or mobile) | `frontend/app/components/Sidebar.tsx` `baseNavSections` |
| OBS-02 | LOW | Settings | Notification switches persist locally; header Bell is inert; no delivery | `settings/page.tsx`; `Header.tsx` |
| OBS-03 | LOW | Dead code | `frontend/components/ThemeToggle.tsx` uses `fluxid-theme` / `data-theme` and is not mounted; live theme is `next-themes` + `theme` | `ThemeToggle.tsx` vs `providers.tsx` |

Suggested direction (not implemented in this PR — report only):

- Make Save actually persist, or remove it and say “saved” on each toggle. Lift the FAB or the Save row so they don’t share a pixel.  
- Either put Transfer in General (desktop + bottom nav) or accept it is a hidden route and drop the score caption that only works on client-side navigation.  
- Thread `network` from `AnalysisContext` into Transfer (and warn if they differ).  
- Header toggle should cycle Light → Dark → System, or only flip when the stored theme is already light/dark.  
- Reuse `isValidStellarAddress` on the destination field and validate before `connect()`.  
- Give Analyze a wrapping row at 320 px so the primary button is fully visible.

---

## Screenshots index

All under `docs/grantfox-OSS/issue11-QA_settings_transfer_mobile/`:

| File | What it shows |
|------|----------------|
| `01-settings-default-desktop.png` | Settings, System selected, default notification knobs |
| `02-settings-light-selected.png` | Light selected immediately after click |
| `03-settings-light-after-reload.png` | Light still selected after reload |
| `04-settings-dark-after-reload.png` | Dark still selected after reload |
| `05-settings-system-after-reload.png` | System still selected after reload |
| `06-notifications-before-toggle.png` | Defaults ON / ON / OFF |
| `07-notifications-after-toggle.png` | Flipped to OFF / OFF / ON |
| `08-notifications-after-reload.png` | Same OFF / OFF / ON after reload |
| `09-save-changes-under-feedback-fab.png` | Save sitting under the Feedback pill |
| `10-settings-header-toggle-overwrote-system.png` | Header toggle left Light selected after System |
| `11-sidebar-expanded.png` | Full rail, Collapse visible, no Transfer item |
| `12-sidebar-collapsed.png` | Icon rail at 80 px, Settings still highlighted |
| `14-transfer-direct-url.png` | Direct URL, dest prefilled, Testnet, not in sidebar |
| `15-transfer-wallet-modal-skips-validation.png` | Connect Wallet modal instead of amount validation |
| `16-dashboard-analyzed-mainnet-score-42.png` | Demo wallet scored 42 on mainnet |
| `17-transfer-prefill-no-score-hint-testnet.png` | Same dest, still Testnet, no Auto-filled / score line |
| `19b-feedback-open.png` | Floating Feedback modal |
| `19c-feedback-after-submit.png` | “Thanks for the feedback!” toast |
| `20-mobile-375-settings.png` | Settings at 375 px |
| `21-mobile-375-bottom-nav-start.png` | Wallet Intelligence group + clipped Overview cue |
| `22-mobile-375-bottom-nav-scrolled.png` | Protocol Intelligence + General / Settings after scroll |
| `23-mobile-375-transfer.png` | Transfer at 375 px, dest truncated, Testnet |
| `25-mobile-320-settings.png` | Settings at 320 px |
| `26-mobile-320-transfer.png` | Transfer at 320 px |
| `27-mobile-320-dashboard.png` | Analyze button clipped on the right |

---

## Checklist

- [x] Theme Light / Dark / System persist after reload  
- [x] Three notification prefs persist after reload  
- [x] `/dashboard/transfer` reachable by direct URL and absent from the sidebar  
- [ ] Testnet XLM sent (no wallet extension in this session — no tx hash)  
- [x] Destination prefills last analyzed G-address (score caption did not)  
- [x] Desktop sidebar collapse 248 → 80, no overlap  
- [x] Mobile bottom-nav scrollable and grouped (Wallet / Protocol / General)  
- [ ] No overflow / clipping on Settings, Transfer, Dashboard at narrow width (Analyze clip + dest clip + Save under FAB)  
- [x] Screenshots: settings before/after theme and toggles, transfer, mobile nav  
- [x] In-app feedback sent (toast: “Thanks for the feedback!”)  
- [ ] Google Form: https://forms.gle/kLYwDRdJo8WV1RTE7 — still needs a browser submit from my account  
- [x] QA-report-only PR; frontend/backend source not touched, build not required  

---

*Walked on 2026-08-16 against https://fluxid.vercel.app — @TCROWN10*
