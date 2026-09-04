import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "./fixtures";

import {
  expectToolcraftSegmentedControlCellsPreservePadding,
} from "./performance-helpers";
import {
  expectToolcraftProductObservableToChange,
  getToolcraftProductObservableSnapshot,
} from "./product-observable-helpers";
import { expectNoForbiddenCanvasUi } from "./canvas-handle-helpers";

async function openSection(page: Page, name: string): Promise<void> {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const header = page
    .getByRole("button", { name: new RegExp(`${escapedName} section$`) })
    .first();
  if ((await header.getAttribute("aria-expanded")) === "false") {
    await header.click();
  }
}

async function selectPatternMethod(page: Page, name: string): Promise<void> {
  const methodIndex = ["Base", "Gradient", "Mosaic", "Triangle"].indexOf(name);
  const control = page
    .getByText("Method", { exact: true })
    .first()
    .locator("xpath=ancestor::*[@role='group'][1]")
    .getByRole("combobox");
  await control.click();
  await page.locator('[role="listbox"] [role="option"]').nth(methodIndex).click();
}

async function addShapeFamily(page: Page, familyId: string): Promise<void> {
  await page.getByRole("button", { name: "Open library" }).click();
  const family = page.getByTestId("shape-family-grid").locator(`[data-shape-family-id="${familyId}"]`);
  if (await family.count() === 0) {
    await page
      .getByTestId("shape-family-grid")
      .locator('[data-shape-collection-id="solid-triangles"]')
      .click();
  }
  await family.click();
  await page.getByTestId("shape-library-add").click();
}

async function addDraftingTriangleGlyph(page: Page, familyId: string): Promise<void> {
  await page.getByRole("button", { name: "Open library" }).click();
  await page
    .getByTestId("shape-library-category")
    .getByText("Complex", { exact: true })
    .click();
  await page.getByTestId("shape-collection-back").click();
  const frameSelect = page.locator('[role="combobox"]').last();
  await frameSelect.click();
  await page.locator('[role="listbox"]:visible').getByText("Equilateral half", { exact: true }).click();
  await page.locator('[data-shape-collection-id="drafting-triangle-glyphs"]').click();
  await page.locator(`[data-shape-family-id="${familyId}"]`).click();
  await page.getByTestId("shape-library-add").click();
}

function getGroupedTextbox(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .first()
    .locator("xpath=ancestor::*[@role='group'][1]")
    .getByRole("textbox");
}

async function setSliderValueWithKeys(page: Page, name: string, value: number): Promise<void> {
  const slider = page.getByRole("slider", { name });
  await slider.press("Home");
  const minimum = Number(await slider.getAttribute("aria-valuemin")) || 0;
  for (let index = minimum; index < value; index += 1) await slider.press("ArrowRight");
}

async function waitForMosaicCounts(page: Page, supportCount: number, anchorCount: number): Promise<void> {
  const output = page.locator('[data-toolcraft-product-output="pattern"]');
  await expect(output.locator('[data-pattern-span="2"][data-pattern-cluster]')).toHaveCount(supportCount);
  await expect(output.locator('[data-pattern-span="4"][data-pattern-cluster]')).toHaveCount(anchorCount);
}

async function getMosaicSilhouetteMetrics(page: Page) {
  return page.locator('[data-toolcraft-product-output="pattern"]').evaluate((output) => {
    const readTranslate = (element: Element) => {
      let current: Element | null = element;
      while (current && current !== output) {
        const match = (current.getAttribute("transform") ?? "").match(/^translate\(([-\d.]+) ([-\d.]+)\)/);
        if (match) return { x: Number(match[1]), y: Number(match[2]) };
        current = current.parentElement;
      }
      return null;
    };
    const tiles = Array.from(output.querySelectorAll<SVGGraphicsElement>("[data-pattern-cluster]"))
      .map((element) => {
        const translation = readTranslate(element);
        return translation
          ? {
              span: Number(element.getAttribute("data-pattern-span")),
              x: translation.x,
              y: translation.y,
            }
          : null;
      })
      .filter((tile): tile is { span: number; x: number; y: number } => tile !== null);
    const coordinates = [...tiles.map((tile) => tile.x), ...tiles.map((tile) => tile.y)]
      .filter((value) => value > 0)
      .sort((left, right) => left - right);
    const differences = coordinates
      .slice(1)
      .map((value, index) => value - coordinates[index]!)
      .filter((value) => value > 0.001);
    const step = Math.min(...differences);
    const logical = tiles.map((tile) => ({
      column: Math.round(tile.x / step),
      row: Math.round(tile.y / step),
      span: tile.span,
    }));
    const maxSpan = Math.max(...logical.map((tile) => tile.span));
    const anchors = logical.filter((tile) => tile.span === maxSpan);
    const anchor = anchors.reduce(
      (total, tile) => ({
        x: total.x + tile.column + tile.span / 2,
        y: total.y + tile.row + tile.span / 2,
      }),
      { x: 0, y: 0 },
    );
    anchor.x /= anchors.length;
    anchor.y /= anchors.length;
    const shareEdge = (
      left: { column: number; row: number; span: number },
      right: { column: number; row: number; span: number },
    ) => {
      const verticalOverlap = Math.min(left.row + left.span, right.row + right.span) - Math.max(left.row, right.row);
      const horizontalOverlap = Math.min(left.column + left.span, right.column + right.span) - Math.max(left.column, right.column);
      return (
        ((left.column + left.span === right.column || right.column + right.span === left.column) && verticalOverlap > 0) ||
        ((left.row + left.span === right.row || right.row + right.span === left.row) && horizontalOverlap > 0)
      );
    };
    const minColumn = Math.min(...logical.map((tile) => tile.column));
    const minRow = Math.min(...logical.map((tile) => tile.row));
    const maxColumn = Math.max(...logical.map((tile) => tile.column + tile.span));
    const maxRow = Math.max(...logical.map((tile) => tile.row + tile.span));
    const occupiedArea = logical.reduce((total, tile) => total + tile.span ** 2, 0);
    return {
      density: occupiedArea / ((maxColumn - minColumn) * (maxRow - minRow)),
      endpoints: logical.filter(
        (tile, index) => logical.filter((other, otherIndex) => index !== otherIndex && shareEdge(tile, other)).length === 1,
      ).length,
      reach: Math.max(...logical.map((tile) => Math.hypot(
        tile.column + tile.span / 2 - anchor.x,
        tile.row + tile.span / 2 - anchor.y,
      ))),
    };
  });
}

async function getMosaicAnchorMetrics(page: Page) {
  return page.locator('[data-toolcraft-product-output="pattern"]').evaluate((output) => {
    const readTranslate = (element: Element) => {
      let current: Element | null = element;
      while (current && current !== output) {
        const match = (current.getAttribute("transform") ?? "").match(/^translate\(([-\d.]+) ([-\d.]+)\)/);
        if (match) return { x: Number(match[1]), y: Number(match[2]) };
        current = current.parentElement;
      }
      return null;
    };
    const readTile = (element: Element) => {
      const translation = readTranslate(element);
      return translation
        ? {
            span: Number(element.getAttribute("data-pattern-span")),
            x: translation.x,
            y: translation.y,
          }
        : null;
    };
    const allTiles = Array.from(output.querySelectorAll("[data-pattern-span]"))
      .map(readTile)
      .filter((tile): tile is { span: number; x: number; y: number } => tile !== null);
    const clusterTiles = Array.from(output.querySelectorAll("[data-pattern-cluster]"))
      .map(readTile)
      .filter((tile): tile is { span: number; x: number; y: number } => tile !== null);
    const coordinateDifferences = (values: readonly number[]) => {
      const unique = [...new Set(values)].sort((left, right) => left - right);
      return unique.slice(1).map((value, index) => value - unique[index]!).filter((value) => value > 0.001);
    };
    const step = Math.min(
      ...coordinateDifferences(allTiles.map((tile) => tile.x)),
      ...coordinateDifferences(allTiles.map((tile) => tile.y)),
    );
    const logical = clusterTiles.map((tile) => ({
      column: Math.round(tile.x / step),
      row: Math.round(tile.y / step),
      span: tile.span,
    }));
    const spans = [...new Set(logical.map((tile) => tile.span))].sort((left, right) => right - left);
    const anchorSpan = spans[0]!;
    const supportSpan = spans[1];
    const anchors = logical.filter((tile) => tile.span === anchorSpan);
    const support = logical.filter((tile) => tile.span === supportSpan);
    const edgeKeys = (tile: { column: number; row: number; span: number }) => {
      const keys: string[] = [];
      for (let offset = 0; offset < tile.span; offset += 1) {
        keys.push(`h:${tile.row}:${tile.column + offset}`);
        keys.push(`h:${tile.row + tile.span}:${tile.column + offset}`);
        keys.push(`v:${tile.column}:${tile.row + offset}`);
        keys.push(`v:${tile.column + tile.span}:${tile.row + offset}`);
      }
      return keys;
    };
    const perimeter = new Set<string>();
    for (const anchor of anchors) for (const key of edgeKeys(anchor)) {
      if (perimeter.has(key)) perimeter.delete(key);
      else perimeter.add(key);
    }
    const covered = new Set<string>();
    for (const tile of support) for (const key of edgeKeys(tile)) {
      if (perimeter.has(key)) covered.add(key);
    }
    const rectangleGap = (
      left: { column: number; row: number; span: number },
      right: { column: number; row: number; span: number },
    ) => Math.max(
      Math.max(left.column - (right.column + right.span - 1) - 1, right.column - (left.column + left.span - 1) - 1, 0),
      Math.max(left.row - (right.row + right.span - 1) - 1, right.row - (left.row + left.span - 1) - 1, 0),
    );
    let maxAnchorGap = 0;
    for (let left = 0; left < anchors.length; left += 1) for (let right = left + 1; right < anchors.length; right += 1) {
      maxAnchorGap = Math.max(maxAnchorGap, rectangleGap(anchors[left]!, anchors[right]!));
    }
    const counts = Object.fromEntries(spans.map((span) => [
      span,
      logical.filter((tile) => tile.span === span).length,
    ]));
    return {
      anchorCoverage: perimeter.size > 0 ? covered.size / perimeter.size * 100 : 0,
      counts,
      maxAnchorGap,
    };
  });
}

async function decodeDownloadedImage(
  page: Page,
  stream: NodeJS.ReadableStream,
): Promise<{ foregroundSamples: number; height: number; nonTransparentSamples: number; width: number }> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const base64 = Buffer.concat(chunks).toString("base64");

  return page.evaluate(async (encoded) => {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D is unavailable");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let foregroundSamples = 0;
    let nonTransparentSamples = 0;
    const sampleStride = Math.max(4, Math.floor(pixels.length / 20000 / 4) * 4);
    for (let index = 0; index < pixels.length; index += sampleStride) {
      if (pixels[index + 3]! > 0) nonTransparentSamples += 1;
      if (pixels[index]! !== 51 || pixels[index + 1]! !== 68 || pixels[index + 2]! !== 85) {
        foregroundSamples += 1;
      }
    }
    const dimensions = { foregroundSamples, height: bitmap.height, nonTransparentSamples, width: bitmap.width };
    bitmap.close();
    return dimensions;
  }, base64);
}

async function countTintedPreviewPixels(page: Page, screenshot: Buffer): Promise<number> {
  return page.evaluate(async (encoded) => {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D is unavailable");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index]! > 180 && pixels[index + 1]! < 120 && pixels[index + 2]! < 170) {
        count += 1;
      }
    }
    bitmap.close();
    return count;
  }, screenshot.toString("base64"));
}

async function getTriangleHalfClipRetention(
  page: Page,
  selector: string,
  svgMarkup?: string,
): Promise<{ clippedPixels: number; retention: number; unclippedPixels: number }> {
  const markup = svgMarkup ?? await page
    .locator('[data-toolcraft-product-output="pattern"]')
    .evaluate((output) => new XMLSerializer().serializeToString(output));

  return page.evaluate(async ({ markup: serialized, selector: targetSelector }) => {
    const documentNode = new DOMParser().parseFromString(serialized, "image/svg+xml");
    const sourceSvg = documentNode.documentElement;
    const target = sourceSvg.querySelector<SVGGElement>(targetSelector);
    const definitions = sourceSvg.querySelector("defs");
    const clip = sourceSvg.querySelector('#pattern-clip-triangle-half polygon');
    if (!target || !definitions || !clip) throw new Error("Triangle half fixture is incomplete");

    const coordinates = (clip.getAttribute("points") ?? "")
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(",").map(Number));
    const frameWidth = Math.max(...coordinates.map(([x]) => x ?? 0));
    const frameHeight = Math.max(...coordinates.map(([, y]) => y ?? 0));
    const scale = 20;

    const rasterize = async (withClip: boolean) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("fill", "#000000");
      svg.setAttribute("height", String(Math.ceil(frameHeight * scale)));
      svg.setAttribute("viewBox", `0 0 ${frameWidth} ${frameHeight}`);
      svg.setAttribute("width", String(Math.ceil(frameWidth * scale)));
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.append(definitions.cloneNode(true));
      const clone = target.cloneNode(true) as SVGGElement;
      clone.setAttribute(
        "transform",
        (clone.getAttribute("transform") ?? "")
          .replace(/^translate\(([-\d.eE]+)[ ,]([-\d.eE]+)\)\s*/, ""),
      );
      if (!withClip) clone.removeAttribute("clip-path");
      svg.append(clone);

      const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
        type: "image/svg+xml",
      });
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.decoding = "sync";
      image.src = url;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Isolated Triangle SVG could not be decoded"));
      });
      const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas 2D is unavailable");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
      let count = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index]! > 16) count += 1;
      }
      URL.revokeObjectURL(url);
      return count;
    };

    const [clippedPixels, unclippedPixels] = await Promise.all([
      rasterize(true),
      rasterize(false),
    ]);
    return {
      clippedPixels,
      retention: unclippedPixels > 0 ? clippedPixels / unclippedPixels : 0,
      unclippedPixels,
    };
  }, { markup, selector });
}

test("browser: edits pattern controls and renders vector output", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expect(page.locator('[data-testid="pattern-renderer"]')).toHaveCount(0);
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Create pattern" }).click();
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  await expect(page.locator('[data-toolcraft-product-output="pattern"]')).toBeVisible();
  await expect(page.locator('[data-pattern-grid="true"]')).toBeVisible();
  await expect(page.locator("[data-pattern-signature]")).toBeVisible();
  expect(await getToolcraftProductObservableSnapshot(page)).toContain("data-toolcraft-product-output");

  await openSection(page, "Pattern Method");
  await expectToolcraftSegmentedControlCellsPreservePadding(page, "Base distribution");
  await openSection(page, "Grid");
  await expectToolcraftProductObservableToChange(page, async () => {
    await page.getByRole("slider", { name: "Rows" }).press("ArrowRight");
    await openSection(page, "Pattern Output");
    await page.getByRole("button", { name: "Update pattern" }).click();
  });

  await openSection(page, "Shape Fill");
  await expectToolcraftSegmentedControlCellsPreservePadding(page, "Fill");
  await page.getByRole("group", { name: "Fill" }).getByRole("button", { name: "Gradient", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Gradient angle" })).toBeVisible();
  const gradientParts = [
    "gradient.gradientType",
    "gradient.angle",
    "gradient.stops.position",
    "gradient.stops.color",
    "gradient.stops.opacity",
  ];
  expect(gradientParts).toHaveLength(5);

  await openSection(page, "Shape Library");
  await page.getByRole("button", { name: "Open library" }).click();
  await expect(page.getByTestId("shape-family-grid")).toBeVisible();

  await page.getByText("Add shape", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Shapes Library" })).toHaveCount(0);
  await expect(page.getByTestId("pattern-source-list").getByRole("button", { name: /^Edit / })).toHaveCount(2);
  await expect(page.getByTestId("pattern-source-list").locator('[data-selected="true"]')).toHaveCount(1);

  await openSection(page, "Import Details");
  await expect(page.getByRole("group", { name: "Import as" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Category" })).toBeVisible();

  await openSection(page, "SVG file");
  const svgInput = page.locator('input[type="file"]').first();
  await svgInput.setInputFiles({
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>',
    ),
    mimeType: "image/svg+xml",
    name: "arbitrary shape name.svg",
  });
  await expect(page.getByText("arbitrary shape name.svg")).toBeVisible();

  await openSection(page, "Import Details");
  const importFields = page.locator('[data-testid="shape-import-details"]');
  await importFields.getByText("Family ID", { exact: true }).locator("xpath=ancestor::*[@data-slot='field'][1]").getByRole("textbox").fill("e2e-square");
  await importFields.getByText("Display name", { exact: true }).locator("xpath=ancestor::*[@data-slot='field'][1]").getByRole("textbox").fill("E2E square");
  const variantName = importFields.getByText("Variant name", { exact: true }).locator("xpath=ancestor::*[@data-slot='field'][1]").getByRole("textbox");
  await variantName.fill("Very Bold!");
  await page.getByRole("button", { name: "Import SVG" }).click();
  await expect(variantName).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText(/lowercase kebab-case|Weight must be one of/)).toBeVisible();
  await variantName.fill("bold");
  await page.getByRole("button", { name: "Import SVG" }).click();
  await expect(page.getByText("E2E square imported.")).toBeVisible();

  await openSection(page, "Background");
  const backgroundColor = page.getByRole("textbox", { name: /background hex/i });
  await backgroundColor.fill("#334455");
  await backgroundColor.press("Enter");
  await expect(page.locator("[data-pattern-background]")).toHaveAttribute("fill", "#334455");

  await openSection(page, "Image Export");
  await getGroupedTextbox(page, "File name").fill("custom pattern");
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();

  // Image resolution defaults to 4K; decoded bytes prove the preset changes
  // actual export dimensions rather than only changing UI state.
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Image" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("custom pattern.png");
  const stream = await download.createReadStream();
  const exportedImage = await decodeDownloadedImage(page, stream);
  expect(exportedImage.width).toBe(4096);
  expect(exportedImage.height).toBeGreaterThan(0);
  expect(exportedImage.nonTransparentSamples).toBeGreaterThan(0);
  expect(exportedImage.foregroundSamples).toBeGreaterThan(0);
});

test("browser: filters and opens shape collections", async ({ page }) => {
  await page.goto("/");
  await openSection(page, "Shape Library");
  await page.getByRole("button", { name: "Open library" }).click();

  const frameSelect = page.locator('[role="dialog"] [role="combobox"]').first();
  await expect(frameSelect).toBeVisible();

  const travelCollection = page.locator('[data-shape-collection-id="travel-icon-set"]');
  await expect(travelCollection).toBeVisible();
  await expect(travelCollection).toContainText("11 of 11 shapes");
  await travelCollection.click();
  await expect(page.getByTestId("shape-collection-summary")).toContainText("11 of 11 shapes");
  await expect(page.getByTestId("shape-family-grid").locator("[data-shape-family-id]")).toHaveCount(11);
  await page.locator('[data-shape-family-id="travel-cloud-2"]').click();
  const libraryDialog = page.locator('[role="dialog"]');
  const outlineVariant = libraryDialog.locator("button").filter({ hasText: /^Outline$/ });
  const filledVariant = libraryDialog.locator("button").filter({ hasText: /^Filled$/ });
  await expect(outlineVariant).toHaveAttribute("aria-pressed", "true");
  await filledVariant.click();
  await expect(filledVariant).toHaveAttribute("aria-pressed", "true");
  await outlineVariant.click();
  await page.getByTestId("shape-library-add").click();

  await expect(page.getByRole("dialog", { name: "Shapes Library" })).toHaveCount(0);
  await expect(page.getByTestId("pattern-source-list")).toContainText("Cloud 2");
  await openSection(page, "Shape Fill");
  await page.getByRole("button", { name: "Solid", exact: true }).click();
  const travelColor = page.getByRole("textbox", { name: /color hex/i });
  await travelColor.fill("#ff3366");
  await travelColor.press("Enter");
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Create pattern" }).click();
  const travelOutput = page.locator('[data-toolcraft-product-output="pattern"]');
  await expect(travelOutput).toBeVisible();
  expect(await countTintedPreviewPixels(page, await travelOutput.screenshot())).toBeGreaterThan(20);
  const travelDownloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const travelDownload = await travelDownloadEvent;
  const travelDownloadPath = await travelDownload.path();
  expect(travelDownloadPath).not.toBeNull();
  const travelSvg = await readFile(travelDownloadPath!, "utf8");
  expect(travelSvg).toContain('data-shape-paint="stroke"');
  expect(travelSvg).toContain('stroke="#FF3366"');
  expect(travelSvg).toContain('fill="none"');

  await openSection(page, "Shape Library");
  await page.getByRole("button", { name: "Open library" }).click();
  await page.getByTestId("shape-collection-back").click();
  await frameSelect.click();
  await page.locator('[role="listbox"]').getByText("Equilateral full", { exact: true }).click();
  const triangleCollection = page.locator('[data-shape-collection-id="solid-triangles"]');
  await expect(triangleCollection).toBeVisible();
  await expect(triangleCollection).toContainText("1 of 2 shapes");
  await triangleCollection.click();
  await expect(page.getByTestId("shape-collection-summary")).toContainText("1 of 2 shapes");
  await expect(page.locator('[data-shape-family-id="solid-triangle-full"]')).toBeVisible();
  await expect(page.locator('[data-shape-family-id="solid-triangle-half"]')).toHaveCount(0);

  await page.getByTestId("shape-collection-back").click();
  await frameSelect.click();
  await page.locator('[role="listbox"]').getByText("Equilateral half", { exact: true }).click();
  await page.locator('[data-shape-collection-id="solid-triangles"]').click();
  await expect(page.locator('[data-shape-family-id="solid-triangle-half"]')).toBeVisible();
  await expect(page.locator('[data-shape-family-id="solid-triangle-full"]')).toHaveCount(0);

  await page.getByTestId("shape-collection-back").click();
  await page.locator('[role="dialog"] button').filter({ hasText: "Complex" }).click();
  const draftingCollection = page.locator(
    '[data-shape-collection-id="drafting-triangle-glyphs"]',
  );
  await expect(draftingCollection).toBeVisible();
  await expect(draftingCollection).toContainText("13 of 13 shapes");
  await expect(draftingCollection).toContainText("3 profiles");
  await draftingCollection.click();
  await expect(page.getByTestId("shape-collection-summary")).toContainText("13 of 13 shapes");
  await expect(page.getByTestId("shape-family-grid").locator("[data-shape-family-id]")).toHaveCount(13);

  const profileSelect = page.getByTestId("shape-profile-selector").locator('[role="combobox"]');
  await profileSelect.click();
  await page.locator('[role="listbox"]:visible [role="option"]').nth(2).click();
  await page.locator('[data-shape-family-id="drafting-triangle-glyph-02"]').click();
  await page.getByTestId("shape-library-add").click();

  await expect(page.getByRole("dialog", { name: "Shapes Library" })).toHaveCount(0);
  await expect(page.getByTestId("pattern-source-list")).toContainText("Glyph 02");
  expect(await getToolcraftProductObservableSnapshot(page, {
    selector: '[data-testid="pattern-source-list"]',
  })).toContain("Glyph 02");
});

test("browser: configures deterministic pattern opacity distribution", async ({ page }) => {
  await page.goto("/");
  await openSection(page, "Shape Library");
  await page.getByRole("button", { name: "Open library" }).click();
  const libraryDialog = page.locator('[role="dialog"]');
  await libraryDialog.locator("button").filter({ hasText: "Complex" }).click();

  const frameSelect = libraryDialog.locator('[role="combobox"]').first();
  await frameSelect.click();
  await page.locator('[role="listbox"]').getByText("Equilateral full", { exact: true }).click();
  await page.locator('[data-shape-collection-id="equilateral-triangle-glyphs"]').click();
  await expect(page.getByTestId("shape-profile-selector")).toBeVisible();
  await expect(page.getByTestId("shape-family-grid").locator("[data-shape-family-id]")).toHaveCount(15);

  const profileSelect = page.getByTestId("shape-profile-selector").locator('[role="combobox"]');
  await profileSelect.click();
  await page.locator('[role="listbox"]:visible [role="option"]').nth(1).click();
  await page.locator('[data-shape-family-id="equilateral-triangle-glyph-01"]').click();
  await page.getByTestId("shape-library-add").click();

  await openSection(page, "Pattern Shapes");
  await page.getByRole("button", { name: "Normalize frames" }).click();
  await openSection(page, "Opacity Distribution");
  const opacityControl = page.getByTestId("opacity-distribution-control");
  await opacityControl.getByRole("switch").click();
  await opacityControl.getByRole("button", { name: "Elements" }).click();
  await page.getByRole("button", { name: "Add opacity" }).click();
  await page.getByRole("spinbutton", { name: "Opacity opacity-1" }).fill("25");
  await page.getByRole("spinbutton", { name: "Chance opacity-1" }).fill("50");
  await page.getByRole("spinbutton", { name: "Opacity opacity-2" }).fill("75");
  await page.getByRole("spinbutton", { name: "Chance opacity-2" }).fill("50");
  await expect(page.getByText("Total: 100%", { exact: false })).toBeVisible();

  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Create pattern" }).click();
  const output = page.locator('[data-toolcraft-product-output="pattern"]');
  await expect(output).toBeVisible();
  expect(await getToolcraftProductObservableSnapshot(page)).toContain(
    '["data-toolcraft-product-output","pattern"]',
  );
  const signatures = await output.locator("[data-pattern-opacity-signature]").evaluateAll((nodes) =>
    [...new Set(nodes.map((node) => node.getAttribute("data-pattern-opacity-signature")))],
  );
  expect(signatures.length).toBeGreaterThan(1);
  const elementMixing = await output.locator("use[data-pattern-opacity-signature]").evaluateAll((nodes) => {
    let eligible = 0;
    let mixed = 0;
    for (const node of nodes) {
      const href = node.getAttribute("href");
      const definition = href?.startsWith("#") ? document.getElementById(href.slice(1)) : null;
      const units = definition
        ? [...definition.querySelectorAll<SVGElement>("[data-shape-opacity-unit]")]
        : [];
      if (units.length <= 1) continue;
      eligible += 1;
      const opacities = new Set(units.map((unit) => unit.getAttribute("opacity") ?? "1"));
      if (opacities.size > 1) mixed += 1;
    }
    return { eligible, mixed };
  });
  expect(elementMixing.eligible).toBeGreaterThan(0);
  expect(elementMixing.mixed / elementMixing.eligible).toBeGreaterThan(0.6);
  await expect(output.locator('[data-shape-opacity-unit][opacity="0.25"]')).not.toHaveCount(0);
  await expect(output.locator('[data-shape-opacity-unit][opacity="0.75"]')).not.toHaveCount(0);

  await page.reload();
  await expect(page.locator('[data-toolcraft-product-output="pattern"] [data-pattern-opacity-signature]')).not.toHaveCount(0);
});

test("browser: creates, edits, and restores a directional Gradient pattern", async ({ page }) => {
  await page.goto("/");
  await openSection(page, "Pattern Method");
  await selectPatternMethod(page, "Gradient");
  await expect(page.getByTestId("directional-phases-control")).toBeVisible();
  await expect(page.getByTestId("phase-list").locator("[data-phase-id]")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Columns", exact: true })).toBeVisible();

  await openSection(page, "Pattern Output");
  await getGroupedTextbox(page, "Pattern name").fill("Directional gradient");
  await page.getByRole("button", { name: "Create pattern" }).click();

  const output = page.locator('[data-toolcraft-product-output="pattern"]');
  await expect(output).toHaveAttribute("data-pattern-method", "directional-phases");
  await expect(output.locator("[data-pattern-phase]")).toHaveCount(128);
  await expect(output.locator('[data-pattern-phase="phase-1"]')).not.toHaveCount(0);
  await expect(output.locator('[data-pattern-phase="phase-2"]')).not.toHaveCount(0);
  await expect(output.locator('[data-pattern-phase="phase-3"]')).not.toHaveCount(0);
  const initialSignature = await page.locator("[data-pattern-signature]").getAttribute("data-pattern-signature");

  await openSection(page, "Pattern Method");
  await page.getByRole("slider", { name: "Direction angle" }).press("ArrowRight");
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();
  await expect(page.locator("[data-pattern-signature]")).not.toHaveAttribute("data-pattern-signature", initialSignature ?? "");

  await page.reload();
  await expect(page.locator('[data-toolcraft-product-output="pattern"]')).toHaveAttribute("data-pattern-method", "directional-phases");
  await openSection(page, "Pattern History");
  await expect(page.getByTestId("pattern-history-list").locator('[data-active="true"]')).toContainText("Gradient");
});

test("browser: creates and restores a Mosaic pattern", async ({ page }) => {
  await page.goto("/");
  await openSection(page, "Pattern Method");

  await expect(page.getByTestId("mosaic-editor")).toHaveCount(0);
  await selectPatternMethod(page, "Mosaic");
  await expect(page.getByTestId("mosaic-editor")).toBeVisible();
  await expectToolcraftSegmentedControlCellsPreservePadding(page, "Amount mode");
  await expect(page.getByRole("group", { name: "Amount mode" }).getByRole("button", { name: "Count" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await expect(page.getByText("Mosaic guide", { exact: true })).toBeVisible();
  await expect(page.getByText(/How recursive sizes and automatic clusters/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("group", { name: "Amount mode" }).getByRole("button", { name: "Coverage" }).click();
  await expect(page.getByTestId("mosaic-coverage-total")).toContainText("100%");
  await page.getByRole("group", { name: "Amount mode" }).getByRole("button", { name: "Count" }).click();

  await page.getByRole("button", { name: "Add Mosaic cluster" }).click();
  await expect(page.getByTestId("mosaic-clusters").locator('[data-testid^="mosaic-cluster-"]')).toHaveCount(2);
  await page.getByRole("textbox", { name: "Cluster 2 name" }).fill("Small accents");
  await page.getByTestId("mosaic-cluster-1").getByRole("spinbutton").first().fill("3");
  await page.getByTestId("mosaic-cluster-2").getByRole("spinbutton").first().fill("1");
  await expect(page.getByTestId("mosaic-valid")).toBeVisible();

  await openSection(page, "Pattern Output");
  await getGroupedTextbox(page, "Pattern name").fill("Multi-size mosaic");
  await page.getByRole("button", { name: "Create pattern" }).click();

  const output = page.locator('[data-toolcraft-product-output="pattern"]');
  await expect(output).toHaveAttribute("data-pattern-method", "multi-size-mosaic");
  expect(await getToolcraftProductObservableSnapshot(page)).toContain("data-toolcraft-product-output");
  await expect(output.locator('[data-pattern-level="mosaic-level-1"]')).not.toHaveCount(0);
  await expect(output.locator('[data-pattern-level="mosaic-level-2"]')).not.toHaveCount(0);
  await expect(output.locator('[data-pattern-level="mosaic-level-3"]')).not.toHaveCount(0);
  const signature = await page.locator("[data-pattern-signature]").getAttribute("data-pattern-signature");

  await page.reload();
  await expect(page.locator('[data-toolcraft-product-output="pattern"]')).toHaveAttribute("data-pattern-method", "multi-size-mosaic");
  await expect(page.locator("[data-pattern-signature]")).toHaveAttribute("data-pattern-signature", signature ?? "");
  await openSection(page, "Pattern History");
  await expect(page.getByTestId("pattern-history-list").locator('[data-active="true"]')).toContainText("Mosaic");

  await openSection(page, "Pattern Method");
  await expect(page.getByTestId("mosaic-editor")).toBeVisible();
  await selectPatternMethod(page, "Base");
  await expect(page.getByTestId("mosaic-editor")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Amount mode" })).toHaveCount(0);
});

test("browser: creates and restores a Triangle pattern", async ({ page }) => {
  await page.goto("/");
  await openSection(page, "Shape Library");
  await addShapeFamily(page, "solid-triangle-full");
  await addDraftingTriangleGlyph(page, "drafting-triangle-glyph-01");

  await openSection(page, "Pattern Method");
  await expect(page.getByTestId("triangle-editor")).toHaveCount(0);
  await selectPatternMethod(page, "Triangle");
  await expect(page.getByTestId("triangle-editor")).toBeVisible();
  await page.getByRole("button", { name: /Add Solid Triangle Full to Full shapes/ }).click();
  await page.getByRole("button", { name: /Add Glyph 01 to Half shapes/ }).click();
  await expect(page.getByTestId("triangle-valid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Alternate elements in row" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Alternate columns" })).toBeVisible();
  await page.getByRole("spinbutton", { name: "Full triangles" }).fill("3");
  await page.getByRole("spinbutton", { name: "Full triangles" }).blur();
  await expect(page.getByRole("button", { name: "Alternate columns" })).toHaveCount(0);
  await page.getByRole("button", { name: "Alternate elements in row" }).click();
  await page.getByRole("button", { name: "Alternate rows" }).click();

  await openSection(page, "Pattern Output");
  await getGroupedTextbox(page, "Pattern name").fill("Triangle lattice");
  await page.getByRole("button", { name: "Create pattern" }).click();
  const output = page.locator('[data-toolcraft-product-output="pattern"]');
  await expect(output).toHaveAttribute("data-pattern-method", "triangle-lattice");
  expect(await getToolcraftProductObservableSnapshot(page)).toContain("data-toolcraft-product-output");
  await expect(output.locator('[data-pattern-role="triangle-full"]')).toHaveCount(384);
  await expect(output.locator('[data-pattern-role="triangle-half"]')).toHaveCount(256);
  const leadingCap = (row: number, column: number) =>
    output.locator(
      `[data-pattern-role="triangle-half"][data-pattern-slot="0"][data-pattern-element-row="${row}"][data-pattern-element-column="${column}"]`,
    );
  await expect(leadingCap(0, 0)).toHaveAttribute("data-pattern-mirror-y", "false");
  await expect(leadingCap(0, 0)).toHaveAttribute("data-pattern-effective-mirror-y", "true");
  await expect(leadingCap(0, 0)).not.toHaveAttribute("transform", /scale\(1 -1\)/);
  await expect(leadingCap(0, 0).locator('[data-pattern-canonical-source="true"]')).toHaveAttribute(
    "transform",
    /scale\(1 -1\)/,
  );
  await expect(leadingCap(0, 1)).toHaveAttribute("data-pattern-mirror-y", "true");
  await expect(leadingCap(0, 1)).toHaveAttribute("data-pattern-effective-mirror-y", "false");
  await expect(leadingCap(0, 1)).toHaveAttribute("transform", /scale\(1 -1\)/);
  await expect(leadingCap(1, 0)).toHaveAttribute("data-pattern-mirror-y", "true");
  await expect(leadingCap(1, 0)).toHaveAttribute("data-pattern-effective-mirror-y", "false");
  await expect(leadingCap(1, 0)).toHaveAttribute("transform", /scale\(1 -1\)/);
  await expect(leadingCap(1, 1)).toHaveAttribute("data-pattern-mirror-y", "false");
  await expect(leadingCap(1, 1)).toHaveAttribute("data-pattern-effective-mirror-y", "true");
  await expect(leadingCap(1, 1)).not.toHaveAttribute("transform", /scale\(1 -1\)/);

  const representativeSelectors = [
    '[data-pattern-role="triangle-half"][data-pattern-slot="0"][data-pattern-element-row="0"][data-pattern-element-column="0"]',
    '[data-pattern-role="triangle-half"][data-pattern-slot="0"][data-pattern-element-row="0"][data-pattern-element-column="1"]',
    '[data-pattern-role="triangle-half"][data-pattern-slot="0"][data-pattern-element-row="1"][data-pattern-element-column="0"]',
    '[data-pattern-role="triangle-half"][data-pattern-slot="4"][data-pattern-element-row="1"][data-pattern-element-column="1"]',
  ];
  const liveMetrics = [];
  for (const selector of representativeSelectors) {
    const metrics = await getTriangleHalfClipRetention(page, selector);
    expect(metrics.unclippedPixels).toBeGreaterThan(100);
    expect(metrics.retention).toBeGreaterThan(0.9);
    liveMetrics.push(metrics);
  }

  const svgDownloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const svgDownload = await svgDownloadEvent;
  const svgDownloadPath = await svgDownload.path();
  expect(svgDownloadPath).not.toBeNull();
  const exportedSvg = await readFile(svgDownloadPath!, "utf8");
  expect(exportedSvg).toContain('clipPathUnits="userSpaceOnUse"');
  expect(exportedSvg).not.toContain('clipPathUnits="objectBoundingBox"');
  expect(exportedSvg).toContain('data-pattern-canonical-source="true"');
  for (const [index, selector] of representativeSelectors.entries()) {
    const metrics = await getTriangleHalfClipRetention(page, selector, exportedSvg);
    expect(metrics.retention).toBeGreaterThan(0.9);
    expect(metrics.retention).toBeCloseTo(liveMetrics[index]!.retention, 2);
  }

  await page.reload();
  await expect(page.locator('[data-toolcraft-product-output="pattern"]')).toHaveAttribute(
    "data-pattern-method",
    "triangle-lattice",
  );
  await expect(leadingCap(0, 1)).toHaveAttribute("transform", /scale\(1 -1\)/);
  await expect(leadingCap(1, 0)).toHaveAttribute("transform", /scale\(1 -1\)/);
  expect((await getTriangleHalfClipRetention(page, representativeSelectors[0]!)).retention).toBeGreaterThan(0.9);
  await openSection(page, "Pattern History");
  await expect(page.getByTestId("pattern-history-list").locator('[data-active="true"]')).toContainText("Triangle");
  await openSection(page, "Pattern Method");
  await expect(page.getByTestId("triangle-editor")).toBeVisible();
  await expect(page.getByRole("button", { name: "Alternate elements in row" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("spinbutton", { name: "Full triangles" }).fill("2");
  await page.getByRole("spinbutton", { name: "Full triangles" }).blur();
  await expect(page.getByRole("button", { name: "Alternate elements in row" })).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "Full triangles" }).fill("3");
  await page.getByRole("spinbutton", { name: "Full triangles" }).blur();
  await expect(page.getByRole("button", { name: "Alternate elements in row" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await selectPatternMethod(page, "Base");
  await expect(page.getByTestId("triangle-editor")).toHaveCount(0);
});

test("browser: Mosaic Spread grows organic branches", async ({ page }) => {
  await page.goto("/");
  await openSection(page, "Grid");
  await setSliderValueWithKeys(page, "Rows", 24);
  await setSliderValueWithKeys(page, "Columns", 48);
  await openSection(page, "Pattern Method");
  await selectPatternMethod(page, "Mosaic");

  await page.getByTestId("mosaic-level-2").getByRole("spinbutton").fill("24");
  await page.getByTestId("mosaic-level-3").getByRole("spinbutton").fill("2");
  const allocations = page.getByTestId("mosaic-cluster-1").getByRole("spinbutton");
  await allocations.nth(0).fill("24");
  await allocations.nth(1).fill("2");
  const spread = page.getByRole("slider", { name: "Spread for Cluster 1" });
  await spread.press("Home");
  await expect(page.getByTestId("mosaic-valid")).toBeVisible();

  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Create pattern" }).click();
  await waitForMosaicCounts(page, 24, 2);
  const compact = await getMosaicSilhouetteMetrics(page);

  await openSection(page, "Pattern Method");
  await spread.press("End");
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();
  await waitForMosaicCounts(page, 24, 2);
  const organic = await getMosaicSilhouetteMetrics(page);

  expect(organic.reach).toBeGreaterThan(compact.reach);
  expect(organic.density).toBeLessThan(compact.density);
  expect(organic.endpoints).toBeGreaterThan(compact.endpoints);
});

test("browser: Mosaic Anchor coverage and Spread stay independent", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await openSection(page, "Grid");
  await setSliderValueWithKeys(page, "Rows", 24);
  await setSliderValueWithKeys(page, "Columns", 48);
  await setSliderValueWithKeys(page, "Seed", 1);
  await openSection(page, "Pattern Method");
  await selectPatternMethod(page, "Mosaic");
  await page.getByTestId("mosaic-level-2").getByRole("spinbutton").fill("24");
  await page.getByTestId("mosaic-level-3").getByRole("spinbutton").fill("2");
  const allocations = page.getByTestId("mosaic-cluster-1").getByRole("spinbutton");
  await allocations.nth(0).fill("24");
  await allocations.nth(1).fill("2");
  const anchorCoverage = page.getByRole("slider", { name: "Anchor coverage for Cluster 1" });
  const spread = page.getByRole("slider", { name: "Spread for Cluster 1" });
  await anchorCoverage.press("Home");
  await expect(page.getByTestId("mosaic-anchor-coverage-actual-1")).toContainText("Actual 0%");

  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Create pattern" }).click();
  await waitForMosaicCounts(page, 24, 2);
  expect(await getToolcraftProductObservableSnapshot(page)).toContain("data-toolcraft-product-output");
  const noCoverage = await getMosaicAnchorMetrics(page);
  const noCoverageCounts = noCoverage.counts;

  await openSection(page, "Pattern Method");
  await anchorCoverage.press("End");
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();
  await waitForMosaicCounts(page, 24, 2);
  const fullCoverage = await getMosaicAnchorMetrics(page);
  expect(fullCoverage.anchorCoverage).toBeGreaterThan(noCoverage.anchorCoverage);
  expect(fullCoverage.counts).toEqual(noCoverageCounts);

  await openSection(page, "Pattern Method");
  await setSliderValueWithKeys(page, "Anchor coverage for Cluster 1", 80);
  await spread.press("Home");
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();
  await waitForMosaicCounts(page, 24, 2);
  const compactCoverage = await getMosaicAnchorMetrics(page);
  const compactSilhouette = await getMosaicSilhouetteMetrics(page);

  await openSection(page, "Pattern Method");
  await spread.press("End");
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();
  await waitForMosaicCounts(page, 24, 2);
  const organicCoverage = await getMosaicAnchorMetrics(page);
  const organicSilhouette = await getMosaicSilhouetteMetrics(page);
  expect(Math.abs(organicCoverage.anchorCoverage - compactCoverage.anchorCoverage)).toBeLessThanOrEqual(15);
  expect(organicSilhouette.reach).toBeGreaterThan(compactSilhouette.reach);
  expect(organicCoverage.maxAnchorGap).toBeGreaterThanOrEqual(compactCoverage.maxAnchorGap);
  expect(organicCoverage.maxAnchorGap).toBeLessThanOrEqual(2);

  await page.reload();
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await openSection(page, "Pattern Method");
  await expect(page.getByRole("slider", { name: "Anchor coverage for Cluster 1" })).toHaveAttribute("aria-valuenow", "80");
});

test("browser: Transition Spread mixes isolated cells and restores deterministic boundaries", async ({ page }) => {
  await page.goto("/");
  await openSection(page, "Pattern Method");
  await selectPatternMethod(page, "Gradient");

  const enableTransition = page.getByRole("switch", { name: "Enable transition from Phase 1 to Phase 2" });
  await expect(enableTransition).toBeVisible();
  await enableTransition.click();
  await expect(page.getByTestId("transition-spread-settings")).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  const width = page.getByRole("spinbutton", { name: "Transition max width from Phase 1 to Phase 2" });
  await width.fill("25");
  const strength = page.getByRole("slider", { name: "Transition strength from Phase 1 to Phase 2" });
  for (let index = 0; index < 10; index += 1) await strength.press("ArrowLeft");
  await expect(strength).toHaveAttribute("aria-valuenow", "90");

  await openSection(page, "Pattern Output");
  await getGroupedTextbox(page, "Pattern name").fill("Transition spread");
  await page.getByRole("button", { name: "Create pattern" }).click();
  const output = page.locator('[data-toolcraft-product-output="pattern"]');
  const previousCells = output.locator(
    '[data-pattern-baseline-phase="phase-1"][data-pattern-phase="phase-2"][data-pattern-spread-boundary="phase-1--phase-2"]',
  );
  await expect(previousCells).not.toHaveCount(0);
  await expect(output.locator('[data-pattern-phase="phase-1"]')).not.toHaveCount(0);
  const previousMarkup = await output.innerHTML();

  await openSection(page, "Pattern Method");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();
  const nextCells = output.locator(
    '[data-pattern-baseline-phase="phase-2"][data-pattern-phase="phase-1"][data-pattern-spread-boundary="phase-1--phase-2"]',
  );
  await expect(nextCells).not.toHaveCount(0);

  await openSection(page, "Grid");
  await page.getByRole("slider", { name: "Seed" }).press("ArrowRight");
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();
  const changedSeedMarkup = await output.innerHTML();
  expect(changedSeedMarkup).not.toBe(previousMarkup);

  await openSection(page, "Grid");
  await page.getByRole("slider", { name: "Seed" }).press("ArrowLeft");
  await openSection(page, "Pattern Method");
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();
  expect(await output.innerHTML()).toBe(previousMarkup);

  await openSection(page, "Pattern Method");
  const angle = page.getByRole("slider", { name: "Direction angle" });
  await angle.press("Home");
  for (let index = 0; index < 30; index += 1) await angle.press("ArrowRight");
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();
  await expect(output.locator('[data-pattern-spread-boundary="phase-1--phase-2"]')).not.toHaveCount(0);

  await openSection(page, "Pattern Method");
  await page.getByRole("button", { name: "Move Phase 1 down" }).click();
  await expect(page.getByText("Transition to Phase 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Enable transition from Phase 1 to Phase 3" })).toBeChecked();

  await page.getByRole("switch", { name: "Enable transition from Phase 1 to Phase 3" }).click();
  await expect(page.getByTestId("transition-spread-settings")).toHaveCount(0);
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();
  await expect(output.locator("[data-pattern-spread-boundary]")).toHaveCount(0);

  await page.reload();
  await expect(page.locator('[data-toolcraft-product-output="pattern"]')).toHaveAttribute("data-pattern-method", "directional-phases");
  await openSection(page, "Pattern Method");
  await page.getByRole("button", { name: "Edit Phase 1" }).click();
  await expect(page.getByRole("switch", { name: "Enable transition from Phase 1 to Phase 3" })).not.toBeChecked();
});

test("browser: edits, duplicates, renames, resets, and removes pattern sources", async ({ page }) => {
  await page.goto("/");
  await openSection(page, "Pattern Shapes");
  const list = page.getByTestId("pattern-source-list");
  const firstEdit = list.getByRole("button", { name: /^Edit / }).first();
  await firstEdit.click();
  await list.getByRole("button", { name: /^Duplicate / }).first().click();
  await list.getByRole("button", { name: /^Edit / }).first().click();

  await openSection(page, "Shape Fill");
  await page.getByRole("button", { name: "Solid", exact: true }).click();
  const color = page.getByRole("textbox", { name: /color hex/i });
  await color.fill("#ff3366");
  await color.press("Enter");
  await list.getByRole("button", { name: /^Edit / }).nth(1).click();
  await list.getByRole("button", { name: /^Edit / }).first().click();
  await expect(color).toHaveValue(/#FF3366/i);
  const selectedPreview = list.locator('[data-selected="true"] svg').first();
  await expect(selectedPreview.locator('[data-pattern-source-geometry="true"]')).toHaveAttribute("fill", "#FF3366");
  expect(await countTintedPreviewPixels(page, await selectedPreview.screenshot())).toBeGreaterThan(20);

  await list.getByRole("button", { name: /^Rename / }).first().click();
  const rename = list.getByRole("textbox", { name: /^Rename / });
  await rename.fill("Red accent");
  await rename.press("Enter");
  await expect(list.getByRole("button", { name: "Edit Red accent" })).toBeVisible();

  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(list.getByRole("button", { name: /^Edit / })).toHaveCount(3);

  await openSection(page, "Selected Shape");
  const selectedName = await list.locator('[data-selected="true"]').getByRole("button", { name: /^Edit / }).getAttribute("aria-label");
  await page.getByRole("button", { name: "Reset Selected Shape section" }).click();
  await expect(list.locator('[data-selected="true"]').getByRole("button", { name: selectedName ?? "" })).toBeVisible();
  await expect(page.locator('[data-testid="pattern-renderer"]')).toHaveCount(0);

  while ((await list.getByRole("button", { name: /^Remove / }).count()) > 0) {
    await list.getByRole("button", { name: /^Remove / }).first().click();
  }
  await expect(page.getByText("You must add a shape.")).toBeVisible();
  await expect(page.getByText("No shape selected").first()).toBeVisible();
  await openSection(page, "Shape Fill");
  await expect(page.getByText("No shape selected").last()).toBeVisible();
  await openSection(page, "Pattern Output");
  await expect(page.getByRole("button", { name: "Create pattern" })).toBeVisible();
});

test("browser: creates, activates, updates, restores, and deletes pattern history", async ({ page }) => {
  await page.goto("/");
  await openSection(page, "Pattern Output");
  const name = getGroupedTextbox(page, "Pattern name");
  await name.fill("First pattern");
  await page.getByRole("button", { name: "Create pattern" }).click();
  const firstSignature = await page.locator("[data-pattern-signature]").getAttribute("data-pattern-signature");

  await openSection(page, "Grid");
  await page.getByRole("slider", { name: "Rows" }).press("ArrowRight");
  await openSection(page, "Pattern Output");
  await name.fill("Second pattern");
  await page.getByRole("button", { name: "Create pattern" }).click();

  await openSection(page, "Pattern History");
  const history = page.getByTestId("pattern-history-list");
  await expect(history.locator('[data-active="true"]')).toContainText("Second pattern");
  await history.getByRole("button", { exact: true, name: "First pattern Base" }).click();
  await expect(page.locator("[data-pattern-signature]")).toHaveAttribute("data-pattern-signature", firstSignature ?? "");
  await history.getByRole("button", { name: /Edit/ }).first().click();
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Update pattern" }).click();

  await openSection(page, "Pattern History");
  await history.locator('[data-active="true"]').getByTitle(/Delete/).click();
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  await history.locator('[data-active="true"]').getByTitle(/Delete/).click();
  await expect(page.locator('[data-testid="pattern-renderer"]')).toHaveCount(0);
  await expect(page.getByTestId("pattern-history-empty")).toBeVisible();
});

test("browser: rejects a variant for a missing shape family", async ({ page }) => {
  await page.goto("/");
  await openSection(page, "SVG file");
  await page.locator('input[type="file"]').first().setInputFiles({
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>',
    ),
    mimeType: "image/svg+xml",
    name: "custom.svg",
  });
  await openSection(page, "Import Details");
  const details = page.getByTestId("shape-import-details");
  await details.getByRole("button", { name: "Variant", exact: true }).click();
  const familyId = details.getByText("Family ID", { exact: true }).locator("xpath=ancestor::*[@data-slot='field'][1]").getByRole("textbox");
  await familyId.fill("missing-family");
  await details.getByRole("button", { name: "Import SVG" }).click();
  await expect(familyId).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("This family does not exist in the selected category.")).toBeVisible();
});

test("browser: normalizes a Figma triangle SVG without moving geometry", async ({ page }) => {
  const geometry = '<path id="authored-geometry" d="M12 0.2158 23.75 20.7842H0.25Z" fill="#000"/>';
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="21" viewBox="0 0 24 21">\n  ${geometry}\n</svg>`;

  await page.goto("/shape-tools");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expectNoForbiddenCanvasUi(page);
  await expect(page.getByTestId("shape-tools-empty")).toBeVisible();

  await openSection(page, "Source SVGs");
  await page.locator('input[type="file"]').first().setInputFiles({
    buffer: Buffer.from(source),
    mimeType: "image/svg+xml",
    name: "figma-full.svg",
  });

  const result = page.getByRole("button", { name: "Select result figma-full.svg" });
  await expect(result).toBeVisible();
  await expect(result).toContainText("Full");
  await expect(result).toContainText("Root viewport corrected");
  await expect(result).toContainText("Geometry unchanged");
  await expect(result).toContainText("24 × 21 → 24 × 20.7846");

  const preview = page.getByTestId("shape-tools-preview");
  await expect(preview).toBeVisible();
  await expect(preview.locator("svg")).toHaveAttribute("width", "24");
  await expect(preview.locator("svg")).toHaveAttribute("height", "20.7846096908");
  await expect(preview.locator("svg")).toHaveAttribute(
    "viewBox",
    "0 0 24 20.7846096908",
  );
  await expect(preview.locator("#authored-geometry")).toHaveAttribute(
    "d",
    "M12 0.2158 23.75 20.7842H0.25Z",
  );

  await openSection(page, "Triangle Frame");
  await expect(page.getByRole("slider", { name: "Triangle side" })).toHaveCount(0);
  await page.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Full" }).click();
  await expect(page.getByRole("slider", { name: "Triangle side" })).toBeVisible();
  await page.getByRole("group", { name: "Mode" }).getByRole("button", { name: "Auto" }).click();
  await expect(page.getByRole("slider", { name: "Triangle side" })).toHaveCount(0);

  const beforeReload = await getToolcraftProductObservableSnapshot(page, {
    selector: '[data-testid="shape-tools-preview"]',
  });
  expect(beforeReload).toContain("data-shape-tools-preview");
  await page.reload();
  await expect(page.getByTestId("shape-tools-preview")).toHaveCount(0);
  await expect(page.getByTestId("shape-tools-empty")).toBeVisible();
});

test("browser: downloads the selected normalized SVG", async ({ page }) => {
  const geometry = '<path id="download-geometry" d="M12 0.2158 23.75 20.7842H0.25Z" fill="#000"/>';
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="21" viewBox="0 0 24 21">\n  ${geometry}\n</svg>`;

  await page.goto("/shape-tools");
  await openSection(page, "Source SVGs");
  await page.locator('input[type="file"]').first().setInputFiles({
    buffer: Buffer.from(source),
    mimeType: "image/svg+xml",
    name: "download-full.svg",
  });
  await expect(page.getByTestId("shape-tools-preview")).toBeVisible();

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("download-full-normalized.svg");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const bytes = await readFile(downloadPath!, "utf8");
  expect(bytes).toContain('width="24"');
  expect(bytes).toContain('height="20.7846096908"');
  expect(bytes).toContain('viewBox="0 0 24 20.7846096908"');
  expect(bytes).toContain(`\n  ${geometry}\n`);
});

test("browser: saves a normalized SVG to the local shape library", async ({ page }) => {
  const geometry = [
    '<path d="M12 1 14 4H10Z"/>',
    '<path d="M4 18 8 11 10 14 8 18Z"/>',
    '<path d="M10 18 14 11 16 14 14 18Z"/>',
    '<path d="M16 18 18 14 20 18Z"/>',
  ].join("");
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="21" viewBox="0 0 24 21">${geometry}</svg>`;

  await page.goto("/shape-tools");
  await openSection(page, "Source SVGs");
  await page.locator('input[type="file"]').first().setInputFiles({
    buffer: Buffer.from(source),
    mimeType: "image/svg+xml",
    name: "local-glyph.svg",
  });
  await expect(page.getByTestId("shape-tools-preview")).toBeVisible();

  await openSection(page, "Local Library");
  const details = page.getByTestId("shape-tools-library-details");
  const field = (label: string) => details
    .getByText(label, { exact: true })
    .locator("xpath=ancestor::*[@data-slot='field'][1]")
    .getByRole("textbox");
  await details.getByRole("group", { name: "Opacity structure" }).getByRole("button", { name: "Elements" }).click();
  await field("Family ID").fill("local-e2e-glyph");
  await field("Display name").fill("Local E2E Glyph");
  await field("Variant ID").fill("base");
  await page.getByRole("button", { name: "Save to Library" }).click();
  await expect(details.getByText("Local E2E Glyph saved to the local library.")).toBeVisible();

  await page.goto("/");
  await openSection(page, "Shape Library");
  await page.getByRole("button", { name: "Open library" }).click();
  const libraryDialog = page.locator('[role="dialog"]');
  await libraryDialog.locator("button").filter({ hasText: "Complex" }).click();
  const frameSelect = libraryDialog.locator('[role="combobox"]').first();
  await frameSelect.click();
  await page.locator('[role="listbox"]').getByText("Equilateral full", { exact: true }).click();
  await expect(page.locator('[data-shape-family-id="local-e2e-glyph"]')).toBeVisible();
  await page.locator('[data-shape-family-id="local-e2e-glyph"]').click();
  await expect(libraryDialog).toContainText("4 opacity units");
});

test("browser: manual canvas dimensions remain in their own Setup fields", async ({ page }) => {
  await page.goto("/");
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Create pattern" }).click();
  await openSection(page, "Grid");
  const autoFit = page.getByRole("switch").first();
  if ((await autoFit.getAttribute("aria-checked")) === "true") await autoFit.click();

  const canvasWidth = getGroupedTextbox(page, "Canvas width");
  const canvasHeight = getGroupedTextbox(page, "Canvas height");
  await canvasWidth.fill("640");
  await canvasWidth.press("Enter");
  await expect(canvasWidth).toHaveValue("640");
  await canvasHeight.fill("480");
  await canvasHeight.press("Enter");
  await expect(canvasHeight).toHaveValue("480");
  await expect(page.locator('[data-toolcraft-product-output="pattern"]')).toHaveAttribute("width", "640");
  await expect(page.locator('[data-toolcraft-product-output="pattern"]')).toHaveAttribute("height", "480");
});

test("browser: restores persisted pattern settings after page reload", async ({ page }) => {
  await page.goto("/");
  await openSection(page, "Grid");
  await page.getByRole("slider", { name: "Rows" }).press("ArrowRight");
  await openSection(page, "Pattern Output");
  await page.getByRole("button", { name: "Create pattern" }).click();
  const beforeReload = await getToolcraftProductObservableSnapshot(page);

  await page.reload();
  await expect(page.locator('[data-testid="pattern-renderer"]')).toBeVisible();
  const afterReload = await getToolcraftProductObservableSnapshot(page);

  expect(afterReload).toBe(beforeReload);
});
