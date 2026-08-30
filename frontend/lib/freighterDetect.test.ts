import { describe, it, expect } from "vitest";
import { isFreighterInjected, isFreighterMobile } from "./freighterDetect";

describe("isFreighterInjected", () => {
  it("detects the desktop extension via window.freighter", () => {
    expect(isFreighterInjected({ freighter: {} })).toBe(true);
  });

  it("detects Freighter mobile via window.stellar.provider", () => {
    expect(
      isFreighterInjected({
        stellar: { provider: "freighter", platform: "mobile" },
      })
    ).toBe(true);
  });

  it("does not treat a missing install as installed", () => {
    expect(isFreighterInjected({})).toBe(false);
    expect(isFreighterInjected(undefined)).toBe(false);
  });
});

describe("isFreighterMobile", () => {
  it("is true only for the Freighter mobile wrapper", () => {
    expect(
      isFreighterMobile({ stellar: { provider: "freighter", platform: "mobile" } })
    ).toBe(true);
  });

  it("is false for the desktop extension", () => {
    expect(isFreighterMobile({ freighter: {} })).toBe(false);
  });
});
