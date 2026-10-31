import { describe, expect, it } from "vitest";
import { returnPath } from "./sign-in";

describe("returnPath", () => {
  it.each(["/generator?brand=e56236~exact&primary=vivid", "/referenzen/a-b", "/sammlungen?x=1#top"])(
    "keeps the internal path %s",
    (next) => {
      expect(returnPath(next)).toBe(next);
    },
  );

  it.each([
    undefined,
    "",
    "generator",
    "https://evil.example",
    "//evil.example",
    "//evil.example/generator",
    "/\\evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
    "data:text/html,hi",
  ])("sends %j to the start page", (next) => {
    expect(returnPath(next)).toBe("/");
  });
});
