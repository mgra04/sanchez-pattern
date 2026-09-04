const forbiddenMarkupPattern =
  /<(?:script|foreignObject|iframe|object|embed|image|video|audio|canvas|style|link|meta)\b|<!DOCTYPE|<\?xml/i;
const forbiddenAttributePattern = /\s(?:on[a-z]+|href|xlink:href|style)\s*=/i;
const externalPaintPattern = /url\s*\(\s*(?!#)/i;
const allowedElementPattern = /<\/?([a-z][\w:-]*)\b/gi;
const allowedElements = new Set([
  "circle",
  "clippath",
  "defs",
  "ellipse",
  "g",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "svg",
]);

export type SanitizedShapeSvg = {
  body: string;
  height: number;
  viewBox: { height: number; minX: number; minY: number; width: number };
  width: number;
};

function getNumericSvgAttribute(source: string, name: string): number | null {
  const match = source.match(new RegExp(`\\b${name}=["']([0-9.]+)["']`, "i"));
  const value = match ? Number(match[1]) : Number.NaN;

  return Number.isFinite(value) ? value : null;
}

function getSvgViewBox(source: string): SanitizedShapeSvg["viewBox"] | null {
  const raw = source.match(/\bviewBox=["']([^"']+)["']/i)?.[1]?.trim();
  if (!raw) return null;
  const values = raw.split(/[\s,]+/).map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null;
  const [minX, minY, width, height] = values;
  if (width! <= 0 || height! <= 0) return null;
  return { height: height!, minX: minX!, minY: minY!, width: width! };
}

function assertAllowedElements(source: string): void {
  for (const match of source.matchAll(allowedElementPattern)) {
    const name = match[1]?.toLowerCase();

    if (name && !allowedElements.has(name)) {
      throw new Error(`Unsupported SVG element <${name}>.`);
    }
  }
}

const drawableElementPattern = /<(?:circle|ellipse|line|path|polygon|polyline|rect)\b[^>]*>/gi;
const blackStrokePattern = /\sstroke=["'](?:black|#000(?:000)?|rgb\(0\s*,\s*0\s*,\s*0\))["']/i;

function normalizeMonochromePaint(body: string, rootFillNone: boolean): string {
  let usesStrokePaint = false;
  let normalized = body
    .replace(/\sfill=["'](?:black|white|#000(?:000)?|#fff(?:fff)?|rgb\(0\s*,\s*0\s*,\s*0\)|rgb\(255\s*,\s*255\s*,\s*255\))["']/gi, "")
    .replace(drawableElementPattern, (element) => {
      if (!blackStrokePattern.test(element)) return element;
      usesStrokePaint = true;
      const withoutStroke = element.replace(blackStrokePattern, "");
      const withMarker = withoutStroke.replace(
        /^<([a-z][\w:-]*)/i,
        '<$1 data-shape-paint="stroke"',
      );
      if (/\sfill=["']none["']/i.test(withMarker)) return withMarker;
      if (!rootFillNone) {
        throw new Error("Monochrome stroke shapes must be stroke-only with fill=none.");
      }
      return withMarker.replace(/\s*\/>$|>$/, (ending) => ` fill="none"${ending}`);
    });

  if (usesStrokePaint) {
    const drawables = normalized.match(drawableElementPattern) ?? [];
    if (drawables.some((element) => !/\bdata-shape-paint=["']stroke["']/i.test(element))) {
      throw new Error("Mixed fill and stroke shape bodies require an explicit paint-role model.");
    }
  }

  const unsupportedFill = normalized.match(/\s(?:fill|stroke)=["']([^"']+)["']/gi)?.find(
    (attribute) => !/["']none["']/i.test(attribute),
  );

  if (unsupportedFill) {
    throw new Error("Shape SVG must use monochrome black geometry or fill=none.");
  }

  return normalized.trim();
}

export function hasShapeStrokePaint(body: string): boolean {
  return /\bdata-shape-paint=["']stroke["']/i.test(body);
}

function getSvgNamespace(source: string): string {
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `shape-${(hash >>> 0).toString(36)}`;
}

function namespaceLocalReferences(body: string): string {
  const namespace = getSvgNamespace(body);
  const idMap = new Map<string, string>();
  const withIds = body.replace(/\bid=["']([^"']+)["']/gi, (_attribute, id: string) => {
    const nextId = `${namespace}-${id}`;
    idMap.set(id, nextId);
    return `id="${nextId}"`;
  });

  return withIds.replace(/url\(\s*#([^)\s]+)\s*\)/gi, (reference, id: string) => {
    const nextId = idMap.get(id);
    return nextId ? `url(#${nextId})` : reference;
  });
}

export function sanitizeShapeSvg(source: string): SanitizedShapeSvg {
  const trimmed = source.trim();

  if (forbiddenMarkupPattern.test(trimmed) || forbiddenAttributePattern.test(trimmed)) {
    throw new Error("SVG contains unsafe or unsupported markup.");
  }

  if (externalPaintPattern.test(trimmed)) {
    throw new Error("SVG cannot reference external paint or resources.");
  }

  assertAllowedElements(trimmed);

  const width = getNumericSvgAttribute(trimmed, "width");
  const height = getNumericSvgAttribute(trimmed, "height");
  const viewBox = getSvgViewBox(trimmed);

  if (!width || !height || !viewBox) {
    throw new Error("Shape SVG must declare positive numeric width, height, and viewBox values.");
  }
  if (
    Math.abs(width - viewBox.width) > 0.51 ||
    Math.abs(height - viewBox.height) > 0.51
  ) {
    throw new Error("Shape SVG width and height must match its viewBox (rounded exports may differ by at most 0.5px).");
  }

  const bodyMatch = trimmed.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  const rootTag = trimmed.match(/<svg\b[^>]*>/i)?.[0] ?? "";

  if (!bodyMatch?.[1]?.trim()) {
    throw new Error("SVG does not contain shape geometry.");
  }

  return {
    body: namespaceLocalReferences(
      normalizeMonochromePaint(bodyMatch[1], /\sfill=["']none["']/i.test(rootTag)),
    ),
    height,
    viewBox,
    width,
  };
}

export function decodeSvgDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);

  if (!match) {
    throw new Error("Uploaded file is not a valid data URL.");
  }

  const payload = match[3] ?? "";

  if (match[2]) {
    return decodeURIComponent(
      Array.from(atob(payload), (character) =>
        `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
      ).join(""),
    );
  }

  return decodeURIComponent(payload);
}

export function scopeShapeSvgBody(body: string, scope: string): string {
  const safeScope = scope.replace(/[^a-z0-9_-]/gi, "-");
  const idMap = new Map<string, string>();
  const withIds = body.replace(/\bid=["']([^"']+)["']/gi, (_attribute, id: string) => {
    const nextId = `${safeScope}-${id}`;
    idMap.set(id, nextId);
    return `id="${nextId}"`;
  });

  return withIds.replace(/url\(\s*#([^)\s]+)\s*\)/gi, (reference, id: string) => {
    const nextId = idMap.get(id);
    return nextId ? `url(#${nextId})` : reference;
  });
}
