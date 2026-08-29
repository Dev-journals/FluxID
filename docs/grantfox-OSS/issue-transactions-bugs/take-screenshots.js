const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const OUT_DIR = path.resolve(__dirname);
const WALLET = "GCKMNZ4G3DP6BDVWQD23JMGE7LCHBS4EDVGTIYTH7GPUKV6UBELI3JNI";
const ZERO_WALLET = "GBACI4PCHZQXZFAADCMG4TICARUDZAGF5CI3A4RPTD7SOSW2VPKLGDCX";
const BASE_URL = "http://localhost:3000";

async function analyzeWallet(page, wallet) {
  await page.goto(`${BASE_URL}/dashboard/transactions`, { waitUntil: "networkidle" });
  // Try to find wallet input in header
  const input = page.locator("input[placeholder*='address' i], input[placeholder*='wallet' i], input[placeholder*='Search' i]").first();
  await input.waitFor({ timeout: 10000 });
  await input.fill(wallet);
  await input.press("Enter");
  // Wait for loading to finish
  await page.waitForFunction(() => !document.querySelector(".card p")?.textContent?.includes("Loading"), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Screenshot 1: All filter active (normal wallet with yUSDC)
  console.log("Analyzing first wallet...");
  await analyzeWallet(page, WALLET);
  await page.screenshot({ path: path.join(OUT_DIR, "01-before-all-filter.png"), fullPage: false });
  console.log("Saved 01-before-all-filter.png");

  // Screenshot 2: Inflow filter — stat cards update
  const inflowBtn = page.locator("button[title='Inflow'], button[aria-label='Inflow']").first();
  await inflowBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, "02-after-inflow-filter-stat-cards.png"), fullPage: false });
  console.log("Saved 02-after-inflow-filter-stat-cards.png");

  // Screenshot 3: Swap filter — asset column with AssetBadge
  const swapBtn = page.locator("button[title='Swap'], button[aria-label='Swap']").first();
  await swapBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, "03-swap-filter-asset-badges.png"), fullPage: false });
  console.log("Saved 03-swap-filter-asset-badges.png");

  // Screenshot 4: Asset tooltip — hover on first non-standard asset in All filter
  const allBtn = page.locator("button[title='All'], button[aria-label='All']").first();
  await allBtn.click();
  await page.waitForTimeout(500);

  // Try to hover on an asset link (yUSDC should be wrapped)
  const assetLinks = page.locator("a[href*='stellar.expert']");
  const count = await assetLinks.count();
  if (count > 0) {
    // Try to find yUSDC or non-standard asset
    for (let i = 0; i < Math.min(count, 10); i++) {
      const text = await assetLinks.nth(i).innerText().catch(() => "");
      if (text.includes("yUSDC") || text.includes("wrapped")) {
        await assetLinks.nth(i).hover({ force: true });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT_DIR, "04-yusdc-tooltip-hover.png"), fullPage: false });
        console.log("Saved 04-yusdc-tooltip-hover.png");
        break;
      }
    }
    // Also take a screenshot of the first asset link hover
    await assetLinks.first().hover({ force: true });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, "04b-asset-tooltip-any.png"), fullPage: false });
    console.log("Saved 04b-asset-tooltip-any.png");
  }

  // Screenshot 5: Zero-value wallet
  console.log("Analyzing zero-value wallet...");
  await analyzeWallet(page, ZERO_WALLET);
  await page.screenshot({ path: path.join(OUT_DIR, "05-zero-value-inflows-wallet.png"), fullPage: false });
  console.log("Saved 05-zero-value-inflows-wallet.png");

  // Check for Non-transfer badges
  const nonTransferBadges = page.locator("span:text('Non-transfer')");
  const badgeCount = await nonTransferBadges.count();
  console.log(`Found ${badgeCount} Non-transfer badges`);
  if (badgeCount > 0) {
    // Scroll to first badge
    await nonTransferBadges.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT_DIR, "06-non-transfer-badge.png"), fullPage: false });
    console.log("Saved 06-non-transfer-badge.png");
  }

  await browser.close();
  console.log("Done.");
})();
