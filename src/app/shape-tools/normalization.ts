import { sanitizeShapeSvg } from "../shapes/svg";

export type TriangleFrameRole = "equilateral-full" | "equilateral-half";
export type ShapeNormalizationMode = "auto" | "full" | "half";

export type SvgViewport = {
  height: number;
  minX: number;
  minY: number;
  width: number;
};

export type ShapeNormalizationResult = {
  alreadyNormalized: boolean;
  canonicalSideLength: number;
  geometryUnchanged: boolean;
  normalizedBody: string;
  normalizedSource: string;
  originalBody: string;
  originalViewport: SvgViewport;
  outputFileName: string;
  role: TriangleFrameRole;
  targetViewport: SvgViewport;
};

export type ShapeNormalizationErrorCode =
  | "ambiguous-role"
  | "incompatible-frame"
  | "invalid-svg"
  | "unsafe-svg";

export class ShapeNormalizationError extends Error {
  constructor(
    public readonly code: ShapeNormalizationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ShapeNormalizationError";
  }
}

type ParsedSvgDocument = {
  body: string;
  closeEnd: number;
  closeStart: number;
  height: number;
  openEnd: number;
  openStart: number;
  openingTag: string;
  source: string;
  viewBox: SvgViewport;
  width: number;
};

const roundedExportTolerance = 0.51;

function readNumericAttribute(openingTag: string, name: string): number {
  const match = openingTag.match(new RegExp(`\\b${name}\\s*=\\s*["']([0-9]+(?:\\.[0-9]+)?)["']`, "i"));
  const value = match ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ShapeNormalizationError(
      "invalid-svg",
      `SVG root must declare a positive numeric ${name}.`,
    );
  }
  return value;
}

function readViewBox(openingTag: string): SvgViewport {
  const raw = openingTag.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  const values = raw?.trim().split(/[\s,]+/).map(Number) ?? [];
  if (
    values.length !== 4 ||
    values.some((value) => !Number.isFinite(value)) ||
    values[2]! <= 0 ||
    values[3]! <= 0
  ) {
    throw new ShapeNormalizationError(
      "invalid-svg",
      "SVG root must declare a finite positive four-value viewBox.",
    );
  }
  return {
    height: values[3]!,
    minX: values[0]!,
    minY: values[1]!,
    width: values[2]!,
  };
}

export function parseSvgDocument(source: string): ParsedSvgDocument {
  const openingMatches = [...source.matchAll(/<svg\b[^>]*>/gi)];
  const closingMatches = [...source.matchAll(/<\/svg\s*>/gi)];
  if (openingMatches.length !== 1 || closingMatches.length !== 1) {
    throw new ShapeNormalizationError(
      "invalid-svg",
      "SVG must contain exactly one root svg element.",
    );
  }
  const opening = openingMatches[0]!;
  const closing = closingMatches[0]!;
  const openStart = opening.index!;
  const openEnd = openStart + opening[0].length;
  const closeStart = closing.index!;
  const closeEnd = closeStart + closing[0].length;
  if (
    source.slice(0, openStart).trim() ||
    source.slice(closeEnd).trim() ||
    closeStart <= openEnd
  ) {
    throw new ShapeNormalizationError(
      "invalid-svg",
      "SVG must contain one root element and no markup outside it.",
    );
  }
  const openingTag = opening[0];
  return {
    body: source.slice(openEnd, closeStart),
    closeEnd,
    closeStart,
    height: readNumericAttribute(openingTag, "height"),
    openEnd,
    openStart,
    openingTag,
    source,
    viewBox: readViewBox(openingTag),
    width: readNumericAttribute(openingTag, "width"),
  };
}

export function formatCanonicalNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new ShapeNormalizationError("invalid-svg", "Canonical dimensions must be finite.");
  }
  return value.toFixed(10).replace(/\.?0+$/, "");
}

export function getCanonicalTriangleViewport(
  role: TriangleFrameRole,
  sideLength: number,
  origin: Pick<SvgViewport, "minX" | "minY"> = { minX: 0, minY: 0 },
): SvgViewport {
  if (!Number.isFinite(sideLength) || sideLength <= 0 || sideLength > 512) {
    throw new ShapeNormalizationError(
      "incompatible-frame",
      "Triangle side length must be greater than 0 and at most 512px.",
    );
  }
  return {
    height: sideLength * Math.sqrt(3) / 2,
    minX: origin.minX,
    minY: origin.minY,
    width: role === "equilateral-full" ? sideLength : sideLength / 2,
  };
}

function isWithinRoundedTolerance(left: number, right: number): boolean {
  return Math.abs(left - right) <= roundedExportTolerance;
}

function getCompatibleAutoCandidates(parsed: ParsedSvgDocument): Array<{
  role: TriangleFrameRole;
  sideLength: number;
  viewport: SvgViewport;
}> {
  const candidates: Array<{ role: TriangleFrameRole; sideLength: number }> = [
    { role: "equilateral-full", sideLength: parsed.viewBox.width },
    { role: "equilateral-half", sideLength: parsed.viewBox.width * 2 },
  ];
  return candidates.flatMap((candidate) => {
    const viewport = getCanonicalTriangleViewport(
      candidate.role,
      candidate.sideLength,
      parsed.viewBox,
    );
    return isWithinRoundedTolerance(parsed.viewBox.height, viewport.height)
      ? [{ ...candidate, viewport }]
      : [];
  });
}

function replaceAttribute(openingTag: string, name: string, value: string): string {
  const pattern = new RegExp(`(\\b${name}\\s*=\\s*)(["'])([^"']*)(\\2)`, "i");
  if (!pattern.test(openingTag)) {
    throw new ShapeNormalizationError("invalid-svg", `SVG root is missing ${name}.`);
  }
  return openingTag.replace(pattern, (_match, prefix: string, quote: string) =>
    `${prefix}${quote}${value}${quote}`,
  );
}

function rewriteViewport(parsed: ParsedSvgDocument, viewport: SvgViewport): string {
  const width = formatCanonicalNumber(viewport.width);
  const height = formatCanonicalNumber(viewport.height);
  const viewBox = [viewport.minX, viewport.minY, viewport.width, viewport.height]
    .map(formatCanonicalNumber)
    .join(" ");
  let openingTag = replaceAttribute(parsed.openingTag, "width", width);
  openingTag = replaceAttribute(openingTag, "height", height);
  openingTag = replaceAttribute(openingTag, "viewBox", viewBox);
  return `${parsed.source.slice(0, parsed.openStart)}${openingTag}${parsed.source.slice(parsed.openEnd)}`;
}

function getOutputFileName(fileName: string): string {
  const base = fileName.trim().replace(/\.svg$/i, "") || "shape";
  return `${base}-normalized.svg`;
}

export function normalizeTriangleSvg(params: {
  fileName: string;
  mode: ShapeNormalizationMode;
  sideLength?: number;
  source: string;
}): ShapeNormalizationResult {
  let parsed: ParsedSvgDocument;
  try {
    parsed = parseSvgDocument(params.source);
    sanitizeShapeSvg(params.source);
  } catch (error) {
    if (error instanceof ShapeNormalizationError) throw error;
    throw new ShapeNormalizationError(
      "unsafe-svg",
      error instanceof Error ? error.message : "SVG is unsafe or unsupported.",
    );
  }
  if (
    !isWithinRoundedTolerance(parsed.width, parsed.viewBox.width) ||
    !isWithinRoundedTolerance(parsed.height, parsed.viewBox.height)
  ) {
    throw new ShapeNormalizationError(
      "incompatible-frame",
      "SVG width and height must match its rounded viewBox.",
    );
  }

  let role: TriangleFrameRole;
  let canonicalSideLength: number;
  let targetViewport: SvgViewport;
  if (params.mode === "auto") {
    const candidates = getCompatibleAutoCandidates(parsed);
    if (candidates.length !== 1) {
      throw new ShapeNormalizationError(
        "ambiguous-role",
        candidates.length === 0
          ? "Auto could not match this viewport to a Full or Half equilateral frame."
          : "Auto matched more than one triangle role. Choose Full or Half manually.",
      );
    }
    ({ role, sideLength: canonicalSideLength, viewport: targetViewport } = candidates[0]!);
  } else {
    role = params.mode === "full" ? "equilateral-full" : "equilateral-half";
    canonicalSideLength = Number(params.sideLength ?? 24);
    targetViewport = getCanonicalTriangleViewport(role, canonicalSideLength, parsed.viewBox);
    if (
      !isWithinRoundedTolerance(parsed.viewBox.width, targetViewport.width) ||
      !isWithinRoundedTolerance(parsed.viewBox.height, targetViewport.height)
    ) {
      throw new ShapeNormalizationError(
        "incompatible-frame",
        `Source viewport does not match a ${role === "equilateral-full" ? "Full" : "Half"} triangle with side ${formatCanonicalNumber(canonicalSideLength)}px.`,
      );
    }
  }

  const normalizedSource = rewriteViewport(parsed, targetViewport);
  const normalized = parseSvgDocument(normalizedSource);
  return {
    alreadyNormalized: normalizedSource === params.source,
    canonicalSideLength,
    geometryUnchanged: normalized.body === parsed.body,
    normalizedBody: normalized.body,
    normalizedSource,
    originalBody: parsed.body,
    originalViewport: parsed.viewBox,
    outputFileName: getOutputFileName(params.fileName),
    role,
    targetViewport,
  };
}
