import {
  createToolcraftPngExportCanvas,
  shouldIncludeToolcraftPreviewBackground,
  type ToolcraftState,
} from "@/toolcraft/runtime";

import { normalizeHexColor, type PatternSnapshot } from "./pattern-model";
import { createPatternSvgMarkup } from "./pattern-svg";

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function loadSvgImage(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to rasterize the pattern SVG."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image encoder returned no data."))),
      type,
      quality,
    );
  });
}

function getBackground(state: ToolcraftState): string {
  return normalizeHexColor(state.values["appearance.background"], "#D9DCE4");
}

export function sanitizeExportFileName(value: unknown): string {
  if (typeof value !== "string") return "sanchez-pattern";
  const sanitized = value
    .replace(/[<>:\"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return sanitized || "sanchez-pattern";
}

function getExportFileName(state: ToolcraftState): string {
  return sanitizeExportFileName(state.values["export.fileName"]);
}

export async function exportPatternSvg(
  state: ToolcraftState,
  snapshot: PatternSnapshot,
): Promise<void> {
  const markup = createPatternSvgMarkup({
    background: getBackground(state),
    canvasHeight: state.canvas.size.height,
    canvasWidth: state.canvas.size.width,
    includeBackground: shouldIncludeToolcraftPreviewBackground({ state }),
    snapshot,
  });
  downloadBlob(
    new Blob([markup], { type: "image/svg+xml;charset=utf-8" }),
    `${getExportFileName(state)}.svg`,
  );
}

export async function exportPatternImage(
  state: ToolcraftState,
  snapshot: PatternSnapshot,
): Promise<void> {
  const format = state.values["export.image.format"] === "jpg" ? "jpg" : "png";
  const includeBackground =
    format === "jpg" ? true : shouldIncludeToolcraftPreviewBackground({ state });
  const markup = createPatternSvgMarkup({
    background: "transparent",
    canvasHeight: state.canvas.size.height,
    canvasWidth: state.canvas.size.width,
    includeBackground: false,
    snapshot,
  });
  const image = await loadSvgImage(markup);
  const canvas = createToolcraftPngExportCanvas({
    background: getBackground(state),
    includeBackground,
    render: ({ context, cssHeight, cssWidth }) => {
      context.drawImage(image, 0, 0, cssWidth, cssHeight);
    },
    resolution:
      typeof state.values["export.image.resolution"] === "string"
        ? state.values["export.image.resolution"]
        : "4k",
    state,
  });
  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
  const blob = await canvasToBlob(canvas, mimeType, format === "jpg" ? 0.92 : undefined);
  downloadBlob(blob, `${getExportFileName(state)}.${format}`);
}
