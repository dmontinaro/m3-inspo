import { describe, expect, it } from "vitest";
import { rejectionReasons } from "./upload-limits";
import { precheckFile, screenshotTitle, titleFromFileName } from "./upload-files";

describe("precheckFile", () => {
  it("lets PNG, JPEG and WebP through", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(precheckFile({ type, size: 1000 })).toBeNull();
    }
  });

  it("leaves files without a declared type to the server, which sniffs the bytes", () => {
    expect(precheckFile({ type: "", size: 1000 })).toBeNull();
  });

  it("rejects with the same reasons the server gives", () => {
    expect(precheckFile({ type: "image/png", size: 0 })).toBe(rejectionReasons.empty);
    expect(precheckFile({ type: "image/png", size: 26 * 1024 * 1024 })).toBe(rejectionReasons.tooLarge);
    expect(precheckFile({ type: "image/svg+xml", size: 1000 })).toBe(rejectionReasons.svg);
    expect(precheckFile({ type: "application/pdf", size: 1000 })).toBe(rejectionReasons.unsupported);
    expect(precheckFile({ type: "image/heic", size: 1000 })).toBe(rejectionReasons.unsupported);
  });
});

describe("titleFromFileName", () => {
  it("drops the extension and turns dashes and underscores into spaces", () => {
    expect(titleFromFileName("hotel-alpenrose_startseite.png")).toBe("hotel alpenrose startseite");
  });
});

describe("screenshotTitle", () => {
  it("names a pasted image after the moment it was pasted", () => {
    expect(screenshotTitle(new Date("2026-09-23T12:07:00Z"))).toBe("Screenshot 23 Sept 2026, 14:07");
  });
});
