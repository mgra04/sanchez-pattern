import type { SvgViewport } from "./normalization";

export type SvgGeometryBounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export function measureSvgGeometryBounds(source: string): SvgGeometryBounds {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10000px;top:-10000px;visibility:hidden;pointer-events:none";
  host.innerHTML = source;
  document.body.append(host);
  try {
    const root = host.querySelector("svg") as SVGSVGElement | null;
    if (!root || typeof root.getBBox !== "function") {
      throw new Error("Browser could not measure SVG geometry.");
    }
    const box = root.getBBox();
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) {
      throw new Error("Browser returned invalid SVG geometry bounds.");
    }
    return { height: box.height, width: box.width, x: box.x, y: box.y };
  } finally {
    host.remove();
  }
}

export function geometryFitsViewport(
  bounds: SvgGeometryBounds,
  viewport: SvgViewport,
  tolerance = 0.001,
): boolean {
  return (
    bounds.x >= viewport.minX - tolerance &&
    bounds.y >= viewport.minY - tolerance &&
    bounds.x + bounds.width <= viewport.minX + viewport.width + tolerance &&
    bounds.y + bounds.height <= viewport.minY + viewport.height + tolerance
  );
}
