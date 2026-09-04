import {
  expect,
  test as base,
  type Page,
} from "@playwright/test";

const retryableNavigationError = /net::ERR_NETWORK_CHANGED|TOOLCRAFT_APP_NOT_READY/;

async function expectRuntimeReady(page: Page): Promise<void> {
  try {
    await page.locator('[data-slot="toolcraft-runtime-app"]').waitFor({
      state: "visible",
      timeout: 5_000,
    });
  } catch {
    throw new Error("TOOLCRAFT_APP_NOT_READY after navigation");
  }
}

async function retryNetworkChange<T>(page: Page, operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!retryableNavigationError.test(String(error)) || attempt === 3) {
        throw error;
      }
      await page.waitForTimeout(250 * attempt);
    }
  }
  throw new Error("Navigation retry loop exited unexpectedly.");
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    page.goto = async (...arguments_) =>
      retryNetworkChange(page, async () => {
        const response = await goto(...arguments_);
        await expectRuntimeReady(page);
        return response;
      });
    page.reload = async (...arguments_) =>
      retryNetworkChange(page, async () => {
        const response = await reload(...arguments_);
        await expectRuntimeReady(page);
        return response;
      });
    await use(page);
  },
});

export { expect };
export type { Page };
