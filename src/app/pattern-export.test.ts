import { describe, expect, it } from "vitest";

import { sanitizeExportFileName } from "./pattern-export";

describe("pattern export filename", () => {
  it("keeps descriptive names and replaces filesystem-reserved characters", () => {
    expect(sanitizeExportFileName("My pattern 01")).toBe("My pattern 01");
    expect(sanitizeExportFileName('pattern: red/blue?')).toBe("pattern- red-blue-");
  });

  it("falls back when the result is empty", () => {
    expect(sanitizeExportFileName("... ")).toBe("sanchez-pattern");
    expect(sanitizeExportFileName(null)).toBe("sanchez-pattern");
  });
});
