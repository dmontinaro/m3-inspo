import { describe, expect, it } from "vitest";
import { naturalPixel } from "./pipette";

describe("the pipette's pixel", () => {
  const natural = { width: 1440, height: 9000 };

  it("is the original's pixel under the point, not the scaled-down view's", () => {
    // Shown at 360 px wide (a phone), one CSS pixel covers four of the original.
    const shown = { width: 360, height: 2250 };
    expect(naturalPixel({ x: 0, y: 0 }, shown, natural)).toEqual({ x: 0, y: 0 });
    expect(naturalPixel({ x: 100.6, y: 50.2 }, shown, natural)).toEqual({ x: 402, y: 200 });
  });

  it("stays inside the image at its far edges", () => {
    const shown = { width: 720, height: 4500 };
    expect(naturalPixel({ x: 720, y: 4500 }, shown, natural)).toEqual({ x: 1439, y: 8999 });
    expect(naturalPixel({ x: -1, y: -0.5 }, shown, natural)).toEqual({ x: 0, y: 0 });
  });
});
