import { describe, expect, it } from "vitest";

import { createSeededRandom, deterministicUnitHash } from "./random";

describe("pattern random streams", () => {
  it("creates a stable stateless unit hash", () => {
    const value = deterministicUnitHash(42, "transition-spread", "a--b", 3, 5);

    expect(value).toBe(deterministicUnitHash(42, "transition-spread", "a--b", 3, 5));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(value).not.toBe(deterministicUnitHash(43, "transition-spread", "a--b", 3, 5));
    expect(value).not.toBe(deterministicUnitHash(42, "transition-spread", "a--c", 3, 5));
    expect(value).not.toBe(deterministicUnitHash(42, "transition-spread", "a--b", 4, 5));
  });

  it("does not consume the existing sequential source-selection stream", () => {
    const before = createSeededRandom(42);
    const expected = [before(), before(), before()];
    const after = createSeededRandom(42);

    deterministicUnitHash(42, "transition-spread", "a--b", 3, 5);
    expect([after(), after(), after()]).toEqual(expected);
  });
});
