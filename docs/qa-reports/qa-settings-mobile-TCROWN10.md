# QA Report — Settings & mobile responsiveness

**Reviewer:** TCROWN10 (`@TCROWN10`)  
**Date:** 2026-08-16 (walkthrough) · **Revised:** 2026-08-20 (scoped to Settings + mobile per review)  
**Issue:** [#11](https://github.com/StellarVhibes/FluxID/issues/11)  
**Severity:** CRITICAL (mainnet prep)  
**App under test:** live deploy [https://fluxid.vercel.app](https://fluxid.vercel.app)  
**Viewports:** 1440×900 (desktop), 375×812 (iPhone-class), 320×640 (narrow)

Screenshots: [`docs/grantfox-OSS/issue11-QA_settings_transfer_mobile/`](../grantfox-OSS/issue11-QA_settings_transfer_mobile/)

Transfer / Send Liquidity is **out of scope** for this revision. That section, its bugs, and its screenshots were removed.

---

## How I walked it

Started at `/dashboard/settings` with `fluxid_onboarding_seen=true` (otherwise the first-run tour covers every shot). Then:

1. Clicked Light / Dark / System, reloaded after each, and read `localStorage.theme` plus `document.documentElement.className`.
2. Flipped all three notification switches (ON/ON/OFF → OFF/OFF/ON), reloaded, and compared the UI to `localStorage.fluxid-notifications`.
3. Clicked **Save Changes**, then the header sun/moon while Settings still had **System** selected.
4. Collapsed / re-expanded the desktop rail and measured `--sidebar-width` against the shell’s `left`.
5. Repeated Settings at 375 px and 320 px, including a horizontal swipe of the bottom nav. Checked Dashboard at 320 px for clipping.
6. Scored three demo-list G-addresses (not a single wallet).

In-app feedback was sent once from the floating button; the toast read **“Thanks for the feedback!”**

---

## Wallets scored

FluxID is address-based — any `G…` key should score. Three wallets from `docs/demo-wallets.txt`, all mainnet:

| Wallet | How it was scored | Result |
|--------|-------------------|--------|
| `GAVA7FY3KBXJVZDBX254LPM53YXRUEVLM5BXMXZOC7ZIW3HXFP6LT4SR` | Live UI Analyze on 2026-08-16 | **42 / Medium Risk / 200 txs**. Inflow Consistency 0%, Outflow Stability 58%, Transaction Frequency 100%. Toast: “Analyzed on mainnet”. |
| `GBACI4PCHZQXZFAADCMG4TICARUDZAGF5CI3A4RPTD7SOSW2VPKLGDCX` | Same local engine as `frontend/lib/scoring.ts` (`calculateLiquidityScore`) on a Horizon payments page (84 records, 75 payment ops) | **60 / Medium**. Inflow 33 / outflow 42. Factors: inflowConsistency 0, outflowStability 30, frequency 30. |
| `GCKMNZ4G3DP6BDVWQD23JMGE7LCHBS4EDVGTIYTH7GPUKV6UBELI3JNI` | Same local engine, Horizon 200-record page | **100 / Low**. 200 inflows, 0 outflows. Factors: 40 + 30 + 30. |

`GAVA…` is the one that went through the live Analyze bar (screenshot `27-mobile-320-dashboard.png` still has that address in the input). The other two used the fallback formula in `scoring.ts` against Horizon — that is the path the frontend takes when `NEXT_PUBLIC_AI_BACKEND_URL` is unset. Live UI numbers can differ when the AI backend is up (`GAVA…` was 42 in the UI vs 70 from the local formula on the same 200-payment window).

A fourth address from the seed list, `GB63YPQH…`, returned Horizon **503** on the payments endpoint during this pass, so it is not in the table.

---

## Acceptance criteria (Settings + mobile)

| Criterion | Result | Notes |
|-----------|--------|-------|
| Theme Light/Dark/System persists after reload | **PASS** | `localStorage.theme` = `light` / `dark` / `system`. System with OS dark → `html` class `dark`. |
| Three notification prefs persist after reload | **PASS** | Writes happen on each toggle (`fluxid-notifications`). After reload the knobs matched `{"scoreAlerts":false,"transactionAlerts":false,"weeklyReports":true}`. |
| Sidebar collapse works on desktop | **PASS** | 248 px → 80 px. `--sidebar-width: 80px`, shell `left: 108px`, heading left-edge 184 px — no overlap. |
| Mobile bottom-nav is horizontally scrollable and grouped | **PASS** | At 375 px: `scrollWidth` 708 / `clientWidth` 343. Groups are Wallet Intelligence → Protocol Intelligence → General, with a right-edge fade. |
| No overflow / clipped content at narrow widths (Settings + Dashboard) | **FAIL** | Page `scrollWidth` equals the viewport (no horizontal page scroll). **Save Changes** sits under the Feedback FAB; the **Analyze** button sticks 12 px past 320 px. See BUG-01, BUG-05. |

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

**OBS-03 (LOW) — dead `ThemeToggle`.**  
`frontend/components/ThemeToggle.tsx` is not mounted. It writes `fluxid-theme` and `data-theme`. Live theme is `next-themes` (`providers.tsx`) plus localStorage key `theme`. Two systems, only one is wired.

---

## Mobile / responsive

### Desktop collapse

Collapse control is visible at `lg` and works. Width animation 248 → 80, CSS var updates, main shell shifts to `left: 108px`. Content is not hidden under the rail. Collapse state is **not** persisted across reload (not in the AC).

**Screenshots:** `11-sidebar-expanded.png`, `12-sidebar-collapsed.png`

### Bottom nav (375 px)

Desktop `aside` is `hidden lg:flex`. Mobile shows a fixed bottom `nav` with `overflow-x-auto`, section labels, and a right-edge fade. Measured `scrollWidth` 708 vs `clientWidth` 343 — it does scroll. After scrolling, Protocol Intelligence (Overview, Agent Gateway, Contract Interface) and General → Settings come into view. Grouping matches the desktop sections.

**Screenshots:** `21-mobile-375-bottom-nav-start.png`, `22-mobile-375-bottom-nav-scrolled.png`

Feedback FAB (`bottom-24`) sits 1 px above the nav (`fb.bottom` 716, `nav.top` 717 at 375). They do not overlap.

### Narrow widths

`document.documentElement.scrollWidth` was equal to the viewport at both 375 and 320, so the *page* does not grow sideways. Local clipping:

**BUG-05 (MEDIUM) — Analyze button clipped at 320 px.**  
On `/dashboard` the Analyze button’s `getBoundingClientRect().right` was **332** against a 320 px viewport. The right edge of the primary action is cut off by the card.

Theme tiles at 375 px were 80×83 each and sat in a 3-column grid without colliding. Notification row text wraps (`min-w-0`) and the switches stay `shrink-0` — that older overlap bug looks fixed.

Weekly Reports + Save Changes require inner scroll on 320 / 375 because the bottom nav + FAB eat the lower ~80 px. Settings notifications 2 and 3 start under the fold.

**Screenshots:** `20-mobile-375-settings.png`, `25-mobile-320-settings.png`, `27-mobile-320-dashboard.png`

---

## Bug summary

| ID | Severity | Area | What’s wrong | Where |
|----|----------|------|----------------|-------|
| BUG-01 | HIGH | Settings | Save Changes writes nothing; Feedback FAB covers it | `frontend/app/dashboard/settings/page.tsx` (`handleSave`); `frontend/app/components/Feedback.tsx` |
| BUG-04 | MEDIUM | Settings / Header | Header theme toggle forces light/dark and drops System | `frontend/app/components/Header.tsx` |
| BUG-05 | MEDIUM | Dashboard mobile | Analyze button overflows 12 px at 320 px | `frontend/app/dashboard/components/AnalyzeBar.tsx` |
| OBS-02 | LOW | Settings | Notification switches persist locally; header Bell is inert; no delivery | `settings/page.tsx`; `Header.tsx` |
| OBS-03 | LOW | Dead code | `ThemeToggle.tsx` uses `fluxid-theme` / `data-theme` and is not mounted; live theme is `next-themes` + `theme` | `ThemeToggle.tsx` vs `providers.tsx` |

Suggested direction (not implemented in this PR — report only):

- Make Save actually persist, or remove it and say “saved” on each toggle. Lift the FAB or the Save row so they don’t share a pixel.
- Header toggle should cycle Light → Dark → System, or only flip when the stored theme is already light/dark.
- Give Analyze a wrapping row at 320 px so the primary button is fully visible.
- Either wire notification prefs to a real channel, or stop calling the header icon a bell.

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
| `11-sidebar-expanded.png` | Full rail, Collapse visible |
| `12-sidebar-collapsed.png` | Icon rail at 80 px, Settings still highlighted |
| `19b-feedback-open.png` | Floating Feedback modal |
| `19c-feedback-after-submit.png` | “Thanks for the feedback!” toast |
| `20-mobile-375-settings.png` | Settings at 375 px |
| `21-mobile-375-bottom-nav-start.png` | Wallet Intelligence group + clipped Overview cue |
| `22-mobile-375-bottom-nav-scrolled.png` | Protocol Intelligence + General / Settings after scroll |
| `25-mobile-320-settings.png` | Settings at 320 px |
| `27-mobile-320-dashboard.png` | Analyze button clipped; `GAVA…` in the input |

---

## Checklist

- [x] Theme Light / Dark / System persist after reload
- [x] Three notification prefs persist after reload
- [x] Desktop sidebar collapse 248 → 80, no overlap
- [x] Mobile bottom-nav scrollable and grouped (Wallet / Protocol / General)
- [ ] No overflow / clipping on Settings / Dashboard at narrow width (Analyze clip + Save under FAB)
- [x] Screenshots: settings before/after theme and toggles, mobile nav
- [x] Three G-addresses scored (live UI + local engine), not a single wallet
- [x] In-app feedback sent (toast: “Thanks for the feedback!”)
- [ ] Google Form: https://forms.gle/kLYwDRdJo8WV1RTE7 — still required from my Google account
- [x] QA-report-only PR; frontend/backend source not touched

---

*Walked 2026-08-16 against https://fluxid.vercel.app; scoped 2026-08-20 — @TCROWN10*
