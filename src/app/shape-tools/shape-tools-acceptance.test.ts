import { describe, expect, it } from "vitest";

import { validateToolcraftAcceptanceCoverage } from "../app-acceptance";
import { shapeToolsAcceptance, shapeToolsTransferMode } from "./shape-tools-acceptance";
import {
  shapeToolsControlSectionInventory,
  shapeToolsSchema,
} from "./shape-tools-schema";

describe("Shape Tools acceptance coverage", () => {
  it("covers every visible Shape Tools control and product action", () => {
    expect(
      validateToolcraftAcceptanceCoverage(
        shapeToolsSchema,
        shapeToolsAcceptance,
        shapeToolsTransferMode,
        shapeToolsControlSectionInventory,
      ),
    ).toEqual([]);
  });
});
