import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(projectRoot, "docs", "assets", "sanchez-pattern.png");
const appUrl = process.env.SANCHEZ_SCREENSHOT_URL ?? "http://127.0.0.1:3002";

await mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { height: 1000, width: 1600 },
  });
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.locator('[data-slot="toolcraft-runtime-app"]').waitFor();

  const createPatternButton = page.getByRole("button", { name: "Create pattern" });
  if (await createPatternButton.isVisible()) {
    await createPatternButton.click();
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: outputPath });
  await page.goto(new URL("/shape-tools", appUrl).href, { waitUntil: "networkidle" });
  await page.locator('[data-slot="toolcraft-runtime-app"]').waitFor();
  process.stdout.write(`Saved ${outputPath}\n`);
} finally {
  await browser.close();
}
